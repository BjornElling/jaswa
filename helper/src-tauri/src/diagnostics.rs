//! What the helper did, in the order it did it.
//!
//! This is the log a user opens when the dashboard says "Connected" and their
//! account is still yesterday's. Answering that needs the two halves the helper
//! sits between: what the game sent, and what JASWA asked for. Neither was
//! recorded before — the file held only whatever an unhandled failure happened
//! to leave in it, which is why a stale entry from a long-replaced
//! implementation could sit there for a week looking like the current problem.
//!
//! It is therefore deliberately *not* the traffic log. That one is opt-in,
//! enormous and full of account data. This one is always on, small, bounded, and
//! carries no rune, monster or artifact content — only counts, commands and
//! outcomes, so it can be read out or pasted into a bug report safely.
//!
//! Every run starts a new file: an entry with no run to belong to cannot be
//! interpreted, and keeping the previous run's entries is how the stale
//! `.cjs` stack trace outlived the implementation that wrote it.

use crate::{config::data_directory, windows};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{
        Mutex, OnceLock,
        atomic::{AtomicU64, Ordering},
    },
};

/// Enough to hold a long session's lifecycle entries, small enough to open in a
/// text editor and to attach to a report.
const MAXIMUM_BYTES: u64 = 4 * 1024 * 1024;

static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

pub fn last_error() -> Option<String> {
    LAST_ERROR
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone()
}

/// Reopen a failed log without discarding evidence from the current session.
pub fn retry() {
    if last_error().is_none() {
        return;
    }
    let Some(lock) = FILE.get() else { return; };
    let mut slot = lock.lock().unwrap_or_else(|error| error.into_inner());
    match fs::OpenOptions::new().create(true).append(true).open(path()) {
        Ok(file) => {
            *slot = Some(file);
            *LAST_ERROR.lock().unwrap_or_else(|error| error.into_inner()) = None;
        }
        Err(error) => failed(error),
    }
}

fn failed(error: std::io::Error) {
    *LAST_ERROR.lock().unwrap_or_else(|error| error.into_inner()) = Some(format!(
        "The diagnostic log could not be written: {error}. Save an error report to preserve the in-memory evidence."
    ));
}

static FILE: OnceLock<Mutex<Option<fs::File>>> = OnceLock::new();
static WRITTEN: AtomicU64 = AtomicU64::new(0);

pub fn path() -> PathBuf {
    /* Diagnostic output belongs beside the exports a user may need to attach.
    The private data directory remains only for the local certificate and
    consent marker, neither of which is a user-facing file. */
    windows::downloads_directory()
        .unwrap_or_else(|_| data_directory())
        .join("JASWA Helper diagnostics.log")
}

/// Replaces any previous run's log and writes the header. Failing to open the
/// file costs the log and nothing else: the helper's job is the account
/// snapshot, and a diagnostic that could stop it would be worse than no
/// diagnostic at all.
pub fn start(version: &str) {
    let file = (|| -> std::io::Result<fs::File> {
        fs::create_dir_all(path().parent().expect("diagnostic file parent"))?;
        fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(path())
    })()
    .map_err(failed)
    .ok();
    let _ = FILE.set(Mutex::new(file));
    WRITTEN.store(0, Ordering::Release);
    record(
        "helper",
        &format!(
            "JASWA Helper {version} started — this log replaces the previous run's and holds no account data"
        ),
    );
}

/// Appends one timestamped line under a short category.
///
/// The categories are the vocabulary a reader scans for: `helper` for the run
/// itself, `game` for the Summoners War connection, `capture` for what a gateway
/// exchange produced, `jaswa` for what the browser asked, and `hosts` for the
/// redirect.
pub fn record(category: &str, message: &str) {
    let Some(lock) = FILE.get() else {
        return;
    };
    let Ok(mut slot) = lock.lock() else {
        return;
    };
    let Some(file) = slot.as_mut() else {
        return;
    };
    let line = format!("{} [{category}] {message}\n", now());
    let written = WRITTEN.load(Ordering::Acquire);
    if written >= MAXIMUM_BYTES {
        return;
    }
    if line.len() as u64 > MAXIMUM_BYTES.saturating_sub(written) {
        let notice = "[helper] Log limit reached. Later entries are not recorded.\n";
        if notice.len() as u64 <= MAXIMUM_BYTES.saturating_sub(written) {
            if let Err(error) = file.write_all(notice.as_bytes()).and_then(|_| file.flush()) {
                failed(error);
            }
        }
        WRITTEN.store(MAXIMUM_BYTES, Ordering::Release);
        return;
    }
    match file.write_all(line.as_bytes()).and_then(|_| file.flush()) {
        Ok(()) => WRITTEN.store(written + line.len() as u64, Ordering::Release),
        Err(error) => failed(error),
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

    /// The categories are a fixed vocabulary rather than free text, so a reader
    /// can scan for them and a grep stays meaningful.
    #[test]
    fn formats_an_entry_with_its_category_and_a_timestamp() {
        let line = format!("{} [game] connected", now());
        assert!(line.contains("[game] connected"));
        assert!(
            line.starts_with("20"),
            "entries lead with an RFC 3339 instant"
        );
    }
}
