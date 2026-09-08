#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use jaswa_helper::{config, diagnostics, profile, service::Service, windows};
use serde_json::{Value, json};
use std::fs;
use tauri::{
    Manager, RunEvent, State,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const SHOW_WINDOW: &str = "show-window";
const QUIT: &str = "quit";

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
    fs::write(&path, export.content).map_err(|error| error.to_string())?;
    Ok(format!(
        "Saved {} to your Downloads folder.",
        export.filename
    ))
}

#[tauri::command]
fn save_error_report(state: State<'_, HelperState>) -> Result<String, String> {
    let mut report = state.service.report();
    report["diagnostics"] = match fs::read_to_string(diagnostics::path()) {
        Ok(log) => Value::String(log),
        Err(error) => json!({"readError": error.to_string()}),
    };
    report["instructions"] = json!(
        "Private report: may contain account and session data. Send only to your developer through a private channel. Include what you clicked, expected behaviour, and the time of the failure. Nothing was uploaded automatically."
    );
    let path =
        config::data_directory().join(format!("JASWA-error-report-{}.json", uuid::Uuid::new_v4()));
    fs::write(
        &path,
        serde_json::to_vec_pretty(&report).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Could not save the error report: {error}"))?;
    match windows::open(&config::data_directory().display().to_string()) {
        Ok(()) => Ok(format!(
            "Saved {}. Send it privately to the developer with the steps that caused the error.",
            path.display()
        )),
        Err(error) => Ok(format!("Saved {}. {error}", path.display())),
    }
}

#[tauri::command]
fn open_diagnostics() -> Result<(), String> {
    let path = diagnostics::path();
    fs::create_dir_all(config::data_directory()).map_err(|error| error.to_string())?;
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
        ])
        .setup(|app| {
            let show = MenuItemBuilder::with_id(SHOW_WINDOW, "Show JASWA Helper").build(app)?;
            let quit = MenuItemBuilder::with_id(QUIT, "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;
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
                    QUIT => app.exit(0),
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
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("valid JASWA Helper application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                // Quitting from the tray removes the redirect; being killed from
                // Task Manager does not, and the absence of this line is how the
                // log says which of the two happened.
                diagnostics::record("helper", "Quit from the tray — removing the local redirect");
                app.state::<HelperState>().service.stop();
            }
        });
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
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
