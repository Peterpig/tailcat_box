//! Parsers for the exact output shapes produced by tailcat v0.7.0.
//!
//! Every parser is covered by unit tests with real captured output; see
//! `docs/tailcat-cli.md` for the transcripts these were derived from.

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

use crate::model::{PingPong, RemoteEntry};

static ADDRESS_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?:Server listening with[^:]*):\s*(tc[0-9A-Za-z_\-]{20,})")
        .expect("address line regex")
});

static BARE_TOKEN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(tc[0-9A-Za-z_\-]{40,})\b").expect("token regex"));

static PONG: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"pong in ([0-9]+(?:\.[0-9]+)?)(ms|s|µs) via (.+)").expect("pong regex")
});

static FORWARD_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^#?\s*forwarding\s+(\S+):(\d+)\s+->\s+remote\s+(\S+):(\d+)")
        .expect("forward regex")
});

static LS_LONG: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([-dlbcps][rwxsStT-]{9})\s+(\d+)\s+(.+?)\s+(\S+)$").expect("ls -l regex")
});

/// Extracts the connection token from a `tailcat serve` stderr line.
pub fn address_from_line(line: &str) -> Option<String> {
    if let Some(caps) = ADDRESS_LINE.captures(line) {
        return Some(caps[1].to_string());
    }
    None
}

/// Extracts a token from a `{"listenAddr":"tc..."}` JSON line.
pub fn address_from_json_line(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if !trimmed.starts_with('{') {
        return None;
    }
    let value: Value = serde_json::from_str(trimmed).ok()?;
    let candidate = value.get("listenAddr")?.as_str()?.trim();
    if candidate.starts_with("tc") {
        Some(candidate.to_string())
    } else {
        None
    }
}

/// Last-resort token scan, used only for lines that clearly announce a listener.
pub fn address_from_loose_line(line: &str) -> Option<String> {
    if !line.contains("listening") {
        return None;
    }
    BARE_TOKEN.captures(line).map(|caps| caps[1].to_string())
}

/// One local listener reported by `tailcat forward` (v0.7.0+).
///
/// The CLI writes `# forwarding 127.0.0.1:54212 -> remote localhost:18080` to
/// stderr once a listener is bound, which is how a `localPort` of `0` is
/// resolved into the port the OS actually handed out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardListener {
    pub bind_host: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

impl ForwardListener {
    /// `host:port` in the same shape the rest of the app uses for `listenAddr`.
    pub fn listen_addr(&self) -> String {
        if self.bind_host.contains(':') && !self.bind_host.starts_with('[') {
            format!("[{}]:{}", self.bind_host, self.local_port)
        } else {
            format!("{}:{}", self.bind_host, self.local_port)
        }
    }
}

pub fn parse_forward_line(line: &str) -> Option<ForwardListener> {
    let caps = FORWARD_LINE.captures(line.trim())?;
    Some(ForwardListener {
        bind_host: caps[1].to_string(),
        local_port: caps[2].parse().ok()?,
        remote_host: caps[3].to_string(),
        remote_port: caps[4].parse().ok()?,
    })
}

pub fn parse_pongs(text: &str) -> Vec<PingPong> {
    text.lines()
        .filter_map(|line| PONG.captures(line))
        .filter_map(|caps| {
            let value: f64 = caps[1].parse().ok()?;
            let rtt_ms = match &caps[2] {
                "s" => value * 1000.0,
                "µs" => value / 1000.0,
                _ => value,
            };
            let via = caps[3].trim().to_string();
            let direct = !via.to_uppercase().starts_with("DERP");
            Some(PingPong {
                rtt_ms,
                via,
                direct,
            })
        })
        .collect()
}

/// Parses `tailcat ls -l` output: `-rw-r--r--  307200 Oct 14 11:00 big.bin`
pub fn parse_ls_long(text: &str) -> Vec<RemoteEntry> {
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let caps = LS_LONG.captures(line.trim_end())?;
            let mode = caps[1].to_string();
            let size = caps[2].parse::<u64>().ok();
            let modified = caps[3].trim().to_string();
            let raw_name = caps[4].to_string();
            let is_dir = mode.starts_with('d') || raw_name.ends_with('/');
            let name = raw_name.trim_end_matches('/').to_string();
            Some(RemoteEntry {
                name,
                size,
                mode: Some(mode),
                modified: Some(modified),
                is_dir,
            })
        })
        .collect()
}

/// Parses `tailcat ls` (short form) output: one name per line.
pub fn parse_ls_short(text: &str) -> Vec<RemoteEntry> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| {
            let is_dir = line.ends_with('/');
            RemoteEntry {
                name: line.trim_end_matches('/').to_string(),
                size: None,
                mode: None,
                modified: None,
                is_dir,
            }
        })
        .collect()
}

/// Parses `tailcat genkey --region=list`: `  301 nyc New York City`.
pub fn parse_regions(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let id = parts.next()?;
            let code = parts.next()?;
            if id.chars().all(|c| c.is_ascii_digit()) {
                Some(format!("{code} ({id})"))
            } else {
                None
            }
        })
        .collect()
}

/// `# wrote file to <path>` emitted by `tailcat genkey`.
pub fn parse_wrote_file(text: &str) -> Option<String> {
    text.lines()
        .find_map(|line| line.trim().strip_prefix("# wrote file to "))
        .map(|path| path.trim().to_string())
}

/// Extracts the connection token printed by `tailcat genkey` for a server key.
///
/// A real blob is ~109 base32url characters (`tco2FwWCB…`, measured against
/// v0.7.0). The guard only has to reject the surrounding status text such as
/// `# wrote file to …`, so it checks shape rather than an exact length.
pub fn parse_generated_address(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|line| is_address_blob(line))
        .map(str::to_string)
}

fn is_address_blob(line: &str) -> bool {
    line.starts_with("tc")
        && line.len() >= 16
        && !line.contains(char::is_whitespace)
        && line
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Extracts the `nodekey:...` public key printed by `tailcat genkey --client`.
pub fn parse_public_key(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|line| line.starts_with("nodekey:"))
        .map(str::to_string)
}

/// Fields decoded from `tailcat parse` JSON output.
#[derive(Debug, Default, Clone)]
pub struct DecodedAddress {
    pub server_public_key: Option<String>,
    pub region_id: Option<i64>,
    pub region_hosts: Vec<String>,
    pub self_contained: bool,
}

pub fn decode_address_json(text: &str) -> Option<DecodedAddress> {
    let value: Value = serde_json::from_str(text).ok()?;
    let mut decoded = DecodedAddress {
        server_public_key: value
            .get("ServerPublic")
            .and_then(Value::as_str)
            .map(str::to_string),
        region_id: value.get("RegionID").and_then(Value::as_i64),
        ..Default::default()
    };

    if let Some(regions) = value.get("Region").and_then(Value::as_array) {
        decoded.self_contained = true;
        for region in regions {
            if let Some(nodes) = region.get("Nodes").and_then(Value::as_array) {
                for node in nodes {
                    if let Some(host) = node.get("HostName").and_then(Value::as_str) {
                        decoded.region_hosts.push(host.to_string());
                    }
                }
            }
        }
    }

    Some(decoded)
}

/// Parses the key JSON written by `tailcat genkey`.
///
/// Client identity keys omit `Public.RegionID`; server keys always carry it
/// (a value of `-1` means "pick a region at each server startup").
pub fn key_is_client(json: &str) -> Option<bool> {
    let value: Value = serde_json::from_str(json).ok()?;
    let public = value.get("Public")?;
    Some(public.get("RegionID").is_none())
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_TOKEN: &str = "tco2FwWCBTIkS2JAbd8Zu-nRX6Kh6ejMZVFqnLc4xPc7uqvCl_EWFrWCCXh-2CI9MEFZTYNBU_vPUP_yvEpPw4nCN7gOewHOHgFWFpGQEw";

    #[test]
    fn extracts_ephemeral_address_from_stderr() {
        let line = format!("# 🐈 Server listening with new address: {REAL_TOKEN}");
        assert_eq!(address_from_line(&line).as_deref(), Some(REAL_TOKEN));
    }

    #[test]
    fn extracts_saved_key_address_from_stderr() {
        let line = format!("# 🐈 Server listening with saved key \"default\": {REAL_TOKEN}");
        assert_eq!(address_from_line(&line).as_deref(), Some(REAL_TOKEN));
    }

    #[test]
    fn ignores_unrelated_lines() {
        assert!(address_from_line("# Selected bootstrap relay region 304, Tokyo").is_none());
        assert!(address_from_loose_line("some random log").is_none());
    }

    #[test]
    fn parses_json_listen_addr() {
        let line = format!("{{\"listenAddr\":\"{REAL_TOKEN}\"}}");
        assert_eq!(address_from_json_line(&line).as_deref(), Some(REAL_TOKEN));
        assert!(address_from_json_line("not json").is_none());
    }

    #[test]
    fn parses_pongs() {
        let text = "pong in 42.1ms via DERP(sfo)\npong in 1.2ms via 203.0.113.7:41641\n";
        let pongs = parse_pongs(text);
        assert_eq!(pongs.len(), 2);
        assert!(!pongs[0].direct);
        assert_eq!(pongs[0].via, "DERP(sfo)");
        assert!(pongs[1].direct);
        assert!((pongs[1].rtt_ms - 1.2).abs() < f64::EPSILON);
    }

    #[test]
    fn parses_forward_listener_lines() {
        // Captured from `tailcat forward <blob> 0:18080` on v0.7.0.
        let listener = parse_forward_line("# forwarding 127.0.0.1:54212 -> remote localhost:18080")
            .expect("parses");
        assert_eq!(listener.bind_host, "127.0.0.1");
        assert_eq!(listener.local_port, 54212);
        assert_eq!(listener.remote_host, "localhost");
        assert_eq!(listener.remote_port, 18080);
        assert_eq!(listener.listen_addr(), "127.0.0.1:54212");

        // Non-loopback binds and IPv6 literals keep a usable host:port shape.
        let any = parse_forward_line("# forwarding 0.0.0.0:8080 -> remote localhost:80").unwrap();
        assert_eq!(any.listen_addr(), "0.0.0.0:8080");
        let v6 = parse_forward_line("# forwarding ::1:8080 -> remote localhost:80").unwrap();
        assert_eq!(v6.listen_addr(), "[::1]:8080");

        // Ordinary log lines must not be mistaken for a listener.
        assert!(parse_forward_line("# Selected bootstrap relay region 304, Tokyo").is_none());
        assert!(parse_forward_line("forwarding somewhere").is_none());
    }

    #[test]
    fn parses_ls_long_output() {
        let text = "-rw-r--r--            6 Oct 14 11:00 a.txt\n\
                    -rw-r--r--       307200 Oct 14 11:00 big.bin\n\
                    drwxr-xr-x           96 Oct 14 11:00 sub/\n";
        let entries = parse_ls_long(text);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "a.txt");
        assert_eq!(entries[0].size, Some(6));
        assert!(!entries[0].is_dir);
        assert_eq!(entries[1].size, Some(307_200));
        assert_eq!(entries[2].name, "sub");
        assert!(entries[2].is_dir);
    }

    #[test]
    fn parses_ls_short_output() {
        let entries = parse_ls_short("a.txt\nsub/\n\n");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[1].name, "sub");
        assert!(entries[1].is_dir);
        assert!(entries[0].size.is_none());
    }

    #[test]
    fn parses_key_names_and_regions() {
        let regions = parse_regions("  301 nyc New York City\n  302 sfo San Francisco\n");
        assert_eq!(regions, vec!["nyc (301)", "sfo (302)"]);
    }

    #[test]
    fn decodes_short_and_self_contained_addresses() {
        let short =
            r#"{"ServerPublic":"nodekey:53a5","ServerDiscoPublic":"discokey:d818","RegionID":304}"#;
        let decoded = decode_address_json(short).expect("decodes");
        assert_eq!(decoded.region_id, Some(304));
        assert!(!decoded.self_contained);
        assert!(decoded.region_hosts.is_empty());

        let long = r#"{"ServerPublic":"nodekey:8022","Region":[{"Nodes":[{"HostName":"derp.example.com"}]}]}"#;
        let decoded = decode_address_json(long).expect("decodes");
        assert!(decoded.self_contained);
        assert_eq!(decoded.region_hosts, vec!["derp.example.com"]);
        assert_eq!(decoded.region_id, None);
    }

    #[test]
    fn detects_client_keys() {
        let server = r#"{"Private":"privkey:x","Public":{"ServerPublic":"nodekey:a","ServerDiscoPublic":"discokey:b","RegionID":-1}}"#;
        let client = r#"{"Private":"privkey:x","Public":{"ServerPublic":"nodekey:a","ServerDiscoPublic":"discokey:b"}}"#;
        assert_eq!(key_is_client(server), Some(false));
        assert_eq!(key_is_client(client), Some(true));
        assert_eq!(key_is_client("nope"), None);
    }

    #[test]
    fn parses_genkey_outputs() {
        let text = format!(
            "# wrote file to /Users/x/Library/Application Support/tailcat/keys/default.private.json\n{REAL_TOKEN}\n"
        );
        assert_eq!(
            parse_wrote_file(&text).as_deref(),
            Some("/Users/x/Library/Application Support/tailcat/keys/default.private.json")
        );
        assert_eq!(parse_generated_address(&text).as_deref(), Some(REAL_TOKEN));
        // The status line on its own must never be mistaken for a token.
        assert!(parse_generated_address("# wrote file to /tmp/default.private.json").is_none());
        assert!(parse_generated_address("not a token at all").is_none());

        let client_out =
            "nodekey:cfb6bfa77a0654d7450947fd6acef17d2cd848da1d30b2540b13dac272ddfd16\n";
        assert_eq!(
            parse_public_key(client_out).as_deref(),
            Some("nodekey:cfb6bfa77a0654d7450947fd6acef17d2cd848da1d30b2540b13dac272ddfd16")
        );
    }
}
