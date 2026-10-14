//! Argument construction for every tailcat invocation.
//!
//! Rules enforced here (see `docs/tailcat-cli.md`):
//!  * arguments are always a vector — a shell string is never built;
//!  * tailcat-level flags are emitted before the subcommand;
//!  * nothing is invented: only flags documented by `tailcat <cmd> --help`.

use std::path::PathBuf;

use crate::model::{FilesMode, KeyCreateRequest};

#[derive(Debug, Clone)]
pub struct CommandSpec {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub cwd: Option<PathBuf>,
}

impl CommandSpec {
    pub fn new(program: PathBuf) -> Self {
        Self {
            program,
            args: Vec::new(),
            env: Vec::new(),
            cwd: None,
        }
    }

    pub fn env_var(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }

    /// argv shown in the UI. Credential-bearing values are redacted by the
    /// caller through `task::redact`, never here.
    pub fn display(&self) -> Vec<String> {
        let mut out = vec![self.program.display().to_string()];
        out.extend(self.args.iter().cloned());
        out
    }
}

/// tailcat-level flags that must precede the subcommand.
pub fn global_args(derp_map_url: Option<&str>, key: Option<&str>, verbose: bool) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(url) = derp_map_url.map(str::trim).filter(|url| !url.is_empty()) {
        args.push(format!("--derpmap-url={url}"));
    }
    if let Some(key) = key.map(str::trim).filter(|key| !key.is_empty()) {
        args.push(format!("--key={key}"));
    }
    if verbose {
        args.push("--verbose".to_string());
    }
    args
}

fn files_value(dir: &str, mode: FilesMode) -> String {
    format!("--files={}:{}", dir.trim(), mode.as_suffix())
}

// These spec builders are thin argv constructors: every parameter maps 1:1 to a
// documented CLI flag (or positional), so bundling them into a struct would hide
// the flag correspondence and add indirection without improving clarity. The
// generated argv is asserted by the tests below.
#[allow(clippy::too_many_arguments)]
pub fn serve_spec(
    program: PathBuf,
    derp_map_url: Option<&str>,
    key: Option<&str>,
    targets: &[String],
    files_dir: Option<&str>,
    files_mode: Option<FilesMode>,
    allow: Option<&[String]>,
    full_address: bool,
    json: bool,
    verbose: bool,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.extend(global_args(derp_map_url, key, verbose));
    spec.args.push("serve".to_string());
    if json {
        spec.args.push("--json".to_string());
    }
    if full_address {
        spec.args.push("--full-address".to_string());
    }
    if let Some(dir) = files_dir.map(str::trim).filter(|dir| !dir.is_empty()) {
        spec.args
            .push(files_value(dir, files_mode.unwrap_or(FilesMode::Ro)));
    }
    if let Some(allow) = allow {
        let joined: Vec<&str> = allow
            .iter()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .collect();
        if !joined.is_empty() {
            spec.args.push(format!("--allow={}", joined.join(",")));
        }
    }
    spec.args.extend(targets.iter().cloned());
    spec
}

pub fn recv_spec(
    program: PathBuf,
    derp_map_url: Option<&str>,
    key: Option<&str>,
    dir: &str,
    json: bool,
    verbose: bool,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.extend(global_args(derp_map_url, key, verbose));
    spec.args.push("recv".to_string());
    if json {
        spec.args.push("--json".to_string());
    }
    spec.args.push(dir.to_string());
    spec
}

// See the note on `serve_spec`: argv constructor with a 1:1 flag mapping.
#[allow(clippy::too_many_arguments)]
pub fn share_spec(
    program: PathBuf,
    derp_map_url: Option<&str>,
    key: Option<&str>,
    dir: &str,
    mode: FilesMode,
    full_address: bool,
    json: bool,
    verbose: bool,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.extend(global_args(derp_map_url, key, verbose));
    spec.args.push("serve".to_string());
    if json {
        spec.args.push("--json".to_string());
    }
    if full_address {
        spec.args.push("--full-address".to_string());
    }
    spec.args.push(files_value(dir, mode));
    spec.args.push("files".to_string());
    spec
}

/// `tailcat cp [-r] [-p] <source>... <addrblob>:[path]`
// See the note on `serve_spec`: argv constructor with a 1:1 flag mapping.
#[allow(clippy::too_many_arguments)]
pub fn cp_spec(
    program: PathBuf,
    derp_map_url: Option<&str>,
    key: Option<&str>,
    sources: &[String],
    address: &str,
    remote_path: &str,
    recursive: bool,
    preserve_times: bool,
    verbose: bool,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.extend(global_args(derp_map_url, key, verbose));
    spec.args.push("cp".to_string());
    if recursive {
        spec.args.push("-r".to_string());
    }
    if preserve_times {
        spec.args.push("-p".to_string());
    }
    spec.args.extend(sources.iter().cloned());
    spec.args
        .push(format!("{}:{}", address.trim(), remote_path.trim()));
    spec
}

/// `tailcat ls [-l] <addrblob>[:path]`
pub fn ls_spec(
    program: PathBuf,
    derp_map_url: Option<&str>,
    key: Option<&str>,
    address: &str,
    path: &str,
    long: bool,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.extend(global_args(derp_map_url, key, false));
    spec.args.push("ls".to_string());
    if long {
        spec.args.push("-l".to_string());
    }
    let trimmed = path.trim();
    if trimmed.is_empty() {
        spec.args.push(address.trim().to_string());
    } else {
        spec.args.push(format!("{}:{}", address.trim(), trimmed));
    }
    spec
}

/// `tailcat cp [-r] [-p] <addrblob>:[path] <local>...` — the fetch direction.
///
/// `cp_spec` always appends the address-bearing argument last, which is the
/// send direction (`<source>... <addrblob>:[path]`); a download needs it first
/// (`<addrblob>:[path] <local>...`), so it gets its own constructor instead of
/// a flag that would silently reverse the operand order.
///
/// The GUI only sends files today, so nothing outside the end-to-end tests
/// calls this yet; it is kept next to `cp_spec` because the two must stay in
/// sync with the same CLI.
// See the note on `serve_spec`: argv constructor with a 1:1 flag mapping.
#[allow(dead_code)]
#[allow(clippy::too_many_arguments)]
pub fn cp_fetch_spec(
    program: PathBuf,
    derp_map_url: Option<&str>,
    key: Option<&str>,
    address: &str,
    remote_path: &str,
    destinations: &[String],
    recursive: bool,
    preserve_times: bool,
    verbose: bool,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.extend(global_args(derp_map_url, key, verbose));
    spec.args.push("cp".to_string());
    if recursive {
        spec.args.push("-r".to_string());
    }
    if preserve_times {
        spec.args.push("-p".to_string());
    }
    spec.args
        .push(format!("{}:{}", address.trim(), remote_path.trim()));
    spec.args.extend(destinations.iter().cloned());
    spec
}

/// `tailcat ssh [-p PORT] [user@]<addrblob> [command...]`
pub fn ssh_spec(
    program: PathBuf,
    derp_map_url: Option<&str>,
    address: &str,
    user: Option<&str>,
    port: Option<u16>,
    command: Option<&str>,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.extend(global_args(derp_map_url, None, false));
    spec.args.push("ssh".to_string());
    if let Some(port) = port {
        spec.args.push("-p".to_string());
        spec.args.push(port.to_string());
    }
    let destination = match user.map(str::trim).filter(|user| !user.is_empty()) {
        Some(user) => format!("{user}@{}", address.trim()),
        None => address.trim().to_string(),
    };
    spec.args.push(destination);
    if let Some(command) = command.map(str::trim).filter(|cmd| !cmd.is_empty()) {
        // Split on whitespace: the command is passed as an argv tail, never
        // through a shell, so there is no injection surface.
        spec.args
            .extend(command.split_whitespace().map(str::to_string));
    }
    spec
}

/// Local port forwarding, performed by the CLI itself.
///
/// `tailcat forward --bind=<host> <addrblob> <localPort>:<remotePort>`
/// (native subcommand since v0.7.0; verified end-to-end against v0.7.0).
/// A `localPort` of `0` asks the OS for a free port, and the CLI prints the
/// address it actually bound to stderr as
/// `# forwarding <host>:<port> -> remote <host>:<port>`.
///
/// The mapping is always written as `local:remote`: the single-port form
/// (`tailcat forward <addr> 0`) is rejected by the CLI with
/// `mapping "0" is invalid: local port: invalid port "0"`.
pub fn forward_spec(
    program: PathBuf,
    derp_map_url: Option<&str>,
    key: Option<&str>,
    address: &str,
    bind_host: &str,
    local_port: u16,
    remote_port: u16,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.extend(global_args(derp_map_url, key, false));
    spec.args.push("forward".to_string());
    let bind = bind_host.trim();
    if !bind.is_empty() {
        spec.args.push(format!("--bind={bind}"));
    }
    spec.args.push(address.trim().to_string());
    spec.args.push(format!("{local_port}:{remote_port}"));
    spec
}

pub fn ping_spec(
    program: PathBuf,
    derp_map_url: Option<&str>,
    address: &str,
    until_direct: bool,
    timeout_secs: u64,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.extend(global_args(derp_map_url, None, false));
    spec.args.push("ping".to_string());
    if until_direct {
        spec.args.push("--until-direct".to_string());
    }
    spec.args.push(format!("--timeout={timeout_secs}s"));
    spec.args.push(address.trim().to_string());
    spec
}

pub fn parse_spec(program: PathBuf, address: &str) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.push("parse".to_string());
    spec.args.push(address.trim().to_string());
    spec
}

pub fn resolve_spec(program: PathBuf, address: &str) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.push("resolve".to_string());
    spec.args.push(address.trim().to_string());
    spec
}

pub fn version_spec(program: PathBuf) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.push("version".to_string());
    spec
}

pub fn genkey_spec(program: PathBuf, request: &KeyCreateRequest) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.push("genkey".to_string());
    spec.args.push(format!("--key={}", request.name.trim()));
    if request.client {
        spec.args.push("--client".to_string());
    }
    if request.force {
        spec.args.push("--force".to_string());
    }
    if !request.client {
        if request.fixed_region {
            spec.args.push("--fixed-region".to_string());
        }
        if request.embed_derp_map {
            spec.args.push("--embed-derp-map".to_string());
        }
        if let Some(region) = request.region.as_deref().map(str::trim) {
            if !region.is_empty() {
                spec.args.push(format!("--region={region}"));
            }
        }
    }
    spec
}

pub fn genkey_delete_spec(program: PathBuf, name: &str) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.push("genkey".to_string());
    spec.args.push("--delete".to_string());
    spec.args.push(format!("--key={}", name.trim()));
    spec
}

pub fn regions_spec(program: PathBuf) -> CommandSpec {
    let mut spec = CommandSpec::new(program);
    spec.args.push("genkey".to_string());
    spec.args.push("--region=list".to_string());
    spec
}

#[cfg(test)]
mod tests {
    use super::*;

    fn program() -> PathBuf {
        PathBuf::from("/opt/homebrew/bin/tailcat")
    }

    #[test]
    fn cp_fetch_puts_the_remote_before_the_local_target() {
        let spec = cp_fetch_spec(
            program(),
            None,
            None,
            "tcAAA",
            "readme.txt",
            &["/tmp/out/readme.txt".to_string()],
            false,
            false,
            false,
        );
        assert_eq!(
            spec.args,
            vec![
                "cp".to_string(),
                "tcAAA:readme.txt".to_string(),
                "/tmp/out/readme.txt".to_string(),
            ],
            "取回方向必须把 <addrblob>:<path> 放在本地目标之前"
        );
    }

    #[test]
    fn cp_fetch_maps_flags_like_cp_spec() {
        let spec = cp_fetch_spec(
            program(),
            Some("https://example.com/derpmap.json"),
            Some("default"),
            "tcAAA",
            "",
            &["/tmp/a".to_string(), "/tmp/b".to_string()],
            true,
            true,
            true,
        );
        assert_eq!(
            spec.args,
            vec![
                "--derpmap-url=https://example.com/derpmap.json".to_string(),
                "--key=default".to_string(),
                "--verbose".to_string(),
                "cp".to_string(),
                "-r".to_string(),
                "-p".to_string(),
                "tcAAA:".to_string(),
                "/tmp/a".to_string(),
                "/tmp/b".to_string(),
            ]
        );
    }
}
