pub const HELPER_PORT: u16 = 37_654;
pub const PROXY_PORT: u16 = 37_655;
pub const HOSTS_MARKER: &str = "# JASWA Helper — Summoners War Steam proxy";
pub const GATEWAYS: [(&str, &str, &str); 6] = [
    (
        "summonerswar-eu-lb.qpyou.cn",
        "127.11.12.13",
        "34.160.156.240",
    ),
    (
        "summonerswar-gb-lb.qpyou.cn",
        "127.11.12.14",
        "34.160.216.76",
    ),
    (
        "summonerswar-sea-lb.qpyou.cn",
        "127.11.12.15",
        "34.160.209.2",
    ),
    (
        "summonerswar-jp-lb.qpyou.cn",
        "127.11.12.16",
        "34.160.238.133",
    ),
    (
        "summonerswar-kr-lb.qpyou.cn",
        "127.11.12.17",
        "34.160.106.3",
    ),
    (
        "summonerswar-cn-lb.qpyou.cn",
        "127.11.12.18",
        "34.111.217.241",
    ),
];

/// Where JASWA is published. The tray opens it when no local server answers.
pub const PUBLISHED_ORIGIN: &str = "https://jaswa.net";
/// The development server, which usually runs a newer JASWA than the published
/// one — so the tray prefers it whenever it is up.
pub const LOCAL_ORIGIN: &str = "http://localhost:3000";

/// Both JASWAs read the snapshot and share personalization locally. Preference
/// writes compare commit tokens; neither page writes to the game.
pub fn allowed_origin(origin: &str) -> bool {
    matches!(origin, LOCAL_ORIGIN | "http://127.0.0.1:3000" | PUBLISHED_ORIGIN)
        || std::env::var("JASWA_ALLOWED_ORIGINS")
            .ok()
            .map(|origins| {
                origins
                    .split(',')
                    .any(|candidate| candidate.trim() == origin)
            })
            .unwrap_or(false)
}

pub fn data_directory() -> std::path::PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("JASWA Helper")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_local_and_the_published_jaswa_may_both_read_the_snapshot() {
        for origin in [LOCAL_ORIGIN, "http://127.0.0.1:3000", PUBLISHED_ORIGIN] {
            assert!(allowed_origin(origin), "{origin} must be allowed");
        }
        // Plain http would put the snapshot on an unencrypted page, and a
        // look-alike host is someone else's page.
        for origin in ["http://jaswa.net", "https://jaswa.net.example", "https://evil.example"] {
            assert!(!allowed_origin(origin), "{origin} must be refused");
        }
    }
}
