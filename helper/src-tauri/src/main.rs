#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use jaswa_helper::{config, profile, service::Service, windows};
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
fn open_jaswa() {
    windows::open("http://localhost:3000");
}

#[tauri::command]
fn download_json(state: State<'_, HelperState>) -> Result<String, String> {
    let profile = state
        .service
        .profile()
        .ok_or("Start Summoners War to capture an account snapshot.")?;
    let data = profile
        .get("data")
        .ok_or("The captured snapshot is incomplete.")?;
    let content =
        profile::serialize_export(data).ok_or("The captured snapshot is not valid JSON.")?;
    let path = config::data_directory().join("SummonersWar-export.json");
    fs::create_dir_all(config::data_directory()).map_err(|error| error.to_string())?;
    fs::write(&path, content).map_err(|error| error.to_string())?;
    windows::open(&path.display().to_string());
    Ok(format!("Saved JSON to {}", path.display()))
}

#[tauri::command]
fn open_diagnostics() -> Result<(), String> {
    let path = config::data_directory().join("diagnostics.log");
    fs::create_dir_all(config::data_directory()).map_err(|error| error.to_string())?;
    if !path.exists() {
        fs::write(&path, "").map_err(|error| error.to_string())?;
    }
    windows::open(&path.display().to_string());
    Ok(())
}

#[tauri::command]
fn open_traffic_log(state: State<'_, HelperState>) -> Result<(), String> {
    let path = state.service.traffic().file();
    if !path.exists() {
        return Err("There is no traffic log yet.".into());
    }
    windows::open(&path.display().to_string());
    Ok(())
}

fn dashboard(service: &Service) -> Value {
    let traffic = service.traffic().status();
    json!({"status": service.status(), "traffic": traffic})
}

fn main() {
    let arguments: Vec<String> = std::env::args().collect();
    if arguments
        .iter()
        .any(|argument| argument == "--jaswa-cleanup")
    {
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
    if !arguments
        .iter()
        .any(|argument| argument == "--jaswa-elevated")
        && !windows::is_administrator()
    {
        if let Err(error) = restart_as_administrator() {
            windows::show_error(&format!(
                "Windows did not grant JASWA Helper administrator permission: {error}"
            ));
        }
        return;
    }
    if !certificate_installation_approved() {
        return;
    }
    let service = match Service::start() {
        Ok(service) => service,
        Err(error) => {
            windows::show_error(&error);
            return;
        }
    };
    tauri::Builder::default()
        .manage(HelperState { service })
        .invoke_handler(tauri::generate_handler![
            helper_status,
            set_traffic_logging,
            open_jaswa,
            download_json,
            open_diagnostics,
            open_traffic_log,
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
                        show_window(&tray.app_handle());
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
        let _ = fs::create_dir_all(marker.parent().expect("certificate marker parent"));
        let _ = fs::write(marker, "approved");
    }
    approved
}
