//! Configuration layer: settings, history and on-disk paths.
//!
//! Everything lives under the platform config directory, next to the keys the
//! tailcat CLI itself manages. Nothing is ever uploaded anywhere.

use std::path::{Path, PathBuf};

use crate::error::{code, AppError, AppResult};
use crate::model::SavedKey;
use crate::model::{HistoryEntry, Settings};
use crate::tailcat::{read_saved_keys, TailcatCli};

pub const APP_DIR_NAME: &str = "tailcat-box";
pub const TAILCAT_DIR_NAME: &str = "tailcat";

#[derive(Debug, Clone)]
pub struct ConfigStore {
    app_dir: PathBuf,
    log_dir: PathBuf,
    keys_dir: PathBuf,
}

impl ConfigStore {
    /// Resolves the platform config directory. `override_root` exists so tests
    /// can point the store at a temporary directory.
    pub fn new(override_root: Option<PathBuf>) -> AppResult<Self> {
        let root = match override_root {
            Some(root) => root,
            None => dirs::config_dir()
                .ok_or_else(|| AppError::new(code::CONFIG_ERROR, "无法确定系统的配置目录"))?,
        };
        Ok(Self::from_root(root))
    }

    pub fn from_root(root: PathBuf) -> Self {
        let app_dir = root.join(APP_DIR_NAME);
        let log_dir = app_dir.join("logs");
        let keys_dir = root.join(TAILCAT_DIR_NAME).join("keys");
        Self {
            app_dir,
            log_dir,
            keys_dir,
        }
    }

    pub fn app_dir(&self) -> &Path {
        &self.app_dir
    }

    pub fn log_dir(&self) -> &Path {
        &self.log_dir
    }

    /// Where downloaded engine versions live (`<app data dir>/engine`).
    pub fn engine_dir(&self) -> PathBuf {
        self.app_dir.join("engine")
    }

    pub fn keys_dir(&self) -> &Path {
        &self.keys_dir
    }

    pub fn settings_path(&self) -> PathBuf {
        self.app_dir.join("settings.json")
    }

    pub fn history_path(&self) -> PathBuf {
        self.app_dir.join("history.json")
    }

    pub fn ensure_dirs(&self) -> AppResult<()> {
        std::fs::create_dir_all(&self.app_dir)?;
        std::fs::create_dir_all(&self.log_dir)?;
        Ok(())
    }

    pub fn load_settings(&self) -> Settings {
        let path = self.settings_path();
        let mut settings = match std::fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str::<Settings>(&text).unwrap_or_else(|error| {
                log::warn!("settings.json 解析失败，已回退到默认值: {error}");
                // Keep the damaged file for inspection instead of deleting it.
                let _ = std::fs::rename(&path, path.with_extension("json.bak"));
                Settings::default()
            }),
            Err(_) => Settings::default(),
        };
        settings.sanitize();
        settings
    }

    pub fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        self.ensure_dirs()?;
        let text = serde_json::to_string_pretty(settings)?;
        write_atomic(&self.settings_path(), &text)
    }

    pub fn load_history(&self) -> Vec<HistoryEntry> {
        let path = self.history_path();
        let Ok(text) = std::fs::read_to_string(&path) else {
            return Vec::new();
        };
        serde_json::from_str::<Vec<HistoryEntry>>(&text).unwrap_or_else(|error| {
            log::warn!("history.json 解析失败，已忽略: {error}");
            Vec::new()
        })
    }

    pub fn save_history(&self, entries: &[HistoryEntry]) -> AppResult<()> {
        self.ensure_dirs()?;
        let text = serde_json::to_string_pretty(entries)?;
        write_atomic(&self.history_path(), &text)
    }

    pub fn saved_keys(&self) -> Vec<SavedKey> {
        read_saved_keys(&self.keys_dir)
    }

    pub fn tailcat_cli(&self, settings: &Settings, program: PathBuf) -> TailcatCli {
        TailcatCli::new(program).with_derp_map(settings.derp_map_url.clone())
    }
}

fn write_atomic(path: &Path, contents: &str) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new(code::CONFIG_ERROR, "配置路径无效"))?;
    std::fs::create_dir_all(parent)?;
    let temp = path.with_extension("tmp");
    std::fs::write(&temp, contents)?;
    std::fs::rename(&temp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ThemeMode;

    fn temp_store(name: &str) -> ConfigStore {
        let root =
            std::env::temp_dir().join(format!("tailcat-box-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        ConfigStore::from_root(root)
    }

    #[test]
    fn settings_round_trip() {
        let store = temp_store("settings");
        let settings = Settings {
            theme: ThemeMode::Dark,
            max_log_lines: 1234,
            ..Settings::default()
        };
        store.save_settings(&settings).expect("saves");

        let loaded = store.load_settings();
        assert_eq!(loaded.theme, ThemeMode::Dark);
        assert_eq!(loaded.max_log_lines, 1234);
    }

    #[test]
    fn sanitize_clamps_hostile_values() {
        let mut settings = Settings {
            max_log_lines: 10_000_000,
            history_limit: 99_999,
            language: "xx".to_string(),
            derp_map_url: Some("   ".to_string()),
            ..Settings::default()
        };
        settings.sanitize();
        assert_eq!(settings.max_log_lines, 20_000);
        assert_eq!(settings.history_limit, 500);
        assert_eq!(settings.language, "zh-CN");
        assert_eq!(settings.derp_map_url, None);
    }

    #[test]
    fn corrupt_settings_file_falls_back_to_defaults() {
        let store = temp_store("corrupt");
        store.ensure_dirs().expect("dirs");
        std::fs::write(store.settings_path(), "{ not json").expect("writes");
        let loaded = store.load_settings();
        assert_eq!(loaded.version, 1);
        assert!(store.settings_path().with_extension("json.bak").exists());
    }
}
