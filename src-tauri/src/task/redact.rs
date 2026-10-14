//! Credential redaction for logs and command summaries.
//!
//! A tailcat connection token is a bearer credential: whoever holds it can
//! reach the listener. It must never be written to logs, and the argv summary
//! shown in the UI must not leak it either.

use once_cell::sync::Lazy;
use regex::Regex;

static TOKEN_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"tc[0-9A-Za-z_\-]{30,}").expect("token regex"));

static PRIVATE_KEY_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"privkey:[0-9a-fA-F]{16,}").expect("privkey regex"));

/// Masks a single token, keeping just enough to recognise it.
pub fn mask_token(token: &str) -> String {
    if token.len() <= 14 {
        return "tc…".to_string();
    }
    format!("{}…{}", &token[..8], &token[token.len() - 4..])
}

/// Replaces every credential-looking substring in free text.
pub fn redact(text: &str) -> String {
    let step_one = TOKEN_RE.replace_all(text, |caps: &regex::Captures| mask_token(&caps[0]));
    PRIVATE_KEY_RE
        .replace_all(&step_one, "privkey:…")
        .into_owned()
}

pub fn redact_args(args: &[String]) -> Vec<String> {
    args.iter().map(|arg| redact(arg)).collect()
}

/// True when the text contains a credential that had to be masked.
pub fn contains_credential(text: &str) -> bool {
    TOKEN_RE.is_match(text) || PRIVATE_KEY_RE.is_match(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "tco2FwWCBTIkS2JAbd8Zu-nRX6Kh6ejMZVFqnLc4xPc7uqvCl_EWFrWCCXh-2CI9MEFZTYNBU_vPUP_yvEpPw4nCN7gOewHOHgFWFpGQEw";

    #[test]
    fn masks_tokens_in_log_lines() {
        let line = format!("# Server listening with new address: {SAMPLE}");
        let redacted = redact(&line);
        assert!(!redacted.contains(SAMPLE));
        assert!(redacted.contains("tco2FwWC…"));
        assert!(redacted.contains("GQEw"));
    }

    #[test]
    fn leaves_ordinary_text_alone() {
        let text = "pong in 42.1ms via DERP(sfo)";
        assert_eq!(redact(text), text);
        assert!(!contains_credential(text));
    }

    #[test]
    fn masks_private_keys() {
        let text = "Private: privkey:781e7c5b97a80a66a90f964a440cf8fb";
        assert_eq!(redact(text), "Private: privkey:…");
    }

    #[test]
    fn redacts_arguments() {
        let args = vec!["cp".to_string(), format!("{SAMPLE}:/pub")];
        let redacted = redact_args(&args);
        assert_eq!(redacted[0], "cp");
        assert!(!redacted[1].contains(SAMPLE));
    }
}
