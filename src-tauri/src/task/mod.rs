//! Task registry: every long-running tailcat process is owned here, never by a
//! screen. Closing a window must not orphan a listener.

pub mod redact;

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::{Child, Command};

use crate::error::{code, AppError, AppResult};
use crate::model::*;
use crate::tailcat::spec::{self, CommandSpec};
use crate::tailcat::TailcatCli;

/// Inspects every log line of a task before it is stored. Used to pick the
/// dynamically assigned local port out of `tailcat forward`'s stderr.
pub type LineHook = Arc<dyn Fn(&str) + Send + Sync>;

/// Everything the registry needs from the application layer to start a task.
pub struct TaskContext {
    pub cli: TailcatCli,
    pub settings: Settings,
}

struct TaskEntry {
    info: TaskInfo,
    logs: VecDeque<LogLine>,
    next_seq: u64,
    child: Option<Child>,
    temp_dir: Option<PathBuf>,
    stop_requested: bool,
    max_log_lines: usize,
}

#[derive(Default)]
pub struct TaskRegistry {
    app: Mutex<Option<AppHandle>>,
    tasks: Mutex<HashMap<String, TaskEntry>>,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn label_for(request: &TaskRequest) -> String {
    match request {
        TaskRequest::Serve { label, targets, .. } => label
            .clone()
            .unwrap_or_else(|| format!("监听服务 {}", targets.join(","))),
        TaskRequest::Forward {
            label,
            address,
            remote_port,
            ..
        } => label.clone().unwrap_or_else(|| {
            format!("端口转发 → {}:{}", redact::mask_token(address), remote_port)
        }),
        TaskRequest::Service {
            label, remote_port, ..
        } => label
            .clone()
            .unwrap_or_else(|| format!("服务访问 → 远端端口 {remote_port}")),
        TaskRequest::Recv { label, dir, .. } => label
            .clone()
            .unwrap_or_else(|| format!("接收文件到 {}", dir)),
        TaskRequest::Share {
            label, dir, mode, ..
        } => label
            .clone()
            .unwrap_or_else(|| format!("共享目录 {} ({})", dir, mode.as_suffix())),
        TaskRequest::Send {
            label,
            sources,
            remote_path,
            ..
        } => label.clone().unwrap_or_else(|| {
            let target = if remote_path.trim().is_empty() {
                "共享根目录".to_string()
            } else {
                remote_path.clone()
            };
            format!("发送 {} 项 → {}", sources.len(), target)
        }),
        TaskRequest::Socks { label, .. } => {
            label.clone().unwrap_or_else(|| "SOCKS5 代理".to_string())
        }
        TaskRequest::Ssh { label, address, .. } => label
            .clone()
            .unwrap_or_else(|| format!("远程命令 {}", redact::mask_token(address))),
    }
}

fn classify_level(stream: LogStream, text: &str) -> LogLevel {
    let lower = text.to_lowercase();
    if lower.contains("panic") || lower.contains("fatal") || lower.contains("error") {
        return LogLevel::Error;
    }
    if stream == LogStream::Stderr {
        // scp progress is written to stderr but is ordinary output.
        let looks_like_progress = text.contains('%')
            || text.contains("B/s")
            || lower.contains("kb/s")
            || lower.contains("mb/s");
        if looks_like_progress || text.trim_start().starts_with('#') {
            return LogLevel::Info;
        }
        if lower.contains("failed") || lower.contains("denied") || lower.contains("refused") {
            return LogLevel::Error;
        }
        return LogLevel::Warn;
    }
    LogLevel::Info
}

impl TaskRegistry {
    pub fn attach(&self, app: AppHandle) {
        if let Ok(mut slot) = self.app.lock() {
            *slot = Some(app);
        }
    }

    fn emit(&self, event: &str, payload: impl serde::Serialize + Clone) {
        if let Ok(slot) = self.app.lock() {
            if let Some(app) = slot.as_ref() {
                if let Err(error) = app.emit(event, payload) {
                    log::warn!("emit {event} failed: {error}");
                }
            }
        }
    }

    pub fn list(&self) -> Vec<TaskInfo> {
        let Ok(tasks) = self.tasks.lock() else {
            return Vec::new();
        };
        let mut infos: Vec<TaskInfo> = tasks.values().map(|entry| entry.info.clone()).collect();
        infos.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        infos
    }

    pub fn get(&self, id: &str) -> Option<TaskInfo> {
        self.tasks
            .lock()
            .ok()
            .and_then(|tasks| tasks.get(id).map(|entry| entry.info.clone()))
    }

    pub fn logs(&self, id: &str, since_seq: u64, limit: usize) -> AppResult<TaskLogPage> {
        let tasks = self
            .tasks
            .lock()
            .map_err(|_| AppError::new(code::INTERNAL, "任务表不可用"))?;
        let entry = tasks.get(id).ok_or_else(|| AppError::task_not_found(id))?;
        let lines: Vec<LogLine> = entry
            .logs
            .iter()
            .filter(|line| line.seq >= since_seq)
            .take(limit.max(1))
            .cloned()
            .collect();
        Ok(TaskLogPage {
            lines,
            next_seq: entry.next_seq,
        })
    }

    pub fn running_count(&self) -> usize {
        self.list()
            .iter()
            .filter(|task| matches!(task.status, TaskStatus::Running | TaskStatus::Starting))
            .count()
    }

    fn push_log(&self, id: &str, stream: LogStream, level: LogLevel, text: String) {
        let redacted = redact::redact(&text);
        // Invariant: nothing that leaves this function may still carry a
        // credential. If this ever fires, a new token shape appeared upstream.
        debug_assert!(
            !redact::contains_credential(&redacted),
            "redaction left a credential in a log line"
        );
        let line = {
            let Ok(mut tasks) = self.tasks.lock() else {
                return;
            };
            let Some(entry) = tasks.get_mut(id) else {
                return;
            };
            let line = LogLine {
                seq: entry.next_seq,
                ts: now(),
                stream,
                level,
                text: redacted,
            };
            entry.next_seq += 1;
            entry.logs.push_back(line.clone());
            while entry.logs.len() > entry.max_log_lines {
                entry.logs.pop_front();
            }
            line
        };
        self.emit(
            EVENT_TASK_LOG,
            LogEvent {
                id: id.to_string(),
                line,
            },
        );
    }

    fn update<F>(&self, id: &str, mutate: F) -> Option<TaskInfo>
    where
        F: FnOnce(&mut TaskInfo),
    {
        let info = {
            let Ok(mut tasks) = self.tasks.lock() else {
                return None;
            };
            let entry = tasks.get_mut(id)?;
            mutate(&mut entry.info);
            entry.info.clone()
        };
        self.emit(EVENT_TASK_UPDATED, TaskEvent { task: info.clone() });
        Some(info)
    }

    fn set_address(&self, id: &str, address: String) {
        let already = self
            .tasks
            .lock()
            .ok()
            .and_then(|tasks| tasks.get(id).and_then(|entry| entry.info.address.clone()));
        if already.is_some() {
            return;
        }
        self.update(id, |info| {
            info.address = Some(address);
        });
    }

    /// Records the local listener reported by `tailcat forward`. The first
    /// line wins, so a restart cannot overwrite the address the UI already
    /// handed to the user.
    fn set_listen_addr(&self, id: &str, listen_addr: String) {
        let already = self.tasks.lock().ok().and_then(|tasks| {
            tasks
                .get(id)
                .and_then(|entry| entry.info.listen_addr.clone())
        });
        if already.is_some() {
            return;
        }
        self.update(id, |info| {
            info.listen_addr = Some(listen_addr);
        });
    }

    pub async fn start(
        self: &Arc<Self>,
        request: TaskRequest,
        ctx: &TaskContext,
    ) -> AppResult<TaskInfo> {
        if matches!(request, TaskRequest::Socks { .. }) {
            return Err(AppError::new(
                code::UNSUPPORTED,
                "本应用不使用 tailcat 的 SOCKS5 代理模式",
            )
            .with_hint("请改用「端口转发」或「服务访问」，它们调用 tailcat 原生的 forward 子命令")
            .with_detail(
                "tailcat v0.7.0 provides `tailcat forward`, which owns the listener \
                 itself; the GUI has no SOCKS surface.",
            ));
        }

        self.start_process(request, ctx).await
    }

    fn register(&self, mut entry: TaskEntry) -> TaskInfo {
        let info = entry.info.clone();
        entry.max_log_lines = entry.max_log_lines.max(100);
        if let Ok(mut tasks) = self.tasks.lock() {
            tasks.insert(info.id.clone(), entry);
        }
        self.emit(EVENT_TASK_UPDATED, TaskEvent { task: info.clone() });
        info
    }

    fn base_entry(info: TaskInfo, max_log_lines: usize) -> TaskEntry {
        TaskEntry {
            info,
            logs: VecDeque::new(),
            next_seq: 0,
            child: None,
            temp_dir: None,
            stop_requested: false,
            max_log_lines,
        }
    }

    async fn start_process(
        self: &Arc<Self>,
        request: TaskRequest,
        ctx: &TaskContext,
    ) -> AppResult<TaskInfo> {
        let kind = request.kind();
        let label = label_for(&request);
        let program = ctx.cli.program().to_path_buf();
        let derp = ctx.settings.derp_map_url.clone();
        let id = uuid::Uuid::new_v4().to_string();

        let mut detail: TaskDetail = HashMap::new();
        let mut spec = match &request {
            TaskRequest::Serve {
                targets,
                files_dir,
                files_mode,
                key_name,
                allow,
                full_address,
                ..
            } => {
                detail.insert("targets".into(), serde_json::json!(targets));
                detail.insert("filesDir".into(), serde_json::json!(files_dir));
                detail.insert(
                    "filesMode".into(),
                    serde_json::json!(files_mode.map(FilesMode::as_suffix)),
                );
                detail.insert("keyName".into(), serde_json::json!(key_name));
                spec::serve_spec(
                    program,
                    derp.as_deref(),
                    key_name.as_deref(),
                    targets,
                    files_dir.as_deref(),
                    *files_mode,
                    allow.as_deref(),
                    full_address.unwrap_or(false),
                    true,
                    false,
                )
            }
            TaskRequest::Recv { dir, key_name, .. } => {
                detail.insert("dir".into(), serde_json::json!(dir));
                detail.insert("keyName".into(), serde_json::json!(key_name));
                spec::recv_spec(
                    program,
                    derp.as_deref(),
                    key_name.as_deref(),
                    dir,
                    true,
                    false,
                )
            }
            TaskRequest::Share {
                dir,
                mode,
                key_name,
                full_address,
                ..
            } => {
                detail.insert("dir".into(), serde_json::json!(dir));
                detail.insert("mode".into(), serde_json::json!(mode.as_suffix()));
                detail.insert("keyName".into(), serde_json::json!(key_name));
                spec::share_spec(
                    program,
                    derp.as_deref(),
                    key_name.as_deref(),
                    dir,
                    *mode,
                    full_address.unwrap_or(false),
                    true,
                    false,
                )
            }
            TaskRequest::Send {
                sources,
                address,
                remote_path,
                recursive,
                preserve_times,
                key_name,
                ..
            } => {
                detail.insert("sourceCount".into(), serde_json::json!(sources.len()));
                detail.insert("remotePath".into(), serde_json::json!(remote_path));
                detail.insert("recursive".into(), serde_json::json!(recursive));
                detail.insert("preserveTimes".into(), serde_json::json!(preserve_times));
                spec::cp_spec(
                    program,
                    derp.as_deref(),
                    key_name.as_deref(),
                    sources,
                    address,
                    remote_path,
                    *recursive,
                    *preserve_times,
                    false,
                )
            }
            TaskRequest::Ssh {
                address,
                user,
                port,
                command,
                ..
            } => {
                detail.insert("remoteCommand".into(), serde_json::json!(command));
                spec::ssh_spec(
                    program,
                    derp.as_deref(),
                    address,
                    user.as_deref(),
                    *port,
                    command.as_deref(),
                )
            }
            // Local forwarding is delegated to the CLI's own `forward`
            // subcommand (native since v0.7.0): one process owns the listener,
            // resolves `localPort = 0` to a real port, and reconnects on its
            // own, so the GUI never has to proxy bytes itself.
            TaskRequest::Forward {
                address,
                remote_port,
                local_port,
                bind_host,
                key_name,
                ..
            } => {
                detail.insert("remotePort".into(), serde_json::json!(remote_port));
                detail.insert("requestedLocalPort".into(), serde_json::json!(local_port));
                detail.insert("bindHost".into(), serde_json::json!(bind_host));
                detail.insert("keyName".into(), serde_json::json!(key_name));
                detail.insert(
                    "address".into(),
                    serde_json::json!(redact::mask_token(address)),
                );
                ensure_bind_allowed(bind_host, ctx)?;
                spec::forward_spec(
                    program,
                    derp.as_deref(),
                    key_name.as_deref(),
                    address,
                    bind_host,
                    *local_port,
                    *remote_port,
                )
            }
            TaskRequest::Service {
                address,
                remote_port,
                local_port,
                bind_host,
                scheme,
                key_name,
                ..
            } => {
                let scheme = scheme
                    .clone()
                    .filter(|value| value == "https")
                    .unwrap_or_else(|| "http".to_string());
                detail.insert("remotePort".into(), serde_json::json!(remote_port));
                detail.insert("requestedLocalPort".into(), serde_json::json!(local_port));
                detail.insert("bindHost".into(), serde_json::json!(bind_host));
                detail.insert("scheme".into(), serde_json::json!(scheme));
                detail.insert("keyName".into(), serde_json::json!(key_name));
                detail.insert(
                    "address".into(),
                    serde_json::json!(redact::mask_token(address)),
                );
                ensure_bind_allowed(bind_host, ctx)?;
                spec::forward_spec(
                    program,
                    derp.as_deref(),
                    key_name.as_deref(),
                    address,
                    bind_host,
                    *local_port,
                    *remote_port,
                )
            }
            _ => return Err(AppError::new(code::UNSUPPORTED, "不支持的任务类型")),
        };

        // Server modes report their token through a file, which is more robust
        // than scraping human-readable stderr (both are handled).
        let needs_address_file = matches!(kind, TaskKind::Serve | TaskKind::Recv | TaskKind::Share);
        let mut temp_dir = None;
        let mut address_file = None;
        if needs_address_file {
            let dir = std::env::temp_dir().join(format!("tailcat-box-{id}"));
            std::fs::create_dir_all(&dir)?;
            let path = dir.join("address.txt");
            spec = spec.env_var("TAILCAT_ADDR_FILE", path.display().to_string());
            temp_dir = Some(dir);
            address_file = Some(path);
        }

        let info = TaskInfo {
            id: id.clone(),
            kind,
            status: TaskStatus::Starting,
            label,
            pid: None,
            created_at: now(),
            started_at: None,
            ended_at: None,
            args_summary: redact::redact_args(&spec.display()),
            address: None,
            listen_addr: None,
            detail,
            exit_code: None,
            exit_signal: None,
            error: None,
        };

        let mut entry = Self::base_entry(info, ctx.settings.max_log_lines);
        entry.temp_dir = temp_dir;
        self.register(entry);

        let mut command = Command::new(&spec.program);
        command.args(&spec.args);
        for (key, value) in &spec.env {
            command.env(key, value);
        }
        command.stdin(std::process::Stdio::null());
        command.stdout(std::process::Stdio::piped());
        command.stderr(std::process::Stdio::piped());
        command.kill_on_drop(true);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.as_std_mut().process_group(0);
        }

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                self.fail_task(&id, spawn_error(&spec, &error));
                return Err(spawn_error(&spec, &error));
            }
        };
        let pid = child.id();

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        if let Ok(mut tasks) = self.tasks.lock() {
            if let Some(entry) = tasks.get_mut(&id) {
                entry.child = Some(child);
                entry.info.pid = pid;
                entry.info.status = TaskStatus::Running;
                entry.info.started_at = Some(now());
            }
        }
        self.emit(
            EVENT_TASK_UPDATED,
            TaskEvent {
                task: self.get(&id).expect("task registered"),
            },
        );

        // `tailcat forward` announces each bound listener on stderr; that line
        // is the only way to learn the port the OS picked for `localPort = 0`.
        let line_hook: Option<LineHook> = if matches!(kind, TaskKind::Forward | TaskKind::Service) {
            let registry = Arc::clone(self);
            let watched_id = id.clone();
            Some(Arc::new(move |line: &str| {
                if let Some(listener) = crate::tailcat::parse::parse_forward_line(line) {
                    registry.set_listen_addr(&watched_id, listener.listen_addr());
                }
            }))
        } else {
            None
        };

        if let Some(stdout) = stdout {
            self.spawn_reader(&id, stdout, LogStream::Stdout, line_hook.clone());
        }
        if let Some(stderr) = stderr {
            self.spawn_reader(&id, stderr, LogStream::Stderr, line_hook);
        }
        if let Some(path) = address_file {
            self.spawn_address_watcher(&id, path);
        }
        self.spawn_waiter(&id);

        Ok(self.get(&id).expect("task registered"))
    }

    fn spawn_reader<R>(
        self: &Arc<Self>,
        id: &str,
        reader: R,
        stream: LogStream,
        hook: Option<LineHook>,
    ) where
        R: AsyncRead + Unpin + Send + 'static,
    {
        let registry = Arc::clone(self);
        let id = id.to_string();
        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        if line.trim().is_empty() {
                            continue;
                        }
                        if let Some(hook) = hook.as_ref() {
                            hook(&line);
                        }
                        if stream == LogStream::Stdout {
                            if let Some(address) =
                                crate::tailcat::parse::address_from_json_line(&line)
                            {
                                registry.set_address(&id, address);
                            }
                        } else {
                            let found = crate::tailcat::parse::address_from_line(&line)
                                .or_else(|| crate::tailcat::parse::address_from_loose_line(&line));
                            if let Some(address) = found {
                                registry.set_address(&id, address);
                            }
                        }
                        let level = classify_level(stream, &line);
                        registry.push_log(&id, stream, level, line);
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        });
    }

    /// `tailcat serve --json` and `TAILCAT_ADDR_FILE` both carry the token; the
    /// file is polled because it is the least ambiguous signal.
    fn spawn_address_watcher(self: &Arc<Self>, id: &str, path: PathBuf) {
        let registry = Arc::clone(self);
        let id = id.to_string();
        tokio::spawn(async move {
            for _ in 0..300 {
                if let Ok(text) = tokio::fs::read_to_string(&path).await {
                    let candidate = text.trim();
                    if candidate.starts_with("tc") {
                        registry.set_address(&id, candidate.to_string());
                        return;
                    }
                }
                if registry.get(&id).is_none_or(|task| {
                    matches!(task.status, TaskStatus::Stopped | TaskStatus::Failed)
                }) {
                    return;
                }
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            }
        });
    }

    fn spawn_waiter(self: &Arc<Self>, id: &str) {
        let registry = Arc::clone(self);
        let id = id.to_string();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                let outcome = {
                    let Ok(mut tasks) = registry.tasks.lock() else {
                        return;
                    };
                    let Some(entry) = tasks.get_mut(&id) else {
                        return;
                    };
                    match entry.child.as_mut() {
                        Some(child) => match child.try_wait() {
                            Ok(Some(status)) => Some(Ok(status)),
                            Ok(None) => None,
                            Err(error) => Some(Err(error.to_string())),
                        },
                        None => return,
                    }
                };

                match outcome {
                    None => continue,
                    Some(Ok(status)) => {
                        registry.finalize_exit(&id, status.code(), signal_of(&status));
                        return;
                    }
                    Some(Err(detail)) => {
                        registry.finalize_error(
                            &id,
                            AppError::new(code::PROCESS_FAILED, "等待进程结束失败")
                                .with_detail(detail),
                        );
                        return;
                    }
                }
            }
        });
    }

    fn take_stderr_tail(&self, id: &str) -> Option<String> {
        let tasks = self.tasks.lock().ok()?;
        let entry = tasks.get(id)?;
        let tail: Vec<String> = entry
            .logs
            .iter()
            .filter(|line| line.stream == LogStream::Stderr)
            .rev()
            .take(12)
            .map(|line| line.text.clone())
            .collect();
        if tail.is_empty() {
            return None;
        }
        Some(tail.into_iter().rev().collect::<Vec<_>>().join("\n"))
    }

    fn finalize_exit(&self, id: &str, exit_code: Option<i32>, exit_signal: Option<String>) {
        let stop_requested = self
            .tasks
            .lock()
            .ok()
            .and_then(|tasks| tasks.get(id).map(|entry| entry.stop_requested))
            .unwrap_or(false);

        let failed = !stop_requested && exit_code.unwrap_or(0) != 0;
        let error = if failed {
            let detail = self.take_stderr_tail(id).unwrap_or_default();
            Some(crate::error::classify_stderr(&detail))
        } else {
            None
        };

        self.cleanup_temp(id);
        self.update(id, |info| {
            info.status = if failed {
                TaskStatus::Failed
            } else {
                TaskStatus::Stopped
            };
            info.exit_code = exit_code;
            info.exit_signal = exit_signal;
            info.ended_at = Some(now());
            info.pid = None;
            info.error = error;
        });

        if failed {
            if let Some(error) = self.get(id).and_then(|task| task.error) {
                self.push_log(id, LogStream::App, LogLevel::Error, error.message.clone());
            }
        } else {
            self.push_log(
                id,
                LogStream::App,
                LogLevel::Info,
                "任务已结束。".to_string(),
            );
        }
    }

    fn finalize_error(&self, id: &str, error: AppError) {
        self.cleanup_temp(id);
        self.update(id, |info| {
            info.status = TaskStatus::Failed;
            info.ended_at = Some(now());
            info.pid = None;
            info.error = Some(error);
        });
    }

    fn fail_task(&self, id: &str, error: AppError) {
        self.cleanup_temp(id);
        self.update(id, |info| {
            info.status = TaskStatus::Failed;
            info.ended_at = Some(now());
            info.error = Some(error.clone());
        });
        self.push_log(id, LogStream::App, LogLevel::Error, error.message);
    }

    fn cleanup_temp(&self, id: &str) {
        let dir = self
            .tasks
            .lock()
            .ok()
            .and_then(|mut tasks| tasks.get_mut(id).and_then(|entry| entry.temp_dir.take()));
        if let Some(dir) = dir {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    pub fn stop(&self, id: &str) -> AppResult<TaskInfo> {
        let (child_pid, already_done) = {
            let mut tasks = self
                .tasks
                .lock()
                .map_err(|_| AppError::new(code::INTERNAL, "任务表不可用"))?;
            let entry = tasks
                .get_mut(id)
                .ok_or_else(|| AppError::task_not_found(id))?;
            if matches!(entry.info.status, TaskStatus::Stopped | TaskStatus::Failed) {
                (None, true)
            } else {
                entry.stop_requested = true;
                entry.info.status = TaskStatus::Stopping;
                (entry.info.pid, false)
            }
        };

        if already_done {
            return Ok(self.get(id).expect("task exists"));
        }

        self.emit(
            EVENT_TASK_UPDATED,
            TaskEvent {
                task: self.get(id).expect("task exists"),
            },
        );

        // 仅在 unix 上向整个进程组发送 SIGTERM；Windows 走下面的 `start_kill()`，
        // 因此这里不绑定 `pid`，避免 Windows 目标出现 unused variable 警告。
        #[cfg(unix)]
        if let Some(pid) = child_pid {
            unsafe {
                libc::killpg(pid as libc::pid_t, libc::SIGTERM);
            }
        }

        if child_pid.is_some() {
            if let Ok(mut tasks) = self.tasks.lock() {
                if let Some(entry) = tasks.get_mut(id) {
                    if let Some(child) = entry.child.as_mut() {
                        let _ = child.start_kill();
                    }
                }
            }
            // The waiter finalises the state once the process is reaped.
        }

        Ok(self.get(id).expect("task exists"))
    }

    pub fn remove(&self, id: &str) -> AppResult<()> {
        {
            let mut tasks = self
                .tasks
                .lock()
                .map_err(|_| AppError::new(code::INTERNAL, "任务表不可用"))?;
            let entry = tasks.get(id).ok_or_else(|| AppError::task_not_found(id))?;
            if matches!(
                entry.info.status,
                TaskStatus::Starting | TaskStatus::Running | TaskStatus::Stopping
            ) {
                return Err(AppError::new(
                    code::TASK_ALREADY_RUNNING,
                    "任务仍在运行，请先停止再移除",
                ));
            }
            tasks.remove(id);
        }
        self.cleanup_temp(id);
        self.emit(EVENT_TASK_REMOVED, RemovedEvent { id: id.to_string() });
        Ok(())
    }

    pub fn stop_all(&self) -> Vec<TaskInfo> {
        let ids: Vec<String> = self
            .list()
            .into_iter()
            .filter(|task| {
                matches!(
                    task.status,
                    TaskStatus::Starting | TaskStatus::Running | TaskStatus::Stopping
                )
            })
            .map(|task| task.id)
            .collect();
        for id in &ids {
            let _ = self.stop(id);
        }
        self.list()
    }

    /// Best-effort synchronous shutdown used on app exit: sends SIGTERM to every
    /// live process group so nothing is left behind.
    pub fn shutdown(&self) {
        let Ok(mut tasks) = self.tasks.lock() else {
            return;
        };
        for entry in tasks.values_mut() {
            entry.stop_requested = true;
            if let Some(child) = entry.child.as_mut() {
                #[cfg(unix)]
                if let Some(pid) = child.id() {
                    unsafe {
                        libc::killpg(pid as libc::pid_t, libc::SIGTERM);
                    }
                }
                let _ = child.start_kill();
            }
        }
    }
}

fn spawn_error(spec: &CommandSpec, error: &std::io::Error) -> AppError {
    let program = spec.program.display().to_string();
    match error.kind() {
        std::io::ErrorKind::NotFound => {
            AppError::engine_missing().with_detail(format!("failed to spawn {program}: {error}"))
        }
        std::io::ErrorKind::PermissionDenied => {
            AppError::new(code::PERMISSION_DENIED, "tailcat 可执行文件没有执行权限")
                .with_detail(format!("{program}: {error}"))
        }
        _ => AppError::new(code::ENGINE_UNUSABLE, "无法启动 tailcat 子进程")
            .with_detail(format!("{program}: {error}")),
    }
}

fn is_loopback(host: &str) -> bool {
    let host = host.trim().to_ascii_lowercase();
    host == "localhost"
        || host == "127.0.0.1"
        || host == "::1"
        || host == "[::1]"
        || host.starts_with("127.")
}

/// Safety net mirroring the UI gate: a non-loopback listener requires the user
/// to have explicitly enabled it in settings, so a bug in the UI cannot expose
/// a local service to the LAN on its own.
fn ensure_bind_allowed(bind_host: &str, ctx: &TaskContext) -> AppResult<()> {
    if is_loopback(bind_host) || ctx.settings.allow_non_loopback_bind {
        return Ok(());
    }
    Err(AppError::new(
        code::PATH_NOT_ALLOWED,
        "监听非回环地址需要先在设置中显式开启",
    )
    .with_hint("设置 → 启动与退出 → 允许监听非回环地址")
    .with_detail(format!("requested bind host: {bind_host}")))
}

#[cfg(unix)]
fn signal_of(status: &std::process::ExitStatus) -> Option<String> {
    use std::os::unix::process::ExitStatusExt;
    status.signal().map(|signal| signal.to_string())
}

#[cfg(not(unix))]
fn signal_of(_status: &std::process::ExitStatus) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_detection() {
        assert!(is_loopback("127.0.0.1"));
        assert!(is_loopback("localhost"));
        assert!(is_loopback("127.1.2.3"));
        assert!(is_loopback("::1"));
        assert!(!is_loopback("0.0.0.0"));
        assert!(!is_loopback("192.168.1.10"));
    }

    #[test]
    fn progress_lines_are_not_warnings() {
        assert_eq!(
            classify_level(LogStream::Stderr, "report.pdf  47%  1.2MB  3.4MB/s  00:03"),
            LogLevel::Info
        );
        assert_eq!(
            classify_level(LogStream::Stderr, "connection refused"),
            LogLevel::Error
        );
        assert_eq!(
            classify_level(LogStream::Stderr, "some other diagnostic"),
            LogLevel::Warn
        );
    }

    #[test]
    fn labels_never_leak_the_token() {
        let request = TaskRequest::Forward {
            label: None,
            address: "tco2FwWCBTIkS2JAbd8Zu-nRX6Kh6ejMZVFqnLc4xPc7uqvCl_EWFrWCCXh-2CI9MEFZTYNBU_vPUP_yvEpPw4nCN7gOewHOHgFWFpGQEw".to_string(),
            remote_port: 8080,
            local_port: 0,
            bind_host: "127.0.0.1".to_string(),
            key_name: None,
        };
        let label = label_for(&request);
        assert!(!label.contains("tco2FwWCBTIkS2JAbd8Zu"));
        assert!(label.contains("8080"));
    }
}
