use serde::Serialize;
use std::fmt;

/// Error codes shared with `src/lib/types.ts` (`ERROR_CODES`).
///
/// This is a vocabulary, not a call graph: both sides must agree on every
/// value even when one side has no call site for it yet, so unused constants
/// are expected rather than a smell.
#[allow(dead_code)]
pub mod code {
    pub const ENGINE_NOT_FOUND: &str = "ENGINE_NOT_FOUND";
    pub const ENGINE_UNUSABLE: &str = "ENGINE_UNUSABLE";
    pub const ENGINE_VERSION_FAILED: &str = "ENGINE_VERSION_FAILED";
    pub const ENGINE_UNSUPPORTED_PLATFORM: &str = "ENGINE_UNSUPPORTED_PLATFORM";
    pub const ENGINE_DOWNLOAD_FAILED: &str = "ENGINE_DOWNLOAD_FAILED";
    pub const ENGINE_CHECKSUM_MISMATCH: &str = "ENGINE_CHECKSUM_MISMATCH";
    pub const ADDRESS_INVALID: &str = "ADDRESS_INVALID";
    pub const ADDRESS_UNRESOLVED: &str = "ADDRESS_UNRESOLVED";
    pub const PORT_IN_USE: &str = "PORT_IN_USE";
    pub const PORT_INVALID: &str = "PORT_INVALID";
    pub const PATH_NOT_ALLOWED: &str = "PATH_NOT_ALLOWED";
    pub const PATH_NOT_FOUND: &str = "PATH_NOT_FOUND";
    pub const PATH_TRAVERSAL: &str = "PATH_TRAVERSAL";
    pub const PERMISSION_DENIED: &str = "PERMISSION_DENIED";
    pub const DISK_FULL: &str = "DISK_FULL";
    pub const NETWORK_ERROR: &str = "NETWORK_ERROR";
    pub const DERP_UNREACHABLE: &str = "DERP_UNREACHABLE";
    pub const CONNECT_FAILED: &str = "CONNECT_FAILED";
    pub const PROCESS_FAILED: &str = "PROCESS_FAILED";
    pub const TASK_NOT_FOUND: &str = "TASK_NOT_FOUND";
    pub const TASK_NOT_RUNNING: &str = "TASK_NOT_RUNNING";
    pub const TASK_ALREADY_RUNNING: &str = "TASK_ALREADY_RUNNING";
    pub const UNSUPPORTED: &str = "UNSUPPORTED";
    pub const CANCELLED: &str = "CANCELLED";
    pub const CONFIG_ERROR: &str = "CONFIG_ERROR";
    pub const IO_ERROR: &str = "IO_ERROR";
    pub const INTERNAL: &str = "INTERNAL";
}

/// The single error type crossing the IPC boundary.
///
/// `message` is written for end users, `detail` holds raw diagnostics and is
/// only rendered when the user explicitly expands it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub hint: Option<String>,
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            hint: None,
            detail: None,
        }
    }

    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        if !detail.trim().is_empty() {
            self.detail = Some(detail);
        }
        self
    }

    pub fn engine_missing() -> Self {
        Self::new(code::ENGINE_NOT_FOUND, "未检测到 tailcat 可执行文件")
            .with_hint("请在「设置 → 引擎」中指定 tailcat 路径，或先安装官方 tailcat")
    }

    pub fn task_not_found(id: &str) -> Self {
        Self::new(code::TASK_NOT_FOUND, "任务不存在或已被移除")
            .with_detail(format!("task id: {id}"))
    }

    pub fn invalid_address(message: impl Into<String>) -> Self {
        Self::new(code::ADDRESS_INVALID, message)
            .with_hint("地址令牌必须以 tc 开头，或使用带 tailcat= TXT 记录的 DNS 名称")
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)?;
        if let Some(detail) = &self.detail {
            write!(f, ": {detail}")?;
        }
        Ok(())
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        let code = match value.kind() {
            std::io::ErrorKind::PermissionDenied => code::PERMISSION_DENIED,
            std::io::ErrorKind::NotFound => code::PATH_NOT_FOUND,
            std::io::ErrorKind::AddrInUse => code::PORT_IN_USE,
            _ => code::IO_ERROR,
        };
        let message = match value.kind() {
            std::io::ErrorKind::PermissionDenied => "权限不足，无法完成操作",
            std::io::ErrorKind::NotFound => "文件或目录不存在",
            std::io::ErrorKind::AddrInUse => "端口已被占用",
            _ => "系统 I/O 操作失败",
        };
        AppError::new(code, message).with_detail(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        AppError::new(code::INTERNAL, "解析数据失败").with_detail(value.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(value: tauri::Error) -> Self {
        AppError::new(code::INTERNAL, "桌面运行时调用失败").with_detail(value.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// Classifies raw process output into a user-facing error.
pub fn classify_stderr(stderr: &str) -> AppError {
    let lowered = stderr.to_lowercase();
    if lowered.contains("address in use") || lowered.contains("bind: address already in use") {
        return AppError::new(code::PORT_IN_USE, "端口已被占用")
            .with_hint("请更换本地端口，或先停止占用该端口的程序")
            .with_detail(stderr.trim());
    }
    if lowered.contains("permission denied") {
        return AppError::new(code::PERMISSION_DENIED, "权限不足").with_detail(stderr.trim());
    }
    if lowered.contains("no space left") {
        return AppError::new(code::DISK_FULL, "磁盘空间不足").with_detail(stderr.trim());
    }
    if lowered.contains("context deadline exceeded") || lowered.contains("timeout") {
        return AppError::new(code::DERP_UNREACHABLE, "连接超时，未能与对端或中继建立通路")
            .with_hint("请确认对端仍在监听、网络可达，或稍后重试")
            .with_detail(stderr.trim());
    }
    if lowered.contains("is neither a") || lowered.contains("invalid") {
        return AppError::invalid_address("地址令牌无效").with_detail(stderr.trim());
    }
    if lowered.contains("no such file") || lowered.contains("cannot find") {
        return AppError::new(code::PATH_NOT_FOUND, "路径不存在").with_detail(stderr.trim());
    }
    AppError::new(code::PROCESS_FAILED, "tailcat 执行失败").with_detail(stderr.trim())
}
