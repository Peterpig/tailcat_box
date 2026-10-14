//! 「停止任务 → 子进程被回收 → 本地监听端口被释放」的可执行验证。
//!
//! 这里不复述 `task/mod.rs` 里的纯逻辑单测，而是**黑盒**驱动
//! [`TaskRegistry`] 的公开 API（`start` / `stop` / `stop_all` / `shutdown`），
//! 为 `AGENT.md` 安全要求第 10 条「应用退出时能够可靠地清理自身创建的子进程」
//! 与验收条件「停止任务后，相关子进程和本地监听端口均能正确释放」补上证据。
//!
//! 两类验证：
//!  * **默认离线可跑**：用一个 shim 脚本冒充 tailcat 可执行文件，脚本
//!    `exec sleep 30` 变成真实的长驻子进程；断言 `stop` / `stop_all` /
//!    `shutdown` 之后该 PID 已被**回收**（不是留在进程表里的僵尸）。
//!  * **真实 tailcat（需 `TAILCAT_E2E=1` 且联网）**：起真实 `tailcat serve`
//!    + `tailcat forward`，断言 stop 之后本地监听端口可以重新绑定。
//!
//! Windows 上没有 `sleep` 也没有 `libc::kill`，整个模块用 `cfg(unix)` 跳过；
//! 因此「子进程回收」在本仓库只对 macOS / Linux 有实测证据。
#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::net::TcpListener;
use tokio::time::sleep;

use crate::model::{LogStream, Settings, TaskInfo, TaskRequest, TaskStatus};
use crate::tailcat::TailcatCli;
use crate::task::{TaskContext, TaskRegistry};

/// 等待子进程被回收（`try_wait` 收割完成）的上限。
const REAP_TIMEOUT: Duration = Duration::from_secs(10);
/// 等待 `tailcat serve` 写出地址令牌的上限（含首次连接 DERP 的耗时）。
const SERVE_READY_TIMEOUT: Duration = Duration::from_secs(60);
/// 等待 `tailcat forward` 报告本地监听端口的上限。
const FORWARD_READY_TIMEOUT: Duration = Duration::from_secs(60);

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

/// 临时目录守卫：测试结束（包括 panic）时尽力删除，避免污染临时目录。
struct TempDirGuard(PathBuf);

impl TempDirGuard {
    fn new(tag: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "tailcat-box-cleanup-{tag}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).expect("创建临时目录失败");
        Self(dir)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// 进程是否仍然存在。
///
/// 关键点：**僵尸进程也返回 `true`**——`kill(pid, 0)` 只检查 PID 是否还在
/// 进程表里，尚未被 `wait` 收割的僵尸同样能通过这个检查。因此
/// `!pid_alive(pid)` 比「进程不在了」更强：它同时证明了子进程已经被
/// `try_wait` 回收，而不是留在进程表里变成僵尸。
fn pid_alive(pid: u32) -> bool {
    let rc = unsafe { libc::kill(pid as libc::pid_t, 0) };
    if rc == 0 {
        return true;
    }
    // EPERM 表示进程存在但不属于当前用户，同样算「还在」。
    std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

/// 轮询等待文件出现且非空，返回其内容。
async fn wait_for_file(path: &Path, timeout: Duration) -> String {
    let deadline = Instant::now() + timeout;
    loop {
        if let Ok(text) = std::fs::read_to_string(path) {
            if !text.trim().is_empty() {
                return text;
            }
        }
        if Instant::now() >= deadline {
            panic!("等待文件 {} 超时", path.display());
        }
        sleep(Duration::from_millis(20)).await;
    }
}

/// 取任务的 stderr 尾部，用于断言失败时给出真实原因。
fn stderr_tail(registry: &TaskRegistry, id: &str) -> String {
    registry
        .logs(id, 0, 400)
        .map(|page| {
            page.lines
                .iter()
                .filter(|line| line.stream == LogStream::Stderr)
                .map(|line| line.text.clone())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

/// 轮询任务状态，直到子进程被回收（进入终态且 `pid` 已被清空）。
async fn wait_until_reaped(registry: &Arc<TaskRegistry>, id: &str, timeout: Duration) -> TaskInfo {
    let deadline = Instant::now() + timeout;
    loop {
        let info = registry.get(id).expect("任务应仍在注册表中");
        if info.pid.is_none() && matches!(info.status, TaskStatus::Stopped | TaskStatus::Failed) {
            return info;
        }
        if Instant::now() >= deadline {
            panic!(
                "等待任务 {id} 被回收超时（最后状态 {:?}）\nstderr 尾部：\n{}",
                info.status,
                stderr_tail(registry, id)
            );
        }
        sleep(Duration::from_millis(50)).await;
    }
}

/// 解析 tailcat 可执行文件：含路径分隔符时按原样判断，纯文件名则在 PATH 中查找。
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

// ---------------------------------------------------------------------------
// 离线验证：stop / stop_all / shutdown 都会回收子进程
// ---------------------------------------------------------------------------

/// 写入一个可执行的 shim 脚本，用来冒充 tailcat 可执行文件。
///
/// 脚本先记录自己收到的 argv（证明 registry 确实按 spec 启动了被测程序），
/// 然后 `exec sleep 30`：`exec` 让 `sleep` 顶替 shell 成为同一个进程，于是
/// 「registry 记录的 PID」就是长驻进程本身的 PID，PID 存活 / 回收的断言不会
/// 因为多一层 shell 而失真。
fn write_shim(dir: &Path, argv_log: &Path) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;

    let path = dir.join("fake-tailcat");
    let body = format!(
        r#"#!/bin/sh
printf '%s\n' "$@" > '{}'
exec sleep 30
"#,
        argv_log.display()
    );
    std::fs::write(&path, body).expect("写入 shim 脚本失败");
    let mut perms = std::fs::metadata(&path)
        .expect("读取 shim 元数据失败")
        .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&path, perms).expect("设置 shim 可执行位失败");
    path
}

fn test_context(program: &Path) -> TaskContext {
    TaskContext {
        cli: TailcatCli::new(program.to_path_buf()),
        settings: Settings::default(),
    }
}

/// 最小可用的任务请求：`Recv` 只需要一个目录，不涉及任何网络参数，
/// 因此可以被 shim 完全接管，离线可跑。
fn recv_request(dir: &Path) -> TaskRequest {
    TaskRequest::Recv {
        label: Some("cleanup-test".to_string()),
        dir: dir.display().to_string(),
        key_name: None,
    }
}

/// 一个已经启动的长驻「shim 任务」。
struct ShimTask {
    /// 必须活到测试结束，否则 shim 脚本 / 工作目录会被提前删除。
    _dirs: (TempDirGuard, TempDirGuard),
    registry: Arc<TaskRegistry>,
    info: TaskInfo,
    pid: u32,
}

/// 起一个 shim 子进程，并完成启动期断言。
async fn start_shim_task(tag: &str) -> ShimTask {
    let dir = TempDirGuard::new(tag);
    let work = TempDirGuard::new(&format!("{tag}-work"));
    let argv_log = dir.path().join("argv.txt");
    let shim = write_shim(dir.path(), &argv_log);

    let registry = Arc::new(TaskRegistry::default());
    let ctx = test_context(&shim);
    let info = registry
        .start(recv_request(work.path()), &ctx)
        .await
        .expect("start 应成功启动 shim 子进程");

    // 启动后：任务处于运行态，PID 可读，且进程真实存在。
    assert_eq!(
        info.status,
        TaskStatus::Running,
        "start 之后任务应处于运行态"
    );
    let pid = info.pid.expect("运行中的任务应记录 PID");
    assert!(pid_alive(pid), "start 之后子进程 {pid} 应仍在运行");

    // 证明 registry 按 spec 启动的确实是被测程序，而不是别的东西。
    let argv = wait_for_file(&argv_log, Duration::from_secs(5)).await;
    let argv: Vec<&str> = argv.lines().collect();
    assert_eq!(
        argv,
        vec![
            "recv",
            "--json",
            work.path().to_str().expect("临时目录路径应为 UTF-8"),
        ],
        "registry 必须按 spec 启动被测程序"
    );

    ShimTask {
        _dirs: (dir, work),
        registry,
        info,
        pid,
    }
}

/// 断言「停止之后 PID 已被回收」，即各停止路径共用的收尾检查。
async fn assert_reaped(task: &ShimTask) {
    let final_info = wait_until_reaped(&task.registry, &task.info.id, REAP_TIMEOUT).await;
    assert_eq!(
        final_info.status,
        TaskStatus::Stopped,
        "主动停止的任务应以 stopped 结束，而不是 {:?}",
        final_info.status
    );
    assert!(final_info.pid.is_none(), "回收后 pid 应被清空");
    assert!(
        !pid_alive(task.pid),
        "停止之后 PID {} 应已消失；若仍是僵尸进程，kill(pid, 0) 依然会成功",
        task.pid
    );
}

/// `stop`：单任务停止后子进程被回收。
#[tokio::test]
async fn stop_reaps_child_process() {
    let task = start_shim_task("stop").await;
    task.registry.stop(&task.info.id).expect("stop 应成功");
    assert_reaped(&task).await;
}

/// `stop_all`：界面上「停止全部」走的路径同样回收每个子进程。
#[tokio::test]
async fn stop_all_reaps_every_child_process() {
    let task = start_shim_task("stop-all").await;
    let stopped = task.registry.stop_all();
    assert_eq!(stopped.len(), 1, "stop_all 应返回全部任务");
    assert_reaped(&task).await;
}

/// `shutdown`：应用退出路径（窗口关闭 / `RunEvent::Exit`）回收子进程。
#[tokio::test]
async fn shutdown_reaps_child_process() {
    let task = start_shim_task("shutdown").await;
    task.registry.shutdown();
    assert_reaped(&task).await;
}

// ---------------------------------------------------------------------------
// 真实 tailcat：停止后本地监听端口被释放（需 TAILCAT_E2E=1）
// ---------------------------------------------------------------------------

/// 等待 registry 从 `TAILCAT_ADDR_FILE` 读出服务端令牌。
async fn wait_for_address(registry: &Arc<TaskRegistry>, id: &str, timeout: Duration) -> String {
    let deadline = Instant::now() + timeout;
    loop {
        let info = registry.get(id).expect("任务应仍在注册表中");
        if let Some(address) = info.address.clone() {
            return address;
        }
        if matches!(info.status, TaskStatus::Stopped | TaskStatus::Failed) {
            panic!(
                "任务 {id} 在写出地址前就结束了（{:?}）\nstderr 尾部：\n{}",
                info.status,
                stderr_tail(registry, id)
            );
        }
        if Instant::now() >= deadline {
            panic!(
                "等待任务 {id} 写出地址超时（{} 秒）\nstderr 尾部：\n{}",
                timeout.as_secs(),
                stderr_tail(registry, id)
            );
        }
        sleep(Duration::from_millis(100)).await;
    }
}

/// 等待 registry 从 `tailcat forward` 的 stderr 里解析出真实的本地监听地址。
async fn wait_for_listen_addr(registry: &Arc<TaskRegistry>, id: &str, timeout: Duration) -> String {
    let deadline = Instant::now() + timeout;
    loop {
        let info = registry.get(id).expect("任务应仍在注册表中");
        if let Some(listen_addr) = info.listen_addr.clone() {
            return listen_addr;
        }
        if matches!(info.status, TaskStatus::Stopped | TaskStatus::Failed) {
            panic!(
                "任务 {id} 在报告监听端口前就结束了（{:?}）\nstderr 尾部：\n{}",
                info.status,
                stderr_tail(registry, id)
            );
        }
        if Instant::now() >= deadline {
            panic!(
                "等待任务 {id} 报告监听端口超时（{} 秒）\nstderr 尾部：\n{}",
                timeout.as_secs(),
                stderr_tail(registry, id)
            );
        }
        sleep(Duration::from_millis(100)).await;
    }
}

/// 端到端验证：`stop` 之后本地监听端口被真实释放。
///
/// 流程：本地 TCP 目标服务 → `tailcat serve`（registry 自动读取地址令牌）
/// → `tailcat forward --bind=127.0.0.1 <token> 0:<port>`（由 CLI 自己挑本地端口）
/// → 先断言该端口**已被占用**（正对照）→ `stop` → 断言端口**可以重新绑定**。
///
/// 必须显式设置 `TAILCAT_E2E=1`：本测试会启动真实 tailcat 子进程并经 DERP
/// 中继联网，耗时且需要外网，不能在默认 `cargo test` 中运行。
#[tokio::test]
async fn e2e_stop_releases_local_listen_port() {
    if std::env::var("TAILCAT_E2E").ok().as_deref() != Some("1") {
        eprintln!("跳过：未设置 TAILCAT_E2E=1");
        return;
    }

    let bin = std::env::var("TAILCAT_E2E_BIN").unwrap_or_else(|_| "tailcat".to_string());
    let Some(program) = resolve_binary(&bin) else {
        panic!(
            "找不到 tailcat 可执行文件 `{bin}`。\n\
             请先安装官方 tailcat CLI（v0.7.0 或更高），\
             或用环境变量 TAILCAT_E2E_BIN 指定其绝对路径，例如：\n\
             \x20   TAILCAT_E2E_BIN=/opt/homebrew/bin/tailcat ./scripts/cleanup-verify.sh"
        );
    };
    eprintln!("==> 使用 tailcat：{}", program.display());

    // 一个真实的本地目标服务；本测试只关心端口释放，不会真正收发数据。
    let target = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("绑定本地目标服务失败");
    let target_port = target
        .local_addr()
        .expect("读取本地目标服务端口失败")
        .port();
    eprintln!("==> 本地目标服务监听 127.0.0.1:{target_port}");

    let registry = Arc::new(TaskRegistry::default());
    let ctx = test_context(&program);

    // 1. `tailcat serve`：registry 通过 TAILCAT_ADDR_FILE 自动读出连接令牌。
    let serve = registry
        .start(
            TaskRequest::Serve {
                label: Some("cleanup-e2e-serve".to_string()),
                targets: vec![target_port.to_string()],
                files_dir: None,
                files_mode: None,
                key_name: None,
                allow: None,
                full_address: None,
            },
            &ctx,
        )
        .await
        .expect("启动 tailcat serve 失败");
    let token = wait_for_address(&registry, &serve.id, SERVE_READY_TIMEOUT).await;
    eprintln!("==> 获得服务端令牌（长度 {}）", token.len());

    // 2. `tailcat forward`：local_port = 0 由 CLI 自己挑端口，registry 从
    //    stderr 解析出它真正绑定的地址。
    let forward = registry
        .start(
            TaskRequest::Forward {
                label: Some("cleanup-e2e-forward".to_string()),
                address: token,
                remote_port: target_port,
                local_port: 0,
                bind_host: "127.0.0.1".to_string(),
                key_name: None,
            },
            &ctx,
        )
        .await
        .expect("启动 tailcat forward 失败");
    let listen_addr = wait_for_listen_addr(&registry, &forward.id, FORWARD_READY_TIMEOUT).await;
    eprintln!("==> tailcat forward 本地监听 {listen_addr}");

    // 3. 正对照：forward 运行期间该端口确实被占用（否则后面的「释放」没有意义）。
    let held = TcpListener::bind(&listen_addr).await;
    assert!(
        held.is_err(),
        "forward 运行期间 {listen_addr} 应已被占用，实际却可以绑定：{held:?}"
    );
    drop(held);

    // 4. 停止 forward，等子进程被回收。
    registry.stop(&forward.id).expect("stop forward 失败");
    let forward_info = wait_until_reaped(&registry, &forward.id, REAP_TIMEOUT).await;
    assert_eq!(forward_info.status, TaskStatus::Stopped);

    // 5. 关键断言：本地监听端口已随子进程一起释放。
    let rebound = TcpListener::bind(&listen_addr).await;
    assert!(
        rebound.is_ok(),
        "stop 之后 {listen_addr} 应能重新绑定，实际失败：{rebound:?}"
    );
    drop(rebound);
    eprintln!("==> 端口已释放：{listen_addr} 可以重新绑定");

    // 6. 收尾：停掉 serve，确保不留下任何子进程。
    registry.stop(&serve.id).expect("stop serve 失败");
    let serve_info = wait_until_reaped(&registry, &serve.id, REAP_TIMEOUT).await;
    assert_eq!(serve_info.status, TaskStatus::Stopped);
    assert_eq!(registry.running_count(), 0, "收尾后不应仍有运行中的任务");
}
