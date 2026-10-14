#![cfg(test)]
//! 引擎下载的离线集成测试：不访问外网。
//!
//! 这里用 `tokio::net::TcpListener` 手写一个最小的 HTTP/1.1 服务器，伪造官方
//! Release 的三份资源——`releases/latest` 的 JSON、`checksums.txt`、以及
//! `tar.gz` / `zip` 产物——然后让 `engine_download::download_into` 走完整条
//! 「下载 → 校验 → 解压 → 安装」链路，并断言：
//!
//!   * 安装出的文件内容与打包内容逐字节一致，unix 上权限为 0755；
//!   * 进度事件里的 `downloaded` 是真实字节数（单调递增，最终等于产物长度）；
//!   * 校验和不匹配时返回 `ENGINE_CHECKSUM_MISMATCH`，且临时文件被清理；
//!   * 含 `..` 的归档条目被拒绝（`PATH_TRAVERSAL`），不会写到解压目录之外。
//!
//! URL 注入点就是 `DownloadConfig`（`api_base` / `download_base` /
//! `allowed_hosts` / `require_https`）；对外的 `engine_download` 命令永远使用
//! `DownloadConfig::default()`，即官方 GitHub 地址。

use std::collections::HashMap;
use std::io::Write as _;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;

use crate::engine_download::{
    asset_name, download_into, sha256_hex, DownloadConfig, Platform, Target,
};
use crate::error::code;
use crate::model::{EngineDownloadPhase, EngineDownloadProgress};

/// 假产物里的「二进制内容」，断言安装结果时会逐字节比对。
const PAYLOAD: &[u8] = b"tailcat-box fake engine binary 5f3c2a\n";

/* -------------------------------------------------------------------------- */
/* 临时目录                                                                   */
/* -------------------------------------------------------------------------- */

struct TempDir {
    path: PathBuf,
}

impl TempDir {
    fn new(tag: &str) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "tailcat-box-engine-dl-{tag}-{}-{}-{nanos}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("create temp dir");
        Self { path }
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

/* -------------------------------------------------------------------------- */
/* 最小 HTTP 服务器                                                           */
/* -------------------------------------------------------------------------- */

struct Route {
    body: Vec<u8>,
    content_type: &'static str,
}

impl Route {
    fn json(body: String) -> Self {
        Self {
            body: body.into_bytes(),
            content_type: "application/json",
        }
    }

    fn binary(body: Vec<u8>) -> Self {
        Self {
            body,
            content_type: "application/octet-stream",
        }
    }

    fn text(body: String) -> Self {
        Self {
            body: body.into_bytes(),
            content_type: "text/plain; charset=utf-8",
        }
    }
}

/// Binds an ephemeral port first so the fake routes can embed the real origin.
async fn start_server(
    build: impl FnOnce(SocketAddr) -> HashMap<String, Route>,
) -> (SocketAddr, JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr = listener.local_addr().expect("local addr");
    let routes = Arc::new(build(addr));
    let handle = tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let routes = Arc::clone(&routes);
            tokio::spawn(async move { serve(stream, routes).await });
        }
    });
    (addr, handle)
}

async fn serve(mut stream: TcpStream, routes: Arc<HashMap<String, Route>>) {
    let mut request = Vec::new();
    let mut chunk = [0u8; 2048];
    loop {
        match stream.read(&mut chunk).await {
            Ok(0) => break,
            Ok(read) => {
                request.extend_from_slice(&chunk[..read]);
                if request.windows(4).any(|window| window == b"\r\n\r\n")
                    || request.len() > 64 * 1024
                {
                    break;
                }
            }
            Err(_) => return,
        }
    }
    let head = String::from_utf8_lossy(&request).into_owned();
    let path = head.split_whitespace().nth(1).unwrap_or("/").to_string();
    let response = match routes.get(&path) {
        Some(route) => {
            let mut out = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: {}\r\nConnection: close\r\n\r\n",
                route.body.len(),
                route.content_type
            )
            .into_bytes();
            out.extend_from_slice(&route.body);
            out
        }
        None => {
            let body = format!("no route for {path}").into_bytes();
            let mut out = format!(
                "HTTP/1.1 404 Not Found\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .into_bytes();
            out.extend_from_slice(&body);
            out
        }
    };
    let _ = stream.write_all(&response).await;
    let _ = stream.flush().await;
    let _ = stream.shutdown().await;
}

/* -------------------------------------------------------------------------- */
/* 假产物                                                                     */
/* -------------------------------------------------------------------------- */

fn build_tar_gz(entry: &str, contents: &[u8]) -> Vec<u8> {
    let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    {
        let mut builder = tar::Builder::new(&mut gz);
        let mut header = tar::Header::new_gnu();
        header.set_size(contents.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, entry, contents)
            .expect("append tar entry");
        builder.finish().expect("finish tar");
    }
    gz.finish().expect("finish gzip")
}

/// Writes the entry name straight into the GNU header, bypassing `set_path`,
/// so a hostile name like `../evil` can be produced for the traversal test.
fn build_tar_gz_raw_name(name: &str, contents: &[u8]) -> Vec<u8> {
    let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    {
        let mut builder = tar::Builder::new(&mut gz);
        let mut header = tar::Header::new_gnu();
        header.set_size(contents.len() as u64);
        header.set_mode(0o644);
        header.set_entry_type(tar::EntryType::Regular);
        let bytes = name.as_bytes();
        assert!(bytes.len() <= 100, "test entry name must fit the header");
        header.as_gnu_mut().expect("gnu header").name[..bytes.len()].copy_from_slice(bytes);
        header.set_cksum();
        builder.append(&header, contents).expect("append raw entry");
        builder.finish().expect("finish tar");
    }
    gz.finish().expect("finish gzip")
}

fn build_zip(entry: &str, contents: &[u8]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    writer.start_file(entry, options).expect("start zip entry");
    writer.write_all(contents).expect("write zip entry");
    writer.finish().expect("finish zip").into_inner()
}

/* -------------------------------------------------------------------------- */
/* Fixture                                                                    */
/* -------------------------------------------------------------------------- */

struct Fixture {
    config: DownloadConfig,
    target: Target,
    install_root: PathBuf,
    archive: Vec<u8>,
    payload: Vec<u8>,
    #[allow(dead_code)]
    server: JoinHandle<()>,
    #[allow(dead_code)]
    root: TempDir,
}

impl Fixture {
    async fn new(tag: &str, platform: Platform, arch: &str, corrupt_checksum: bool) -> Self {
        Self::with_entries(
            tag,
            platform,
            arch,
            None,
            PAYLOAD.to_vec(),
            corrupt_checksum,
        )
        .await
    }

    /// `entry_override` replaces the in-archive entry name (used for the
    /// traversal test); `payload` is the binary content inside the archive.
    async fn with_entries(
        tag: &str,
        platform: Platform,
        arch: &str,
        entry_override: Option<&str>,
        payload: Vec<u8>,
        corrupt_checksum: bool,
    ) -> Self {
        let version = "9.9.9".to_string();
        let target = Target {
            platform,
            arch: arch.to_string(),
        };
        let name = asset_name(&target, &version).expect("asset name");
        let entry = entry_override.map(str::to_string).unwrap_or_else(|| {
            if matches!(platform, Platform::Windows) {
                "tailcat.exe".to_string()
            } else {
                // Nested on purpose: the installer must find the binary
                // wherever the archive puts it.
                format!("tailcat_{version}_linux_amd64/tailcat")
            }
        });
        let archive = match platform {
            Platform::Windows => build_zip(&entry, &payload),
            // The hostile-name case has to bypass `tar::Header::set_path`,
            // which refuses `..` itself.
            _ if entry_override.is_some() => build_tar_gz_raw_name(&entry, &payload),
            _ => build_tar_gz(&entry, &payload),
        };
        let digest = if corrupt_checksum {
            "0".repeat(64)
        } else {
            sha256_hex(&archive)
        };

        let served_archive = archive.clone();
        let (addr, server) = start_server(move |addr| {
            let origin = format!("http://{addr}");
            let asset_url =
                format!("{origin}/tailscale/tailcat/releases/download/v{version}/{name}");
            let mut routes = HashMap::new();
            routes.insert(
                "/repos/tailscale/tailcat/releases/latest".to_string(),
                Route::json(format!(
                    "{{\"tag_name\":\"v{version}\",\"assets\":[{{\"name\":\"{name}\",\
                     \"browser_download_url\":\"{asset_url}\"}}]}}"
                )),
            );
            routes.insert(
                format!("/tailscale/tailcat/releases/download/v{version}/checksums.txt"),
                Route::text(format!("{digest}  {name}\n")),
            );
            routes.insert(
                format!("/tailscale/tailcat/releases/download/v{version}/{name}"),
                Route::binary(served_archive.clone()),
            );
            routes
        })
        .await;

        let root = TempDir::new(tag);
        Self {
            config: DownloadConfig {
                api_base: format!("http://{addr}"),
                download_base: format!("http://{addr}"),
                allowed_hosts: vec!["127.0.0.1".to_string()],
                require_https: false,
            },
            target,
            install_root: root.path.clone(),
            archive,
            payload,
            server,
            root,
        }
    }
}

fn recorder() -> (
    Arc<Mutex<Vec<EngineDownloadProgress>>>,
    impl Fn(EngineDownloadProgress) + Send + Sync,
) {
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&events);
    (events, move |progress| {
        sink.lock().expect("progress lock").push(progress);
    })
}

/* -------------------------------------------------------------------------- */
/* 用例                                                                       */
/* -------------------------------------------------------------------------- */

#[tokio::test]
async fn linux_tarball_downloads_verifies_extracts_and_installs() {
    let fixture = Fixture::new("linux-tar", Platform::Linux, "x86_64", false).await;
    let (events, sink) = recorder();

    let installed = download_into(
        &fixture.config,
        &fixture.target,
        None,
        &fixture.install_root,
        sink,
    )
    .await
    .expect("install succeeds");

    assert_eq!(installed.version, "9.9.9");
    assert_eq!(
        installed.path,
        fixture.install_root.join("9.9.9").join("tailcat")
    );
    assert_eq!(
        std::fs::read(&installed.path).expect("read installed"),
        fixture.payload,
        "installed bytes must match the archive payload"
    );

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&installed.path)
            .expect("metadata")
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o755, "unix install must be executable");
    }

    let events = events.lock().expect("events").clone();
    for phase in [
        EngineDownloadPhase::Checking,
        EngineDownloadPhase::Downloading,
        EngineDownloadPhase::Verifying,
        EngineDownloadPhase::Extracting,
        EngineDownloadPhase::Installing,
    ] {
        assert!(
            events.iter().any(|event| event.phase == phase),
            "{phase:?} missing"
        );
    }
    assert_eq!(
        events.last().map(|event| event.phase),
        Some(EngineDownloadPhase::Done)
    );

    // The reported byte counts are the real ones: monotonic, and exactly the
    // length of the served archive.
    let expected_total = fixture.archive.len() as u64;
    let mut seen = 0u64;
    let mut saw_total = false;
    for event in events
        .iter()
        .filter(|event| event.phase == EngineDownloadPhase::Downloading)
    {
        assert!(event.downloaded >= seen, "downloaded must not go backwards");
        seen = event.downloaded;
        assert_eq!(event.version.as_deref(), Some("9.9.9"));
        if let Some(total) = event.total {
            saw_total = true;
            assert_eq!(total, expected_total);
        }
    }
    assert!(saw_total, "the server sends Content-Length");
    assert_eq!(
        seen, expected_total,
        "final byte count must equal the asset size"
    );

    // Scratch state is gone.
    assert!(!fixture.install_root.join("9.9.9.part").exists());
    assert!(!fixture.install_root.join(".9.9.9.extract").exists());
}

#[tokio::test]
async fn windows_zip_downloads_verifies_extracts_and_installs() {
    let fixture = Fixture::new("win-zip", Platform::Windows, "x86_64", false).await;
    let (events, sink) = recorder();

    let installed = download_into(
        &fixture.config,
        &fixture.target,
        None,
        &fixture.install_root,
        sink,
    )
    .await
    .expect("install succeeds");

    assert_eq!(
        installed.path,
        fixture.install_root.join("9.9.9").join("tailcat.exe")
    );
    assert_eq!(
        std::fs::read(&installed.path).expect("read installed"),
        fixture.payload
    );
    assert_eq!(
        events.lock().expect("events").last().map(|e| e.phase),
        Some(EngineDownloadPhase::Done)
    );
}

#[tokio::test]
async fn checksum_mismatch_fails_and_removes_the_partial_download() {
    let fixture = Fixture::new("bad-sum", Platform::Linux, "x86_64", true).await;
    let (events, sink) = recorder();

    let error = download_into(
        &fixture.config,
        &fixture.target,
        None,
        &fixture.install_root,
        sink,
    )
    .await
    .expect_err("checksum mismatch must fail the install");

    assert_eq!(error.code, code::ENGINE_CHECKSUM_MISMATCH);
    let actual_digest = sha256_hex(&fixture.archive);
    assert!(
        error.message.contains(&"0".repeat(64)) && error.message.contains(&actual_digest),
        "the user-facing message must carry both digests: {}",
        error.message
    );
    let detail = error.detail.clone().unwrap_or_default();
    assert!(
        detail.contains(
            "expected sha256: 0000000000000000000000000000000000000000000000000000000000000000"
        ),
        "detail must carry the expected digest: {detail}"
    );
    assert!(
        detail.contains(&actual_digest),
        "detail must carry the actual digest: {detail}"
    );

    // The partial download and the scratch directory are cleaned up, and
    // nothing was installed.
    assert!(
        !fixture.install_root.join("9.9.9.part").exists(),
        "the partial download must be deleted"
    );
    assert!(!fixture.install_root.join(".9.9.9.extract").exists());
    assert!(!fixture.install_root.join("9.9.9").exists());

    let events = events.lock().expect("events").clone();
    assert_eq!(
        events.last().map(|event| event.phase),
        Some(EngineDownloadPhase::Error)
    );
    assert!(events
        .iter()
        .all(|event| event.phase != EngineDownloadPhase::Installing));
}

#[tokio::test]
async fn path_traversal_entries_are_rejected() {
    let fixture = Fixture::with_entries(
        "traversal",
        Platform::Linux,
        "x86_64",
        Some("../escaped-tailcat"),
        PAYLOAD.to_vec(),
        false,
    )
    .await;
    let (_events, sink) = recorder();

    let error = download_into(
        &fixture.config,
        &fixture.target,
        None,
        &fixture.install_root,
        sink,
    )
    .await
    .expect_err("traversal must fail the install");

    assert_eq!(error.code, code::PATH_TRAVERSAL);
    let escaped = fixture
        .install_root
        .parent()
        .expect("parent")
        .join("escaped-tailcat");
    assert!(!escaped.exists(), "nothing may be written outside the root");
    assert!(!fixture.install_root.join("9.9.9.part").exists());
    assert!(!fixture.install_root.join(".9.9.9.extract").exists());
}

#[tokio::test]
async fn macos_is_reported_as_unsupported_without_touching_the_network() {
    let fixture = Fixture::new("macos", Platform::Linux, "x86_64", false).await;
    let macos = Target {
        platform: Platform::Macos,
        arch: "aarch64".to_string(),
    };
    let (_events, sink) = recorder();

    let error = download_into(&fixture.config, &macos, None, &fixture.install_root, sink)
        .await
        .expect_err("macOS must be refused");

    assert_eq!(error.code, code::ENGINE_UNSUPPORTED_PLATFORM);
    assert!(error.message.contains("brew install tailcat"));
    assert!(!fixture.install_root.join("9.9.9").exists());
}

#[tokio::test]
async fn hostile_version_strings_are_refused_before_any_request() {
    let fixture = Fixture::new("bad-version", Platform::Linux, "x86_64", false).await;
    let (_events, sink) = recorder();

    let error = download_into(
        &fixture.config,
        &fixture.target,
        Some("../../etc/passwd"),
        &fixture.install_root,
        sink,
    )
    .await
    .expect_err("hostile version must be refused");

    assert_eq!(error.code, code::ENGINE_DOWNLOAD_FAILED);
    assert!(!fixture.install_root.join("9.9.9").exists());
}

#[tokio::test]
async fn download_info_reports_the_published_asset() {
    let fixture = Fixture::new("info", Platform::Linux, "x86_64", false).await;
    let info = crate::engine_download::download_info(&fixture.config, &fixture.target).await;

    assert!(info.supported);
    assert_eq!(info.platform, "linux");
    assert_eq!(info.arch, "x86_64");
    assert_eq!(info.version.as_deref(), Some("9.9.9"));
    assert_eq!(
        info.asset_name.as_deref(),
        Some("tailcat_9.9.9_linux_amd64.tar.gz")
    );
    assert!(info.reason.is_none());
}
