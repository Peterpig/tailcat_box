//! Tauri command surface. Mirrors `src/lib/api.ts` one-for-one.

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::config::ConfigStore;
use crate::engine;
use crate::engine_download;
use crate::error::{code, AppError, AppResult};
use crate::model::*;
use crate::system;
use crate::task::{TaskContext, TaskRegistry};

pub struct AppState {
    pub store: ConfigStore,
    pub registry: Arc<TaskRegistry>,
    pub settings: RwLock<Settings>,
}

impl AppState {
    pub fn new(store: ConfigStore, registry: Arc<TaskRegistry>) -> Self {
        let settings = store.load_settings();
        Self {
            store,
            registry,
            settings: RwLock::new(settings),
        }
    }

    pub fn settings_snapshot(&self) -> Settings {
        self.settings
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    fn replace_settings(&self, settings: Settings) -> AppResult<Settings> {
        self.store.save_settings(&settings)?;
        if let Ok(mut guard) = self.settings.write() {
            *guard = settings.clone();
        }
        Ok(settings)
    }
}

fn emit<T: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(error) = app.emit(event, payload) {
        log::warn!("emit {event} failed: {error}");
    }
}

/* -------------------------------------------------------------------------- */
/* System                                                                     */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub fn system_info(app: AppHandle, state: State<'_, AppState>) -> SystemInfo {
    let log_dir = app
        .path()
        .app_log_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| state.store.log_dir().display().to_string());
    SystemInfo {
        os: system::os_name(),
        arch: system::arch_name(),
        app_version: app.package_info().version.to_string(),
        config_dir: state.store.app_dir().display().to_string(),
        log_dir,
        bundled_tailcat_path: engine::bundled_binary().map(|path| path.display().to_string()),
        native: true,
    }
}

#[tauri::command]
pub fn system_open_url(app: AppHandle, url: String) -> AppResult<()> {
    system::open_url(&app, &url)
}

#[tauri::command]
pub fn system_open_path(app: AppHandle, path: String) -> AppResult<()> {
    system::open_path(&app, &path)
}

#[tauri::command]
pub fn system_reveal(app: AppHandle, path: String) -> AppResult<()> {
    system::reveal_path(&app, &path)
}

/// `force = false` asks the UI to confirm first when tasks are still running.
#[tauri::command]
pub fn app_quit(app: AppHandle, state: State<'_, AppState>, force: bool) -> AppResult<()> {
    let running = state.registry.running_count();
    let confirm = state.settings_snapshot().confirm_on_quit;
    if !force && confirm && running > 0 {
        emit(
            &app,
            EVENT_QUIT_REQUESTED,
            serde_json::json!({ "running": running }),
        );
        return Ok(());
    }
    state.registry.shutdown();
    app.exit(0);
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub async fn engine_status(state: State<'_, AppState>) -> AppResult<EngineStatus> {
    let settings = state.settings_snapshot();
    Ok(engine::build_status(&settings, &state.store).await)
}

#[tauri::command]
pub async fn engine_detect(
    state: State<'_, AppState>,
    path: Option<String>,
) -> AppResult<EngineStatus> {
    let mut settings = state.settings_snapshot();
    if let Some(path) = path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let candidate = PathBuf::from(path);
        if !candidate.is_file() {
            return Err(AppError::new(code::PATH_NOT_FOUND, "该路径下没有找到文件")
                .with_hint("请选择 tailcat 可执行文件本身，而不是目录")
                .with_detail(format!("missing: {path}")));
        }
        settings.tailcat_path = Some(path.to_string());
    }
    Ok(engine::build_status(&settings, &state.store).await)
}

#[tauri::command]
pub async fn engine_set_path(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
) -> AppResult<EngineStatus> {
    let mut settings = state.settings_snapshot();
    settings.tailcat_path = path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    settings.sanitize();
    let settings = state.replace_settings(settings)?;
    // 引擎路径属于设置的一部分，写盘后必须广播，否则已打开的设置页会读到旧值。
    emit(&app, EVENT_SETTINGS_CHANGED, settings.clone());
    let status = engine::build_status(&settings, &state.store).await;
    emit(&app, EVENT_ENGINE_CHANGED, status.clone());
    Ok(status)
}

#[tauri::command]
pub async fn engine_set_derpmap(
    app: AppHandle,
    state: State<'_, AppState>,
    url: Option<String>,
) -> AppResult<EngineStatus> {
    let mut settings = state.settings_snapshot();
    let trimmed = url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(value) = trimmed {
        if !(value.starts_with("https://") || value.starts_with("http://")) {
            return Err(
                AppError::new(code::CONFIG_ERROR, "DERP map 地址必须是 http(s) URL")
                    .with_hint("例如 https://tailcat.dev/derpmap.json")
                    .with_detail(format!("rejected: {value}")),
            );
        }
    }
    settings.derp_map_url = trimmed.map(str::to_string);
    let settings = state.replace_settings(settings)?;
    emit(&app, EVENT_SETTINGS_CHANGED, settings.clone());
    let status = engine::build_status(&settings, &state.store).await;
    emit(&app, EVENT_ENGINE_CHANGED, status.clone());
    Ok(status)
}

#[tauri::command]
pub fn engine_keys_list(state: State<'_, AppState>) -> Vec<SavedKey> {
    state.store.saved_keys()
}

/// Describes whether the official release feed has a binary for this machine.
/// Never fails: an unreachable feed is reported through `reason`.
#[tauri::command]
pub async fn engine_download_info() -> EngineDownloadInfo {
    engine_download::download_info(
        &engine_download::DownloadConfig::default(),
        &engine_download::Target::detect(),
    )
    .await
}

/// Downloads, SHA256-verifies, unpacks and installs the official binary, then
/// points `Settings.tailcatPath` at it. Progress is streamed on
/// `tailcat://engine-download`.
#[tauri::command]
pub async fn engine_download(
    app: AppHandle,
    state: State<'_, AppState>,
    version: Option<String>,
) -> AppResult<EngineStatus> {
    let mut settings = state.settings_snapshot();
    let target = engine_download::Target::detect();
    let install_root = state.store.engine_dir();
    let handle = app.clone();
    let installed = engine_download::download_into(
        &engine_download::DownloadConfig::default(),
        &target,
        version.as_deref(),
        &install_root,
        move |progress| emit(&handle, EVENT_ENGINE_DOWNLOAD, progress),
    )
    .await?;

    log::info!(
        "已安装 tailcat {} 到 {}",
        installed.version,
        installed.path.display()
    );
    settings.tailcat_path = Some(installed.path.display().to_string());
    settings.sanitize();
    let settings = state.replace_settings(settings)?;
    // 安装完成后 `tailcatPath` 已改变，同步广播设置变更事件。
    emit(&app, EVENT_SETTINGS_CHANGED, settings.clone());
    let status = engine::build_status(&settings, &state.store).await;
    emit(&app, EVENT_ENGINE_CHANGED, status.clone());
    Ok(status)
}

#[tauri::command]
pub async fn engine_create_key(
    app: AppHandle,
    state: State<'_, AppState>,
    request: KeyCreateRequest,
) -> AppResult<KeyCreateResult> {
    let settings = state.settings_snapshot();
    let cli = engine::cli_for(&settings, &state.store).await?;
    let result = cli.create_key(&request).await?;
    emit(
        &app,
        EVENT_ENGINE_CHANGED,
        engine::build_status(&settings, &state.store).await,
    );
    Ok(result)
}

#[tauri::command]
pub async fn engine_delete_key(state: State<'_, AppState>, name: String) -> AppResult<()> {
    let settings = state.settings_snapshot();
    let cli = engine::cli_for(&settings, &state.store).await?;
    cli.delete_key(&name).await
}

#[tauri::command]
pub async fn engine_regions(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    let settings = state.settings_snapshot();
    let cli = engine::cli_for(&settings, &state.store).await?;
    cli.regions().await
}

#[tauri::command]
pub async fn engine_parse(state: State<'_, AppState>, address: String) -> AppResult<ParsedAddress> {
    let settings = state.settings_snapshot();
    let cli = engine::cli_for(&settings, &state.store).await?;
    cli.parse_address(&address).await
}

#[tauri::command]
pub async fn engine_resolve(state: State<'_, AppState>, address: String) -> AppResult<String> {
    let settings = state.settings_snapshot();
    let cli = engine::cli_for(&settings, &state.store).await?;
    cli.resolve(&address).await
}

#[tauri::command]
pub async fn engine_ping(
    state: State<'_, AppState>,
    address: String,
    until_direct: Option<bool>,
    timeout_sec: Option<u64>,
) -> AppResult<PingResult> {
    let settings = state.settings_snapshot();
    let cli = engine::cli_for(&settings, &state.store).await?;
    cli.ping(
        &address,
        until_direct.unwrap_or(false),
        timeout_sec.unwrap_or(10),
    )
    .await
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

async fn context_for(state: &State<'_, AppState>) -> AppResult<TaskContext> {
    let settings = state.settings_snapshot();
    let cli = engine::cli_for(&settings, &state.store).await?;
    Ok(TaskContext { cli, settings })
}

#[tauri::command]
pub fn task_list(state: State<'_, AppState>) -> Vec<TaskInfo> {
    state.registry.list()
}

#[tauri::command]
pub fn task_get(state: State<'_, AppState>, id: String) -> Option<TaskInfo> {
    state.registry.get(&id)
}

#[tauri::command]
pub fn task_logs(
    state: State<'_, AppState>,
    id: String,
    since_seq: Option<u64>,
    limit: Option<usize>,
) -> AppResult<TaskLogPage> {
    state
        .registry
        .logs(&id, since_seq.unwrap_or(0), limit.unwrap_or(500))
}

#[tauri::command]
pub async fn task_start(state: State<'_, AppState>, request: TaskRequest) -> AppResult<TaskInfo> {
    // Validate the peer address with the CLI before anything is spawned.
    let peer = match &request {
        TaskRequest::Forward { address, .. }
        | TaskRequest::Service { address, .. }
        | TaskRequest::Send { address, .. }
        | TaskRequest::Socks { address, .. }
        | TaskRequest::Ssh { address, .. } => Some(address.clone()),
        _ => None,
    };

    let context = context_for(&state).await?;
    if let Some(address) = peer {
        let parsed = context.cli.parse_address(&address).await?;
        if parsed.blob.is_none() && parsed.dns_name.is_none() {
            return Err(AppError::invalid_address("地址无效"));
        }
    }

    let info = state.registry.start(request.clone(), &context).await?;
    record_history(&state, &request);
    Ok(info)
}

/// Records "recent connection" entries for tasks that target a peer.
fn record_history(state: &State<'_, AppState>, request: &TaskRequest) {
    let (kind, address, label) = match request {
        TaskRequest::Forward {
            address,
            label,
            remote_port,
            ..
        } => (
            HistoryKind::Forward,
            address.clone(),
            label
                .clone()
                .unwrap_or_else(|| format!("端口转发 :{remote_port}")),
        ),
        TaskRequest::Service {
            address,
            label,
            remote_port,
            ..
        } => (
            HistoryKind::Service,
            address.clone(),
            label
                .clone()
                .unwrap_or_else(|| format!("服务访问 :{remote_port}")),
        ),
        TaskRequest::Send {
            address,
            label,
            sources,
            ..
        } => (
            HistoryKind::Send,
            address.clone(),
            label
                .clone()
                .unwrap_or_else(|| format!("发送 {} 项", sources.len())),
        ),
        _ => return,
    };

    let settings = state.settings_snapshot();
    let mut entries = state.store.load_history();
    let timestamp = chrono::Utc::now().to_rfc3339();
    if let Some(existing) = entries.iter_mut().find(|entry| entry.address == address) {
        existing.last_used_at = timestamp;
        existing.use_count = existing.use_count.saturating_add(1);
        if existing.label.trim().is_empty() {
            existing.label = label;
        }
    } else {
        entries.push(HistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            kind,
            address,
            label,
            note: None,
            created_at: timestamp.clone(),
            last_used_at: timestamp,
            use_count: 1,
        });
    }
    entries.sort_by(|a, b| b.last_used_at.cmp(&a.last_used_at));
    if entries.len() > settings.history_limit {
        entries.truncate(settings.history_limit);
    }
    if let Err(error) = state.store.save_history(&entries) {
        log::warn!("saving history failed: {error}");
    }
}

#[tauri::command]
pub fn task_stop(state: State<'_, AppState>, id: String) -> AppResult<TaskInfo> {
    state.registry.stop(&id)
}

#[tauri::command]
pub fn task_remove(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.registry.remove(&id)
}

#[tauri::command]
pub fn task_stop_all(state: State<'_, AppState>) -> Vec<TaskInfo> {
    state.registry.stop_all()
}

/* -------------------------------------------------------------------------- */
/* Files                                                                      */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub fn fs_home_dir() -> AppResult<String> {
    dirs::home_dir()
        .map(|path| path.display().to_string())
        .ok_or_else(|| AppError::new(code::IO_ERROR, "无法确定用户主目录"))
}

#[tauri::command]
pub fn fs_list_dir(path: Option<String>) -> AppResult<Vec<LocalEntry>> {
    let base = match path.filter(|value| !value.trim().is_empty()) {
        Some(path) => PathBuf::from(path),
        None => {
            dirs::home_dir().ok_or_else(|| AppError::new(code::IO_ERROR, "无法确定用户主目录"))?
        }
    };
    if !base.is_dir() {
        return Err(AppError::new(code::PATH_NOT_FOUND, "目录不存在")
            .with_detail(format!("not a directory: {}", base.display())));
    }
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&base)?.flatten() {
        let path = entry.path();
        let metadata = entry.metadata().ok();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        entries.push(LocalEntry {
            name,
            path: path.display().to_string(),
            is_dir: metadata.as_ref().is_some_and(|meta| meta.is_dir()),
            size: metadata
                .as_ref()
                .filter(|meta| meta.is_file())
                .map(|meta| meta.len()),
            modified: metadata
                .as_ref()
                .and_then(|meta| meta.modified().ok())
                .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339()),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub async fn remote_list(
    state: State<'_, AppState>,
    address: String,
    path: Option<String>,
) -> AppResult<RemoteListing> {
    let settings = state.settings_snapshot();
    let cli = engine::cli_for(&settings, &state.store).await?;
    cli.list_remote(&address, path.as_deref().unwrap_or(""), true)
        .await
}

/* -------------------------------------------------------------------------- */
/* Settings & history                                                         */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    state.settings_snapshot()
}

#[tauri::command]
pub async fn settings_update(
    app: AppHandle,
    state: State<'_, AppState>,
    patch: serde_json::Value,
) -> AppResult<Settings> {
    let mut current = serde_json::to_value(state.settings_snapshot())?;
    if let (Some(target), Some(source)) = (current.as_object_mut(), patch.as_object()) {
        for (key, value) in source {
            target.insert(key.clone(), value.clone());
        }
    }
    let mut settings: Settings = serde_json::from_value(current)?;
    settings.sanitize();
    let settings = state.replace_settings(settings)?;
    emit(&app, EVENT_SETTINGS_CHANGED, settings.clone());
    Ok(settings)
}

#[tauri::command]
pub async fn settings_reset(app: AppHandle, state: State<'_, AppState>) -> AppResult<Settings> {
    let settings = state.replace_settings(Settings::default())?;
    emit(&app, EVENT_SETTINGS_CHANGED, settings.clone());
    Ok(settings)
}

#[tauri::command]
pub fn settings_export(state: State<'_, AppState>, path: String) -> AppResult<()> {
    let settings = state.settings_snapshot();
    let text = serde_json::to_string_pretty(&settings)?;
    std::fs::write(PathBuf::from(path), text)?;
    Ok(())
}

#[tauri::command]
pub async fn settings_import(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<Settings> {
    let text = std::fs::read_to_string(PathBuf::from(&path))?;
    let mut settings: Settings = serde_json::from_str(&text).map_err(|error| {
        AppError::new(code::CONFIG_ERROR, "配置文件格式不正确")
            .with_hint("请选择由本应用导出的 settings.json")
            .with_detail(error.to_string())
    })?;
    settings.sanitize();
    let settings = state.replace_settings(settings)?;
    emit(&app, EVENT_SETTINGS_CHANGED, settings.clone());
    Ok(settings)
}

#[tauri::command]
pub fn history_list(state: State<'_, AppState>) -> Vec<HistoryEntry> {
    state.store.load_history()
}

#[tauri::command]
pub fn history_rename(
    state: State<'_, AppState>,
    id: String,
    note: Option<String>,
) -> AppResult<Vec<HistoryEntry>> {
    let mut entries = state.store.load_history();
    if let Some(entry) = entries.iter_mut().find(|entry| entry.id == id) {
        entry.note = note.filter(|value| !value.trim().is_empty());
    }
    state.store.save_history(&entries)?;
    Ok(entries)
}

#[tauri::command]
pub fn history_remove(state: State<'_, AppState>, id: String) -> AppResult<Vec<HistoryEntry>> {
    let mut entries = state.store.load_history();
    entries.retain(|entry| entry.id != id);
    state.store.save_history(&entries)?;
    Ok(entries)
}

#[tauri::command]
pub fn history_clear(state: State<'_, AppState>) -> AppResult<Vec<HistoryEntry>> {
    state.store.save_history(&[])?;
    Ok(Vec::new())
}
