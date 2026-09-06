//! Keep the first failed exchange until a fresh login repairs the capture gap.
//! Evidence stays in memory until the user explicitly saves a private report.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};

#[derive(Default)]
pub struct Incidents {
    first: Option<Value>,
    count: u64,
    active: bool,
}

impl Incidents {
    pub fn record(
        &mut self,
        reason: &str,
        request: &[u8],
        response: &[u8],
        profile: Option<Value>,
    ) {
        if !self.active {
            self.first = None;
            self.count = 0;
        }
        self.count = self.count.saturating_add(1);
        self.active = true;
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

    pub fn active(&self) -> bool {
        self.active
    }
    pub fn recover(&mut self) {
        self.active = false;
    }
    pub fn report(&self) -> Value {
        json!({"firstFailure": self.first, "failureCount": self.count, "captureGap": self.active})
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
        incidents.recover();
        assert!(!incidents.active());
        assert_eq!(
            incidents.report()["firstFailure"]["requestBase64"],
            STANDARD.encode(b"request")
        );
    }
}
