use crate::config::data_directory;
use serde_json::{Value, json};
use std::{fs, io, path::PathBuf};

pub const MAXIMUM_LOG_BYTES: u64 = 64 * 1024 * 1024;

pub fn traffic_log_path(directory: Option<PathBuf>) -> PathBuf {
    directory.unwrap_or_else(data_directory).join("traffic.log")
}

/// A bounded, newline-delimited local diagnostic recording. It deliberately
/// does not participate in profile updates: an unwritable disk may cost a log,
/// never the account snapshot it was observing.
pub struct TrafficLog {
    directory: PathBuf,
    maximum_bytes: u64,
    enabled: bool,
    entries: u64,
    bytes: u64,
    recorded: bool,
    last_error: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrafficStatus {
    pub enabled: bool,
    pub entries: u64,
    pub recorded: bool,
    pub bytes: u64,
    pub full: bool,
    pub file: String,
    pub last_error: Option<String>,
}

impl TrafficLog {
    pub fn new(directory: Option<PathBuf>) -> Self {
        Self {
            directory: directory.unwrap_or_else(data_directory),
            maximum_bytes: MAXIMUM_LOG_BYTES,
            enabled: false,
            entries: 0,
            bytes: 0,
            recorded: false,
            last_error: None,
        }
    }

    #[cfg(test)]
    fn limited(directory: PathBuf, maximum_bytes: u64) -> Self {
        Self {
            maximum_bytes,
            ..Self::new(Some(directory))
        }
    }

    pub fn set_enabled(&mut self, enabled: bool) -> bool {
        if enabled == self.enabled {
            return enabled;
        }
        self.enabled = enabled;
        if enabled {
            self.entries = 0;
            self.bytes = 0;
            self.recorded = false;
            self.last_error = None;
            if let Err(error) = (|| -> io::Result<()> {
                fs::create_dir_all(&self.directory)?;
                fs::write(self.file(), "")
            })() {
                self.last_error = Some(error.to_string());
            }
        }
        enabled
    }

    pub fn record(&mut self, command: Option<&str>, request: &Value, response: &Value) {
        if !self.enabled || self.bytes >= self.maximum_bytes {
            return;
        }
        let line = format!(
            "{}\n",
            json!({"at": now(), "command": command.filter(|command| !command.is_empty()), "request": request, "response": response})
        );
        self.bytes += line.len() as u64;
        self.entries += 1;
        self.recorded = true;
        let full = self.bytes >= self.maximum_bytes;
        let result = (|| -> io::Result<()> {
            fs::create_dir_all(&self.directory)?;
            let mut file = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.file())?;
            use std::io::Write;
            file.write_all(line.as_bytes())?;
            if full {
                file.write_all(
                    format!(
                        "{}\n",
                        json!({"at": now(), "note": "Log limit reached. Recording stopped."})
                    )
                    .as_bytes(),
                )?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            self.last_error = Some(error.to_string());
        }
    }

    pub fn file(&self) -> PathBuf {
        traffic_log_path(Some(self.directory.clone()))
    }
    pub fn status(&self) -> TrafficStatus {
        TrafficStatus {
            enabled: self.enabled,
            entries: self.entries,
            recorded: self.recorded,
            bytes: self.bytes,
            full: self.bytes >= self.maximum_bytes,
            file: self.file().display().to_string(),
            last_error: self.last_error.clone(),
        }
    }
}

fn now() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_a_fresh_local_log_and_preserves_a_finished_one() {
        let directory = tempfile::tempdir().unwrap();
        let mut log = TrafficLog::new(Some(directory.path().to_owned()));
        log.record(Some("Ignored"), &json!({}), &json!({}));
        assert!(!log.file().exists());
        log.set_enabled(true);
        log.record(
            Some("Captured"),
            &json!({"command": "Captured"}),
            &json!({"unit_id": 1}),
        );
        log.set_enabled(false);
        assert!(log.status().recorded);
        assert!(fs::read_to_string(log.file()).unwrap().contains("Captured"));
    }

    #[test]
    fn writes_a_limit_notice_after_the_last_whole_entry() {
        let directory = tempfile::tempdir().unwrap();
        let mut log = TrafficLog::limited(directory.path().to_owned(), 100);
        log.set_enabled(true);
        log.record(
            Some("Big"),
            &json!({}),
            &json!({"padding": "x".repeat(200)}),
        );
        assert!(log.status().full);
        assert!(
            fs::read_to_string(log.file())
                .unwrap()
                .contains("Log limit reached")
        );
    }
}
