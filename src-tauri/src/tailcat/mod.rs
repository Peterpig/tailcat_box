//! Adapter layer for the official `tailcat` CLI.
//!
//! Everything the rest of the app knows about tailcat goes through this type.
//! It never builds a shell string, never guesses a flag, and always surfaces
//! failures as `AppError`.

pub mod parse;
pub mod spec;

use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio::process::Command;

use crate::error::{classify_stderr, code, AppError, AppResult};
use crate::model::{
    KeyCreateRequest, KeyCreateResult, ParsedAddress, PingResult, RemoteEntry, RemoteListing,
    SavedKey,
};

use self::spec::CommandSpec;

/// Upper bounds for one-shot CLI calls. Long-running work is handled by the
/// task registry instead, which streams output continuously.
const NETWORK_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl CommandOutput {
    pub fn ok(&self) -> bool {
        self.code == Some(0)
    }

    /// Raw diagnostics for `AppError.detail`, never shown unless expanded.
    pub fn diagnostics(&self) -> String {
        let mut parts = Vec::new();
        if !self.stderr.trim().is_empty() {
            parts.push(format!("stderr:\n{}", self.stderr.trim()));
        }
        if !self.stdout.trim().is_empty() {
            parts.push(format!("stdout:\n{}", self.stdout.trim()));
        }
        if let Some(code) = self.code {
            parts.push(format!("exit code: {code}"));
        }
        parts.join("\n\n")
    }
}

#[derive(Debug, Clone)]
pub struct TailcatCli {
    program: PathBuf,
    derp_map_url: Option<String>,
}

impl TailcatCli {
    pub fn new(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
            derp_map_url: None,
        }
    }

    pub fn with_derp_map(mut self, url: Option<String>) -> Self {
        self.derp_map_url = url.filter(|value| !value.trim().is_empty());
        self
    }

    pub fn program(&self) -> &Path {
        &self.program
    }

    pub fn derp_map_url(&self) -> Option<&str> {
        self.derp_map_url.as_deref()
    }

    pub fn spec_program(&self) -> PathBuf {
        self.program.clone()
    }

    async fn run(&self, spec: CommandSpec, timeout: Duration) -> AppResult<CommandOutput> {
        let mut command = Command::new(&spec.program);
        command.args(&spec.args);
        for (key, value) in &spec.env {
            command.env(key, value);
        }
        if let Some(cwd) = &spec.cwd {
            command.current_dir(cwd);
        }
        command.stdin(std::process::Stdio::null());
        command.kill_on_drop(true);

        let child = command.spawn().map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => AppError::engine_missing().with_detail(format!(
                "failed to spawn {}: {error}",
                spec.program.display()
            )),
            std::io::ErrorKind::PermissionDenied => {
                AppError::new(code::PERMISSION_DENIED, "tailcat 可执行文件没有执行权限")
                    .with_hint("请检查文件权限，或改用其他路径")
                    .with_detail(error.to_string())
            }
            _ => AppError::engine_missing().with_detail(error.to_string()),
        })?;

        let output = tokio::time::timeout(timeout, child.wait_with_output())
            .await
            .map_err(|_| {
                AppError::new(code::NETWORK_ERROR, "tailcat 命令执行超时")
                    .with_hint("请检查网络连接后重试")
                    .with_detail(format!(
                        "{} timed out after {:?}",
                        spec.display().join(" "),
                        timeout
                    ))
            })??;

        Ok(CommandOutput {
            code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }

    pub async fn version(&self) -> AppResult<String> {
        let spec = spec::version_spec(self.spec_program());
        let output = self.run(spec, Duration::from_secs(15)).await?;
        let text = if output.stdout.trim().is_empty() {
            output.stderr.clone()
        } else {
            output.stdout.clone()
        };
        let version = text
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(|line| line.trim_start_matches('v').to_string());
        match version {
            Some(version) if output.ok() => Ok(version),
            _ => Err(
                AppError::new(code::ENGINE_VERSION_FAILED, "无法读取 tailcat 版本")
                    .with_hint("该文件可能不是官方的 tailcat 可执行文件")
                    .with_detail(output.diagnostics()),
            ),
        }
    }

    /// Authoritative validation of a connection token.
    pub async fn parse_address(&self, input: &str) -> AppResult<ParsedAddress> {
        let text = input.trim();
        if text.is_empty() {
            return Err(AppError::invalid_address("请输入对端地址"));
        }

        if !text.starts_with("tc") {
            // DNS names are resolved by the CLI from a `tailcat=` TXT record at
            // connect time; there is nothing to decode up front.
            return Ok(ParsedAddress {
                input: text.to_string(),
                blob: None,
                dns_name: Some(text.to_string()),
                server_public_key: None,
                region_id: None,
                region_hosts: Vec::new(),
                self_contained: false,
            });
        }

        let spec = spec::parse_spec(self.spec_program(), text);
        let output = self.run(spec, Duration::from_secs(15)).await?;
        if !output.ok() {
            return Err(classify_stderr(&format!(
                "{}\n{}",
                output.stderr, output.stdout
            )));
        }
        let decoded = parse::decode_address_json(&output.stdout).ok_or_else(|| {
            AppError::invalid_address("无法解析地址令牌内容").with_detail(output.diagnostics())
        })?;

        Ok(ParsedAddress {
            input: text.to_string(),
            blob: Some(text.to_string()),
            dns_name: None,
            server_public_key: decoded.server_public_key,
            region_id: decoded.region_id,
            region_hosts: decoded.region_hosts,
            self_contained: decoded.self_contained,
        })
    }

    /// Expands a short token into a self-contained one with embedded DERP info.
    pub async fn resolve(&self, address: &str) -> AppResult<String> {
        let spec = spec::resolve_spec(self.spec_program(), address);
        let output = self.run(spec, NETWORK_TIMEOUT).await?;
        if !output.ok() {
            return Err(classify_stderr(&format!(
                "{}\n{}",
                output.stderr, output.stdout
            )));
        }
        output
            .stdout
            .lines()
            .map(str::trim)
            .find(|line| line.starts_with("tc"))
            .map(str::to_string)
            .ok_or_else(|| {
                AppError::new(code::ADDRESS_UNRESOLVED, "无法展开该地址")
                    .with_detail(output.diagnostics())
            })
    }

    pub async fn regions(&self) -> AppResult<Vec<String>> {
        let spec = spec::regions_spec(self.spec_program());
        let output = self.run(spec, NETWORK_TIMEOUT).await?;
        if !output.ok() {
            return Err(classify_stderr(&output.stderr));
        }
        Ok(parse::parse_regions(&format!(
            "{}{}",
            output.stdout, output.stderr
        )))
    }

    pub async fn create_key(&self, request: &KeyCreateRequest) -> AppResult<KeyCreateResult> {
        let spec = spec::genkey_spec(self.spec_program(), request);
        let output = self.run(spec, NETWORK_TIMEOUT).await?;
        if !output.ok() {
            return Err(classify_stderr(&format!(
                "{}\n{}",
                output.stderr, output.stdout
            )));
        }
        let combined = format!("{}\n{}", output.stdout, output.stderr);
        Ok(KeyCreateResult {
            name: request.name.trim().to_string(),
            client: request.client,
            address: if request.client {
                None
            } else {
                parse::parse_generated_address(&output.stdout)
            },
            public_key: if request.client {
                parse::parse_public_key(&output.stdout)
            } else {
                None
            },
            path: parse::parse_wrote_file(&combined),
        })
    }

    pub async fn delete_key(&self, name: &str) -> AppResult<()> {
        let spec = spec::genkey_delete_spec(self.spec_program(), name);
        let output = self.run(spec, Duration::from_secs(15)).await?;
        if !output.ok() {
            return Err(classify_stderr(&output.stderr));
        }
        Ok(())
    }

    /// Path discovery probe. `tailcat ping` is known to time out against some
    /// peers even when data transfer works, so callers must present this as
    /// advisory only (see `docs/limitations.md`).
    pub async fn ping(
        &self,
        address: &str,
        until_direct: bool,
        timeout_secs: u64,
    ) -> AppResult<PingResult> {
        let spec = spec::ping_spec(
            self.spec_program(),
            self.derp_map_url(),
            address,
            until_direct,
            timeout_secs.clamp(1, 120),
        );
        let output = self
            .run(spec, Duration::from_secs(timeout_secs.clamp(1, 120) + 15))
            .await?;
        let combined = format!("{}\n{}", output.stdout, output.stderr);
        let pongs = parse::parse_pongs(&combined);
        let direct = pongs.iter().any(|pong| pong.direct);
        let ok = !pongs.is_empty() && output.ok();

        Ok(PingResult {
            ok,
            direct,
            pongs,
            error: if ok {
                None
            } else {
                Some(classify_stderr(&combined))
            },
        })
    }

    pub async fn list_remote(
        &self,
        address: &str,
        path: &str,
        long: bool,
    ) -> AppResult<RemoteListing> {
        let spec = spec::ls_spec(
            self.spec_program(),
            self.derp_map_url(),
            None,
            address,
            path,
            long,
        );
        let output = self.run(spec, NETWORK_TIMEOUT).await?;
        if !output.ok() {
            return Err(classify_stderr(&format!(
                "{}\n{}",
                output.stderr, output.stdout
            )));
        }
        let entries: Vec<RemoteEntry> = if long {
            parse::parse_ls_long(&output.stdout)
        } else {
            parse::parse_ls_short(&output.stdout)
        };
        Ok(RemoteListing {
            path: path.trim().to_string(),
            entries,
        })
    }
}

/// Reads the key files tailcat keeps in `$CONFIG/tailcat/keys`.
pub fn read_saved_keys(keys_dir: &Path) -> Vec<SavedKey> {
    let mut keys = Vec::new();
    let Ok(entries) = std::fs::read_dir(keys_dir) else {
        return keys;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(key_name) = name.strip_suffix(".private.json") else {
            continue;
        };
        let client = std::fs::read_to_string(&path)
            .ok()
            .and_then(|json| parse::key_is_client(&json))
            .unwrap_or(false);
        keys.push(SavedKey {
            name: key_name.to_string(),
            client,
            is_default: key_name == "default",
            path: Some(path.display().to_string()),
        });
    }
    keys.sort_by(|a, b| a.name.cmp(&b.name));
    keys
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::FilesMode;

    fn cli() -> TailcatCli {
        TailcatCli::new("/opt/homebrew/bin/tailcat")
            .with_derp_map(Some("https://example.com/derpmap.json".to_string()))
    }

    #[test]
    fn global_flags_precede_subcommand() {
        let spec = spec::serve_spec(
            cli().spec_program(),
            cli().derp_map_url(),
            Some("default"),
            &["8080".to_string()],
            None,
            None,
            None,
            false,
            true,
            false,
        );
        assert_eq!(
            spec.args[0],
            "--derpmap-url=https://example.com/derpmap.json"
        );
        assert_eq!(spec.args[1], "--key=default");
        assert_eq!(spec.args[2], "serve");
        assert!(spec.args.contains(&"--json".to_string()));
        assert_eq!(spec.args.last().unwrap(), "8080");
    }

    #[test]
    fn serve_files_service_carries_mode_suffix() {
        let spec = spec::serve_spec(
            cli().spec_program(),
            None,
            None,
            &["files".to_string()],
            Some("/srv/pub"),
            Some(FilesMode::Rw),
            Some(&["nodekey:abc".to_string(), "none".to_string()]),
            true,
            false,
            false,
        );
        assert!(spec.args.contains(&"--files=/srv/pub:rw".to_string()));
        assert!(spec.args.contains(&"--full-address".to_string()));
        assert!(spec.args.contains(&"--allow=nodekey:abc,none".to_string()));
    }

    #[test]
    fn cp_target_uses_addrblob_colon_path() {
        let spec = spec::cp_spec(
            cli().spec_program(),
            None,
            None,
            &["report.pdf".to_string()],
            "tcAAA",
            "",
            false,
            true,
            false,
        );
        assert!(spec.args.contains(&"-p".to_string()));
        assert_eq!(spec.args.last().unwrap(), "tcAAA:");
    }

    #[test]
    fn forward_spec_uses_native_forward_subcommand() {
        let spec = spec::forward_spec(
            cli().spec_program(),
            None,
            None,
            "tcAAA",
            "127.0.0.1",
            0,
            8080,
        );
        assert_eq!(
            spec.args,
            vec!["forward", "--bind=127.0.0.1", "tcAAA", "0:8080"]
                .into_iter()
                .map(str::to_string)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn forward_spec_keeps_global_flags_first_and_skips_empty_bind() {
        let spec = spec::forward_spec(
            cli().spec_program(),
            None,
            Some("client-default"),
            "tcAAA",
            "  ",
            8080,
            80,
        );
        assert_eq!(spec.args[0], "--key=client-default");
        assert_eq!(spec.args[1], "forward");
        assert!(!spec.args.iter().any(|arg| arg.starts_with("--bind")));
        assert_eq!(spec.args.last().unwrap(), "8080:80");
    }

    #[test]
    fn ssh_command_is_split_without_a_shell() {
        let spec = spec::ssh_spec(
            cli().spec_program(),
            None,
            "tcAAA",
            Some("root"),
            Some(2222),
            Some("uptime -p"),
        );
        assert_eq!(
            spec.args,
            vec!["ssh", "-p", "2222", "root@tcAAA", "uptime", "-p"]
                .into_iter()
                .map(str::to_string)
                .collect::<Vec<_>>()
        );
    }
}
