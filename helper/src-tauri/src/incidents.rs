//! Keep the first reader failure as evidence, ahead of a known sealed answer.
//! Evidence stays in memory until the user explicitly saves a private report.
//!
//! Evidence is all it is. A missed change never pauses capture; only a login
//! JASWA cannot read does, because without one there is no account to update.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};

/* Enough for one evening's distinct gaps; a repeating failure takes no slot. */
const LATER_FAILURES_KEPT: usize = 8;

#[derive(Default)]
pub struct Incidents {
    first: Option<Value>,
    first_encrypted: bool,
    /// The first exchange of each further reader failure with a reason not
    /// seen before. Keeping the first failure alone lost the evidence of
    /// every later one: a session that missed `AssembleUnit_V2` and then
    /// `BuyShopItem` saved a report with nothing of the second (November 24,
    /// 2026). The account copy stays with `first` only, since one is
    /// megabytes and the answer's shape is what a reader is written from.
    later: Vec<Value>,
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
            self.later.clear();
            self.count = 0;
            self.superseded = false;
        }
        self.count = self.count.saturating_add(1);
        let exchange = || json!({
            "at": time::OffsetDateTime::now_utc().to_string(),
            "reason": reason,
            "requestBase64": STANDARD.encode(request),
            "responseBase64": STANDARD.encode(response),
        });
        // A repeated Raid limit must not hide the readable purchase whose
        // missing path an error report could actually help us fix.
        if self.first.is_none() || (self.first_encrypted && !encrypted) {
            self.first_encrypted = encrypted;
            let mut first = exchange();
            first["profileBeforeFailure"] = json!(profile);
            self.first = Some(first);
            return;
        }
        let seen = |entry: &Value| entry["reason"] == reason;
        if !encrypted
            && self.later.len() < LATER_FAILURES_KEPT
            && !self.first.as_ref().is_some_and(seen)
            && !self.later.iter().any(seen)
        {
            self.later.push(exchange());
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
        json!({"firstFailure": self.first, "laterFailures": self.later,
            "failureCount": self.count, "loginFailed": self.login_failed})
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
    fn each_distinct_later_failure_keeps_its_own_exchange() {
        let mut incidents = Incidents::default();
        assert_eq!(incidents.report()["laterFailures"], json!([]));
        incidents.record("AssembleUnit_V2: unread", b"assemble", b"a", Some(json!({"runes": []})));
        for _ in 0..15 {
            incidents.record("AssembleUnit_V2: unread", b"assemble2", b"a2", None);
        }
        assert_eq!(incidents.report()["laterFailures"], json!([]), "a repeat takes no slot");
        incidents.record_encrypted("Raid", b"raid", b"sealed", None);
        incidents.record("BuyShopItem: shrine list", b"buy", b"b", Some(json!({"runes": []})));
        let report = incidents.report();
        assert_eq!(report["firstFailure"]["reason"], "AssembleUnit_V2: unread");
        let later = report["laterFailures"].as_array().unwrap();
        assert_eq!(later.len(), 1, "a sealed answer is no evidence for a reader");
        assert_eq!(later[0]["requestBase64"], STANDARD.encode(b"buy"));
        assert!(later[0].get("profileBeforeFailure").is_none());
        for index in 0..100 {
            incidents.record(&format!("Future{index}: unread"), b"f", b"f", None);
        }
        assert_eq!(incidents.report()["laterFailures"].as_array().unwrap().len(), LATER_FAILURES_KEPT);
        assert_eq!(incidents.report()["failureCount"], 118);
        incidents.recover();
        incidents.record("after login", b"new", b"new", None);
        assert_eq!(incidents.report()["laterFailures"], json!([]));
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
