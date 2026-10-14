//! Locating and validating the tailcat binary.

use std::path::{Path, PathBuf};

use crate::config::ConfigStore;
use crate::error::{code, AppError};
use crate::model::{EngineSource, EngineStatus, Settings};
use crate::tailcat::TailcatCli;

fn executable_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &["tailcat.exe", "tailcat.cmd", "tailcat.bat"]
    } else {
        &["tailcat"]
    }
}

/// Directory the running application lives in (inside the .app bundle on macOS).
pub fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
}

/// A binary shipped alongside the app, if the packager included one.
pub fn bundled_binary() -> Option<PathBuf> {
    let dir = exe_dir()?;
    let mut candidates = Vec::new();
    for name in executable_names() {
        candidates.push(dir.join(name));
        candidates.push(dir.join("resources").join(name));
        candidates.push(dir.join("bin").join(name));
    }
    // macOS bundle layout: Contents/MacOS/<exe>, Contents/Resources/<file>
    if let Some(contents) = dir.parent() {
        for name in executable_names() {
            candidates.push(contents.join("Resources").join(name));
        }
    }
    candidates.into_iter().find(|path| is_executable_file(path))
}

pub fn find_on_path() -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        for name in executable_names() {
            let candidate = dir.join(name);
            if is_executable_file(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode() & 0o111 == 0 {
            return false;
        }
    }
    true
}

/// Resolution order: explicit custom path → bundled binary → PATH.
pub fn resolve(settings: &Settings) -> (Option<PathBuf>, EngineSource) {
    if let Some(custom) = settings
        .tailcat_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let path = PathBuf::from(custom);
        if is_executable_file(&path) {
            return (Some(path), EngineSource::Custom);
        }
        // A configured-but-broken path must not silently fall through to a
        // different binary; the user asked for this one.
        return (None, EngineSource::Missing);
    }

    if settings.prefer_bundled {
        if let Some(path) = bundled_binary() {
            return (Some(path), EngineSource::Bundled);
        }
    }

    if let Some(path) = find_on_path() {
        return (Some(path), EngineSource::Path);
    }

    if !settings.prefer_bundled {
        if let Some(path) = bundled_binary() {
            return (Some(path), EngineSource::Bundled);
        }
    }

    (None, EngineSource::Missing)
}

pub async fn build_status(settings: &Settings, store: &ConfigStore) -> EngineStatus {
    let (path, source) = resolve(settings);
    let keys_dir = store.keys_dir().display().to_string();
    let saved = store.saved_keys();
    let has_default_key = saved.iter().any(|key| key.is_default && !key.client);
    let has_client_key = saved.iter().any(|key| key.name == "client-default");

    let Some(path) = path else {
        let error = if settings
            .tailcat_path
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
        {
            AppError::new(code::ENGINE_UNUSABLE, "配置的 tailcat 路径不可用")
                .with_hint("请确认该文件存在且具有执行权限")
                .with_detail(format!(
                    "configured path: {}",
                    settings.tailcat_path.clone().unwrap_or_default()
                ))
        } else {
            AppError::engine_missing()
        };
        return EngineStatus {
            keys_dir: Some(keys_dir),
            saved_keys: saved.iter().map(|key| key.name.clone()).collect(),
            has_default_key,
            has_client_key,
            ..EngineStatus::missing(
                settings.tailcat_path.clone(),
                settings.derp_map_url.clone(),
                error,
            )
        };
    };

    let cli = TailcatCli::new(path.clone()).with_derp_map(settings.derp_map_url.clone());
    let (version, error) = match cli.version().await {
        Ok(version) => (Some(version), None),
        Err(error) => (None, Some(error)),
    };

    EngineStatus {
        found: true,
        source,
        path: Some(path.display().to_string()),
        version,
        configured_path: settings.tailcat_path.clone(),
        keys_dir: Some(keys_dir),
        saved_keys: saved.iter().map(|key| key.name.clone()).collect(),
        has_default_key,
        has_client_key,
        derp_map_url: settings.derp_map_url.clone(),
        error,
    }
}

/// Builds a CLI handle for commands, or fails with the standard engine error.
pub async fn cli_for(settings: &Settings, store: &ConfigStore) -> Result<TailcatCli, AppError> {
    let (path, _) = resolve(settings);
    match path {
        Some(path) => Ok(store.tailcat_cli(settings, path)),
        None => Err(AppError::engine_missing()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_path_takes_priority_and_fails_closed() {
        let settings = Settings {
            tailcat_path: Some("/definitely/not/here/tailcat".to_string()),
            ..Settings::default()
        };
        let (path, source) = resolve(&settings);
        assert!(path.is_none());
        assert_eq!(source, EngineSource::Missing);
    }

    #[test]
    fn missing_settings_resolve_to_missing_or_path() {
        let settings = Settings::default();
        let (path, source) = resolve(&settings);
        match (path, source) {
            (Some(_), EngineSource::Path) | (Some(_), EngineSource::Bundled) => {}
            (None, EngineSource::Missing) => {}
            other => panic!("unexpected resolution: {other:?}"),
        }
    }
}
