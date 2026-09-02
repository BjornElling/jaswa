use crate::{
    config::{GATEWAYS, HELPER_PORT, HOSTS_MARKER, allowed_origin, data_directory},
    profile::ProfileStore,
    protocol::{decode_request, decode_response},
    traffic::TrafficLog,
};
use rcgen::{BasicConstraints, CertificateParams, DnType, IsCa, KeyPair};
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
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

const GATEWAY_PATH: &str = "/api/gateway_c2.php";
const MAXIMUM_INTERCEPTED_BODY_BYTES: usize = 16 * 1024 * 1024;

pub struct Service {
    shared: Arc<Shared>,
}

struct Shared {
    running: AtomicBool,
    profile: Mutex<ProfileStore>,
    traffic: Mutex<TrafficLog>,
    game_running: Mutex<bool>,
    observed_game: Mutex<bool>,
    waiting_for_fresh_start: Mutex<bool>,
    last_error: Mutex<Option<String>>,
}

impl Service {
    pub fn start() -> Result<Self, String> {
        let directory = data_directory();
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let server = certificate_config(&directory)?;
        install_hosts()?;
        let shared = Arc::new(Shared {
            running: AtomicBool::new(true),
            profile: Mutex::new(ProfileStore::default()),
            traffic: Mutex::new(TrafficLog::new(None)),
            game_running: Mutex::new(false),
            observed_game: Mutex::new(false),
            waiting_for_fresh_start: Mutex::new(false),
            last_error: Mutex::new(None),
        });
        start_api(Arc::clone(&shared))?;
        start_game_monitor(Arc::clone(&shared));
        for (hostname, local_address, fallback) in GATEWAYS {
            start_bridge(
                Arc::clone(&shared),
                Arc::clone(&server),
                hostname,
                local_address,
                fallback,
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
        (
            403,
            Some(json!({"error": "This page is not allowed to read JASWA Helper."})),
        )
    } else if route == "/health" {
        (200, Some(status(&shared)))
    } else if route == "/profile" {
        match shared.profile.lock().expect("profile lock poisoned").read() {
            Some(profile) => (
                200,
                Some(serde_json::to_value(profile).expect("serializable profile")),
            ),
            None => (
                404,
                Some(json!({"error": "Start Summoners War to capture an account snapshot."})),
            ),
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

fn start_game_monitor(shared: Arc<Shared>) {
    thread::spawn(move || {
        while shared.running.load(Ordering::Acquire) {
            let running = summoners_war_running();
            let mut prior = shared
                .game_running
                .lock()
                .expect("game state lock poisoned");
            let mut observed = shared
                .observed_game
                .lock()
                .expect("game state lock poisoned");
            if !*observed
                && running
                && !shared
                    .profile
                    .lock()
                    .expect("profile lock poisoned")
                    .status()
                    .has_profile
            {
                *shared
                    .waiting_for_fresh_start
                    .lock()
                    .expect("game state lock poisoned") = true;
            }
            if *prior && !running {
                shared
                    .profile
                    .lock()
                    .expect("profile lock poisoned")
                    .clear();
                *shared
                    .waiting_for_fresh_start
                    .lock()
                    .expect("game state lock poisoned") = false;
            }
            *prior = running;
            *observed = true;
            drop(observed);
            drop(prior);
            thread::sleep(Duration::from_secs(2));
        }
    });
}

fn summoners_war_running() -> bool {
    crate::windows::process_running("SummonersWar.exe")
}

fn start_bridge(
    shared: Arc<Shared>,
    server: Arc<ServerConfig>,
    hostname: &'static str,
    local_address: &'static str,
    upstream: &'static str,
) -> Result<(), String> {
    let listener = TcpListener::bind(format!("{local_address}:443")).map_err(|error| format!("Another program is using port 443 on this computer, so JASWA Helper could not open its local link for {hostname}: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    thread::spawn(move || {
        while shared.running.load(Ordering::Acquire) {
            match listener.accept() {
                Ok((stream, _)) => {
                    if let Err(error) = stream.set_nonblocking(false) {
                        *shared.last_error.lock().expect("error lock poisoned") = Some(format!(
                            "Gateway bridge for {hostname} could not prepare a connection: {error}"
                        ));
                        continue;
                    }
                    let shared = Arc::clone(&shared);
                    let server = Arc::clone(&server);
                    thread::spawn(move || relay(stream, server, hostname, upstream, shared));
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
    let result = (|| -> Result<(), String> {
        let mut incoming = StreamOwned::new(
            ServerConnection::new(server).map_err(|error| error.to_string())?,
            socket,
        );
        let request = read_http_message(&mut incoming)?;
        let captures_gateway = String::from_utf8_lossy(&request).contains(GATEWAY_PATH);
        let roots = RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let client = ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        let name = ServerName::try_from(hostname.to_owned()).map_err(|error| error.to_string())?;
        let stream = TcpStream::connect((upstream, 443))
            .map_err(|error| format!("Could not connect to {hostname}: {error}"))?;
        let mut outgoing = StreamOwned::new(
            ClientConnection::new(Arc::new(client), name).map_err(|error| error.to_string())?,
            stream,
        );
        outgoing
            .write_all(&request)
            .map_err(|error| error.to_string())?;
        outgoing.flush().map_err(|error| error.to_string())?;
        let response = read_http_message(&mut outgoing)?;
        if captures_gateway {
            capture(&request, &response, &shared);
        }
        incoming
            .write_all(&response)
            .map_err(|error| error.to_string())?;
        incoming.flush().map_err(|error| error.to_string())?;
        Ok(())
    })();
    if let Err(error) = result {
        *shared.last_error.lock().expect("error lock poisoned") = Some(error);
    }
}

fn read_http_message(stream: &mut (impl Read + Write)) -> Result<Vec<u8>, String> {
    let mut message = Vec::new();
    let mut buffer = [0; 16 * 1024];
    let header_end;
    loop {
        let read = stream
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("The gateway closed before sending an HTTP header.".into());
        }
        message.extend_from_slice(&buffer[..read]);
        if message.len() > MAXIMUM_INTERCEPTED_BODY_BYTES + 64 * 1024 {
            return Err("The game response was too large to import safely.".into());
        }
        if let Some(end) = message.windows(4).position(|window| window == b"\r\n\r\n") {
            header_end = end + 4;
            break;
        }
    }
    let header = String::from_utf8_lossy(&message[..header_end]);
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
    while message.len() < header_end + length {
        let read = stream
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("The gateway closed before sending its complete HTTP body.".into());
        }
        message.extend_from_slice(&buffer[..read]);
    }
    message.truncate(header_end + length);
    Ok(message)
}

fn capture(request: &[u8], response: &[u8], shared: &Shared) {
    let Ok(request_text) = std::str::from_utf8(http_body(request)) else {
        return;
    };
    let Ok(request) = decode_request(request_text) else {
        return;
    };
    let Ok(response_text) = std::str::from_utf8(http_body(response)) else {
        return;
    };
    let Ok(response) = decode_response(response_text) else {
        return;
    };
    let command = request.get("command").and_then(Value::as_str);
    shared
        .traffic
        .lock()
        .expect("traffic lock poisoned")
        .record(command, &request, &response);
    let mut profile = shared.profile.lock().expect("profile lock poisoned");
    if matches!(command, Some("HubUserLogin") | Some("GuestLogin")) {
        profile.accept_snapshot(response);
        *shared
            .waiting_for_fresh_start
            .lock()
            .expect("game state lock poisoned") = false;
    } else {
        profile.apply_update(&response, &request);
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
