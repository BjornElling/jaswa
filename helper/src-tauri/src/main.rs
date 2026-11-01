#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use jaswa_helper::{config, diagnostics, profile, service::Service, windows};
use serde_json::{Value, json};
use std::fs;
use tauri::{
    Manager, RunEvent, State,
    menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItem, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const SHOW_WINDOW: &str = "show-window";
const QUIT: &str = "quit";
const OPEN_JASWA: &str = "open-jaswa";
const DOWNLOAD_JSON: &str = "download-json";
const SAVE_REPORT: &str = "save-report";
const OPEN_DIAGNOSTICS: &str = "open-diagnostics";
const TRAFFIC: &str = "traffic";
const OPEN_TRAFFIC: &str = "open-traffic";
const RESTART: &str = "restart";
const UPDATE: &str = "update";

struct TrayItems {
    download: MenuItem<tauri::Wry>,
    traffic: CheckMenuItem<tauri::Wry>,
    open_traffic: MenuItem<tauri::Wry>,
    update: CheckMenuItem<tauri::Wry>,
}

#[derive(Debug, PartialEq, Eq)]
struct TrayReading {
    has_profile: bool,
    recording: bool,
    recorded: bool,
    update: Option<String>,
}

impl TrayReading {
    fn from_dashboard(dashboard: &Value) -> Self {
        Self {
            has_profile: dashboard["status"]["hasProfile"] == true,
            recording: dashboard["traffic"]["enabled"] == true,
            recorded: dashboard["traffic"]["recorded"] == true,
            update: dashboard["status"]["updateVersion"]
                .as_str()
                .map(str::to_owned),
        }
    }
}

impl TrayItems {
    fn refresh(&self, service: &Service) -> tauri::Result<()> {
        let reading = TrayReading::from_dashboard(&dashboard(service));
        self.download.set_enabled(reading.has_profile)?;
        self.traffic.set_text(if reading.recording {
            "Stop traffic log"
        } else {
            "Log all traffic"
        })?;
        self.traffic.set_checked(reading.recording)?;
        self.open_traffic.set_enabled(reading.recorded)?;
        self.update.set_text(reading.update.as_ref().map_or_else(
            || "No newer version".to_owned(),
            |version| format!("Update to v{version}"),
        ))?;
        self.update.set_enabled(reading.update.is_some())?;
        self.update.set_checked(reading.update.is_some())?;
        Ok(())
    }
}

struct HelperState {
    service: Service,
}

#[tauri::command]
fn helper_status(state: State<'_, HelperState>) -> Value {
    dashboard(&state.service)
}

/// Returns nothing: the dashboard the caller needs arrives through
/// `helper_status`, and handing back a status object here would put a value the
/// caller treats as a status message into its message line.
#[tauri::command]
fn set_traffic_logging(enabled: bool, state: State<'_, HelperState>) {
    state.service.traffic().set_enabled(enabled);
}

#[tauri::command]
fn open_jaswa() -> Result<(), String> {
    windows::open("http://localhost:3000")
}

/// The address comes from the service, never from the dashboard: the window
/// only asks for "the update", so nothing it renders can choose what opens.
#[tauri::command]
fn download_update(state: State<'_, HelperState>) -> Result<String, String> {
    let release = state
        .service
        .newer_release()
        .ok_or("No newer helper is known. Open JASWA, and it tells the helper.")?;
    windows::open(&release.installer_url())?;
    diagnostics::record(
        "helper",
        &format!("Opened the installer for helper {}", release.version()),
    );
    Ok(format!(
        "Downloading helper {} — run the installer to update.",
        release.version()
    ))
}

#[tauri::command]
fn restart_helper(state: State<'_, HelperState>) -> Result<String, String> {
    state.service.recover()
}

#[tauri::command]
fn download_json(state: State<'_, HelperState>) -> Result<String, String> {
    let snapshot = state
        .service
        .swex_snapshot()
        .ok_or("Start Summoners War to capture an account snapshot.")?;
    let export = profile::serialize_swex_export(&snapshot)
        .ok_or("The captured account cannot be exported as an SWEX-compatible profile.")?;
    let directory = windows::downloads_directory()?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(&export.filename);
    windows::write_private_file(&path, export.content.as_bytes())?;
    Ok(format!(
        "Saved {} to your Downloads folder.",
        export.filename
    ))
}

#[tauri::command]
fn save_error_report(state: State<'_, HelperState>) -> Result<String, String> {
    let mut report = state.service.report();
    let traffic = state.service.traffic().status();
    report["savedAt"] = json!(
        time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default()
    );
    report["summary"] = report_summary(&report["status"]);
    report["traffic"] = serde_json::to_value(&traffic).expect("serializable traffic status");
    report["diagnostics"] = match fs::read_to_string(diagnostics::path()) {
        Ok(log) => json!({"entries": diagnostic_entries(&log), "raw": log}),
        Err(error) => json!({"readError": error.to_string()}),
    };
    report["instructions"] = json!(
        "Private report: may contain account and session data. Send only to your developer through a private channel. Include what you clicked, expected behaviour, and the time of the failure. Nothing was uploaded automatically."
    );
    let directory = windows::downloads_directory()?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("JASWA-error-report-{}.json", uuid::Uuid::new_v4()));
    windows::write_private_file(
        &path,
        &serde_json::to_vec_pretty(&report).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Could not save the error report: {error}"))?;
    match windows::open(&directory.display().to_string()) {
        Ok(()) => Ok(format!(
            "Saved {} to your Downloads folder. Send it privately to the developer with the steps that caused the error.",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("the error report")
        )),
        Err(error) => Ok(format!("Saved {}. {error}", path.display())),
    }
}

fn report_summary(status: &Value) -> Value {
    let has_error = status["lastError"]
        .as_str()
        .filter(|message| !message.is_empty());
    let (finding, next_step) = if let Some(error) = has_error {
        (
            format!("Capture stopped: {error}"),
            "Keep this report and try Restart helper. Reopen Summoners War only if the helper still reports missing or unreadable account changes.",
        )
    } else if status["gameStartedBeforeHelper"] == true {
        (
            "Summoners War was already open when the helper installed its redirect.".to_owned(),
            "Quit the game and open it again so its login can pass through the helper.",
        )
    } else if status["gameLoginPending"] == true {
        ("A gateway connection arrived without an account login within 45 seconds. This does not prove that the helper started after the game; a later reconnect produces the same observation.".to_owned(), "The helper is still waiting. If the game is already open and no account appears, include this report with the steps that led here.")
    } else if status["profileReady"] == true {
        (
            "A current account snapshot is available.".to_owned(),
            "No capture fault is active.",
        )
    } else {
        (
            "The helper has not captured an account snapshot yet.".to_owned(),
            "Open Summoners War after the helper is ready, then save another report only if capture does not begin.",
        )
    };
    json!({"finding": finding, "nextStep": next_step})
}

fn diagnostic_entries(log: &str) -> Vec<Value> {
    log.lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            match line.split_once(" [").and_then(|(at, rest)| {
                rest.split_once("] ")
                    .map(|(category, message)| (at, category, message))
            }) {
                Some((at, category, message)) => {
                    json!({"at": at, "category": category, "message": message})
                }
                None => json!({"unparsed": line}),
            }
        })
        .collect()
}

#[tauri::command]
fn open_diagnostics() -> Result<(), String> {
    let path = diagnostics::path();
    fs::create_dir_all(path.parent().expect("diagnostic file parent"))
        .map_err(|error| error.to_string())?;
    if !path.exists() {
        return Err("The diagnostic log is unavailable. Save an error report to preserve the in-memory evidence.".into());
    }
    windows::open(&path.display().to_string())?;
    Ok(())
}

#[tauri::command]
fn open_traffic_log(state: State<'_, HelperState>) -> Result<(), String> {
    let path = state.service.traffic().file();
    if !path.exists() {
        return Err("There is no traffic log yet.".into());
    }
    windows::open(&path.display().to_string())?;
    Ok(())
}

fn dashboard(service: &Service) -> Value {
    let traffic = service.traffic().status();
    json!({"status": service.status(), "traffic": traffic})
}

fn main() {
    std::panic::set_hook(Box::new(|information| {
        windows::show_error(&format!(
            "JASWA Helper stopped an operation unexpectedly: {information}. Quit and restart the helper before reopening Summoners War. Keep diagnostics.log for the developer."
        ));
    }));
    let arguments: Vec<String> = std::env::args().collect();
    if arguments
        .iter()
        .any(|argument| argument == "--jaswa-cleanup")
    {
        let _instance = match windows::claim_instance() {
            Ok(guard) => guard,
            Err(error) => {
                windows::show_error(&error);
                std::process::exit(1);
            }
        };
        let remove_certificate = arguments
            .iter()
            .any(|argument| argument == "--jaswa-remove-certificate");
        std::process::exit(
            if jaswa_helper::service::cleanup(remove_certificate).is_ok() {
                0
            } else {
                1
            },
        );
    }
    // Ask for consent and install the local root *before* elevating. Both belong
    // to the real user: the prompt has to appear in their session, and the
    // per-user ROOT store follows whichever profile is active — after elevation
    // that is the administrator's, whose store the game never reads.
    let already_elevated = arguments
        .iter()
        .any(|argument| argument == "--jaswa-elevated");
    if !already_elevated {
        if !certificate_installation_approved() {
            return;
        }
        if let Err(error) = jaswa_helper::service::provision_certificate() {
            windows::show_error(&format!(
                "JASWA Helper could not install its local certificate: {error}"
            ));
            return;
        }
    }
    // The elevated relaunch inherits consent from the pass that spawned it; a
    // missing marker there means the process was started with the flag by hand,
    // so it still has to ask rather than proceed unasked.
    if already_elevated && !certificate_installation_approved() {
        return;
    }
    if !already_elevated && !windows::is_administrator() {
        if let Err(error) = restart_as_administrator() {
            windows::show_error(&format!(
                "Windows did not grant JASWA Helper administrator permission: {error}"
            ));
        }
        return;
    }
    let _instance = match windows::claim_instance() {
        Ok(guard) => guard,
        Err(error) => {
            windows::show_error(&error);
            return;
        }
    };
    diagnostics::start(env!("CARGO_PKG_VERSION"));
    let service = match Service::start() {
        Ok(service) => service,
        Err(error) => {
            diagnostics::record("helper", &format!("Could not start: {error}"));
            windows::show_error(&error);
            return;
        }
    };
    diagnostics::record(
        "helper",
        "Listening for Summoners War. Open the game to capture your account.",
    );
    tauri::Builder::default()
        .manage(HelperState { service })
        .invoke_handler(tauri::generate_handler![
            helper_status,
            set_traffic_logging,
            open_jaswa,
            download_json,
            open_diagnostics,
            open_traffic_log,
            save_error_report,
            restart_helper,
            download_update,
        ])
        .setup(|app| {
            let show = MenuItemBuilder::with_id(SHOW_WINDOW, "Show JASWA Helper").build(app)?;
            let open = MenuItemBuilder::with_id(OPEN_JASWA, "Open JASWA").build(app)?;
            let download = MenuItemBuilder::with_id(DOWNLOAD_JSON, "Download JSON").build(app)?;
            let report = MenuItemBuilder::with_id(SAVE_REPORT, "Save error report").build(app)?;
            let diagnostics = MenuItemBuilder::with_id(OPEN_DIAGNOSTICS, "Open diagnostic log").build(app)?;
            let traffic = CheckMenuItemBuilder::with_id(TRAFFIC, "Log all traffic").build(app)?;
            let open_traffic = MenuItemBuilder::with_id(OPEN_TRAFFIC, "Open traffic log").build(app)?;
            let restart = MenuItemBuilder::with_id(RESTART, "Restart helper").build(app)?;
            let update = CheckMenuItemBuilder::with_id(UPDATE, "No newer version").build(app)?;
            let quit = MenuItemBuilder::with_id(QUIT, "Quit").build(app)?;
            let menu = MenuBuilder::new(app).item(&show).separator()
                .items(&[&open, &download, &report, &diagnostics, &traffic, &open_traffic, &restart, &update])
                .separator().item(&quit).build()?;
            let items = TrayItems { download, traffic, open_traffic, update };
            items.refresh(&app.state::<HelperState>().service)?;
            app.manage(items);
            let app_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let items = app_handle.state::<TrayItems>();
                if let Err(error) = items.refresh(&app_handle.state::<HelperState>().service) {
                    diagnostics::record("tray", &format!("Could not refresh menu: {error}"));
                    break;
                }
            });
            TrayIconBuilder::with_id("helper")
                .tooltip("JASWA Helper")
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("application icon"),
                )
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    SHOW_WINDOW => show_window(app),
                    OPEN_JASWA => tray_result(open_jaswa().map(|()| None)),
                    DOWNLOAD_JSON => tray_result(download_json(app.state()).map(Some)),
                    SAVE_REPORT => {
                        if windows::confirm_action("Save a private error report? It may contain account and session data, the failed exchange and your snapshot. Nothing is uploaded. Send the file only to your developer through a private channel.") {
                            tray_result(save_error_report(app.state()).map(Some));
                        }
                    }
                    OPEN_DIAGNOSTICS => tray_result(open_diagnostics().map(|()| None)),
                    TRAFFIC => {
                        let state = app.state::<HelperState>();
                        let enabled = state.service.traffic().status().enabled;
                        if enabled || windows::confirm_action("Record everything Summoners War sends to your Downloads folder? This writes decoded account data to a local file and never uploads it.") {
                            state.service.traffic().set_enabled(!enabled);
                            if let Some(error) = state.service.traffic().status().last_error {
                                windows::show_error(&format!("Could not record traffic: {error}"));
                            }
                        }
                    }
                    OPEN_TRAFFIC => tray_result(open_traffic_log(app.state()).map(|()| None)),
                    RESTART => tray_result(restart_helper(app.state()).map(Some)),
                    UPDATE => tray_result(download_update(app.state()).map(Some)),
                    QUIT => request_quit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                request_quit(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("valid JASWA Helper application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                // Quitting removes the redirect; being killed from
                // Task Manager does not, and the absence of this line is how the
                // log says which of the two happened.
                diagnostics::record("helper", "Helper exiting — removing the local redirect");
                app.state::<HelperState>().service.stop();
            }
        });
}

// All exit controls consult live service state, never the dashboard's last poll.
fn request_quit(app: &tauri::AppHandle) {
    if quit_approved(app.state::<HelperState>().service.is_receiving_game_input(), || {
        windows::confirm_action("Close JASWA Helper? Summoners War is connected. Closing stops account capture and live updates. You may need to restart the game to reconnect to the helper.")
    }) {
        app.exit(0);
    }
}

fn quit_approved(receiving: bool, confirm: impl FnOnce() -> bool) -> bool {
    !receiving || confirm()
}

fn tray_result(result: Result<Option<String>, String>) {
    match result {
        Ok(Some(message)) => windows::show_info(&message),
        Ok(None) => {}
        Err(error) => windows::show_error(&error),
    }
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn restart_as_administrator() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    windows::restart_elevated(&executable.display().to_string())
}

fn certificate_installation_approved() -> bool {
    let marker = config::data_directory()
        .join("certificates")
        .join("approved");
    if marker.exists() {
        return true;
    }
    let approved = windows::confirm_certificate_installation();
    if approved {
        if let Err(error) = fs::create_dir_all(marker.parent().expect("certificate marker parent"))
            .and_then(|_| fs::write(marker, "approved"))
        {
            windows::show_error(&format!("Could not save certificate consent: {error}"));
            return false;
        }
    }
    approved
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quitting_requires_consent_only_during_game_input() {
        assert!(quit_approved(false, || panic!("Idle exit must not ask")));
        assert!(!quit_approved(true, || false));
        assert!(quit_approved(true, || true));
    }

    #[test]
    fn tray_reads_empty_and_populated_dashboard_states() {
        let empty = TrayReading::from_dashboard(&json!({
            "status": {"hasProfile": false, "updateVersion": null},
            "traffic": {"enabled": false, "recorded": false}
        }));
        assert_eq!(empty, TrayReading { has_profile: false, recording: false, recorded: false, update: None });
        let full = TrayReading::from_dashboard(&json!({
            "status": {"hasProfile": true, "updateVersion": "1.2.3"},
            "traffic": {"enabled": true, "recorded": true}
        }));
        assert_eq!(full, TrayReading { has_profile: true, recording: true, recorded: true, update: Some("1.2.3".into()) });
        let stopped = TrayReading::from_dashboard(&json!({
            "status": {"hasProfile": true, "updateVersion": null},
            "traffic": {"enabled": false, "recorded": true}
        }));
        assert!(!stopped.recording);
        assert!(stopped.recorded);
        assert!(stopped.update.is_none());
    }

    #[test]
    fn report_explains_a_delayed_login_without_blaming_helper_startup() {
        let summary = report_summary(&json!({
            "lastError": null,
            "gameStartedBeforeHelper": false,
            "gameLoginPending": true,
            "profileReady": false,
        }));
        assert!(
            summary["finding"]
                .as_str()
                .unwrap()
                .contains("does not prove that the helper started after the game")
        );
    }

    #[test]
    fn report_turns_diagnostics_into_a_readable_timeline() {
        let entries = diagnostic_entries("2026-09-08T17:39:01Z [game] connected\nbroken");
        assert_eq!(
            entries[0],
            json!({"at": "2026-09-08T17:39:01Z", "category": "game", "message": "connected"})
        );
        assert_eq!(entries[1], json!({"unparsed": "broken"}));
    }
}
