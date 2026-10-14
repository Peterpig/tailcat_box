//! Tailcat Box desktop shell.
//!
//! Layering (see `docs/architecture.md`):
//!   commands -> task registry / config -> tailcat adapter -> official CLI

#[cfg(test)]
mod cleanup;
mod commands;
mod config;
#[cfg(test)]
mod e2e;
mod engine;
mod engine_download;
#[cfg(test)]
mod engine_download_tests;
mod error;
mod model;
mod system;
mod tailcat;
mod task;

use std::sync::Arc;

use tauri::{Emitter, Manager, RunEvent, WindowEvent};

use crate::commands::AppState;
use crate::config::ConfigStore;
use crate::model::EVENT_QUIT_REQUESTED;
use crate::task::TaskRegistry;

fn log_level(level: crate::model::LogLevelName) -> log::LevelFilter {
    match level {
        crate::model::LogLevelName::Error => log::LevelFilter::Error,
        crate::model::LogLevelName::Warn => log::LevelFilter::Warn,
        crate::model::LogLevelName::Info => log::LevelFilter::Info,
        crate::model::LogLevelName::Debug => log::LevelFilter::Debug,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = match ConfigStore::new(None) {
        Ok(store) => store,
        Err(error) => {
            eprintln!("tailcat-box: 无法初始化配置目录: {error}");
            std::process::exit(1);
        }
    };
    if let Err(error) = store.ensure_dirs() {
        eprintln!("tailcat-box: 无法创建配置目录: {error}");
    }

    let settings = store.load_settings();
    let registry = Arc::new(TaskRegistry::default());
    let state = AppState::new(store.clone(), Arc::clone(&registry));

    let registry_for_setup = Arc::clone(&registry);
    let registry_for_exit = Arc::clone(&registry);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log_level(settings.log_level))
                .build(),
        )
        .manage(state)
        .setup(move |app| {
            registry_for_setup.attach(app.handle().clone());
            log::info!("tailcat-box {} 已启动", app.package_info().version);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                let running = state.registry.running_count();
                if running > 0 && state.settings_snapshot().confirm_on_quit {
                    api.prevent_close();
                    if let Err(error) = window.emit(
                        EVENT_QUIT_REQUESTED,
                        serde_json::json!({ "running": running }),
                    ) {
                        log::warn!("emit quit-requested failed: {error}");
                    }
                } else {
                    // Never leave listeners or transfers running behind us.
                    state.registry.shutdown();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::system_info,
            commands::system_open_url,
            commands::system_open_path,
            commands::system_reveal,
            commands::app_quit,
            commands::engine_status,
            commands::engine_detect,
            commands::engine_set_path,
            commands::engine_set_derpmap,
            commands::engine_download_info,
            commands::engine_download,
            commands::engine_keys_list,
            commands::engine_create_key,
            commands::engine_delete_key,
            commands::engine_regions,
            commands::engine_parse,
            commands::engine_resolve,
            commands::engine_ping,
            commands::task_list,
            commands::task_get,
            commands::task_logs,
            commands::task_start,
            commands::task_stop,
            commands::task_remove,
            commands::task_stop_all,
            commands::fs_home_dir,
            commands::fs_list_dir,
            commands::remote_list,
            commands::settings_get,
            commands::settings_update,
            commands::settings_reset,
            commands::settings_export,
            commands::settings_import,
            commands::history_list,
            commands::history_rename,
            commands::history_remove,
            commands::history_clear,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build the Tauri application");

    app.run(move |_handle, event| {
        if let RunEvent::Exit = event {
            registry_for_exit.shutdown();
        }
    });
}
