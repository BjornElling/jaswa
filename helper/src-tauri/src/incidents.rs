//! Keep the first exchange JASWA could not take whole, as evidence for a report.
//! Evidence stays in memory until the user explicitly saves a private report.
//!
//! Evidence is all it is. A missed change never pauses capture; only a login
//! JASWA cannot read does, because without one there is no account to update.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};

#[derive(Default)]
pub struct Incidents {
    first: Option<Value>,
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
        if self.superseded {
            self.first = None;
            self.count = 0;
            self.superseded = false;
        }
        self.count = self.count.saturating_add(1);
        if self.first.is_none() {
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
