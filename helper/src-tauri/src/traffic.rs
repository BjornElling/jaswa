use crate::{config::data_directory, windows};
use serde_json::{Value, json};
use std::{fs, io, path::PathBuf};

pub const MAXIMUM_LOG_BYTES: u64 = 64 * 1024 * 1024;

pub fn traffic_log_path(directory: Option<PathBuf>) -> PathBuf {
    directory
        .unwrap_or_else(|| windows::downloads_directory().unwrap_or_else(|_| data_directory()))
        .join("JASWA Helper traffic.log")
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
    full: bool,
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
            directory: directory.unwrap_or_else(|| {
                windows::downloads_directory().unwrap_or_else(|_| data_directory())
            }),
            maximum_bytes: MAXIMUM_LOG_BYTES,
            enabled: false,
            entries: 0,
            bytes: 0,
            recorded: false,
            full: false,
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
            self.full = false;
            self.last_error = None;
            if let Err(error) = (|| -> io::Result<()> {
                fs::create_dir_all(&self.directory)?;
                fs::write(self.file(), "")
            })() {
                self.enabled = false;
                self.last_error = Some(error.to_string());
            }
        }
        self.enabled
    }

    pub fn record(&mut self, command: Option<&str>, request: &Value, response: &Value) {
        if !self.enabled || self.bytes >= self.maximum_bytes {
            return;
        }
        let line = format!(
            "{}\n",
            json!({"at": now(), "command": command.filter(|command| !command.is_empty()), "request": request, "response": response})
        );
        let bytes = self.bytes.saturating_add(line.len() as u64);
        if bytes > self.maximum_bytes {
            self.full = true;
            self.enabled = false;
            return;
        }
        let full = bytes == self.maximum_bytes;
        let result = (|| -> io::Result<()> {
            fs::create_dir_all(&self.directory)?;
            let mut file = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.file())?;
            use std::io::Write;
            file.write_all(line.as_bytes())?;
            Ok(())
        })();
        match result {
            Ok(()) => {
                self.bytes = bytes;
                self.entries += 1;
                self.recorded = true;
                if full {
                    /* A full file is a completed recording, not an ongoing one. */
                    self.full = true;
                    self.enabled = false;
                }
            }
            Err(error) => {
                /* Do not claim an exchange that never reached the file. */
                self.enabled = false;
                self.last_error = Some(error.to_string());
            }
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
            full: self.full,
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

    /// The dashboard reports what it reads back from `status`, so turning the
    /// log on has to be visible there immediately — before any traffic arrives.
    /// A helper enabled against a silent game must not still read "Off".
    #[test]
    fn reports_recording_before_the_game_sends_anything() {
        let directory = tempfile::tempdir().unwrap();
        let mut log = TrafficLog::new(Some(directory.path().to_owned()));
        assert!(!log.status().enabled);
        log.set_enabled(true);
        let status = log.status();
        assert!(status.enabled);
        assert_eq!(status.entries, 0);
        assert!(!status.recorded);
        assert!(status.last_error.is_none());
        assert!(log.file().exists(), "enabling starts the file it promises");
    }

    /// Enabling twice is the double-click case. The second call must not wipe
    /// entries already recorded, which resetting the counters would do.
    #[test]
    fn enabling_an_already_recording_log_keeps_what_it_captured() {
        let directory = tempfile::tempdir().unwrap();
        let mut log = TrafficLog::new(Some(directory.path().to_owned()));
        log.set_enabled(true);
        log.record(Some("First"), &json!({}), &json!({"unit_id": 1}));
        log.set_enabled(true);
        assert_eq!(log.status().entries, 1);
        assert!(fs::read_to_string(log.file()).unwrap().contains("First"));
    }

    /// Off then on is a new recording, deliberately: the file is the one thing
    /// the user opens, and mixing two sessions into it would misreport which
    /// exchange belonged to which run. The old entries go, the counters with
    /// them.
    #[test]
    fn restarting_the_log_replaces_the_previous_recording() {
        let directory = tempfile::tempdir().unwrap();
        let mut log = TrafficLog::new(Some(directory.path().to_owned()));
        log.set_enabled(true);
        log.record(Some("Earlier"), &json!({}), &json!({"unit_id": 1}));
        log.set_enabled(false);
        log.set_enabled(true);
        assert_eq!(log.status().entries, 0);
        log.record(Some("Later"), &json!({}), &json!({"unit_id": 2}));
        let written = fs::read_to_string(log.file()).unwrap();
        assert!(written.contains("Later"));
        assert!(!written.contains("Earlier"));
    }

    /// Disabling stops recording. Traffic arriving afterwards belongs to no
    /// session the user asked for and must not reach the file.
    #[test]
    fn ignores_traffic_once_the_log_is_switched_off() {
        let directory = tempfile::tempdir().unwrap();
        let mut log = TrafficLog::new(Some(directory.path().to_owned()));
        log.set_enabled(true);
        log.record(Some("Kept"), &json!({}), &json!({"unit_id": 1}));
        log.set_enabled(false);
        log.record(Some("Dropped"), &json!({}), &json!({"unit_id": 2}));
        assert_eq!(log.status().entries, 1);
        let written = fs::read_to_string(log.file()).unwrap();
        assert!(written.contains("Kept"));
        assert!(!written.contains("Dropped"));
    }

    /// An unwritable directory must cost the log and nothing else: the status
    /// carries the reason so the dashboard can say it, and the process lives.
    #[test]
    fn reports_a_write_failure_without_losing_the_helper() {
        let directory = tempfile::tempdir().unwrap();
        let occupied = directory.path().join("occupied");
        fs::write(&occupied, "not a directory").unwrap();
        let mut log = TrafficLog::new(Some(occupied));
        log.set_enabled(true);
        assert!(!log.status().enabled);
        log.record(Some("Lost"), &json!({}), &json!({}));
        assert_eq!(log.status().entries, 0);
        assert!(!log.status().recorded);
        assert!(
            log.status().last_error.is_some(),
            "the dashboard needs a reason to show"
        );
    }

    /// A command name the game omits must not become the empty string in the
    /// log, where it would read as an exchange with a command called "".
    #[test]
    fn records_a_missing_command_as_absent_rather_than_empty() {
        let directory = tempfile::tempdir().unwrap();
        let mut log = TrafficLog::new(Some(directory.path().to_owned()));
        log.set_enabled(true);
        log.record(Some(""), &json!({}), &json!({"unit_id": 1}));
        log.record(None, &json!({}), &json!({"unit_id": 2}));
        let written = fs::read_to_string(log.file()).unwrap();
        assert_eq!(written.lines().count(), 2);
        assert!(!written.contains("\"command\":\"\""));
        assert!(written.contains("\"command\":null"));
    }

    #[test]
    fn stops_before_an_entry_would_exceed_the_limit() {
        let directory = tempfile::tempdir().unwrap();
        let mut log = TrafficLog::limited(directory.path().to_owned(), 100);
        log.set_enabled(true);
        log.record(
            Some("Big"),
            &json!({}),
            &json!({"padding": "x".repeat(200)}),
        );
        assert!(log.status().full);
        assert!(fs::metadata(log.file()).unwrap().len() <= 100);
        assert_eq!(log.status().entries, 0);
        assert!(!log.status().enabled, "a full log is no longer recording");
    }
}
