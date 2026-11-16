//! Keep the first reader failure as evidence, ahead of a known sealed answer.
//! Evidence stays in memory until the user explicitly saves a private report.
//!
//! Evidence is all it is. A missed change never pauses capture; only a login
//! JASWA cannot read does, because without one there is no account to update.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};

#[derive(Default)]
pub struct Incidents {
    first: Option<Value>,
    first_encrypted: bool,
    count: u64,
    login_failed: bool,
    /// A complete login since the evidence was taken: the next incident
    /// starts a new record instead of hiding behind an old one.
    superseded: bool,
}

impl Incidents {
    pub fn record(
        &mut self,
        reason: &str,
        request: &[u8],
        response: &[u8],
        profile: Option<Value>,
    ) {
        self.record_with_cause(reason, request, response, profile, false);
    }

    pub fn record_encrypted(&mut self, reason: &str, request: &[u8], response: &[u8], profile: Option<Value>) {
        self.record_with_cause(reason, request, response, profile, true);
    }

    fn record_with_cause(&mut self, reason: &str, request: &[u8], response: &[u8], profile: Option<Value>, encrypted: bool) {
        if self.superseded {
            self.first = None;
            self.count = 0;
            self.superseded = false;
        }
        self.count = self.count.saturating_add(1);
        // A repeated Raid limit must not hide the readable purchase whose
        // missing path an error report could actually help us fix.
        if self.first.is_none() || (self.first_encrypted && !encrypted) {
            self.first_encrypted = encrypted;
            self.first = Some(json!({
                "at": time::OffsetDateTime::now_utc().to_string(),
                "reason": reason,
                "requestBase64": STANDARD.encode(request),
                "responseBase64": STANDARD.encode(response),
                "profileBeforeFailure": profile,
            }));
        }
    }

    pub fn fail_login(&mut self, reason: &str, request: &[u8], response: &[u8]) {
        self.record(reason, request, response, None);
        self.login_failed = true;
    }

    pub fn login_failed(&self) -> bool {
        self.login_failed
    }

    pub fn recover(&mut self) {
        self.login_failed = false;
        self.superseded = true;
    }

    pub fn report(&self) -> Value {
        json!({"firstFailure": self.first, "failureCount": self.count, "loginFailed": self.login_failed})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_known_encrypted_limit_never_hides_a_reader_failure() {
        let mut incidents = Incidents::default();
        incidents.record_encrypted("Raid", b"raid", b"sealed", None);
        incidents.record_encrypted("Raid again", b"raid2", b"sealed2", None);
        assert_eq!(incidents.report()["firstFailure"]["reason"], "Raid");
        incidents.record("BuyShopItem", b"buy", b"readable", Some(json!({"data": {"runes": []}})));
        incidents.record_encrypted("Raid later", b"raid3", b"sealed3", None);
        incidents.record("another reader", b"other", b"other", None);
        assert_eq!(incidents.report()["firstFailure"]["reason"], "BuyShopItem");
        assert_eq!(incidents.report()["firstFailure"]["requestBase64"], STANDARD.encode(b"buy"));
        assert!(incidents.report()["firstFailure"]["profileBeforeFailure"].is_object());
        assert_eq!(incidents.report()["failureCount"], 5);
        incidents.recover();
        incidents.record_encrypted("new session", b"new", b"sealed", None);
        assert_eq!(incidents.report()["firstFailure"]["reason"], "new session");
        assert_eq!(incidents.report()["failureCount"], 1);
    }
    #[test]
    fn preserves_the_first_exchange_and_counts_later_failures() {
        let mut incidents = Incidents::default();
        incidents.record("first", b"request", b"response", Some(json!({"runes": []})));
        incidents.record("later", b"other", b"other", None);
        assert_eq!(incidents.report()["firstFailure"]["reason"], "first");
        assert_eq!(incidents.report()["failureCount"], 2);
        assert!(!incidents.login_failed(), "a missed change is evidence, not a stop");
        incidents.recover();
        assert_eq!(
            incidents.report()["firstFailure"]["requestBase64"],
            STANDARD.encode(b"request"),
            "a login keeps the evidence until something new happens"
        );
        incidents.record("after login", b"new", b"new", None);
        assert_eq!(incidents.report()["firstFailure"]["reason"], "after login");
        assert_eq!(incidents.report()["failureCount"], 1);
    }

    #[test]
    fn only_a_failed_login_stands_until_a_complete_login() {
        let mut incidents = Incidents::default();
        incidents.fail_login("bad login", b"request", b"response");
        assert!(incidents.login_failed());
        incidents.recover();
        assert!(!incidents.login_failed());
    }
}
