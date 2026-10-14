//! Serde mirrors of the shared IPC contract in `src/lib/types.ts`.
//!
//! Any change here must be mirrored there (and vice versa) in the same commit.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::AppError;

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineSource {
    Bundled,
    Path,
    Custom,
    Missing,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub found: bool,
    pub source: EngineSource,
    pub path: Option<String>,
    pub version: Option<String>,
    pub configured_path: Option<String>,
    pub keys_dir: Option<String>,
    pub saved_keys: Vec<String>,
    pub has_default_key: bool,
    pub has_client_key: bool,
    pub derp_map_url: Option<String>,
    pub error: Option<AppError>,
}

impl EngineStatus {
    pub fn missing(
        configured_path: Option<String>,
        derp_map_url: Option<String>,
        error: AppError,
    ) -> Self {
        Self {
            found: false,
            source: EngineSource::Missing,
            path: None,
            version: None,
            configured_path,
            keys_dir: None,
            saved_keys: Vec::new(),
            has_default_key: false,
            has_client_key: false,
            derp_map_url,
            error: Some(error),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedKey {
    pub name: String,
    pub client: bool,
    pub is_default: bool,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyCreateRequest {
    pub name: String,
    pub client: bool,
    pub region: Option<String>,
    #[serde(default)]
    pub fixed_region: bool,
    #[serde(default)]
    pub embed_derp_map: bool,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyCreateResult {
    pub name: String,
    pub client: bool,
    pub address: Option<String>,
    pub public_key: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedAddress {
    pub input: String,
    pub blob: Option<String>,
    pub dns_name: Option<String>,
    pub server_public_key: Option<String>,
    pub region_id: Option<i64>,
    pub region_hosts: Vec<String>,
    pub self_contained: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingPong {
    pub rtt_ms: f64,
    pub via: String,
    pub direct: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub ok: bool,
    pub direct: bool,
    pub pongs: Vec<PingPong>,
    pub error: Option<AppError>,
}

/// Whether the official release feed has a binary for this machine, and what
/// the UI should tell the user either way. Mirrors `EngineDownloadInfo`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineDownloadInfo {
    pub supported: bool,
    pub platform: String,
    pub arch: String,
    /// Latest official version, without a leading `v`; null when unsupported or
    /// when the release feed could not be reached.
    pub version: Option<String>,
    pub asset_name: Option<String>,
    /// Chinese explanation plus the manual fallback; set for unsupported
    /// platforms and for "could not determine" outcomes.
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineDownloadPhase {
    Checking,
    Downloading,
    Verifying,
    Extracting,
    Installing,
    Done,
    Error,
}

/// Payload of `tailcat://engine-download`. `downloaded` is the real number of
/// bytes written to disk so far; it is never estimated.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineDownloadProgress {
    pub phase: EngineDownloadPhase,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub version: Option<String>,
    pub message: Option<String>,
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskKind {
    Serve,
    Forward,
    Service,
    Recv,
    Share,
    Send,
    Socks,
    Ssh,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Starting,
    Running,
    Stopping,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FilesMode {
    Ro,
    Rw,
    Wo,
    /// Recursive write-only drop box (`:wo+`), added by tailcat v0.7.0.
    #[serde(rename = "wo+")]
    WoPlus,
}

impl FilesMode {
    pub fn as_suffix(self) -> &'static str {
        match self {
            FilesMode::Ro => "ro",
            FilesMode::Rw => "rw",
            FilesMode::Wo => "wo",
            FilesMode::WoPlus => "wo+",
        }
    }
}

pub type TaskDetail = HashMap<String, serde_json::Value>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    pub id: String,
    pub kind: TaskKind,
    pub status: TaskStatus,
    pub label: String,
    pub pid: Option<u32>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub args_summary: Vec<String>,
    pub address: Option<String>,
    pub listen_addr: Option<String>,
    pub detail: TaskDetail,
    pub exit_code: Option<i32>,
    pub exit_signal: Option<String>,
    pub error: Option<AppError>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogStream {
    Stdout,
    Stderr,
    App,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub seq: u64,
    pub ts: String,
    pub stream: LogStream,
    pub level: LogLevel,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskLogPage {
    pub lines: Vec<LogLine>,
    pub next_seq: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEvent {
    pub task: TaskInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    pub id: String,
    pub line: LogLine,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedEvent {
    pub id: String,
}

/// Internally tagged on `kind`, matching the TypeScript union.
#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum TaskRequest {
    Serve {
        #[serde(default)]
        label: Option<String>,
        targets: Vec<String>,
        #[serde(default)]
        files_dir: Option<String>,
        #[serde(default)]
        files_mode: Option<FilesMode>,
        #[serde(default)]
        key_name: Option<String>,
        #[serde(default)]
        allow: Option<Vec<String>>,
        #[serde(default)]
        full_address: Option<bool>,
    },
    Forward {
        #[serde(default)]
        label: Option<String>,
        address: String,
        remote_port: u16,
        local_port: u16,
        bind_host: String,
        #[serde(default)]
        key_name: Option<String>,
    },
    Service {
        #[serde(default)]
        label: Option<String>,
        address: String,
        remote_port: u16,
        local_port: u16,
        bind_host: String,
        #[serde(default)]
        scheme: Option<String>,
        #[serde(default)]
        key_name: Option<String>,
    },
    Recv {
        #[serde(default)]
        label: Option<String>,
        dir: String,
        #[serde(default)]
        key_name: Option<String>,
    },
    Share {
        #[serde(default)]
        label: Option<String>,
        dir: String,
        mode: FilesMode,
        #[serde(default)]
        key_name: Option<String>,
        #[serde(default)]
        full_address: Option<bool>,
    },
    Send {
        #[serde(default)]
        label: Option<String>,
        sources: Vec<String>,
        address: String,
        remote_path: String,
        #[serde(default)]
        recursive: bool,
        #[serde(default)]
        preserve_times: bool,
        #[serde(default)]
        key_name: Option<String>,
    },
    Socks {
        #[serde(default)]
        label: Option<String>,
        address: String,
    },
    Ssh {
        #[serde(default)]
        label: Option<String>,
        address: String,
        #[serde(default)]
        user: Option<String>,
        #[serde(default)]
        port: Option<u16>,
        #[serde(default)]
        command: Option<String>,
    },
}

impl TaskRequest {
    pub fn kind(&self) -> TaskKind {
        match self {
            TaskRequest::Serve { .. } => TaskKind::Serve,
            TaskRequest::Forward { .. } => TaskKind::Forward,
            TaskRequest::Service { .. } => TaskKind::Service,
            TaskRequest::Recv { .. } => TaskKind::Recv,
            TaskRequest::Share { .. } => TaskKind::Share,
            TaskRequest::Send { .. } => TaskKind::Send,
            TaskRequest::Socks { .. } => TaskKind::Socks,
            TaskRequest::Ssh { .. } => TaskKind::Ssh,
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Files                                                                      */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub size: Option<u64>,
    pub mode: Option<String>,
    pub modified: Option<String>,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteListing {
    pub path: String,
    pub entries: Vec<RemoteEntry>,
}

/* -------------------------------------------------------------------------- */
/* Settings & history                                                         */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevelName {
    Error,
    Warn,
    Info,
    Debug,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StartScreen {
    Home,
    Last,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub theme: ThemeMode,
    pub language: String,
    pub tailcat_path: Option<String>,
    pub prefer_bundled: bool,
    pub derp_map_url: Option<String>,
    pub start_screen: StartScreen,
    pub log_level: LogLevelName,
    pub log_dir: Option<String>,
    pub redact_addresses: bool,
    pub confirm_on_quit: bool,
    pub allow_non_loopback_bind: bool,
    pub max_log_lines: usize,
    pub history_limit: usize,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            theme: ThemeMode::System,
            language: "zh-CN".to_string(),
            tailcat_path: None,
            prefer_bundled: true,
            derp_map_url: None,
            start_screen: StartScreen::Home,
            log_level: LogLevelName::Info,
            log_dir: None,
            redact_addresses: true,
            confirm_on_quit: true,
            allow_non_loopback_bind: false,
            max_log_lines: 2000,
            history_limit: 50,
        }
    }
}

impl Settings {
    /// Clamps user-supplied values into a safe range. Called on every update so
    /// a hand-edited settings file cannot disable a safety default silently.
    pub fn sanitize(&mut self) {
        self.version = 1;
        self.max_log_lines = self.max_log_lines.clamp(100, 20_000);
        self.history_limit = self.history_limit.clamp(0, 500);
        if !matches!(self.language.as_str(), "zh-CN" | "en") {
            self.language = "zh-CN".to_string();
        }
        if let Some(url) = &self.derp_map_url {
            let trimmed = url.trim();
            if trimmed.is_empty() {
                self.derp_map_url = None;
            } else {
                self.derp_map_url = Some(trimmed.to_string());
            }
        }
        if let Some(path) = &self.tailcat_path {
            let trimmed = path.trim();
            if trimmed.is_empty() {
                self.tailcat_path = None;
            } else {
                self.tailcat_path = Some(trimmed.to_string());
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HistoryKind {
    Serve,
    Forward,
    Service,
    Share,
    Send,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub kind: HistoryKind,
    pub address: String,
    pub label: String,
    pub note: Option<String>,
    pub created_at: String,
    pub last_used_at: String,
    pub use_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub app_version: String,
    pub config_dir: String,
    pub log_dir: String,
    pub bundled_tailcat_path: Option<String>,
    pub native: bool,
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

pub const EVENT_TASK_UPDATED: &str = "tailcat://task-updated";
pub const EVENT_TASK_LOG: &str = "tailcat://task-log";
pub const EVENT_TASK_REMOVED: &str = "tailcat://task-removed";
pub const EVENT_ENGINE_CHANGED: &str = "tailcat://engine-changed";
pub const EVENT_ENGINE_DOWNLOAD: &str = "tailcat://engine-download";
pub const EVENT_SETTINGS_CHANGED: &str = "tailcat://settings-changed";
pub const EVENT_QUIT_REQUESTED: &str = "tailcat://quit-requested";
