use crate::{
    config::{GATEWAYS, HELPER_PORT, HOSTS_MARKER, allowed_origin, data_directory},
    diagnostics,
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
/// How the helper keeps working while the game is running is by watching its
/// live gateway connection. A game that has closed every connection and sent
/// nothing for this long is treated as gone, and its snapshot is dropped.
const GAME_QUIET_GRACE: Duration = Duration::from_secs(60);
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(3);

pub struct Service {
    shared: Arc<Shared>,
}

struct Shared {
    running: AtomicBool,
    profile: Mutex<ProfileStore>,
    traffic: Mutex<TrafficLog>,
    game_running: Mutex<bool>,
    waiting_for_fresh_start: Mutex<bool>,
    /// Number of gateway connections the game currently holds open. A live
    /// connection is the plainest evidence the game is running and reaching the
    /// redirect, and needs no scan of the system's other processes.
    open_connections: AtomicUsize,
    /// When the game last connected or sent anything, so a brief reconnect does
    /// not read as the game having closed.
    last_contact: Mutex<Option<Instant>>,
    last_error: Mutex<Option<String>>,
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
    certificate_config(&directory).map(|_| ())
}

impl Service {
    pub fn start() -> Result<Self, String> {
        let directory = data_directory();
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        // Re-reads the identity provisioned before elevation. Installing the
        // root again from here is harmless when the user is unelevated, and a
        // no-op the game never depends on when they are.
        let server = certificate_config(&directory)?;
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
        install_hosts()?;
        diagnostics::record("hosts", "Local gateway redirect installed");
        let shared = Arc::new(Shared {
            running: AtomicBool::new(true),
            profile: Mutex::new(ProfileStore::default()),
            traffic: Mutex::new(TrafficLog::new(None)),
            game_running: Mutex::new(false),
            waiting_for_fresh_start: Mutex::new(false),
            open_connections: AtomicUsize::new(0),
            last_contact: Mutex::new(None),
            last_error: Mutex::new(None),
        });
        start_api(Arc::clone(&shared))?;
        start_watchdog(Arc::clone(&shared));
        for ((hostname, local_address, _), upstream) in GATEWAYS.iter().zip(upstreams) {
            start_bridge(
                Arc::clone(&shared),
                Arc::clone(&server),
                hostname,
                local_address,
                upstream,
            )?;
        }
        Ok(Self { shared })
    }

    pub fn stop(&self) {
        self.shared.running.store(false, Ordering::Release);
        let _ = remove_hosts();
    }

    pub fn profile(&self) -> Option<Value> {
        self.shared
            .profile
            .lock()
            .ok()?
            .read()
            .and_then(|profile| serde_json::to_value(profile).ok())
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
        let _ = crate::windows::remove_root_certificate("JASWA Helper Local Root");
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
    let waiting = *shared
        .waiting_for_fresh_start
        .lock()
        .expect("game state lock poisoned");
    let last_error = shared
        .last_error
        .lock()
        .expect("error lock poisoned")
        .clone();
    json!({
        "running": shared.running.load(Ordering::Acquire),
        "hasProfile": snapshot.has_profile,
        "updatedAt": snapshot.updated_at,
        "source": snapshot.source,
        "revision": snapshot.revision,
        "sessionId": snapshot.session_id,
        "instanceId": snapshot.instance_id,
        "profileReady": snapshot.has_profile && game_running && last_error.is_none(),
        "restartRequired": game_running && waiting && !snapshot.has_profile,
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
                    let shared = Arc::clone(&shared);
                    thread::spawn(move || {
                        let _ = respond_api(stream, shared);
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
    let mut request = [0; 16 * 1024];
    let read = stream.read(&mut request)?;
    let request = String::from_utf8_lossy(&request[..read]);
    let mut lines = request.split("\r\n");
    let first = lines.next().unwrap_or_default();
    let origin = lines.find_map(|line| {
        line.strip_prefix("Origin: ")
            .or_else(|| line.strip_prefix("origin: "))
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

            let connected = game_connected(&shared);
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
            let mut waiting = shared
                .waiting_for_fresh_start
                .lock()
                .expect("game state lock poisoned");
            if connected && !has_profile {
                // The game is reaching the redirect but no snapshot exists: the
                // helper came up after the game had already logged in, so the
                // login exchange that carries the account was missed. A restart
                // replays it.
                if !*waiting {
                    diagnostics::record(
                        "game",
                        "Connected, but no login exchange was seen — the helper started after the game had logged in. Restarting Summoners War replays it.",
                    );
                }
                *waiting = true;
            }
            if !*prior && connected {
                diagnostics::record("game", "Summoners War connected to the local redirect");
            }
            if *prior && !connected {
                // The game has gone: its snapshot belongs to a session that is
                // over, so drop it rather than keep serving a stale account.
                shared
                    .profile
                    .lock()
                    .expect("profile lock poisoned")
                    .clear();
                *waiting = false;
                diagnostics::record(
                    "game",
                    "Summoners War closed — the captured snapshot was dropped, so JASWA keeps the last import it saved",
                );
            }
            *prior = connected;
            drop(waiting);
            drop(prior);
            thread::sleep(WATCHDOG_INTERVAL);
        }
    });
}

/// The game counts as running while it holds a gateway connection open, or has
/// used one within the grace window. The grace covers a brief reconnect so a
/// dropped-and-remade connection does not read as the game closing.
fn game_connected(shared: &Shared) -> bool {
    if shared.open_connections.load(Ordering::Acquire) > 0 {
        return true;
    }
    shared
        .last_contact
        .lock()
        .expect("contact lock poisoned")
        .is_some_and(|at| at.elapsed() < GAME_QUIET_GRACE)
}

fn mark_contact(shared: &Shared) {
    *shared
        .last_contact
        .lock()
        .expect("contact lock poisoned") = Some(Instant::now());
}

/// Restores the hosts redirect if it has been removed while the helper runs, and
/// reports the removal so the dashboard can explain why data had stopped
/// arriving. Reads on every pass but writes only when the entry is gone, so an
/// intact file is left untouched.
fn ensure_hosts_redirect(shared: &Shared) {
    // Never re-add the redirect once the helper is stopping: `stop` removes it
    // exactly so a game left running can reach its server directly again.
    if !shared.running.load(Ordering::Acquire) {
        return;
    }
    let intact = fs::read_to_string(hosts_path())
        .map(|contents| contents.contains(HOSTS_MARKER))
        .unwrap_or(false);
    if intact {
        return;
    }
    let message = match install_hosts() {
        Ok(()) => "Summoners War's local redirect was removed while the helper was running, so the game stopped sending fresh data. The helper restored it — this is usually antivirus reverting the hosts file. If your account keeps showing old data, allow JASWA Helper in your antivirus.".to_owned(),
        Err(error) => format!(
            "JASWA Helper could not restore Summoners War's local redirect, so the game cannot send fresh data. Another program, usually antivirus, is blocking the hosts file: {error}"
        ),
    };
    diagnostics::record("hosts", &message);
    *shared.last_error.lock().expect("error lock poisoned") = Some(message);
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
                    if let Err(error) = stream.set_nonblocking(false) {
                        *shared.last_error.lock().expect("error lock poisoned") = Some(format!(
                            "Gateway bridge for {hostname} could not prepare a connection: {error}"
                        ));
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
    shared.open_connections.fetch_add(1, Ordering::AcqRel);
    let result = (|| -> Result<(), String> {
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
            let captures_gateway = String::from_utf8_lossy(&request).contains(GATEWAY_PATH);
            let mut outgoing = connect_upstream(hostname, upstream, &roots, &name)?;
            let response = exchange_once(&mut outgoing, &request)?;
            if captures_gateway {
                capture(&request, &response, &shared);
            }
            incoming.write_message(&response)?;
        }
    })();
    shared.open_connections.fetch_sub(1, Ordering::AcqRel);
    if let Err(error) = result {
        *shared.last_error.lock().expect("error lock poisoned") = Some(error);
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
    let stream = TcpStream::connect((upstream, 443))
        .map_err(|error| format!("Could not connect to {hostname}: {error}"))?;
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
    connection.write_message(request)?;
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
            if self.pending.len() > MAXIMUM_INTERCEPTED_BODY_BYTES + 64 * 1024 {
                return Err("The game response was too large to import safely.".into());
            }
            match self.fill(&mut buffer)? {
                0 if self.pending.is_empty() => return Ok(None),
                0 => return Err("The gateway closed before sending an HTTP header.".into()),
                _ => {}
            }
        };
        let header = String::from_utf8_lossy(&self.pending[..header_end]);
        let length = header
            .lines()
            .find_map(|line| {
                line.split_once(':')
                    .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
                    .and_then(|(_, value)| value.trim().parse::<usize>().ok())
            })
            .unwrap_or(0);
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
                    ) =>
            {
                Ok(0)
            }
            Err(error) => Err(error.to_string()),
        }
    }

    fn write_message(&mut self, message: &[u8]) -> Result<(), String> {
        self.stream
            .write_all(message)
            .map_err(|error| error.to_string())?;
        self.stream.flush().map_err(|error| error.to_string())
    }
}

fn capture(request: &[u8], response: &[u8], shared: &Shared) {
    let Ok(request_text) = std::str::from_utf8(http_body(request)) else {
        diagnostics::record("capture", "Skipped an exchange whose request body was not text");
        return;
    };
    let request = match decode_request(request_text) {
        Ok(request) => request,
        Err(error) => {
            diagnostics::record("capture", &format!("Could not decode a game request: {error}"));
            return;
        }
    };
    let command_name = request
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or("(unnamed)")
        .to_owned();
    let Ok(response_text) = std::str::from_utf8(http_body(response)) else {
        diagnostics::record(
            "capture",
            &format!("Skipped {command_name}: its response body was not text"),
        );
        return;
    };
    let response = match decode_response(response_text) {
        Ok(response) => response,
        Err(error) => {
            diagnostics::record(
                "capture",
                &format!("Could not decode the response to {command_name}: {error}"),
            );
            return;
        }
    };
    let command = request.get("command").and_then(Value::as_str);
    shared
        .traffic
        .lock()
        .expect("traffic lock poisoned")
        .record(command, &request, &response);
    let mut profile = shared.profile.lock().expect("profile lock poisoned");
    if matches!(command, Some("HubUserLogin") | Some("GuestLogin")) {
        let accepted = profile.accept_snapshot(response);
        let status = profile.status();
        diagnostics::record(
            "capture",
            &if accepted {
                format!(
                    "{command_name} captured a full account snapshot (session {}, revision {})",
                    status.session_id, status.revision
                )
            } else {
                format!(
                    "{command_name} was rejected: it carried no usable monster and rune lists, so the previous snapshot stands"
                )
            },
        );
        *shared
            .waiting_for_fresh_start
            .lock()
            .expect("game state lock poisoned") = false;
    } else if profile.apply_update(&response, &request) {
        diagnostics::record(
            "capture",
            &format!(
                "{command_name} changed the snapshot (revision {})",
                profile.status().revision
            ),
        );
    }
    *shared.last_error.lock().expect("error lock poisoned") = None;
}

fn http_body(message: &[u8]) -> &[u8] {
    message
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| &message[index + 4..])
        .unwrap_or_default()
}

fn certificate_config(directory: &Path) -> Result<Arc<ServerConfig>, String> {
    let certificates = directory.join("certificates");
    let ca_path = certificates.join("ca.pem");
    let leaf_path = certificates.join("gateway.pem");
    let key_path = certificates.join("gateway.key");
    if !leaf_path.exists() || !key_path.exists() || !ca_path.exists() {
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
    install_certificate(&ca_path)?;
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
            waiting_for_fresh_start: Mutex::new(false),
            open_connections: AtomicUsize::new(0),
            last_contact: Mutex::new(None),
            last_error: Mutex::new(None),
        }
    }

    /// A game that has never connected is not running — the state the helper
    /// starts in and returns to after the game closes.
    #[test]
    fn a_game_that_never_connected_is_not_running() {
        assert!(!game_connected(&shared_for_test()));
    }

    /// An open gateway connection is the plain signal the game is running, which
    /// replaces scanning the system's process list.
    #[test]
    fn an_open_connection_means_the_game_is_running() {
        let shared = shared_for_test();
        shared.open_connections.fetch_add(1, Ordering::AcqRel);
        assert!(game_connected(&shared));
        shared.open_connections.fetch_sub(1, Ordering::AcqRel);
    }

    /// A connection that has just closed still counts within the grace window,
    /// so a brief reconnect is not read as the game closing and does not drop
    /// the captured account.
    #[test]
    fn a_recent_connection_survives_the_grace_window() {
        let shared = shared_for_test();
        mark_contact(&shared);
        assert!(game_connected(&shared), "just-closed connection still counts");

        if let Some(stale) = Instant::now().checked_sub(GAME_QUIET_GRACE + Duration::from_secs(5)) {
            *shared.last_contact.lock().unwrap() = Some(stale);
            assert!(
                !game_connected(&shared),
                "a game silent past the grace window is gone"
            );
        }
    }
}
