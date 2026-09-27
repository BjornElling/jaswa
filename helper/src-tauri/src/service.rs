use crate::{
    config::{GATEWAYS, HELPER_PORT, HOSTS_MARKER, allowed_origin, data_directory},
    diagnostics,
    incidents::Incidents,
    profile::ProfileStore,
    protocol::{decode_request, decode_response},
    traffic::TrafficLog,
};
use rcgen::{
    BasicConstraints, CertificateParams, DnType, GeneralSubtree, IsCa, KeyPair, NameConstraints,
};
use rustls::{
    ClientConfig, ClientConnection, RootCertStore, ServerConfig, ServerConnection, StreamOwned,
    pki_types::{CertificateDer, ServerName},
};
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

const GATEWAY_PATH: &str = "/api/gateway_c2.php";
const MAXIMUM_INTERCEPTED_BODY_BYTES: usize = 16 * 1024 * 1024;
/// How long a closed, silent gateway still counts as the game reaching the
/// redirect. Ordinary play goes quiet for minutes at a time — the game hangs up
/// its keep-alive socket and opens a new one for its next command — so this
/// window ends only the *connection* evidence, never the game session itself.
const GAME_QUIET_GRACE: Duration = Duration::from_secs(60);
/// A gateway socket opens before the game sends its login. The watchdog must
/// never mistake that normal startup interval for a helper that missed login.
const LOGIN_CAPTURE_GRACE: Duration = Duration::from_secs(45);
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(3);

pub struct Service {
    shared: Arc<Shared>,
    owns_hosts: AtomicBool,
}

struct Shared {
    running: AtomicBool,
    profile: Mutex<ProfileStore>,
    traffic: Mutex<TrafficLog>,
    game_running: Mutex<bool>,
    /// A gateway connection stayed up past the normal login window without an
    /// account snapshot. This is useful evidence to report, but not proof the
    /// helper started late: the game may have reconnected long after startup.
    waiting_for_login: Mutex<bool>,
    /// Set only by the process-list observation immediately before the helper
    /// installs its redirect. It identifies the one case where the login
    /// exchange cannot have passed through this helper.
    game_started_before_helper: AtomicBool,
    /// The first gateway contact in this game session. It gives login capture
    /// a bounded startup window without guessing from one open socket.
    game_started_at: Mutex<Option<Instant>>,
    /// Number of gateway connections the game currently holds open. A live
    /// connection is the plainest evidence the game is running and reaching the
    /// redirect, and needs no scan of the system's other processes.
    open_connections: AtomicUsize,
    /// When the game last connected or sent anything, so a brief reconnect does
    /// not read as the game having closed.
    last_contact: Mutex<Option<Instant>>,
    last_error: Mutex<Option<String>>,
    incidents: Mutex<Incidents>,
    api_connections: AtomicUsize,
}

/// Creates the local identity and puts its root in the current user's trust
/// store, without touching anything that needs elevation.
///
/// This must run as the *real* user, before any relaunch as administrator.
/// Elevating switches to the administrator's profile, and the per-user ROOT
/// store follows the profile — so a certificate installed after elevation lands
/// in the administrator's store while Summoners War, still running as the real
/// user, reads its own and finds nothing to trust.
pub fn provision_certificate() -> Result<(), String> {
    let directory = data_directory();
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    certificate_config(&directory, true).map(|_| ())
}

impl Service {
    pub fn start() -> Result<Self, String> {
        let directory = data_directory();
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        // Elevation must not generate or trust a different identity under another user.
        let server = certificate_config(&directory, false)?;
        // Resolve each gateway to its real address *before* installing the hosts
        // redirect, so resolution reads public DNS rather than the loopback
        // entry we are about to add. This follows the gateway's load-balancer
        // address when it changes, which a hardcoded upstream cannot; the
        // shipped address stays as a fallback.
        let upstreams: Vec<String> = GATEWAYS
            .iter()
            .map(|(hostname, _, fallback)| resolve_upstream(hostname, fallback))
            .collect();
        for ((hostname, _, fallback), upstream) in GATEWAYS.iter().zip(&upstreams) {
            diagnostics::record(
                "helper",
                &format!(
                    "{hostname} resolves to {upstream}{}",
                    if upstream == fallback {
                        " (shipped fallback — DNS gave nothing usable)"
                    } else {
                        ""
                    }
                ),
            );
        }
        let shared = Arc::new(Shared {
            running: AtomicBool::new(true),
            profile: Mutex::new(ProfileStore::default()),
            traffic: Mutex::new(TrafficLog::new(None)),
            game_running: Mutex::new(false),
            waiting_for_login: Mutex::new(false),
            game_started_before_helper: AtomicBool::new(false),
            game_started_at: Mutex::new(None),
            open_connections: AtomicUsize::new(0),
            last_contact: Mutex::new(None),
            last_error: Mutex::new(None),
            incidents: Mutex::new(Incidents::default()),
            api_connections: AtomicUsize::new(0),
        });
        let service = Self {
            shared: Arc::clone(&shared),
            owns_hosts: AtomicBool::new(false),
        };
        start_api(Arc::clone(&shared))?;
        for ((hostname, local_address, _), upstream) in GATEWAYS.iter().zip(upstreams) {
            start_bridge(
                Arc::clone(&shared),
                Arc::clone(&server),
                hostname,
                local_address,
                upstream,
            )?;
        }
        match crate::windows::summoners_war_is_running() {
            Ok(true) => {
                shared
                    .game_started_before_helper
                    .store(true, Ordering::Release);
                diagnostics::record(
                    "game",
                    "Summoners War was already running when the helper installed its redirect. Restarting the game lets the helper capture its login.",
                );
            }
            Ok(false) => {}
            Err(error) => diagnostics::record(
                "game",
                &format!("Could not check whether Summoners War was already running: {error}"),
            ),
        }
        service.owns_hosts.store(true, Ordering::Release);
        install_hosts()?;
        diagnostics::record("hosts", "Local gateway redirect installed");
        start_watchdog(Arc::clone(&shared));
        Ok(service)
    }

    pub fn stop(&self) {
        if self.shared.running.swap(false, Ordering::AcqRel)
            && self.owns_hosts.swap(false, Ordering::AcqRel)
        {
            if let Err(error) = remove_hosts() {
                diagnostics::record("hosts", &error);
                crate::windows::show_error(&format!(
                    "Could not remove the local game redirect: {error}. Run the helper cleanup before starting the game again."
                ));
            }
        }
    }

    pub fn report(&self) -> Value {
        let incidents = self
            .shared
            .incidents
            .lock()
            .expect("incident lock poisoned")
            .report();
        json!({
            "status": self.status(),
            "incidents": incidents,
            "currentProfile": self.profile(),
            "platform": std::env::consts::OS,
            "architecture": std::env::consts::ARCH,
        })
    }

    pub fn profile(&self) -> Option<Value> {
        self.shared
            .profile
            .lock()
            .ok()?
            .read()
            .and_then(|profile| serde_json::to_value(profile).ok())
    }
    pub fn swex_snapshot(&self) -> Option<Value> {
        self.shared.profile.lock().ok()?.swex_snapshot()
    }
    pub fn traffic(&self) -> std::sync::MutexGuard<'_, TrafficLog> {
        self.shared.traffic.lock().expect("traffic lock poisoned")
    }
    pub fn status(&self) -> Value {
        status(&self.shared)
    }
}

impl Drop for Service {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Removes only state this helper created. The installer invokes this before
/// replacing files, so an interrupted upgrade cannot strand the game at a
/// loopback gateway.
pub fn cleanup(remove_certificate: bool) -> Result<(), String> {
    remove_hosts()?;
    if remove_certificate {
        let directory = data_directory().join("certificates");
        crate::windows::remove_root_certificate("JASWA Helper Local Root")?;
        if directory.exists() {
            fs::remove_dir_all(directory).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn status(shared: &Shared) -> Value {
    let snapshot = shared
        .profile
        .lock()
        .expect("profile lock poisoned")
        .status();
    let game_running = *shared
        .game_running
        .lock()
        .expect("game state lock poisoned");
    let login_pending = *shared
        .waiting_for_login
        .lock()
        .expect("game state lock poisoned");
    let game_started_before_helper = shared.game_started_before_helper.load(Ordering::Acquire);
    let last_error = shared
        .last_error
        .lock()
        .expect("error lock poisoned")
        .clone();
    let capture_gap = shared
        .incidents
        .lock()
        .expect("incident lock poisoned")
        .active();
    let last_error = last_error.or_else(diagnostics::last_error).or_else(|| capture_gap.then(|| "An exchange could not be imported. Save an error report, then restart Summoners War to capture a fresh account. Live import is paused.".to_owned()));
    json!({
        "running": shared.running.load(Ordering::Acquire),
        "version": env!("CARGO_PKG_VERSION"),
        "hasProfile": snapshot.has_profile,
        "updatedAt": snapshot.updated_at,
        "source": snapshot.source,
        "revision": snapshot.revision,
        "sessionId": snapshot.session_id,
        "instanceId": snapshot.instance_id,
        "profileReady": snapshot.has_profile && game_running && last_error.is_none(),
        "gameStartedBeforeHelper": game_started_before_helper && !snapshot.has_profile,
        "gameLoginPending": game_running && login_pending && !snapshot.has_profile,
        "restartRequired": game_started_before_helper && !snapshot.has_profile,
        "lastError": last_error,
    })
}

fn start_api(shared: Arc<Shared>) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", HELPER_PORT)).map_err(|error| {
        format!("Another program is already using local port {HELPER_PORT}: {error}")
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    thread::spawn(move || {
        while shared.running.load(Ordering::Acquire) {
            match listener.accept() {
                Ok((stream, _)) => {
                    if let Err(error) = stream.set_nonblocking(false) {
                        *shared.last_error.lock().expect("error lock poisoned") =
                            Some(format!("Local API could not prepare a connection: {error}"));
                        continue;
                    }
                    if shared.api_connections.fetch_add(1, Ordering::AcqRel) >= 16 {
                        shared.api_connections.fetch_sub(1, Ordering::AcqRel);
                        continue;
                    }
                    let shared = Arc::clone(&shared);
                    thread::spawn(move || {
                        if let Err(error) = respond_api(stream, Arc::clone(&shared)) {
                            diagnostics::record("jaswa", &format!("Local request failed: {error}"));
                        }
                        shared.api_connections.fetch_sub(1, Ordering::AcqRel);
                    });
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(50))
                }
                Err(error) => {
                    *shared.last_error.lock().expect("error lock poisoned") =
                        Some(format!("Local API stopped: {error}"));
                    break;
                }
            }
        }
    });
    Ok(())
}

fn respond_api(mut stream: TcpStream, shared: Arc<Shared>) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    let mut connection = Connection::new(&mut stream);
    let request = connection
        .read_message()
        .map_err(io::Error::other)?
        .ok_or_else(|| io::Error::other("Empty local request"))?;
    let request = String::from_utf8_lossy(&request);
    let mut lines = request.split("\r\n");
    let first = lines.next().unwrap_or_default();
    let origin = lines.find_map(|line| {
        line.split_once(':')
            .filter(|(name, _)| name.eq_ignore_ascii_case("origin"))
            .map(|(_, value)| value.trim())
    });
    let permitted = origin.is_some_and(allowed_origin);
    let route = first.split_whitespace().nth(1).unwrap_or_default();
    let method = first.split_whitespace().next().unwrap_or_default();
    let (code, value) = if method == "OPTIONS" && permitted {
        (204, None)
    } else if method != "GET" {
        (
            405,
            Some(json!({"error": "Only reading your local import is supported."})),
        )
    } else if !permitted {
        // A refused origin answers every poll with 403, which the dashboard can
        // only show as "not connected" — indistinguishable from a helper that is
        // not running, unless the reason is written down.
        diagnostics::record(
            "jaswa",
            &format!(
                "Refused a request for {route} from origin {} — only JASWA's own address may read the snapshot",
                origin.unwrap_or("(none sent)")
            ),
        );
        (
            403,
            Some(json!({"error": "This page is not allowed to read JASWA Helper."})),
        )
    } else if route == "/health" {
        (200, Some(status(&shared)))
    } else if route == "/profile" && status(&shared)["profileReady"] != true {
        (
            409,
            Some(
                json!({"error": "The capture is not ready. Check helper status and save an error report."}),
            ),
        )
    } else if route == "/profile" {
        match shared.profile.lock().expect("profile lock poisoned").read() {
            Some(profile) => {
                // The half of the round trip nothing recorded before. A user
                // whose account is stale needs to know whether JASWA collected
                // the snapshot at all, and which one it got.
                diagnostics::record(
                    "jaswa",
                    &format!(
                        "Served the snapshot to JASWA (session {}, revision {}, captured {})",
                        profile.session_id, profile.revision, profile.updated_at
                    ),
                );
                (
                    200,
                    Some(serde_json::to_value(profile).expect("serializable profile")),
                )
            }
            None => {
                diagnostics::record(
                    "jaswa",
                    "JASWA asked for the snapshot and there is none — start Summoners War",
                );
                (
                    404,
                    Some(json!({"error": "Start Summoners War to capture an account snapshot."})),
                )
            }
        }
    } else {
        (
            404,
            Some(json!({"error": "Unknown local JASWA Helper route."})),
        )
    };
    let reason = match code {
        200 => "OK",
        204 => "No Content",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Error",
    };
    let body = value.map(|value| value.to_string()).unwrap_or_default();
    let mut headers = format!(
        "HTTP/1.1 {code} {reason}\r\nCache-Control: no-store\r\nContent-Length: {}\r\n",
        body.len()
    );
    if let Some(origin) = origin.filter(|origin| allowed_origin(origin)) {
        headers.push_str(&format!("Access-Control-Allow-Origin: {origin}\r\nAccess-Control-Allow-Private-Network: true\r\nVary: Origin\r\n"));
    }
    if method == "OPTIONS" && permitted {
        headers.push_str("Access-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n");
    }
    stream.write_all(
        format!("{headers}Content-Type: application/json; charset=utf-8\r\n\r\n{body}").as_bytes(),
    )
}

/// Watches two things the helper cannot serve fresh data without: that the game
/// still holds a live connection to the redirect, and that the redirect itself
/// is still in place. The second is the failure that leaves the dashboard
/// "connected" while the account quietly ages — antivirus reverting the hosts
/// file — so the watchdog restores it and says what happened.
fn start_watchdog(shared: Arc<Shared>) {
    thread::spawn(move || {
        while shared.running.load(Ordering::Acquire) {
            ensure_hosts_redirect(&shared);

            let reaching_redirect = game_reaching_redirect(&shared);
            let predates_helper = shared.game_started_before_helper.load(Ordering::Acquire);
            let session_under_way = shared
                .game_started_at
                .lock()
                .expect("game start lock poisoned")
                .is_some();
            /* The process list answers the one question live gateway traffic
            cannot: whether a quiet game is still open. It is read only when
            that cheaper evidence is missing and there is a session for it to
            decide about, so neither active play nor an idle helper pays for
            it. */
            let process_alive = if predates_helper || (!reaching_redirect && session_under_way) {
                crate::windows::summoners_war_is_running().ok()
            } else {
                None
            };

            /* The initial observation is the evidence for this warning. Once
            that same process has gone, discard it; subsequent game starts
            are normal starts behind the redirect and must never inherit the
            warning. */
            if predates_helper && process_alive == Some(false) {
                shared
                    .game_started_before_helper
                    .store(false, Ordering::Release);
                diagnostics::record(
                    "game",
                    "The Summoners War session that predated the helper has closed. The next launch can be captured normally.",
                );
            }

            let running = game_is_running(reaching_redirect, process_alive);
            let has_profile = shared
                .profile
                .lock()
                .expect("profile lock poisoned")
                .status()
                .has_profile;

            let mut prior = shared
                .game_running
                .lock()
                .expect("game state lock poisoned");
            let mut login_pending = shared
                .waiting_for_login
                .lock()
                .expect("game state lock poisoned");
            if login_capture_overdue(&shared, reaching_redirect, has_profile) {
                // A game can reconnect long after its original login, so this
                // cannot diagnose a late helper. It only says that the current
                // connection has not yet supplied the account snapshot.
                if !*login_pending {
                    diagnostics::record(
                        "game",
                        "Summoners War is connected, but no account login arrived within 45 seconds. Continuing to wait; this does not establish that the helper started after the game.",
                    );
                }
                *login_pending = true;
            }
            if *prior && !running {
                // The game has gone: its snapshot belongs to a session that is
                // over, so drop it rather than keep serving a stale account.
                shared
                    .profile
                    .lock()
                    .expect("profile lock poisoned")
                    .clear();
                *login_pending = false;
                *shared
                    .game_started_at
                    .lock()
                    .expect("game start lock poisoned") = None;
                diagnostics::record(
                    "game",
                    if has_profile {
                        "Summoners War closed — the captured snapshot was dropped, so JASWA keeps the last import it saved"
                    } else {
                        "Summoners War closed"
                    },
                );
            }
            *prior = running;
            drop(login_pending);
            drop(prior);
            thread::sleep(WATCHDOG_INTERVAL);
        }
    });
}

/// Whether the game is currently reaching the redirect: it holds a gateway
/// connection open, or used one within the grace window. The grace covers a
/// brief reconnect so a dropped-and-remade connection reads as one session.
fn game_reaching_redirect(shared: &Shared) -> bool {
    if shared.open_connections.load(Ordering::Acquire) > 0 {
        return true;
    }
    shared
        .last_contact
        .lock()
        .expect("contact lock poisoned")
        .is_some_and(|at| at.elapsed() < GAME_QUIET_GRACE)
}

/// Whether the game session is still open.
///
/// Live gateway traffic settles it outright. But the game talks to the gateway
/// only when it has something to ask, and normal play — a long battle, a
/// dungeon run, a menu — leaves it silent with no socket open for minutes.
/// Reading that silence as the game closing dropped the account snapshot in the
/// middle of a session, and nothing could bring it back: the login exchange
/// that carries the account is sent once per launch, so every later reconnect
/// arrived with no account to capture and the helper waited forever. The
/// process list is what actually distinguishes a quiet game from a closed one,
/// so it decides here; when it cannot be read, the connection evidence stands
/// alone as before.
fn game_is_running(reaching_redirect: bool, process_alive: Option<bool>) -> bool {
    reaching_redirect || process_alive.unwrap_or(false)
}

fn mark_contact(shared: &Shared) {
    *shared.last_contact.lock().expect("contact lock poisoned") = Some(Instant::now());
}

/// Records the first gateway contact of a game session, which is also the one
/// point where announcing the connection is meaningful: the game reopens its
/// socket constantly during play, and a line per reconnect would read as the
/// game restarting over and over.
fn mark_game_start(shared: &Shared) {
    let mut started = shared
        .game_started_at
        .lock()
        .expect("game start lock poisoned");
    if started.is_none() {
        *started = Some(Instant::now());
        diagnostics::record("game", "Summoners War connected to the local redirect");
    }
}

/// A connection that has been reaching the redirect past the startup window
/// without supplying an account. Only live connection evidence counts: a quiet
/// game that the process list says is still open has nothing to send.
fn login_capture_overdue(shared: &Shared, reaching_redirect: bool, has_profile: bool) -> bool {
    reaching_redirect
        && !has_profile
        && shared
            .game_started_at
            .lock()
            .expect("game start lock poisoned")
            .is_some_and(|started| started.elapsed() >= LOGIN_CAPTURE_GRACE)
}

/// Observe external changes without fighting the user's security software.
fn ensure_hosts_redirect(shared: &Shared) {
    if !shared.running.load(Ordering::Acquire) {
        return;
    }
    let result = fs::read_to_string(hosts_path());
    let message = match result {
        Ok(contents) if helper_block().lines().all(|expected| contents.lines().any(|line| line == expected)) => return,
        Ok(_) => "The local game redirect was changed or removed. Live import is paused. Save an error report and inspect the change before restarting the helper.".to_owned(),
        Err(error) => format!("Could not check the local game redirect: {error}. Save an error report."),
    };
    let mut previous = shared.last_error.lock().expect("error lock poisoned");
    if previous.as_ref() != Some(&message) {
        diagnostics::record("hosts", &message);
    }
    *previous = Some(message);
}

fn start_bridge(
    shared: Arc<Shared>,
    server: Arc<ServerConfig>,
    hostname: &'static str,
    local_address: &'static str,
    upstream: String,
) -> Result<(), String> {
    let listener = TcpListener::bind(format!("{local_address}:443")).map_err(|error| format!("Another program is using port 443 on this computer, so JASWA Helper could not open its local link for {hostname}: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    thread::spawn(move || {
        while shared.running.load(Ordering::Acquire) {
            match listener.accept() {
                Ok((stream, _)) => {
                    // A connection on the gateway port is the game reaching the
                    // redirect: the freshest sign it is running.
                    mark_contact(&shared);
                    mark_game_start(&shared);
                    if let Err(error) = stream.set_nonblocking(false) {
                        *shared.last_error.lock().expect("error lock poisoned") = Some(format!(
                            "Gateway bridge for {hostname} could not prepare a connection: {error}"
                        ));
                        continue;
                    }
                    if shared.open_connections.fetch_add(1, Ordering::AcqRel) >= 32 {
                        shared.open_connections.fetch_sub(1, Ordering::AcqRel);
                        *shared.last_error.lock().expect("error lock poisoned") = Some("Too many local gateway connections. Restart the helper and save an error report if this repeats.".into());
                        continue;
                    }
                    let shared = Arc::clone(&shared);
                    let server = Arc::clone(&server);
                    let upstream = upstream.clone();
                    thread::spawn(move || relay(stream, server, hostname, &upstream, shared));
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(50))
                }
                Err(error) => {
                    *shared.last_error.lock().expect("error lock poisoned") =
                        Some(format!("Gateway bridge for {hostname} stopped: {error}"));
                    break;
                }
            }
        }
    });
    Ok(())
}

fn relay(
    socket: TcpStream,
    server: Arc<ServerConfig>,
    hostname: &str,
    upstream: &str,
    shared: Arc<Shared>,
) {
    let mut last_request = Vec::new();
    let mut last_response = Vec::new();
    let result = (|| -> Result<(), String> {
        socket
            .set_read_timeout(Some(Duration::from_secs(120)))
            .map_err(|error| error.to_string())?;
        socket
            .set_write_timeout(Some(Duration::from_secs(30)))
            .map_err(|error| error.to_string())?;
        let mut incoming = Connection::new(StreamOwned::new(
            ServerConnection::new(server).map_err(|error| error.to_string())?,
            socket,
        ));
        let roots = RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let name = ServerName::try_from(hostname.to_owned()).map_err(|error| error.to_string())?;
        // The game keeps its gateway connection open and sends its next command
        // on it. Serving one exchange and hanging up cost every request after the
        // first, which the game reports as "Network connection delayed (M:238)".
        // Keep that client-side connection alive, but retain one upstream
        // connection per exchange: retrying a POST after an ambiguous failure
        // could execute a game mutation twice.
        loop {
            let Some(request) = incoming.read_message()? else {
                return Ok(());
            };
            // Every exchange on a live connection renews the contact time, so a
            // long, idle-but-open session is never mistaken for the game closing.
            mark_contact(&shared);
            let captures_gateway = String::from_utf8_lossy(&request)
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .is_some_and(|path| path.split('?').next() == Some(GATEWAY_PATH));
            last_request = request.clone();
            last_response.clear();
            let mut outgoing = connect_upstream(hostname, upstream, &roots, &name)?;
            let response = exchange_once(&mut outgoing, &request)?;
            last_response = response.clone();
            if captures_gateway {
                capture(&request, &response, &shared);
            }
            // The game may close its keep-alive socket immediately after the
            // response it asked for. On Windows that close can surface while
            // rustls is flushing the response as WSAECONNRESET (10054). The
            // upstream exchange and capture are already complete at this
            // point, so a client-side disconnect must not turn a valid update
            // into a helper-wide capture gap.
            if !forward_response(&mut incoming, &response)? {
                diagnostics::record(
                    "game",
                    "Summoners War closed the local gateway connection while the helper was forwarding a completed response",
                );
                return Ok(());
            }
        }
    })();
    shared.open_connections.fetch_sub(1, Ordering::AcqRel);
    if let Err(error) = result {
        diagnostics::record("capture", &error);
        let profile = shared
            .profile
            .lock()
            .expect("profile lock poisoned")
            .read()
            .and_then(|value| serde_json::to_value(value).ok());
        shared
            .incidents
            .lock()
            .expect("incident lock poisoned")
            .record(&error, &last_request, &last_response, profile);
        *shared.last_error.lock().expect("error lock poisoned") = Some(format!(
            "Gateway exchange failed: {error}. Save an error report, then restart the helper and game."
        ));
    }
}

/// Finds the gateway's real address by DNS, ignoring any loopback answer left by
/// a redirect from an earlier run, and falls back to the shipped address when
/// resolution yields nothing usable.
fn resolve_upstream(hostname: &str, fallback: &str) -> String {
    use std::net::ToSocketAddrs;
    (hostname, 443u16)
        .to_socket_addrs()
        .into_iter()
        .flatten()
        .map(|address| address.ip())
        .find(|ip| ip.is_ipv4() && !ip.is_loopback())
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| fallback.to_owned())
}

/// Opens a fresh TLS connection to the real gateway.
fn connect_upstream(
    hostname: &str,
    upstream: &str,
    roots: &RootCertStore,
    name: &ServerName<'static>,
) -> Result<Connection<StreamOwned<ClientConnection, TcpStream>>, String> {
    let client = ClientConfig::builder()
        .with_root_certificates(roots.clone())
        .with_no_client_auth();
    let address = format!("{upstream}:443")
        .parse()
        .map_err(|error| format!("Invalid gateway address: {error}"))?;
    let stream = TcpStream::connect_timeout(&address, Duration::from_secs(15))
        .map_err(|error| format!("Could not connect to {hostname}: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| error.to_string())?;
    Ok(Connection::new(StreamOwned::new(
        ClientConnection::new(Arc::new(client), name.clone()).map_err(|error| error.to_string())?,
        stream,
    )))
}

/// Sends one request and insists on an answer, for a connection just opened.
fn exchange_once(
    connection: &mut Connection<StreamOwned<ClientConnection, TcpStream>>,
    request: &[u8],
) -> Result<Vec<u8>, String> {
    connection
        .write_message(request)
        .map_err(|error| error.to_string())?;
    connection
        .read_message()?
        .ok_or_else(|| "The gateway closed without answering.".into())
}

/// One end of a kept-alive connection, holding whatever was read past the
/// message it was asked for.
///
/// A single read can arrive carrying the end of one message and the start of the
/// next. Those extra bytes belong to the following message, so they are kept
/// here rather than discarded — dropping them loses the game's next command.
struct Connection<S> {
    stream: S,
    pending: Vec<u8>,
}

impl<S: Read + Write> Connection<S> {
    fn new(stream: S) -> Self {
        Self {
            stream,
            pending: Vec::new(),
        }
    }

    /// Reads one HTTP message, or `None` when the peer closed cleanly between
    /// messages. On a keep-alive connection that close is how a session ends, so
    /// it must not be reported as a failure the dashboard shows.
    fn read_message(&mut self) -> Result<Option<Vec<u8>>, String> {
        let mut buffer = [0; 16 * 1024];
        let header_end = loop {
            if let Some(end) = self
                .pending
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
            {
                break end + 4;
            }
            if self.pending.len() > 64 * 1024 {
                return Err("The game response was too large to import safely.".into());
            }
            match self.fill(&mut buffer)? {
                0 if self.pending.is_empty() => return Ok(None),
                0 => return Err("The gateway closed before sending an HTTP header.".into()),
                _ => {}
            }
        };
        if header_end > 64 * 1024 {
            return Err("The HTTP header was too large.".into());
        }
        let header = std::str::from_utf8(&self.pending[..header_end])
            .map_err(|_| "The HTTP header was not text.")?;
        let mut length = None;
        for line in header.lines().skip(1).filter(|line| !line.is_empty()) {
            let (name, value) = line.split_once(':').ok_or("Malformed HTTP header.")?;
            if name.eq_ignore_ascii_case("transfer-encoding") {
                return Err("Unsupported HTTP transfer encoding. Save an error report.".into());
            }
            if name.eq_ignore_ascii_case("content-length") {
                let value = value.trim();
                if value.is_empty()
                    || !value.bytes().all(|byte| byte.is_ascii_digit())
                    || length.is_some()
                {
                    return Err("Invalid or repeated HTTP Content-Length.".into());
                }
                length = Some(
                    value
                        .parse::<usize>()
                        .map_err(|_| "Invalid HTTP Content-Length.")?,
                );
            }
        }
        if length.is_none() && header.starts_with("HTTP/") {
            let status = header.split_whitespace().nth(1).unwrap_or_default();
            if !matches!(status, "204" | "304") && !status.starts_with('1') {
                return Err(
                    "The gateway response has no explicit body length. Save an error report."
                        .into(),
                );
            }
        }
        let length = length.unwrap_or(0);
        if length > MAXIMUM_INTERCEPTED_BODY_BYTES {
            return Err("The game response was too large to import safely.".into());
        }
        while self.pending.len() < header_end + length {
            if self.fill(&mut buffer)? == 0 {
                return Err("The gateway closed before sending its complete HTTP body.".into());
            }
        }
        // Anything past this message is the next one, so it stays buffered.
        let remainder = self.pending.split_off(header_end + length);
        let message = std::mem::replace(&mut self.pending, remainder);
        Ok(Some(message))
    }

    /// Appends one read to the buffer, reporting a dropped reused connection as
    /// a clean end rather than a failure.
    fn fill(&mut self, buffer: &mut [u8]) -> Result<usize, String> {
        match self.stream.read(buffer) {
            Ok(read) => {
                self.pending.extend_from_slice(&buffer[..read]);
                Ok(read)
            }
            Err(error)
                if self.pending.is_empty()
                    && matches!(
                        error.kind(),
                        io::ErrorKind::ConnectionReset
                            | io::ErrorKind::ConnectionAborted
                            | io::ErrorKind::UnexpectedEof
                            | io::ErrorKind::TimedOut
                            | io::ErrorKind::WouldBlock
                    ) =>
            {
                Ok(0)
            }
            Err(error) => Err(error.to_string()),
        }
    }

    fn write_message(&mut self, message: &[u8]) -> io::Result<()> {
        self.stream.write_all(message)?;
        self.stream.flush()
    }
}

fn peer_disconnected(kind: io::ErrorKind) -> bool {
    matches!(
        kind,
        io::ErrorKind::BrokenPipe
            | io::ErrorKind::ConnectionAborted
            | io::ErrorKind::ConnectionReset
            | io::ErrorKind::NotConnected
            | io::ErrorKind::UnexpectedEof
    )
}

fn forward_response<S: Read + Write>(
    connection: &mut Connection<S>,
    response: &[u8],
) -> Result<bool, String> {
    match connection.write_message(response) {
        Ok(()) => Ok(true),
        Err(error) if peer_disconnected(error.kind()) => Ok(false),
        Err(error) => Err(format!(
            "Could not forward the gateway response to Summoners War: {error}"
        )),
    }
}

fn capture(request: &[u8], response: &[u8], shared: &Shared) {
    let fail = |reason: String| {
        diagnostics::record("capture", &reason);
        let profile = shared
            .profile
            .lock()
            .expect("profile lock poisoned")
            .read()
            .and_then(|value| serde_json::to_value(value).ok());
        shared
            .incidents
            .lock()
            .expect("incident lock poisoned")
            .record(&reason, request, response, profile);
    };
    let Ok(request_text) = std::str::from_utf8(http_body(request)) else {
        diagnostics::record(
            "capture",
            "Skipped an auxiliary exchange whose request body was not text",
        );
        return;
    };
    let request = match decode_request(request_text) {
        Ok(request) => request,
        Err(error) => {
            diagnostics::record(
                "capture",
                &format!(
                    "Skipped an auxiliary exchange whose request could not be decoded: {error}"
                ),
            );
            return;
        }
    };
    let Some(command) = request
        .get("command")
        .and_then(Value::as_str)
        .filter(|command| !command.is_empty())
    else {
        diagnostics::record(
            "capture",
            "Skipped an auxiliary exchange without a command name",
        );
        return;
    };
    let command_name = command.to_owned();
    let required_snapshot = is_snapshot_command(command);
    let Ok(response_text) = std::str::from_utf8(http_body(response)) else {
        if required_snapshot {
            fail(format!("The response to {command_name} was not text."));
        } else {
            diagnostics::record(
                "capture",
                &format!("Skipped {command_name}: its auxiliary response was not text"),
            );
        }
        return;
    };
    let response = match decode_response(response_text) {
        Ok(response) => response,
        Err(error) => {
            if required_snapshot {
                fail(format!(
                    "Could not decode the response to {command_name}: {error}"
                ));
            } else {
                // The game routes chat and service lookups through this gateway
                // too. They are not account data, so their separate envelope
                // must not invalidate a login snapshot that was already read.
                diagnostics::record(
                    "capture",
                    &format!(
                        "Skipped {command_name}: its auxiliary response is outside the account capture protocol ({error})"
                    ),
                );
            }
            return;
        }
    };
    if !response.is_object() {
        if required_snapshot {
            fail(format!("{command_name} has no response object."));
        } else {
            diagnostics::record(
                "capture",
                &format!("Skipped {command_name}: its auxiliary response is not an object"),
            );
        }
        return;
    }
    shared
        .traffic
        .lock()
        .expect("traffic lock poisoned")
        .record(Some(command), &request, &response);
    let mut profile = shared.profile.lock().expect("profile lock poisoned");
    if required_snapshot {
        let accepted = profile.accept_snapshot(response);
        if !accepted {
            profile.clear();
            drop(profile);
            fail(format!(
                "{command_name} did not contain a valid account snapshot. The old account was discarded."
            ));
            return;
        }
        shared
            .incidents
            .lock()
            .expect("incident lock poisoned")
            .recover();
        let status = profile.status();
        diagnostics::record(
            "capture",
            &format!(
                "{command_name} captured a full account snapshot (session {}, revision {})",
                status.session_id, status.revision
            ),
        );
        drop(profile);
        *shared
            .waiting_for_login
            .lock()
            .expect("game state lock poisoned") = false;
        shared
            .game_started_before_helper
            .store(false, Ordering::Release);
    } else if shared
        .incidents
        .lock()
        .expect("incident lock poisoned")
        .active()
    {
        diagnostics::record(
            "capture",
            &format!("Held back {command_name}: the capture gap stands until the next login"),
        );
    } else if let Some(reason) = profile.unmodeled_exchange(&response, &request) {
        drop(profile);
        fail(reason);
    } else if profile.apply_update(&response, &request) {
        diagnostics::record(
            "capture",
            &format!(
                "{command_name} changed the snapshot (revision {})",
                profile.status().revision
            ),
        );
    } else {
        /* The silent case is the one that brings a user here: the dashboard
        says Connected, the account is yesterday's, and the log said nothing
        because nothing happened. A command the account model does not act on
        names itself instead, so the game's own word for what the user just
        did can be looked up rather than guessed at. */
        diagnostics::record(
            "capture",
            &format!("{command_name} changed nothing in the snapshot"),
        );
    }
}

fn is_snapshot_command(command: &str) -> bool {
    matches!(command, "HubUserLogin" | "GuestLogin")
}

fn http_body(message: &[u8]) -> &[u8] {
    message
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| &message[index + 4..])
        .unwrap_or_default()
}

fn certificate_config(directory: &Path, provision: bool) -> Result<Arc<ServerConfig>, String> {
    let certificates = directory.join("certificates");
    let ca_path = certificates.join("ca.pem");
    let leaf_path = certificates.join("gateway.pem");
    let key_path = certificates.join("gateway.key");
    if !leaf_path.exists() || !key_path.exists() || !ca_path.exists() {
        if !provision {
            return Err("The certificate provisioned before elevation is unavailable. Start the helper normally under the same Windows account used for the game; elevating as a different user cannot reuse its local certificate.".into());
        }
        fs::create_dir_all(&certificates).map_err(|error| error.to_string())?;
        let mut ca_params =
            CertificateParams::new(Vec::<String>::new()).map_err(|error| error.to_string())?;
        ca_params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        // Constrain the local root to the Summoners War gateway domain. A rogue
        // root that can vouch for any site is the dangerous, adware-like case;
        // this one can only ever certify *.qpyou.cn, so a copy of it cannot be
        // turned against the user's banking or mail.
        ca_params.name_constraints = Some(NameConstraints {
            permitted_subtrees: vec![GeneralSubtree::DnsName(".qpyou.cn".to_owned())],
            excluded_subtrees: Vec::new(),
        });
        ca_params
            .distinguished_name
            .push(DnType::CommonName, "JASWA Helper Local Root");
        let ca_key = KeyPair::generate().map_err(|error| error.to_string())?;
        let ca = ca_params
            .self_signed(&ca_key)
            .map_err(|error| error.to_string())?;
        let names: Vec<String> = GATEWAYS
            .iter()
            .map(|(name, _, _)| (*name).to_owned())
            .collect();
        let leaf_params = CertificateParams::new(names).map_err(|error| error.to_string())?;
        let leaf_key = KeyPair::generate().map_err(|error| error.to_string())?;
        let leaf = leaf_params
            .signed_by(&leaf_key, &ca, &ca_key)
            .map_err(|error| error.to_string())?;
        fs::write(&ca_path, ca.pem()).map_err(|error| error.to_string())?;
        fs::write(&leaf_path, leaf.pem()).map_err(|error| error.to_string())?;
        fs::write(&key_path, leaf_key.serialize_pem()).map_err(|error| error.to_string())?;
    }
    // Re-adding the same root is idempotent and restores trust if it was
    // removed from Windows while the local identity was intentionally kept.
    if provision {
        install_certificate(&ca_path)?;
    }
    let mut certificate_reader =
        io::BufReader::new(fs::File::open(leaf_path).map_err(|error| error.to_string())?);
    let certificates: Vec<CertificateDer<'static>> = rustls_pemfile::certs(&mut certificate_reader)
        .collect::<Result<_, _>>()
        .map_err(|error| error.to_string())?;
    let mut key_reader =
        io::BufReader::new(fs::File::open(key_path).map_err(|error| error.to_string())?);
    let key = rustls_pemfile::private_key(&mut key_reader)
        .map_err(|error| error.to_string())?
        .ok_or("The local helper key is missing.")?;
    ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certificates, key)
        .map(Arc::new)
        .map_err(|error| error.to_string())
}

fn install_certificate(path: &Path) -> Result<(), String> {
    let mut reader = io::BufReader::new(fs::File::open(path).map_err(|error| error.to_string())?);
    let certificate = rustls_pemfile::certs(&mut reader)
        .next()
        .transpose()
        .map_err(|error| error.to_string())?
        .ok_or("The local helper certificate is missing.")?;
    crate::windows::install_root_certificate(certificate.as_ref())
}
fn hosts_path() -> PathBuf {
    std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\Windows"))
        .join("System32\\drivers\\etc\\hosts")
}
fn helper_block() -> String {
    std::iter::once(HOSTS_MARKER.to_owned())
        .chain(
            GATEWAYS
                .iter()
                .map(|(host, address, _)| format!("{address}\t{host}")),
        )
        .chain(std::iter::once(format!("{HOSTS_MARKER} end")))
        .collect::<Vec<_>>()
        .join("\r\n")
}
fn without_hosts_entries(contents: &str) -> String {
    let owned: Vec<String> = helper_block().split("\r\n").map(str::to_owned).collect();
    contents
        .replace("\r\n", "\n")
        .lines()
        .filter(|line| !owned.iter().any(|owned| owned == line))
        .collect::<Vec<_>>()
        .join("\r\n")
}
fn install_hosts() -> Result<(), String> {
    let path = hosts_path();
    let current = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if current
        .lines()
        .collect::<Vec<_>>()
        .windows(helper_block().lines().count())
        .any(|lines| lines == helper_block().lines().collect::<Vec<_>>())
    {
        return Ok(());
    }
    fs::write(
        &path,
        format!(
            "{}\r\n\r\n{}\r\n",
            without_hosts_entries(&current).trim_end(),
            helper_block()
        ),
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}
fn remove_hosts() -> Result<(), String> {
    let path = hosts_path();
    let current = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if !current.contains(HOSTS_MARKER) {
        return Ok(());
    }
    fs::write(
        &path,
        format!("{}\r\n", without_hosts_entries(&current).trim_end()),
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encoded(value: &Value, compressed: bool) -> String {
        use base64::{Engine as _, engine::general_purpose::STANDARD};
        use cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7};
        let mut plain = serde_json::to_vec(value).unwrap();
        if compressed {
            let mut encoder =
                flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(&plain).unwrap();
            plain = encoder.finish().unwrap();
        }
        let length = plain.len();
        plain.resize(length + 16, 0);
        let bytes = cbc::Encryptor::<aes::Aes128>::new_from_slices(b"Gr4S2eiNl7zq5MrU", &[0; 16])
            .unwrap()
            .encrypt_padded_mut::<Pkcs7>(&mut plain, length)
            .unwrap();
        STANDARD.encode(bytes)
    }

    #[test]
    fn a_failed_login_stays_visible_until_a_complete_login() {
        let shared = shared_for_test();
        let login = message(&encoded(&json!({"command": "HubUserLogin"}), false));
        let bad = message("broken envelope");
        capture(login.as_bytes(), bad.as_bytes(), &shared);
        assert!(
            status(&shared)["lastError"]
                .as_str()
                .unwrap()
                .contains("Save an error report")
        );
        let request = message(&encoded(&json!({"command": "GetSomething"}), false));
        let response = message(&encoded(&json!({"ret_code": 0}), true));
        capture(request.as_bytes(), response.as_bytes(), &shared);
        assert!(
            !status(&shared)["lastError"].is_null(),
            "an unrelated success cannot repair missing data"
        );
        let account = message(&encoded(
            &json!({"ret_code": 0, "unit_list": [], "runes": []}),
            true,
        ));
        capture(login.as_bytes(), account.as_bytes(), &shared);
        assert!(status(&shared)["lastError"].is_null());
        assert!(shared.incidents.lock().unwrap().report()["firstFailure"].is_object());
        capture(login.as_bytes(), response.as_bytes(), &shared);
        assert_eq!(
            status(&shared)["hasProfile"],
            false,
            "a rejected login must not retain another account"
        );
        assert!(!status(&shared)["lastError"].is_null());
    }

    #[test]
    fn an_unreadable_auxiliary_exchange_cannot_stop_a_captured_account() {
        let shared = shared_for_test();
        *shared.game_running.lock().unwrap() = true;
        let login = message(&encoded(&json!({"command": "HubUserLogin"}), false));
        let account = message(&encoded(
            &json!({"ret_code": 0, "unit_list": [], "runes": []}),
            true,
        ));
        capture(login.as_bytes(), account.as_bytes(), &shared);

        let chat = message(&encoded(&json!({"command": "GetChatServerInfo"}), false));
        let auxiliary_response = message("not an account envelope");
        capture(chat.as_bytes(), auxiliary_response.as_bytes(), &shared);

        assert!(status(&shared)["profileReady"].as_bool().unwrap());
        assert!(status(&shared)["lastError"].is_null());
        assert!(
            !shared.incidents.lock().unwrap().active(),
            "chat-service traffic must not turn a healthy account capture into an incident"
        );
    }

    #[test]
    fn rejects_ambiguous_http_framing_instead_of_dropping_the_body() {
        for headers in [
            "Content-Length: nope",
            "Content-Length: 1\r\nContent-Length: 2",
            "Transfer-Encoding: chunked",
            "Content-Length: 999999999999999999999999",
            "Content-Length: -1",
        ] {
            let mut connection = Connection::new(Conversation {
                incoming: io::Cursor::new(
                    format!("POST / HTTP/1.1\r\n{headers}\r\n\r\nx").into_bytes(),
                ),
            });
            assert!(connection.read_message().is_err(), "{headers}");
        }
    }

    #[test]
    fn local_api_reads_fragmented_case_insensitive_origin_and_refuses_stale_profiles() {
        let shared = Arc::new(shared_for_test());
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let mut client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let worker =
            thread::spawn(move || respond_api(listener.accept().unwrap().0, shared).unwrap());
        client.write_all(b"GET /profile HTTP/1.1\r\nOr").unwrap();
        client
            .write_all(b"IgIn: http://localhost:3000\r\n\r\n")
            .unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        assert!(response.starts_with("HTTP/1.1 409"));
        assert!(response.contains("Access-Control-Allow-Origin: http://localhost:3000"));
        worker.join().unwrap();
    }

    /// A pair of HTTP messages on one connection, as the game sends them.
    struct Conversation {
        incoming: io::Cursor<Vec<u8>>,
    }

    impl Read for Conversation {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            self.incoming.read(buffer)
        }
    }
    impl Write for Conversation {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            Ok(buffer.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    struct ResetWriter;

    impl Read for ResetWriter {
        fn read(&mut self, _buffer: &mut [u8]) -> io::Result<usize> {
            Ok(0)
        }
    }

    impl Write for ResetWriter {
        fn write(&mut self, _buffer: &[u8]) -> io::Result<usize> {
            Err(io::Error::new(
                io::ErrorKind::ConnectionReset,
                "the game closed the connection",
            ))
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    fn message(body: &str) -> String {
        format!(
            "POST /api/gateway_c2.php HTTP/1.1\r\nHost: gateway\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
    }

    /// The keep-alive failure this reader exists for: the game sends its next
    /// command on the same connection, so one call must stop at the end of the
    /// first message and leave the second for the call after it. Reading both as
    /// one message, or stopping after one, cost every request but the first and
    /// the game reported "Network connection delayed (M:238)".
    #[test]
    fn reads_each_message_of_a_reused_connection_in_turn() {
        let mut connection = Connection::new(Conversation {
            incoming: io::Cursor::new(
                format!("{}{}", message("first"), message("second")).into_bytes(),
            ),
        });
        let first = connection.read_message().unwrap().unwrap();
        assert!(String::from_utf8_lossy(&first).ends_with("first"));
        let second = connection.read_message().unwrap().unwrap();
        assert!(String::from_utf8_lossy(&second).ends_with("second"));
        assert!(
            connection.read_message().unwrap().is_none(),
            "a spent connection reports its end rather than an error"
        );
    }

    /// Both messages arriving in one read is the case that loses data: the
    /// bytes past the first message are the second one and must be kept.
    #[test]
    fn keeps_the_next_message_when_one_read_carries_both() {
        let both = format!("{}{}", message("one"), message("two")).into_bytes();
        let mut connection = Connection::new(Conversation {
            incoming: io::Cursor::new(both.clone()),
        });
        let first = connection.read_message().unwrap().unwrap();
        assert_eq!(first.len(), message("one").len());
        assert!(
            !connection.pending.is_empty(),
            "the over-read bytes are the next message and must be buffered"
        );
        let second = connection.read_message().unwrap().unwrap();
        assert!(String::from_utf8_lossy(&second).ends_with("two"));
    }

    /// A close between messages is how a keep-alive session ends. Reporting it
    /// as an error would put a failure on the dashboard for ordinary shutdown.
    #[test]
    fn reports_a_clean_close_between_messages_as_the_end() {
        let mut connection = Connection::new(Conversation {
            incoming: io::Cursor::new(Vec::new()),
        });
        assert!(connection.read_message().unwrap().is_none());
    }

    #[test]
    fn treats_a_game_reset_while_forwarding_as_a_closed_client() {
        let mut connection = Connection::new(ResetWriter);
        assert_eq!(forward_response(&mut connection, b"response").unwrap(), false);
        assert!(peer_disconnected(io::ErrorKind::ConnectionReset));
        assert!(!peer_disconnected(io::ErrorKind::TimedOut));
    }

    /// A message that stops mid-body is a real failure and must stay one, so a
    /// truncated capture is never mistaken for a complete exchange.
    #[test]
    fn rejects_a_message_that_ends_inside_its_body() {
        let mut connection = Connection::new(Conversation {
            incoming: io::Cursor::new(
                "POST /api/gateway_c2.php HTTP/1.1\r\nContent-Length: 99\r\n\r\nshort"
                    .as_bytes()
                    .to_vec(),
            ),
        });
        assert!(connection.read_message().is_err());
    }

    /// A header with no body is complete at its blank line; waiting for a body
    /// the sender will never send would stall the connection.
    #[test]
    fn reads_a_message_that_carries_no_body() {
        let mut connection = Connection::new(Conversation {
            incoming: io::Cursor::new(b"GET /health HTTP/1.1\r\nHost: gateway\r\n\r\n".to_vec()),
        });
        let read = connection.read_message().unwrap().unwrap();
        assert!(String::from_utf8_lossy(&read).ends_with("\r\n\r\n"));
    }

    #[test]
    fn keeps_only_this_helpers_hosts_entries_out_of_the_file() {
        let existing = "127.0.0.1\tlocalhost\r\n";
        let installed = format!("{existing}\r\n{}\r\n", helper_block());
        let cleaned = without_hosts_entries(&installed);
        assert!(cleaned.contains("127.0.0.1\tlocalhost"));
        assert!(!cleaned.contains("qpyou.cn"));
        assert!(!cleaned.contains(HOSTS_MARKER));
    }

    fn shared_for_test() -> Shared {
        Shared {
            running: AtomicBool::new(true),
            profile: Mutex::new(ProfileStore::default()),
            traffic: Mutex::new(TrafficLog::new(None)),
            game_running: Mutex::new(false),
            waiting_for_login: Mutex::new(false),
            game_started_before_helper: AtomicBool::new(false),
            game_started_at: Mutex::new(None),
            open_connections: AtomicUsize::new(0),
            last_contact: Mutex::new(None),
            last_error: Mutex::new(None),
            incidents: Mutex::new(Incidents::default()),
            api_connections: AtomicUsize::new(0),
        }
    }

    /// A game that has never connected is not running — the state the helper
    /// starts in and returns to after the game closes.
    #[test]
    fn a_game_that_never_connected_is_not_running() {
        let shared = shared_for_test();
        assert!(!game_reaching_redirect(&shared));
        assert!(!game_is_running(
            game_reaching_redirect(&shared),
            Some(false)
        ));
    }

    #[test]
    fn tells_jaswa_when_the_game_predated_the_helper() {
        let shared = shared_for_test();
        shared
            .game_started_before_helper
            .store(true, Ordering::Release);

        let report = status(&shared);
        assert_eq!(report["gameStartedBeforeHelper"], true);
        assert_eq!(report["restartRequired"], true);
        assert_eq!(report["profileReady"], false);

        /* A normal later launch has no startup marker, so this warning cannot
        reappear merely because the helper sees the game's process again. */
        shared
            .game_started_before_helper
            .store(false, Ordering::Release);
        assert_eq!(status(&shared)["restartRequired"], false);
    }

    /// An open gateway connection is the plain signal the game is running, and
    /// needs no scan of the system's process list.
    #[test]
    fn an_open_connection_means_the_game_is_running() {
        let shared = shared_for_test();
        shared.open_connections.fetch_add(1, Ordering::AcqRel);
        assert!(game_reaching_redirect(&shared));
        assert!(game_is_running(true, None));
        shared.open_connections.fetch_sub(1, Ordering::AcqRel);
    }

    /// A connection that has just closed still counts within the grace window,
    /// so a brief reconnect is not read as the game closing and does not drop
    /// the captured account.
    #[test]
    fn a_recent_connection_survives_the_grace_window() {
        let shared = shared_for_test();
        mark_contact(&shared);
        assert!(
            game_reaching_redirect(&shared),
            "just-closed connection still counts"
        );

        if let Some(stale) = Instant::now().checked_sub(GAME_QUIET_GRACE + Duration::from_secs(5)) {
            *shared.last_contact.lock().unwrap() = Some(stale);
            assert!(
                !game_reaching_redirect(&shared),
                "a game silent past the grace window has no live connection"
            );
        }
    }

    /// The failure this guards: ordinary play goes quiet for minutes with no
    /// gateway socket at all, and the login that carries the account is sent
    /// once per launch. Dropping the snapshot on that silence left the helper
    /// waiting for a login the running game would never send again.
    #[test]
    fn a_quiet_but_running_game_keeps_its_snapshot() {
        let shared = shared_for_test();
        *shared.game_running.lock().unwrap() = true;
        let login = message(&encoded(&json!({"command": "HubUserLogin"}), false));
        let account = message(&encoded(
            &json!({"ret_code": 0, "unit_list": [], "runes": []}),
            true,
        ));
        capture(login.as_bytes(), account.as_bytes(), &shared);
        if let Some(stale) = Instant::now().checked_sub(GAME_QUIET_GRACE + Duration::from_secs(5)) {
            *shared.last_contact.lock().unwrap() = Some(stale);
        }

        assert!(
            game_is_running(game_reaching_redirect(&shared), Some(true)),
            "the process list, not gateway silence, says whether the game closed"
        );
        assert!(
            !game_is_running(game_reaching_redirect(&shared), Some(false)),
            "a game whose process is gone has genuinely closed"
        );
        assert!(
            !game_is_running(game_reaching_redirect(&shared), None),
            "an unreadable process list falls back to the connection evidence"
        );
        assert!(status(&shared)["profileReady"].as_bool().unwrap());
    }

    /// A quiet game has nothing to send, so its silence must not be reported as
    /// a login the helper is still missing.
    #[test]
    fn a_quiet_game_is_not_reported_as_a_pending_login() {
        let shared = shared_for_test();
        mark_game_start(&shared);
        *shared.game_started_at.lock().unwrap() =
            Instant::now().checked_sub(LOGIN_CAPTURE_GRACE + Duration::from_secs(1));
        assert!(
            !login_capture_overdue(&shared, false, false),
            "no live connection means no connection to blame for a missing login"
        );
    }

    #[test]
    fn a_new_game_connection_gets_time_to_send_its_login() {
        let shared = shared_for_test();
        shared.open_connections.fetch_add(1, Ordering::AcqRel);
        mark_game_start(&shared);
        assert!(
            !login_capture_overdue(&shared, true, false),
            "an open connection alone is normal game startup, not proof of a missed login"
        );
        *shared.game_started_at.lock().unwrap() =
            Instant::now().checked_sub(LOGIN_CAPTURE_GRACE + Duration::from_secs(1));
        assert!(
            login_capture_overdue(&shared, true, false),
            "only a full startup window without a snapshot asks for a restart"
        );
    }

    /// The game reopens its gateway socket constantly during play. One line per
    /// reconnect read as the game restarting over and over.
    #[test]
    fn the_redirect_connection_is_announced_once_per_session() {
        let shared = shared_for_test();
        mark_game_start(&shared);
        let first = *shared.game_started_at.lock().unwrap();
        mark_game_start(&shared);
        assert_eq!(
            first,
            *shared.game_started_at.lock().unwrap(),
            "a reconnect joins the session already under way"
        );
    }
}
