#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use jaswa_helper::service::Service;
use std::{process::Command, time::Duration};
use tray_icon::{
    Icon, TrayIconBuilder,
    menu::{Menu, MenuEvent, MenuItem},
};

const OPEN_JASWA: &str = "open-jaswa";
const DOWNLOAD_JSON: &str = "download-json";
const OPEN_DIAGNOSTICS: &str = "open-diagnostics";
const TOGGLE_LOG: &str = "toggle-log";
const OPEN_TRAFFIC: &str = "open-traffic";
const QUIT: &str = "quit";

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
        && !is_administrator()
    {
        if let Err(error) = restart_as_administrator() {
            notify_failure(&format!(
                "Windows did not grant JASWA Helper administrator permission: {error}"
            ));
        }
        return;
    }
    let service = match Service::start() {
        Ok(service) => service,
        Err(error) => {
            notify_failure(&error);
            return;
        }
    };
    let menu = Menu::new();
    let title = MenuItem::with_id("title", "JASWA Helper", false, None);
    let detail = MenuItem::with_id("detail", "Waiting for Summoners War", false, None);
    let open = MenuItem::with_id(OPEN_JASWA, "Open JASWA", true, None);
    let download = MenuItem::with_id(DOWNLOAD_JSON, "Download JSON", false, None);
    let diagnostics = MenuItem::with_id(OPEN_DIAGNOSTICS, "Open diagnostic log", true, None);
    let log = MenuItem::with_id(TOGGLE_LOG, "Log all traffic", true, None);
    let traffic = MenuItem::with_id(OPEN_TRAFFIC, "Open traffic log", false, None);
    let quit = MenuItem::with_id(QUIT, "Quit", true, None);
    for item in [
        &title,
        &detail,
        &open,
        &download,
        &diagnostics,
        &log,
        &traffic,
        &quit,
    ] {
        menu.append(item).expect("valid tray menu");
    }
    let icon = Icon::from_rgba(tray_pixels(), 16, 16).expect("valid tray icon");
    let tray = TrayIconBuilder::new()
        .with_tooltip("JASWA Helper")
        .with_menu(Box::new(menu))
        .with_icon(icon)
        .build()
        .expect("tray notification icon");
    let events = MenuEvent::receiver();
    loop {
        refresh(&service, &detail, &download, &log, &traffic, &tray);
        match events.recv_timeout(Duration::from_millis(500)) {
            Ok(event) if event.id == OPEN_JASWA => open_path("http://localhost:3000"),
            Ok(event) if event.id == DOWNLOAD_JSON => {
                if let Some(profile) = service.profile() {
                    let path =
                        jaswa_helper::config::data_directory().join("SummonersWar-export.json");
                    if let Some(content) = jaswa_helper::profile::serialize_export(&profile["data"])
                    {
                        let _ = std::fs::write(&path, content);
                        open_path(&path.display().to_string());
                    }
                }
            }
            Ok(event) if event.id == OPEN_DIAGNOSTICS => open_path(
                &jaswa_helper::config::data_directory()
                    .join("diagnostics.log")
                    .display()
                    .to_string(),
            ),
            Ok(event) if event.id == TOGGLE_LOG => {
                let enabled = service.traffic().status().enabled;
                service.traffic().set_enabled(!enabled);
            }
            Ok(event) if event.id == OPEN_TRAFFIC => {
                open_path(&service.traffic().file().display().to_string())
            }
            Ok(event) if event.id == QUIT => break,
            Ok(_) | Err(_) => {}
        }
    }
    service.stop();
}

fn refresh(
    service: &Service,
    detail: &MenuItem,
    download: &MenuItem,
    log: &MenuItem,
    traffic: &MenuItem,
    tray: &tray_icon::TrayIcon,
) {
    let status = service.status();
    let ready = status["profileReady"].as_bool().unwrap_or(false);
    let restart = status["restartRequired"].as_bool().unwrap_or(false);
    let problem = status["lastError"].as_str();
    let text = if let Some(error) = problem {
        format!("Connection needs attention: {error}")
    } else if ready {
        "Snapshot ready · live sync".into()
    } else if restart {
        "Restart Summoners War to connect".into()
    } else {
        "Waiting for Summoners War".into()
    };
    detail.set_text(&text);
    download.set_enabled(status["hasProfile"].as_bool().unwrap_or(false));
    let traffic_status = service.traffic().status();
    log.set_text(if traffic_status.enabled {
        "Stop logging all traffic"
    } else {
        "Log all traffic"
    });
    traffic.set_enabled(traffic_status.recorded);
    tray.set_tooltip(Some(&format!("JASWA Helper — {text}")))
        .ok();
}

fn open_path(path: &str) {
    let _ = Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", path])
        .spawn();
}
fn notify_failure(message: &str) {
    let _ = Command::new("powershell.exe").args(["-NoProfile", "-Command", &format!("Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('{}', 'JASWA Helper')", message.replace('\'', "''"))]).spawn();
}

fn is_administrator() -> bool {
    Command::new("net.exe")
        .arg("session")
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn restart_as_administrator() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let escaped = executable.display().to_string().replace('\'', "''");
    let command = format!(
        "Start-Process -FilePath '{escaped}' -ArgumentList '--jaswa-elevated' -Verb RunAs -WindowStyle Hidden"
    );
    let status = Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", &command])
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("The Windows elevation request was declined.".into())
    }
}
fn tray_pixels() -> Vec<u8> {
    let mut pixels = vec![0; 16 * 16 * 4];
    for y in 2..14 {
        for x in 2..14 {
            let index = (y * 16 + x) * 4;
            let edge = x == 2 || x == 13 || y == 2 || y == 13;
            pixels[index..index + 4].copy_from_slice(if edge {
                &[191, 145, 54, 255]
            } else {
                &[30, 30, 27, 255]
            });
        }
    }
    pixels
}
