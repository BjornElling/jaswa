//! Whether Summoners War is running, decided in one place.
//!
//! Every part of the helper that depends on the game being open — the snapshot,
//! the gaps it carries, a failed exchange, a login that has not arrived, the
//! warning about a game that predates the helper, the exit guard — reads this
//! one session, and when the game goes they all end together in `end`.
//!
//! Before this, the same question was answered by six loose fields and two
//! heuristics, and the answer to "has the game closed?" waited for a sixty
//! second connection grace to lapse before the process list was even asked.
//! Worse, a failed exchange was helper-wide state: closing the game in the
//! middle of one left "Capture stopped" standing until the user pressed
//! Restart helper, long after there was any game to capture.
//!
//! The evidence, strongest first:
//!
//! 1. **The process list.** Once it has shown this session's game, it alone
//!    decides that the game has closed. Reading it costs a millisecond every
//!    watchdog tick; reading silence as a closed game once cost a whole
//!    session (`a_quiet_but_running_game_keeps_its_snapshot`).
//! 2. **An open gateway connection.** A socket on the redirect is the game, so
//!    it starts a session at once and keeps one alive. Windows closes a
//!    process's sockets with the process, so it never outlives the game.
//! 3. **Recent contact.** Only when the process list cannot vouch for the game —
//!    it cannot be read, or the game's executable is named differently — does a
//!    quiet gap after the last exchange count, for `QUIET_GRACE`.

use std::time::{Duration, Instant};

/// How long a quiet redirect still counts as the game when the process list
/// cannot vouch for it. Ordinary play goes quiet for minutes at a time — the
/// game hangs up its keep-alive socket and opens a new one for its next
/// command — so this is a fallback, never the way a closed game is noticed.
pub const QUIET_GRACE: Duration = Duration::from_secs(60);
/// A gateway socket opens before the game sends its login. The watchdog must
/// never mistake that normal startup interval for a helper that missed login.
pub const LOGIN_GRACE: Duration = Duration::from_secs(45);

#[derive(Debug, Default)]
pub struct GameSession {
    /// Counts ended sessions, so work begun in one session cannot write into
    /// the next: a relay that fails after its game has closed holds a stale
    /// generation and its failure is dropped with the session it belonged to.
    generation: u64,
    present: bool,
    /// The first gateway contact of this session.
    connected_at: Option<Instant>,
    last_contact: Option<Instant>,
    /// The process list has shown the game during this session, so it may also
    /// say when the game is gone.
    process_seen: bool,
    /// The game was already running when the helper installed its redirect,
    /// so its login cannot have passed through the helper.
    predates_helper: bool,
    waiting_for_login: bool,
    /// A failure that belongs to this session — an exchange that broke, a
    /// connection the helper could not take. A new game cannot inherit it.
    fault: Option<String>,
}

/// What a watchdog tick changed, so the caller can say so once.
#[derive(Debug, PartialEq, Eq)]
pub enum Change {
    None,
    /// The game had been running and is gone. Everything the session owned
    /// was reset with it.
    Ended { had_predated_helper: bool },
    /// A gateway connection has stayed past the login window without a login.
    LoginOverdue,
}

impl GameSession {
    /// The process list as the helper installed its redirect. A game already
    /// running then cannot have sent its login through the helper.
    pub fn helper_started(&mut self, game_running: bool) {
        if game_running {
            self.present = true;
            self.process_seen = true;
            self.predates_helper = true;
        }
    }

    /// The game opened a gateway connection: proof it is running. Returns the
    /// session that connection belongs to, and whether it opened the session.
    pub fn connected(&mut self, now: Instant) -> (u64, bool) {
        let first = self.connected_at.is_none();
        if first {
            self.connected_at = Some(now);
        }
        self.present = true;
        self.last_contact = Some(now);
        (self.generation, first)
    }

    /// An exchange on a connection opened in `generation`. A connection that
    /// outlived its session renews nothing.
    pub fn contact(&mut self, generation: u64, now: Instant) {
        if generation == self.generation {
            self.last_contact = Some(now);
        }
    }

    /// Records a failure against the session it happened in, the newest one
    /// shown; a failure from an ended session is dropped with it.
    pub fn fail(&mut self, generation: u64, message: String) -> bool {
        if generation != self.generation || !self.present {
            return false;
        }
        self.fault = Some(message);
        true
    }

    /// One watchdog tick. `process` is the process list's answer, `None` when
    /// it could not be read.
    pub fn observe(
        &mut self,
        process: Option<bool>,
        open_connections: usize,
        has_profile: bool,
        now: Instant,
    ) -> Change {
        let connected = open_connections > 0;
        let recently = connected
            || self
                .last_contact
                .is_some_and(|at| now.saturating_duration_since(at) < QUIET_GRACE);
        if process == Some(true) {
            self.process_seen = true;
        }
        let present = match process {
            Some(true) => true,
            Some(false) if self.process_seen => connected,
            _ => recently,
        };
        if self.present && !present {
            let had_predated_helper = self.predates_helper;
            self.end();
            return Change::Ended { had_predated_helper };
        }
        self.present = present;
        let overdue = recently
            && !has_profile
            && self
                .connected_at
                .is_some_and(|at| now.saturating_duration_since(at) >= LOGIN_GRACE);
        if overdue && !self.waiting_for_login {
            self.waiting_for_login = true;
            return Change::LoginOverdue;
        }
        Change::None
    }

    /// A complete login passed through the helper, which answers both the
    /// login wait and the warning about a game older than the helper.
    pub fn logged_in(&mut self) {
        self.waiting_for_login = false;
        self.predates_helper = false;
    }

    /// The game has gone: forget everything that was true only while it ran.
    /// The caller drops the snapshot, its gaps and the login failure alongside.
    pub fn end(&mut self) {
        *self = Self {
            generation: self.generation.wrapping_add(1),
            ..Self::default()
        };
    }

    /// The user asked for Restart helper: a stale fault goes, the game stays.
    pub fn clear_fault(&mut self) {
        self.fault = None;
    }

    pub fn running(&self) -> bool {
        self.present
    }
    /// The game is running and has talked to the redirect in this session, so
    /// closing the helper would cut it off.
    pub fn connected_this_session(&self) -> bool {
        self.present && self.connected_at.is_some()
    }
    pub fn predates_helper(&self) -> bool {
        self.predates_helper
    }
    pub fn waiting_for_login(&self) -> bool {
        self.present && self.waiting_for_login
    }
    pub fn fault(&self) -> Option<&str> {
        self.fault.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn later(by: Duration) -> Instant {
        Instant::now() + by
    }

    #[test]
    fn nothing_running_is_no_session() {
        let mut session = GameSession::default();
        assert_eq!(session.observe(Some(false), 0, false, Instant::now()), Change::None);
        assert_eq!(session.observe(None, 0, false, Instant::now()), Change::None);
        assert!(!session.running());
        assert!(!session.connected_this_session());
    }

    #[test]
    fn a_connection_starts_the_session_before_any_tick() {
        let mut session = GameSession::default();
        let (generation, first) = session.connected(Instant::now());
        assert!(first);
        assert!(session.running());
        assert!(session.connected_this_session());
        assert!(!session.connected(Instant::now()).1, "a reconnect joins the session under way");
        assert_eq!(session.connected(Instant::now()).0, generation);
    }

    /// The failure this module exists for: the game closed, and the helper
    /// went on showing its gap and its broken exchange.
    #[test]
    fn a_closed_game_ends_everything_it_owned_on_the_next_tick() {
        let mut session = GameSession::default();
        let now = Instant::now();
        let (generation, _) = session.connected(now);
        session.observe(Some(true), 1, true, now);
        assert!(session.fail(generation, "Gateway exchange failed".into()));
        assert_eq!(
            session.observe(Some(false), 0, true, now),
            Change::Ended { had_predated_helper: false },
            "no sixty-second wait once the process list has vouched for the game"
        );
        assert!(!session.running());
        assert!(session.fault().is_none());
        assert!(!session.connected_this_session());
    }

    #[test]
    fn a_quiet_running_game_stays_however_long_it_is_silent() {
        let mut session = GameSession::default();
        let now = Instant::now();
        session.connected(now);
        session.observe(Some(true), 0, true, now);
        assert_eq!(session.observe(Some(true), 0, true, later(QUIET_GRACE * 10)), Change::None);
        assert!(session.running());
    }

    #[test]
    fn a_failure_from_an_ended_session_is_dropped() {
        let mut session = GameSession::default();
        let (old, _) = session.connected(Instant::now());
        session.observe(Some(true), 1, true, Instant::now());
        session.observe(Some(false), 0, true, Instant::now());
        assert!(!session.fail(old, "the closing game's last socket".into()));
        session.connected(Instant::now());
        assert!(!session.fail(old, "still the old session".into()));
        assert!(session.fault().is_none(), "a new game never inherits a fault");
        session.contact(old, later(QUIET_GRACE * 2));
        assert_eq!(
            session.observe(None, 0, false, later(QUIET_GRACE + Duration::from_secs(1))),
            Change::Ended { had_predated_helper: false },
            "an old connection's exchange renews nothing in the new session"
        );
    }

    /// The executable may be named differently, or the list unreadable: then
    /// the process list cannot vouch for the game either way, and connection
    /// evidence with its grace decides alone.
    #[test]
    fn without_the_process_list_the_connection_grace_decides() {
        for process in [None, Some(false)] {
            let mut session = GameSession::default();
            let now = Instant::now();
            session.connected(now);
            assert_eq!(session.observe(process, 0, true, later(QUIET_GRACE / 2)), Change::None);
            assert!(session.running());
            assert_eq!(
                session.observe(process, 0, true, later(QUIET_GRACE + Duration::from_secs(1))),
                Change::Ended { had_predated_helper: false }
            );
        }
    }

    #[test]
    fn an_open_connection_outweighs_a_process_list_that_lost_the_game() {
        let mut session = GameSession::default();
        session.connected(Instant::now());
        session.observe(Some(true), 1, true, Instant::now());
        assert_eq!(session.observe(Some(false), 1, true, Instant::now()), Change::None);
        assert!(session.running());
    }

    #[test]
    fn a_game_that_predates_the_helper_is_said_until_it_closes() {
        let mut session = GameSession::default();
        session.helper_started(true);
        assert!(session.running());
        assert!(session.predates_helper());
        assert!(!session.connected_this_session(), "a pre-existing game has not connected");
        assert_eq!(session.observe(Some(true), 0, false, Instant::now()), Change::None);
        assert_eq!(
            session.observe(Some(false), 0, false, Instant::now()),
            Change::Ended { had_predated_helper: true }
        );
        assert!(!session.predates_helper(), "the next launch is a normal one");
        let mut quiet = GameSession::default();
        quiet.helper_started(false);
        assert!(!quiet.running() && !quiet.predates_helper());
    }

    #[test]
    fn a_login_is_overdue_only_on_a_live_connection_past_its_window() {
        let mut session = GameSession::default();
        let now = Instant::now();
        session.connected(now);
        assert_eq!(session.observe(Some(true), 1, false, now), Change::None, "startup is not a missed login");
        let overdue = later(LOGIN_GRACE + Duration::from_secs(1));
        assert_eq!(session.observe(Some(true), 1, true, overdue), Change::None, "a captured account is no missing login");
        assert_eq!(session.observe(Some(true), 1, false, overdue), Change::LoginOverdue);
        assert_eq!(session.observe(Some(true), 1, false, overdue), Change::None, "said once");
        assert!(session.waiting_for_login());
        let mut quiet = GameSession::default();
        quiet.connected(now);
        assert_eq!(
            quiet.observe(Some(true), 0, false, later(QUIET_GRACE + LOGIN_GRACE)),
            Change::None,
            "a quiet game has nothing to send, so its silence is no missing login"
        );
    }

    #[test]
    fn restart_helper_clears_the_fault_and_keeps_the_game() {
        let mut session = GameSession::default();
        let (generation, _) = session.connected(Instant::now());
        session.fail(generation, "broken".into());
        session.clear_fault();
        assert!(session.fault().is_none());
        assert!(session.running());
    }
}
