//! System integration: opening paths/URLs and platform identification.

use tauri_plugin_opener::OpenerExt;

use crate::error::{code, AppError, AppResult};

pub fn os_name() -> String {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
    .to_string()
}

pub fn arch_name() -> String {
    std::env::consts::ARCH.to_string()
}

/// Only http/https URLs are ever handed to the OS.
pub fn open_url(app: &tauri::AppHandle, url: &str) -> AppResult<()> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err(
            AppError::new(code::PATH_NOT_ALLOWED, "只允许打开 http/https 链接")
                .with_detail(format!("rejected url: {trimmed}")),
        );
    }
    app.opener()
        .open_url(trimmed, None::<&str>)
        .map_err(|error| {
            AppError::new(code::INTERNAL, "无法打开链接").with_detail(error.to_string())
        })
}

pub fn open_path(app: &tauri::AppHandle, path: &str) -> AppResult<()> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(code::PATH_NOT_FOUND, "路径为空"));
    }
    if !std::path::Path::new(trimmed).exists() {
        return Err(AppError::new(code::PATH_NOT_FOUND, "路径不存在")
            .with_detail(format!("missing path: {trimmed}")));
    }
    app.opener()
        .open_path(trimmed, None::<&str>)
        .map_err(|error| {
            AppError::new(code::INTERNAL, "无法打开路径").with_detail(error.to_string())
        })
}

pub fn reveal_path(app: &tauri::AppHandle, path: &str) -> AppResult<()> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(code::PATH_NOT_FOUND, "路径为空"));
    }
    if !std::path::Path::new(trimmed).exists() {
        return Err(AppError::new(code::PATH_NOT_FOUND, "路径不存在")
            .with_detail(format!("missing path: {trimmed}")));
    }
    app.opener().reveal_item_in_dir(trimmed).map_err(|error| {
        AppError::new(code::INTERNAL, "无法在文件管理器中显示").with_detail(error.to_string())
    })
}
