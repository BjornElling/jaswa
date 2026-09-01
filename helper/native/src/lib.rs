//! Platform-independent rules for the native helper.
//!
//! Keeping the game protocol and snapshot rules outside the Windows shell makes
//! the risky part of the helper executable directly testable without a tray,
//! an elevated process, or a live Summoners War account.

pub mod config;
pub mod profile;
pub mod protocol;
pub mod service;
pub mod traffic;
