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

pub fn allowed_origin(origin: &str) -> bool {
    matches!(origin, "http://localhost:3000" | "http://127.0.0.1:3000")
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
