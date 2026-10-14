#![cfg(test)]
//! 真实端到端集成测试：证明本应用用于本地端口转发的参数构造（`tailcat::spec`）
//! 与输出解析（`tailcat::parse`）确实驱动官方 `tailcat` CLI 打通了
//! 「本地监听端口 → 远端 localhost 目标服务」的完整链路。
//!
//! 同一套辅助设施还覆盖文件传输：
//!   * 接收方向：`tailcat recv --json <dir>`（只写投递箱）+ `tailcat cp <file> <addrblob>:`；
//!   * 共享/读取方向：`tailcat serve --files=<dir>:ro files` + `tailcat ls -l`
//!     与 `tailcat cp <addrblob>:<file> <local>` 取回。
//!
//! 为什么必须显式开启（`TAILCAT_E2E=1`）：
//!   * 该测试会启动真实的 `tailcat serve` / `tailcat forward` 子进程，
//!     并依赖 DERP 中继联网，耗时且需要外网；
//!   * 因此默认（未设置 `TAILCAT_E2E=1`）直接跳过，保证普通 `cargo test`
//!     在离线环境与 CI 中不会发起任何网络请求。
//!
//! 可用环境变量 `TAILCAT_E2E_BIN` 覆盖 tailcat 可执行文件路径，
//! 默认使用 PATH 中的 `tailcat`。

use std::io;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::{Child, Command};
use tokio::time::{sleep, timeout};

use crate::model::FilesMode;
use crate::tailcat::{parse, spec};

/// 本地 HTTP 服务返回的固定响应体；端到端断言会检查它被真实取回。
const E2E_BODY: &str = "tailcat-box e2e ok";

/// 文件传输测试写入投递箱的内容；断言会逐字节比对它被真实接收。
const E2E_FILE_BODY: &str = "tailcat-box e2e file payload 7f3a\n";

/// 只读共享测试里的文件内容；断言会比对 `ls -l` 的大小与取回后的字节。
const E2E_SHARE_BODY: &str = "tailcat-box e2e shared payload 9c1d\n";

/// 等待 `tailcat serve` 写出地址文件的超时上限。
const SERVE_READY_TIMEOUT: Duration = Duration::from_secs(60);
/// 等待 `tailcat forward` 报告本地监听端口的超时上限。
const FORWARD_READY_TIMEOUT: Duration = Duration::from_secs(60);
/// 连接本地转发端口、读取响应的超时上限。
const CONNECT_TIMEOUT: Duration = Duration::from_secs(45);
/// 等待一次性子命令（`cp` / `ls`）结束的超时上限；首次连接要走 DERP，给足余量。
const CLI_TIMEOUT: Duration = Duration::from_secs(120);

/// 解析 tailcat 可执行文件：带路径分隔符的按原样判断，
/// 纯文件名（如 `tailcat`）则在 PATH 中查找。
fn resolve_binary(name: &str) -> Option<PathBuf> {
    let candidate = PathBuf::from(name);
    if candidate.components().count() > 1 {
        return candidate.is_file().then_some(candidate);
    }
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .map(|dir| dir.join(name))
        .find(|joined| joined.is_file())
}

/// 真实网络测试的统一开关：只有显式设置 `TAILCAT_E2E=1` 才继续，
/// 否则打印跳过原因并返回 `false`，保证默认 `cargo test` 完全不联网。
fn e2e_enabled() -> bool {
    if std::env::var("TAILCAT_E2E").ok().as_deref() == Some("1") {
        return true;
    }
    eprintln!("跳过：未设置 TAILCAT_E2E=1");
    false
}

/// 定位并打印要使用的 tailcat 可执行文件（`TAILCAT_E2E_BIN` 优先，默认走 PATH）。
fn tailcat_bin() -> PathBuf {
    let bin = std::env::var("TAILCAT_E2E_BIN").unwrap_or_else(|_| "tailcat".to_string());
    let Some(program) = resolve_binary(&bin) else {
        panic!(
            "找不到 tailcat 可执行文件 `{bin}`。\n\
             请先安装官方 tailcat CLI（v0.7.0 或更高），\
             或用环境变量 TAILCAT_E2E_BIN 指定其绝对路径，例如：\n\
             \x20   TAILCAT_E2E_BIN=/opt/homebrew/bin/tailcat ./scripts/e2e-verify.sh"
        );
    };
    eprintln!("==> 使用 tailcat：{}", program.display());
    program
}

/// 从 `TAILCAT_ADDR_FILE` 的内容里提取连接令牌。
///
/// v0.7.0 写入的是裸令牌（无换行、无 JSON）；为兼容可能的 JSON / 日志行
/// 形态，这里复用解析模块依次尝试，最后再退回到「以 tc 开头的裸令牌」。
fn token_from_addr_file(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(token) = parse::address_from_json_line(trimmed) {
        return Some(token);
    }
    if let Some(token) = parse::address_from_line(trimmed) {
        return Some(token);
    }
    if let Some(token) = parse::address_from_loose_line(trimmed) {
        return Some(token);
    }
    if trimmed.starts_with("tc") && !trimmed.contains(char::is_whitespace) {
        return Some(trimmed.to_string());
    }
    None
}

/// 取文本末尾若干字符，用于打印子进程日志尾部。
fn tail(text: &str, max_chars: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= max_chars {
        return text.to_string();
    }
    chars[chars.len() - max_chars..].iter().collect()
}

/// 后台逐行读取子进程 stderr 到共享缓冲区，便于超时时打印尾部日志。
fn spawn_line_collector(
    stderr: tokio::process::ChildStderr,
) -> (Arc<Mutex<String>>, tokio::task::JoinHandle<()>) {
    let buffer = Arc::new(Mutex::new(String::new()));
    let sink = Arc::clone(&buffer);
    let handle = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(mut guard) = sink.lock() {
                guard.push_str(&line);
                guard.push('\n');
            }
        }
    });
    (buffer, handle)
}

/// 子进程守卫：正常路径调用 `shutdown()` 显式回收；
/// 断言失败或提前返回时由 `Drop` 兜底，确保不泄漏 tailcat 进程。
struct ChildGuard {
    child: Option<Child>,
}

impl ChildGuard {
    fn new(child: Child) -> Self {
        Self { child: Some(child) }
    }

    /// 显式回收：先请求终止，再等待进程退出。
    async fn shutdown(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
    }

    /// 子进程若已退出则返回其状态，用于尽早发现启动失败。
    fn try_wait(&mut self) -> io::Result<Option<std::process::ExitStatus>> {
        match self.child.as_mut() {
            Some(child) => child.try_wait(),
            None => Ok(None),
        }
    }
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
            // Drop 里不能 await，用有限轮询兜底回收，避免留下孤儿进程。
            let deadline = Instant::now() + Duration::from_secs(5);
            while Instant::now() < deadline {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) => std::thread::sleep(Duration::from_millis(20)),
                    Err(_) => break,
                }
            }
        }
    }
}

/// 临时地址文件守卫：无论如何退出都尝试删除。
struct TempFileGuard(PathBuf);

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// 临时工作目录守卫：测试正常结束或 panic 时都递归删除，避免留下投递箱等残留。
struct TempDirGuard(PathBuf);

impl TempDirGuard {
    fn new(tag: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "tailcat-box-e2e-{tag}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).expect("创建端到端临时工作目录失败");
        Self(dir)
    }

    fn join(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// 复制共享日志缓冲区的当前内容，用于失败时打印子进程输出尾部。
fn log_text(log: &Arc<Mutex<String>>) -> String {
    log.lock().map(|guard| guard.clone()).unwrap_or_default()
}

/// 轮询等待服务端通过 `TAILCAT_ADDR_FILE` 写出可解析的地址令牌。
///
/// 需要连续两次读到相同令牌，避免读到写入中的半个令牌；服务端提前退出或超时
/// 都会 panic 并附上 stderr 尾部，便于直接定位 CLI 的报错。
async fn wait_for_blob(
    addr_file: &Path,
    guard: &mut ChildGuard,
    log: &Arc<Mutex<String>>,
    what: &str,
    ready_timeout: Duration,
) -> String {
    let deadline = Instant::now() + ready_timeout;
    let mut last_seen: Option<String> = None;
    loop {
        let token = std::fs::read_to_string(addr_file)
            .ok()
            .and_then(|text| token_from_addr_file(&text));
        if let Some(token) = token {
            if last_seen.as_deref() == Some(token.as_str()) {
                return token;
            }
            last_seen = Some(token);
        }
        if let Ok(Some(status)) = guard.try_wait() {
            panic!(
                "`{what}` 在写出地址前就退出了（{status}）。\n\
                 地址文件：{}\nstderr 尾部：\n{}",
                addr_file.display(),
                tail(&log_text(log), 4000)
            );
        }
        if Instant::now() >= deadline {
            panic!(
                "等待 `{what}` 写出地址文件超时（{} 秒）。\n\
                 地址文件：{}\nstderr 尾部：\n{}",
                ready_timeout.as_secs(),
                addr_file.display(),
                tail(&log_text(log), 4000)
            );
        }
        sleep(Duration::from_millis(200)).await;
    }
}

/// 已就绪的 tailcat 服务端（`serve` / `recv` / 只读共享）：持有子进程守卫、
/// 持续收集的 stderr 日志，以及解析出来的地址令牌。
struct TailcatServer {
    guard: ChildGuard,
    log: Arc<Mutex<String>>,
    log_task: tokio::task::JoinHandle<()>,
    blob: String,
}

impl TailcatServer {
    /// 按给定 spec 启动服务端，等待它写出地址令牌后才返回。
    async fn start(
        spec: &spec::CommandSpec,
        addr_file: &Path,
        what: &str,
        ready_timeout: Duration,
    ) -> Self {
        let _ = std::fs::remove_file(addr_file);
        let mut command = Command::new(&spec.program);
        command.args(&spec.args);
        for (key, value) in &spec.env {
            command.env(key, value);
        }
        command.env("TAILCAT_ADDR_FILE", addr_file.display().to_string());
        command.stdin(Stdio::null());
        command.stdout(Stdio::null());
        command.stderr(Stdio::piped());
        command.kill_on_drop(true);
        let mut child = command
            .spawn()
            .unwrap_or_else(|error| panic!("启动 `{what}` 失败：{error}"));
        let stderr = child
            .stderr
            .take()
            .unwrap_or_else(|| panic!("`{what}` 未提供 stderr 管道"));
        let mut guard = ChildGuard::new(child);
        let (log, log_task) = spawn_line_collector(stderr);
        let blob = wait_for_blob(addr_file, &mut guard, &log, what, ready_timeout).await;
        eprintln!("==> {what} 已就绪（地址令牌长度 {}）", blob.len());
        Self {
            guard,
            log,
            log_task,
            blob,
        }
    }

    fn logs(&self) -> String {
        log_text(&self.log)
    }

    /// 显式回收服务端子进程并停掉日志收集任务。
    async fn shutdown(mut self) {
        self.guard.shutdown().await;
        self.log_task.abort();
    }
}

/// 一次性子命令（`cp` / `ls`）的退出状态与输出。
struct CliOutput {
    status: Option<i32>,
    stdout: String,
    stderr: String,
}

impl CliOutput {
    fn ok(&self) -> bool {
        self.status == Some(0)
    }

    /// 断言失败时打印的诊断信息（退出码 + stdout + stderr）。
    fn diagnostics(&self) -> String {
        format!(
            "exit code: {:?}\nstdout:\n{}\nstderr:\n{}",
            self.status,
            self.stdout.trim(),
            self.stderr.trim()
        )
    }
}

/// 运行会自行退出的 tailcat 子命令，收集 stdout / stderr 与退出码。
async fn run_cli(spec: &spec::CommandSpec, what: &str, limit: Duration) -> CliOutput {
    let mut command = Command::new(&spec.program);
    command.args(&spec.args);
    for (key, value) in &spec.env {
        command.env(key, value);
    }
    command.stdin(Stdio::null());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.kill_on_drop(true);
    let child = command
        .spawn()
        .unwrap_or_else(|error| panic!("启动 `{what}` 失败：{error}"));
    let output = match timeout(limit, child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(error)) => panic!("等待 `{what}` 结束失败：{error}"),
        Err(_) => panic!("`{what}` 超过 {} 秒仍未结束", limit.as_secs()),
    };
    CliOutput {
        status: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

/// 目录里恰好一个普通文件时返回其路径；否则 panic 并列出目录内容。
///
/// 只写投递箱（`recv`）会用一个带时间戳与随机后缀的新名字保存上传的文件，
/// 因此断言只能按内容比对，不能假定文件名。
fn single_file_in(dir: &Path) -> PathBuf {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .unwrap_or_else(|error| panic!("读取目录 {} 失败：{error}", dir.display()))
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect();
    files.sort();
    assert_eq!(
        files.len(),
        1,
        "目录 {} 里应恰好出现 1 个文件；实际：{files:?}",
        dir.display()
    );
    files.remove(0)
}

/// 极简本地 HTTP 服务：收到任意请求后返回固定响应体。
/// 只用 tokio 手写，不引入任何新依赖（Cargo.toml 不在可改范围）。
async fn serve_local_http(listener: TcpListener) {
    loop {
        let Ok((mut socket, _peer)) = listener.accept().await else {
            break;
        };
        tokio::spawn(async move {
            // 只读一次请求即可，请求内容无关紧要。
            let mut request = [0u8; 1024];
            let _ = socket.read(&mut request).await;
            let response = format!(
                "HTTP/1.0 200 OK\r\nContent-Length: {}\r\n\r\n{}",
                E2E_BODY.len(),
                E2E_BODY
            );
            let _ = socket.write_all(response.as_bytes()).await;
            let _ = socket.flush().await;
            let _ = socket.shutdown().await;
        });
    }
}

/// 端到端验证：官方 `tailcat` 的本地端口转发能访问到真实的目标服务。
///
/// 流程：本地 HTTP 服务 → `tailcat serve --json` → `tailcat forward 0:<port>`
/// → 连接 forward 打印出的真实本地端口 → 断言取回固定响应体。
///
/// 之所以必须显式设置 `TAILCAT_E2E=1`：本测试会启动真实的 tailcat 子进程
/// 并经 DERP 中继联网，不能在默认 `cargo test` 中运行。
#[tokio::test]
async fn e2e_本地端口转发可访问真实的目标服务() {
    // 1. 默认跳过：未显式设置 TAILCAT_E2E=1 时绝不发起网络请求。
    if !e2e_enabled() {
        return;
    }

    // 2. 解析 tailcat 可执行文件（可用 TAILCAT_E2E_BIN 覆盖，默认走 PATH）。
    let program = tailcat_bin();

    // 3. 起一个本地 HTTP 服务，作为「真实的目标服务」。
    let http_listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("绑定本地 HTTP 测试服务失败");
    let http_port = http_listener
        .local_addr()
        .expect("读取本地 HTTP 测试服务端口失败")
        .port();
    let http_task = tokio::spawn(serve_local_http(http_listener));
    eprintln!("==> 本地目标服务监听 127.0.0.1:{http_port}");

    // 4. 临时地址文件（比抓 stdout 更稳）。
    let addr_file = std::env::temp_dir().join(format!(
        "tailcat-box-e2e-{}-{}.txt",
        std::process::id(),
        uuid::Uuid::new_v4().simple()
    ));
    let _addr_guard = TempFileGuard(addr_file.clone());
    let _ = std::fs::remove_file(&addr_file);

    // 5. 启动 `tailcat serve --json <http_port>`。
    let serve = spec::serve_spec(
        program.clone(),
        None,
        None,
        &[http_port.to_string()],
        None,
        None,
        None,
        false,
        true,
        false,
    );
    let mut serve_cmd = Command::new(&serve.program);
    serve_cmd.args(&serve.args);
    for (key, value) in &serve.env {
        serve_cmd.env(key, value);
    }
    serve_cmd.env("TAILCAT_ADDR_FILE", addr_file.display().to_string());
    serve_cmd.stdin(Stdio::null());
    serve_cmd.stdout(Stdio::null());
    serve_cmd.stderr(Stdio::piped());
    serve_cmd.kill_on_drop(true);
    let mut serve_child = serve_cmd
        .spawn()
        .unwrap_or_else(|error| panic!("启动 `tailcat serve` 失败：{error}"));
    let serve_stderr = serve_child
        .stderr
        .take()
        .expect("tailcat serve 未提供 stderr 管道");
    let mut serve_guard = ChildGuard::new(serve_child);
    let (serve_log, serve_log_task) = spawn_line_collector(serve_stderr);

    // 6. 轮询等待地址文件出现（上限 60 秒）。
    let deadline = Instant::now() + SERVE_READY_TIMEOUT;
    let mut last_seen: Option<String> = None;
    let blob = loop {
        let token = std::fs::read_to_string(&addr_file)
            .ok()
            .and_then(|text| token_from_addr_file(&text));
        if let Some(token) = token {
            // 需要连续两次读到相同内容，避免读到写入中的半个令牌。
            if last_seen.as_deref() == Some(token.as_str()) {
                break token;
            }
            last_seen = Some(token);
        }
        if let Ok(Some(status)) = serve_guard.try_wait() {
            let logs = serve_log
                .lock()
                .map(|guard| guard.clone())
                .unwrap_or_default();
            panic!(
                "`tailcat serve` 在写出地址前就退出了（{status}）。\n\
                 地址文件：{}\nserve stderr 尾部：\n{}",
                addr_file.display(),
                tail(&logs, 4000)
            );
        }
        if Instant::now() >= deadline {
            let logs = serve_log
                .lock()
                .map(|guard| guard.clone())
                .unwrap_or_default();
            panic!(
                "等待 tailcat serve 写出地址文件超时（{} 秒）。\n\
                 地址文件：{}\nserve stderr 尾部：\n{}",
                SERVE_READY_TIMEOUT.as_secs(),
                addr_file.display(),
                tail(&logs, 4000)
            );
        }
        sleep(Duration::from_millis(200)).await;
    };
    eprintln!("==> 获得服务端地址令牌（长度 {}）", blob.len());

    // 7. 启动 `tailcat forward --bind=127.0.0.1 <blob> 0:<http_port>`。
    let forward = spec::forward_spec(
        program.clone(),
        None,
        None,
        &blob,
        "127.0.0.1",
        0,
        http_port,
    );
    assert_eq!(
        forward.args,
        vec![
            "forward".to_string(),
            "--bind=127.0.0.1".to_string(),
            blob.clone(),
            format!("0:{http_port}"),
        ],
        "forward argv 必须与官方 CLI 期望的一致"
    );
    let mut forward_cmd = Command::new(&forward.program);
    forward_cmd.args(&forward.args);
    for (key, value) in &forward.env {
        forward_cmd.env(key, value);
    }
    forward_cmd.stdin(Stdio::null());
    forward_cmd.stdout(Stdio::null());
    forward_cmd.stderr(Stdio::piped());
    forward_cmd.kill_on_drop(true);
    let mut forward_child = forward_cmd
        .spawn()
        .unwrap_or_else(|error| panic!("启动 `tailcat forward` 失败：{error}"));
    let forward_stderr = forward_child
        .stderr
        .take()
        .expect("tailcat forward 未提供 stderr 管道");
    let mut forward_guard = ChildGuard::new(forward_child);

    // 8. 读取 stderr，用解析模块拿到真实的本地监听地址。
    let forward_log = Arc::new(Mutex::new(String::new()));
    let (listener_tx, listener_rx) = tokio::sync::oneshot::channel::<parse::ForwardListener>();
    let forward_log_task = {
        let sink = Arc::clone(&forward_log);
        tokio::spawn(async move {
            let mut sender = Some(listener_tx);
            let mut lines = BufReader::new(forward_stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut guard) = sink.lock() {
                    guard.push_str(&line);
                    guard.push('\n');
                }
                if let Some(listener) = parse::parse_forward_line(&line) {
                    if let Some(sender) = sender.take() {
                        let _ = sender.send(listener);
                    }
                }
            }
        })
    };

    let listener = match timeout(FORWARD_READY_TIMEOUT, listener_rx).await {
        Ok(Ok(listener)) => listener,
        Ok(Err(_)) => {
            let logs = forward_log
                .lock()
                .map(|guard| guard.clone())
                .unwrap_or_default();
            panic!(
                "`tailcat forward` 在报告监听端口前就退出了。\nforward stderr 尾部：\n{}",
                tail(&logs, 4000)
            );
        }
        Err(_) => {
            let logs = forward_log
                .lock()
                .map(|guard| guard.clone())
                .unwrap_or_default();
            panic!(
                "等待 tailcat forward 报告本地监听端口超时（{} 秒）。\nforward stderr 尾部：\n{}",
                FORWARD_READY_TIMEOUT.as_secs(),
                tail(&logs, 4000)
            );
        }
    };

    // 断言：`0` 必须被解析成真实的本地端口，且目标端口就是本地 HTTP 服务端口。
    assert_ne!(
        listener.local_port, 0,
        "`0` 必须被 tailcat 解析为真实的本地端口"
    );
    assert_eq!(
        listener.remote_port, http_port,
        "转发目标端口必须等于本地 HTTP 服务端口"
    );
    eprintln!(
        "==> 转发已建立：{} -> remote {}:{}",
        listener.listen_addr(),
        listener.remote_host,
        listener.remote_port
    );

    // 9. 经本地转发端口访问真实目标服务。
    let listen_addr = listener.listen_addr();
    let mut stream = timeout(CONNECT_TIMEOUT, TcpStream::connect(&listen_addr))
        .await
        .unwrap_or_else(|_| {
            panic!(
                "连接本地转发端口 {listen_addr} 超时（{} 秒）",
                CONNECT_TIMEOUT.as_secs()
            )
        })
        .unwrap_or_else(|error| panic!("连接本地转发端口 {listen_addr} 失败：{error}"));
    stream
        .write_all(b"GET / HTTP/1.0\r\n\r\n")
        .await
        .expect("向本地转发端口写入 HTTP 请求失败");
    let mut response = Vec::new();
    timeout(CONNECT_TIMEOUT, stream.read_to_end(&mut response))
        .await
        .unwrap_or_else(|_| panic!("经转发读取响应超时（{} 秒）", CONNECT_TIMEOUT.as_secs()))
        .expect("经转发读取响应失败");
    let response = String::from_utf8_lossy(&response);
    assert!(
        response.starts_with("HTTP/1.0 200"),
        "响应状态行应为 200；实际响应：\n{response}"
    );
    assert!(
        response.contains(E2E_BODY),
        "经端口转发取回的内容应包含固定响应体 `{E2E_BODY}`；实际响应：\n{response}"
    );
    eprintln!("==> 端到端成功：经 {listen_addr} 取回目标服务的固定响应体");

    // 10. 清理：显式回收两个子进程，并停掉本地 HTTP 服务。
    forward_guard.shutdown().await;
    serve_guard.shutdown().await;
    http_task.abort();
    serve_log_task.abort();
    forward_log_task.abort();
    let _ = std::fs::remove_file(&addr_file);
    eprintln!("==> 已回收 tailcat serve / forward 子进程");
}

/// 端到端验证（接收方向）：官方 `tailcat` 的只写投递箱能真实收到 `cp` 发来的文件。
///
/// 流程：`tailcat recv --json <dir>`（等价于 `serve --files=<dir>:wo files`）
/// → 用 `spec::recv_spec` 生成参数启动服务端 → 等它写出地址令牌 →
/// 用 `spec::cp_spec` 生成 `tailcat cp <localfile> <addrblob>:` 把文件发过去 →
/// 断言投递箱里出现一个内容逐字节一致的文件。
///
/// 断言按内容而非文件名：`wo` 模式会用「原名 + UTC 时间戳 + 随机后缀」保存上传，
/// 这正是它不泄露目录信息的设计。
#[tokio::test]
async fn e2e_接收投递箱可收到官方_cli_发送的文件() {
    if !e2e_enabled() {
        return;
    }
    let program = tailcat_bin();

    // 1. 临时工作目录：inbox 是投递箱，src 存放待发送的本地文件。
    let workdir = TempDirGuard::new("recv");
    let inbox = workdir.join("inbox");
    let source_dir = workdir.join("src");
    std::fs::create_dir_all(&inbox).expect("创建投递箱目录失败");
    std::fs::create_dir_all(&source_dir).expect("创建发送目录失败");
    let payload = source_dir.join("payload.txt");
    std::fs::write(&payload, E2E_FILE_BODY).expect("写入待发送文件失败");
    eprintln!(
        "==> 投递箱 {}；待发送文件 {}（{} 字节）",
        inbox.display(),
        payload.display(),
        E2E_FILE_BODY.len()
    );

    // 2. 接收端参数完全由 `spec::recv_spec` 生成：`recv --json <dir>`。
    let inbox_arg = inbox.display().to_string();
    let recv = spec::recv_spec(program.clone(), None, None, &inbox_arg, true, false);
    assert_eq!(
        recv.args,
        ["recv", "--json", inbox_arg.as_str()],
        "recv argv 必须与官方 CLI 期望的一致"
    );

    let addr_file = workdir.join("recv-addr.txt");
    let server = TailcatServer::start(&recv, &addr_file, "tailcat recv", SERVE_READY_TIMEOUT).await;

    // 3. 发送端参数完全由 `spec::cp_spec` 生成：`cp <localfile> <addrblob>:`。
    let source_arg = payload.display().to_string();
    let cp = spec::cp_spec(
        program.clone(),
        None,
        None,
        std::slice::from_ref(&source_arg),
        &server.blob,
        "",
        false,
        false,
        false,
    );
    assert_eq!(
        cp.args,
        vec![
            "cp".to_string(),
            source_arg.clone(),
            format!("{}:", server.blob),
        ],
        "cp argv 必须把地址写成 <addrblob>:（投递箱根目录）"
    );

    let sent = run_cli(&cp, "tailcat cp（发送到投递箱）", CLI_TIMEOUT).await;
    assert!(
        sent.ok(),
        "`tailcat cp` 发送文件应成功；实际：\n{}\nrecv stderr 尾部：\n{}",
        sent.diagnostics(),
        tail(&server.logs(), 2000)
    );

    // 4. 断言：投递箱里出现内容完全一致的文件。
    let delivered = single_file_in(&inbox);
    let received = std::fs::read_to_string(&delivered)
        .unwrap_or_else(|error| panic!("读取投递箱文件 {} 失败：{error}", delivered.display()));
    assert_eq!(
        received,
        E2E_FILE_BODY,
        "投递箱收到的内容必须与发送的本地文件逐字节一致；实际文件：{}",
        delivered.display()
    );
    eprintln!(
        "==> 接收方向成功：{} → 投递箱 {}，收到 {} 字节 {:?}",
        delivered.file_name().unwrap_or_default().to_string_lossy(),
        inbox.display(),
        received.len(),
        received
    );

    server.shutdown().await;
    eprintln!("==> 已回收 tailcat recv 子进程");
}

/// 端到端验证（共享/读取方向）：官方 `tailcat` 能列出只读共享目录并取回文件。
///
/// 流程：`tailcat serve --files=<dir>:ro files` → 用 `spec::share_spec` 启动 →
/// 用 `spec::ls_spec` 生成 `tailcat ls -l <addrblob>` 并用
/// `parse::parse_ls_long` 解析目录项 → 再用 `spec::cp_fetch_spec` 生成
/// `tailcat cp <addrblob>:<file> <local>` 取回文件并断言内容一致。
#[tokio::test]
async fn e2e_只读共享目录可被官方_cli_列出并取回文件() {
    if !e2e_enabled() {
        return;
    }
    let program = tailcat_bin();

    // 1. 临时工作目录：shared 是共享目录，dest 是取回文件的落点。
    let workdir = TempDirGuard::new("share");
    let shared = workdir.join("shared");
    let dest = workdir.join("dest");
    std::fs::create_dir_all(&shared).expect("创建共享目录失败");
    std::fs::create_dir_all(&dest).expect("创建取回目录失败");
    std::fs::write(shared.join("readme.txt"), E2E_SHARE_BODY).expect("写入共享文件失败");
    eprintln!(
        "==> 共享目录 {}（readme.txt，{} 字节）",
        shared.display(),
        E2E_SHARE_BODY.len()
    );

    // 2. 服务端参数完全由 `spec::share_spec` 生成：`serve --json --files=<dir>:ro files`。
    let shared_arg = shared.display().to_string();
    let share = spec::share_spec(
        program.clone(),
        None,
        None,
        &shared_arg,
        FilesMode::Ro,
        false,
        true,
        false,
    );
    assert_eq!(
        share.args,
        vec![
            "serve".to_string(),
            "--json".to_string(),
            format!("--files={shared_arg}:ro"),
            "files".to_string(),
        ],
        "只读共享 argv 必须与官方 CLI 期望的一致"
    );

    let addr_file = workdir.join("share-addr.txt");
    let server = TailcatServer::start(
        &share,
        &addr_file,
        "tailcat serve files（只读共享）",
        SERVE_READY_TIMEOUT,
    )
    .await;

    // 3. 列目录：参数由 `spec::ls_spec` 生成，输出交给 `parse::parse_ls_long` 解析。
    let ls = spec::ls_spec(program.clone(), None, None, &server.blob, "", true);
    assert_eq!(
        ls.args,
        vec!["ls".to_string(), "-l".to_string(), server.blob.clone()],
        "ls argv 必须与官方 CLI 期望的一致"
    );
    let listed = run_cli(&ls, "tailcat ls -l", CLI_TIMEOUT).await;
    assert!(
        listed.ok(),
        "`tailcat ls -l` 应成功；实际：\n{}\nserve stderr 尾部：\n{}",
        listed.diagnostics(),
        tail(&server.logs(), 2000)
    );
    let entries = parse::parse_ls_long(&listed.stdout);
    let readme = entries
        .iter()
        .find(|entry| entry.name == "readme.txt")
        .unwrap_or_else(|| {
            panic!(
                "`ls -l` 输出应包含 readme.txt；解析到的目录项：{entries:?}\n原始输出：\n{}",
                listed.stdout
            )
        });
    assert!(!readme.is_dir, "readme.txt 必须是普通文件");
    assert_eq!(
        readme.size,
        Some(E2E_SHARE_BODY.len() as u64),
        "`ls -l` 报出的大小必须等于共享文件真实大小"
    );
    eprintln!(
        "==> 列出目录成功：{} 项，readme.txt 大小 {:?}",
        entries.len(),
        readme.size
    );

    // 4. 取回文件：参数由 `spec::cp_fetch_spec` 生成，远端参数在本地目标之前。
    let local = dest.join("readme.txt");
    let local_arg = local.display().to_string();
    let fetch = spec::cp_fetch_spec(
        program.clone(),
        None,
        None,
        &server.blob,
        "readme.txt",
        std::slice::from_ref(&local_arg),
        false,
        false,
        false,
    );
    assert_eq!(
        fetch.args,
        vec![
            "cp".to_string(),
            format!("{}:readme.txt", server.blob),
            local_arg.clone(),
        ],
        "取回 argv 必须把 <addrblob>:<path> 放在本地目标之前"
    );
    let fetched = run_cli(&fetch, "tailcat cp（取回文件）", CLI_TIMEOUT).await;
    assert!(
        fetched.ok(),
        "`tailcat cp` 取回文件应成功；实际：\n{}\nserve stderr 尾部：\n{}",
        fetched.diagnostics(),
        tail(&server.logs(), 2000)
    );

    let pulled = std::fs::read_to_string(&local)
        .unwrap_or_else(|error| panic!("读取取回文件 {} 失败：{error}", local.display()));
    assert_eq!(
        pulled,
        E2E_SHARE_BODY,
        "取回的内容必须与共享目录里的文件逐字节一致；实际文件：{}",
        local.display()
    );
    eprintln!(
        "==> 读取方向成功：{}:readme.txt → {}，取回 {} 字节 {:?}",
        server.blob.chars().take(12).collect::<String>(),
        local.display(),
        pulled.len(),
        pulled
    );

    server.shutdown().await;
    eprintln!("==> 已回收 tailcat serve files 子进程");
}
