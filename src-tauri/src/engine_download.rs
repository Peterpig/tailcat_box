//! Safe download and installation of the official `tailcat` release binaries.
//!
//! `AGENT.md` 三.6 asks for "检测、下载或安装对应平台的官方版本" together with
//! "检查下载文件的来源、校验和或签名" and "不允许自动执行来源不明的脚本".
//! This module implements exactly that, and nothing more:
//!
//!   * only `https` URLs on the official GitHub hosts are accepted, for the
//!     release metadata, the checksum file and the asset itself, and every
//!     redirect hop is re-checked against the same allowlist;
//!   * the published `checksums.txt` (SHA256) is fetched from the same release
//!     and the downloaded bytes must match it before anything is unpacked;
//!   * archives are unpacked with path-traversal guards, and only the `tailcat`
//!     / `tailcat.exe` file is installed;
//!   * no shell is ever involved, and no installer script is ever executed.
//!
//! macOS is intentionally unsupported: upstream publishes no darwin assets
//! (macOS builds come from Homebrew / source), so we report that plainly and
//! point the user at Homebrew instead of guessing.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::redirect::Policy;
use reqwest::Url;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use crate::error::{code, AppError, AppResult};
use crate::model::{EngineDownloadInfo, EngineDownloadPhase, EngineDownloadProgress};

/// Official repository publishing the release assets.
pub const RELEASE_REPO: &str = "tailscale/tailcat";
/// Base of the GitHub REST API.
pub const DEFAULT_API_BASE: &str = "https://api.github.com";
/// Base of the GitHub release download URLs.
pub const DEFAULT_DOWNLOAD_BASE: &str = "https://github.com";
/// Hosts allowed to serve metadata, checksums and binaries. Release assets are
/// served from `github.com` but redirect to `*.githubusercontent.com`.
pub const OFFICIAL_HOSTS: &[&str] = &[
    "github.com",
    "api.github.com",
    "codeload.github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "github-releases.githubusercontent.com",
];

/// Longest we wait for a single HTTP response to start.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
/// Longest we wait for the whole request, including the body stream.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(600);
/// Refuse to follow more than this many redirects.
const MAX_REDIRECTS: usize = 5;

/* -------------------------------------------------------------------------- */
/* Platform / architecture                                                    */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Macos,
    Linux,
    Windows,
    Other,
}

impl Platform {
    pub fn detect() -> Self {
        match std::env::consts::OS {
            "macos" => Platform::Macos,
            "linux" => Platform::Linux,
            "windows" => Platform::Windows,
            _ => Platform::Other,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Platform::Macos => "macos",
            Platform::Linux => "linux",
            Platform::Windows => "windows",
            Platform::Other => "unknown",
        }
    }

    /// The `os` field used in the official asset names. macOS has none.
    fn asset_os(self) -> Option<&'static str> {
        match self {
            Platform::Linux => Some("linux"),
            Platform::Windows => Some("windows"),
            Platform::Macos | Platform::Other => None,
        }
    }

    /// Archive format the official release ships for this OS.
    fn archive_ext(self) -> Option<&'static str> {
        match self {
            Platform::Linux => Some("tar.gz"),
            Platform::Windows => Some("zip"),
            Platform::Macos | Platform::Other => None,
        }
    }

    fn binary_name(self) -> &'static str {
        if matches!(self, Platform::Windows) {
            "tailcat.exe"
        } else {
            "tailcat"
        }
    }
}

/// A machine the release feed is being asked about. Kept explicit (rather than
/// read from `cfg!` at every call site) so the offline integration test can
/// exercise the Linux and Windows paths on any host.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub platform: Platform,
    /// Normalised architecture name, e.g. `x86_64` / `aarch64` / `armv7`.
    pub arch: String,
}

impl Target {
    pub fn detect() -> Self {
        Self {
            platform: Platform::detect(),
            arch: detect_arch(),
        }
    }

    /// The `arch` field used in the official asset names.
    pub fn asset_arch(&self) -> Option<&'static str> {
        match self.arch.as_str() {
            "x86_64" => Some("amd64"),
            "aarch64" => Some("arm64"),
            "armv7" => Some("armv7"),
            _ => None,
        }
    }
}

/// `std::env::consts::ARCH`, normalised to the names the UI and the asset
/// mapping both use. 32-bit ARM targets report `arm`, which is the only 32-bit
/// ARM line upstream publishes (`armv7`).
pub fn detect_arch() -> String {
    match std::env::consts::ARCH {
        "x86_64" | "amd64" => "x86_64".to_string(),
        "aarch64" | "arm64" => "aarch64".to_string(),
        "arm" | "armv7" | "armv7l" => "armv7".to_string(),
        other => other.to_string(),
    }
}

/// `tailcat_<version>_<os>_<arch>.<ext>`, or `None` when upstream ships no
/// binary for this target.
pub fn asset_name(target: &Target, version: &str) -> Option<String> {
    let os = target.platform.asset_os()?;
    let arch = target.asset_arch()?;
    let ext = target.platform.archive_ext()?;
    Some(format!("tailcat_{version}_{os}_{arch}.{ext}"))
}

/// Chinese explanation shown by the UI when the platform is not supported.
pub fn unsupported_reason(target: &Target) -> String {
    match target.platform {
        Platform::Macos => "官方未提供 macOS 平台的 tailcat 二进制产物（macOS 版本由 Homebrew 从源码构建）。请改用 Homebrew 安装：brew install tailcat；或从源码构建后，在「设置 → 引擎」中手动指定 tailcat 路径。".to_string(),
        Platform::Other => format!(
            "官方未提供当前系统（{}）的 tailcat 二进制产物。请在「设置 → 引擎」中手动指定已安装的 tailcat 路径。",
            target.platform.as_str()
        ),
        _ => format!(
            "官方未提供当前架构（{}）的 tailcat 二进制产物（官方仅发布 amd64 / arm64 / armv7）。请在「设置 → 引擎」中手动指定已安装的 tailcat 路径。",
            target.arch
        ),
    }
}

fn unsupported_error(target: &Target) -> AppError {
    AppError::new(
        code::ENGINE_UNSUPPORTED_PLATFORM,
        unsupported_reason(target),
    )
    .with_hint("可以手动安装官方 tailcat 后，在「设置 → 引擎」中指定其路径")
    .with_detail(format!(
        "platform: {}, arch: {}",
        target.platform.as_str(),
        target.arch
    ))
}

/* -------------------------------------------------------------------------- */
/* Checksums                                                                  */
/* -------------------------------------------------------------------------- */

/// Parses a `checksums.txt` body (`<sha256>  <filename>` per line, the format
/// `sha256sum` emits). Malformed lines are skipped rather than guessed at; a
/// missing entry is reported by the caller.
pub fn parse_checksums(text: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(hash) = parts.next() else { continue };
        let Some(name) = parts.next() else { continue };
        if !is_sha256_hex(hash) {
            continue;
        }
        // `sha256sum -b` prefixes the file name with `*`.
        let name = name.strip_prefix('*').unwrap_or(name);
        if name.is_empty() {
            continue;
        }
        map.insert(name.to_string(), hash.to_ascii_lowercase());
    }
    map
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Whole-buffer digest. The install path streams into a `Sha256` directly, so
/// this helper exists for the known-answer tests.
#[cfg(test)]
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex_lower(&hasher.finalize())
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

/// Fails with `ENGINE_CHECKSUM_MISMATCH` when the digest does not match. Both
/// digests are part of the user-facing message (and repeated in `detail`) so
/// the user can compare them against the official `checksums.txt` by hand.
pub fn verify_checksum(expected: &str, actual: &str, asset: &str) -> AppResult<()> {
    if expected.eq_ignore_ascii_case(actual) {
        return Ok(());
    }
    Err(AppError::new(
        code::ENGINE_CHECKSUM_MISMATCH,
        format!(
            "下载的 {asset} 校验和不匹配：期望 SHA256 {expected}，实际 {actual}。文件可能已损坏或被篡改"
        ),
    )
    .with_hint("请重试；若持续失败，请在官方 Releases 页面手动下载并核对 SHA256")
    .with_detail(format!(
        "expected sha256: {expected}\nactual sha256:   {actual}"
    )))
}

/* -------------------------------------------------------------------------- */
/* HTTP                                                                       */
/* -------------------------------------------------------------------------- */

/// Where release metadata and binaries are fetched from. The default is the
/// official GitHub endpoints; the offline integration test injects a local
/// server instead.
#[derive(Debug, Clone)]
pub struct DownloadConfig {
    pub api_base: String,
    pub download_base: String,
    pub allowed_hosts: Vec<String>,
    pub require_https: bool,
}

impl Default for DownloadConfig {
    fn default() -> Self {
        Self {
            api_base: DEFAULT_API_BASE.to_string(),
            download_base: DEFAULT_DOWNLOAD_BASE.to_string(),
            allowed_hosts: OFFICIAL_HOSTS.iter().map(|host| host.to_string()).collect(),
            require_https: true,
        }
    }
}

/// Scheme + host gate applied to every URL we request, initial or redirected.
pub fn is_allowed_url(url: &Url, hosts: &[String], require_https: bool) -> bool {
    let scheme_ok = if require_https {
        url.scheme() == "https"
    } else {
        matches!(url.scheme(), "https" | "http")
    };
    if !scheme_ok {
        return false;
    }
    match url.host_str() {
        Some(host) => hosts
            .iter()
            .any(|allowed| allowed.eq_ignore_ascii_case(host)),
        None => false,
    }
}

fn build_client(config: &DownloadConfig) -> AppResult<reqwest::Client> {
    let hosts = config.allowed_hosts.clone();
    let require_https = config.require_https;
    // Re-check every hop: a redirect off the official hosts is refused rather
    // than followed.
    let policy = Policy::custom(move |attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            return attempt.error("重定向次数过多");
        }
        if !is_allowed_url(attempt.url(), &hosts, require_https) {
            return attempt.error("重定向目标不在允许的官方域名范围内");
        }
        attempt.follow()
    });
    reqwest::Client::builder()
        .user_agent(format!("tailcat-box/{}", env!("CARGO_PKG_VERSION")))
        .redirect(policy)
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| {
            AppError::new(code::ENGINE_DOWNLOAD_FAILED, "无法初始化网络客户端")
                .with_detail(error.to_string())
        })
}

#[derive(Debug, Deserialize)]
struct ReleaseResponse {
    tag_name: String,
    #[serde(default)]
    assets: Vec<ReleaseAsset>,
}

#[derive(Debug, Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
}

fn parse_url(raw: &str, what: &str) -> AppResult<Url> {
    Url::parse(raw).map_err(|error| {
        AppError::new(code::ENGINE_DOWNLOAD_FAILED, format!("{what}不是合法 URL"))
            .with_detail(format!("{raw}: {error}"))
    })
}

fn checked_url(raw: &str, what: &str, config: &DownloadConfig) -> AppResult<Url> {
    let url = parse_url(raw, what)?;
    if !is_allowed_url(&url, &config.allowed_hosts, config.require_https) {
        return Err(AppError::new(
            code::ENGINE_DOWNLOAD_FAILED,
            format!("{what}不在允许的官方域名范围内"),
        )
        .with_hint("本应用只从 GitHub 官方域名下载 tailcat")
        .with_detail(format!("rejected url: {raw}")));
    }
    Ok(url)
}

fn network_error(what: &str, error: reqwest::Error) -> AppError {
    AppError::new(code::NETWORK_ERROR, format!("{what}失败"))
        .with_hint("请检查网络连接或代理设置后重试")
        .with_detail(error.to_string())
}

async fn fetch_release(
    client: &reqwest::Client,
    config: &DownloadConfig,
    tag: Option<&str>,
) -> AppResult<ReleaseResponse> {
    let api = config.api_base.trim_end_matches('/');
    let path = match tag {
        Some(tag) => format!("/repos/{RELEASE_REPO}/releases/tags/{tag}"),
        None => format!("/repos/{RELEASE_REPO}/releases/latest"),
    };
    let url = checked_url(&format!("{api}{path}"), "官方版本接口地址", config)?;
    let response = client
        .get(url.clone())
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| network_error("获取官方版本信息", error))?;
    if !response.status().is_success() {
        return Err(AppError::new(
            code::ENGINE_DOWNLOAD_FAILED,
            format!("官方版本接口返回 HTTP {}", response.status().as_u16()),
        )
        .with_hint("请确认版本号存在，或稍后重试")
        .with_detail(format!("url: {url}")));
    }
    response
        .json::<ReleaseResponse>()
        .await
        .map_err(|error| network_error("解析官方版本信息", error))
}

async fn fetch_text(
    client: &reqwest::Client,
    config: &DownloadConfig,
    raw: &str,
    what: &str,
) -> AppResult<String> {
    let url = checked_url(raw, what, config)?;
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|error| network_error(what, error))?;
    if !response.status().is_success() {
        return Err(AppError::new(
            code::ENGINE_DOWNLOAD_FAILED,
            format!("{what}返回 HTTP {}", response.status().as_u16()),
        )
        .with_detail(format!("url: {url}")));
    }
    response
        .text()
        .await
        .map_err(|error| network_error(what, error))
}

/* -------------------------------------------------------------------------- */
/* Versions                                                                   */
/* -------------------------------------------------------------------------- */

fn version_charset_ok(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
}

/// Validates a user-supplied version and returns the release tag (`v0.7.0`).
/// Deliberately strict: it must not be possible to smuggle a path separator or
/// a host into the request.
pub fn normalize_requested_version(input: &str) -> AppResult<String> {
    let trimmed = input.trim();
    let stripped = trimmed.strip_prefix('v').unwrap_or(trimmed);
    if !version_charset_ok(stripped) || !stripped.starts_with(|c: char| c.is_ascii_digit()) {
        return Err(
            AppError::new(code::ENGINE_DOWNLOAD_FAILED, "版本号格式无效")
                .with_hint("请使用形如 0.7.0 的官方版本号")
                .with_detail(format!("rejected version: {trimmed}")),
        );
    }
    Ok(format!("v{stripped}"))
}

/// Turns the tag reported by the release feed into the version used for the
/// install directory and the asset name (no leading `v`).
fn version_from_tag(tag: &str) -> AppResult<String> {
    let trimmed = tag.trim();
    let stripped = trimmed.strip_prefix('v').unwrap_or(trimmed);
    if !version_charset_ok(stripped) {
        return Err(
            AppError::new(code::ENGINE_DOWNLOAD_FAILED, "官方版本号格式异常")
                .with_detail(format!("tag: {tag}")),
        );
    }
    Ok(stripped.to_string())
}

/* -------------------------------------------------------------------------- */
/* Archive extraction                                                         */
/* -------------------------------------------------------------------------- */

/// Rejects absolute paths, drive prefixes and `..` so an archive cannot write
/// outside the extraction directory.
fn safe_relative_path(path: &Path) -> AppResult<PathBuf> {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::new(
                    code::PATH_TRAVERSAL,
                    "压缩包中包含不安全的路径条目，已拒绝解压",
                )
                .with_detail(format!("rejected entry: {}", path.display())));
            }
        }
    }
    if out.as_os_str().is_empty() {
        return Err(
            AppError::new(code::PATH_TRAVERSAL, "压缩包中包含空的路径条目，已拒绝解压")
                .with_detail("rejected entry: <empty>"),
        );
    }
    Ok(out)
}

fn extraction_error(what: &str, error: impl std::fmt::Display) -> AppError {
    AppError::new(code::ENGINE_DOWNLOAD_FAILED, format!("解压 {what} 失败"))
        .with_hint("请重新下载；若持续失败，请到官方 Releases 页面手动下载")
        .with_detail(error.to_string())
}

fn extract_archive(platform: Platform, archive: &Path, dest: &Path) -> AppResult<()> {
    match platform {
        Platform::Windows => extract_zip(archive, dest),
        _ => extract_tar_gz(archive, dest),
    }
}

fn extract_tar_gz(archive: &Path, dest: &Path) -> AppResult<()> {
    let file = std::fs::File::open(archive)?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(decoder);
    for entry in tar.entries().map_err(|e| extraction_error("tar.gz", e))? {
        let mut entry = entry.map_err(|e| extraction_error("tar.gz", e))?;
        let entry_type = entry.header().entry_type();
        // Only regular files and directories are materialised; links and device
        // nodes are dropped rather than recreated.
        if !entry_type.is_file() && !entry_type.is_dir() {
            continue;
        }
        let raw = entry
            .path()
            .map_err(|e| extraction_error("tar.gz", e))?
            .into_owned();
        let relative = safe_relative_path(&raw)?;
        let out = dest.join(relative);
        if entry_type.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut writer = std::fs::File::create(&out)?;
        std::io::copy(&mut entry, &mut writer)?;
    }
    Ok(())
}

fn extract_zip(archive: &Path, dest: &Path) -> AppResult<()> {
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| extraction_error("zip", e))?;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|e| extraction_error("zip", e))?;
        let relative = safe_relative_path(Path::new(entry.name()))?;
        let out = dest.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut writer = std::fs::File::create(&out)?;
        std::io::copy(&mut entry, &mut writer)?;
    }
    Ok(())
}

/// Finds the shallowest entry named `name` anywhere in the extracted tree.
fn find_binary(root: &Path, name: &str) -> AppResult<PathBuf> {
    let mut best: Option<(usize, PathBuf)> = None;
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.is_dir() {
                stack.push((path, depth + 1));
            } else if path.file_name().and_then(|value| value.to_str()) == Some(name)
                && best.as_ref().is_none_or(|(found, _)| depth < *found)
            {
                best = Some((depth, path));
            }
        }
    }
    best.map(|(_, path)| path).ok_or_else(|| {
        AppError::new(
            code::ENGINE_DOWNLOAD_FAILED,
            format!("解压后的压缩包中未找到 {name} 可执行文件"),
        )
        .with_hint("官方发布内容可能已变更，请在官方 Releases 页面手动下载")
    })
}

/// Removes the partial download and the scratch extraction directory on every
/// exit path, including early returns.
struct Scratch {
    file: PathBuf,
    dir: PathBuf,
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.file);
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/* -------------------------------------------------------------------------- */
/* Public entry points                                                        */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone)]
pub struct InstalledEngine {
    /// Version without the leading `v`.
    pub version: String,
    pub path: PathBuf,
}

/// Describes what (if anything) could be installed here, without downloading.
/// Never fails: network problems are reported through `reason`.
pub async fn download_info(config: &DownloadConfig, target: &Target) -> EngineDownloadInfo {
    let platform = target.platform.as_str().to_string();
    let arch = target.arch.clone();
    let unsupported = |reason: String| EngineDownloadInfo {
        supported: false,
        platform: platform.clone(),
        arch: arch.clone(),
        version: None,
        asset_name: None,
        reason: Some(reason),
    };

    if target.platform.asset_os().is_none() || target.asset_arch().is_none() {
        return unsupported(unsupported_reason(target));
    }

    let client = match build_client(config) {
        Ok(client) => client,
        Err(error) => return unsupported(error.message),
    };
    let release = match fetch_release(&client, config, None).await {
        Ok(release) => release,
        Err(error) => {
            return EngineDownloadInfo {
                supported: true,
                platform,
                arch,
                version: None,
                asset_name: None,
                reason: Some(format!("无法获取官方版本信息：{}", error.message)),
            }
        }
    };

    let Ok(version) = version_from_tag(&release.tag_name) else {
        return EngineDownloadInfo {
            supported: true,
            platform,
            arch,
            version: None,
            asset_name: None,
            reason: Some("官方最新版本号格式异常，无法自动下载".to_string()),
        };
    };
    let name = asset_name(target, &version);
    let published = name
        .as_ref()
        .is_some_and(|name| release.assets.iter().any(|asset| &asset.name == name));
    EngineDownloadInfo {
        supported: true,
        platform,
        arch,
        version: Some(version),
        asset_name: if published { name } else { None },
        reason: if published {
            None
        } else {
            Some("官方最新版本未提供适配当前平台的产物，请稍后重试或手动安装".to_string())
        },
    }
}

/// Full pipeline: resolve the release -> fetch `checksums.txt` -> stream the
/// asset to a temporary file (reporting real byte counts) -> verify SHA256 ->
/// unpack -> install `<install_root>/<version>/tailcat`.
pub async fn download_into<F>(
    config: &DownloadConfig,
    target: &Target,
    requested: Option<&str>,
    install_root: &Path,
    on_progress: F,
) -> AppResult<InstalledEngine>
where
    F: Fn(EngineDownloadProgress) + Send + Sync,
{
    let progress = |phase: EngineDownloadPhase,
                    downloaded: u64,
                    total: Option<u64>,
                    version: Option<&str>,
                    message: Option<String>| {
        on_progress(EngineDownloadProgress {
            phase,
            downloaded,
            total,
            version: version.map(str::to_string),
            message,
        });
    };

    if target.platform.asset_os().is_none() || target.asset_arch().is_none() {
        return Err(unsupported_error(target));
    }

    progress(
        EngineDownloadPhase::Checking,
        0,
        None,
        None,
        Some("正在获取官方版本信息".to_string()),
    );

    let tag = match requested.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => Some(normalize_requested_version(value)?),
        None => None,
    };
    let client = build_client(config)?;
    let release = fetch_release(&client, config, tag.as_deref()).await?;
    let version = version_from_tag(&release.tag_name)?;
    let asset_name = asset_name(target, &version).ok_or_else(|| unsupported_error(target))?;

    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| {
            AppError::new(
                code::ENGINE_DOWNLOAD_FAILED,
                format!(
                    "官方 {} 未提供适配当前平台的产物（{asset_name}）",
                    release.tag_name
                ),
            )
            .with_hint("请改用其他版本，或在「设置 → 引擎」中手动指定 tailcat 路径")
            .with_detail(format!(
                "platform: {}, arch: {}",
                target.platform.as_str(),
                target.arch
            ))
        })?;
    let asset_url = checked_url(&asset.browser_download_url, "官方下载地址", config)?;

    // Checksums come from the same release, over the same host allowlist.
    let checksums_url = format!(
        "{}/{RELEASE_REPO}/releases/download/{}/checksums.txt",
        config.download_base.trim_end_matches('/'),
        release.tag_name
    );
    let checksums = fetch_text(&client, config, &checksums_url, "官方校验和文件").await?;
    let expected = parse_checksums(&checksums)
        .remove(&asset_name)
        .ok_or_else(|| {
            AppError::new(
                code::ENGINE_DOWNLOAD_FAILED,
                format!("官方 checksums.txt 中未找到 {asset_name} 的校验和"),
            )
            .with_hint("为避免安装未经校验的文件，本应用不会跳过校验；请稍后重试或手动安装")
            .with_detail(format!("checksums url: {checksums_url}"))
        })?;

    std::fs::create_dir_all(install_root)?;
    let scratch = Scratch {
        file: install_root.join(format!("{version}.part")),
        dir: install_root.join(format!(".{version}.extract")),
    };
    let _ = std::fs::remove_file(&scratch.file);
    let _ = std::fs::remove_dir_all(&scratch.dir);

    let response = client
        .get(asset_url.clone())
        .send()
        .await
        .map_err(|error| network_error("下载 tailcat", error))?;
    if !response.status().is_success() {
        return Err(AppError::new(
            code::ENGINE_DOWNLOAD_FAILED,
            format!("下载 tailcat 失败：HTTP {}", response.status().as_u16()),
        )
        .with_hint("请稍后重试，或到官方 Releases 页面手动下载")
        .with_detail(format!("url: {asset_url}")));
    }
    let total = response.content_length();
    progress(
        EngineDownloadPhase::Downloading,
        0,
        total,
        Some(&version),
        Some(format!("正在下载 {asset_name}")),
    );

    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(&scratch.file).await?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| network_error("下载 tailcat", error))?;
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        progress(
            EngineDownloadPhase::Downloading,
            downloaded,
            total,
            Some(&version),
            None,
        );
    }
    file.flush().await?;
    drop(file);

    progress(
        EngineDownloadPhase::Verifying,
        downloaded,
        total,
        Some(&version),
        Some("正在校验 SHA256".to_string()),
    );
    let actual = hex_lower(&hasher.finalize());
    if let Err(error) = verify_checksum(&expected, &actual, &asset_name) {
        // `scratch` deletes the partial file as it drops here.
        progress(
            EngineDownloadPhase::Error,
            downloaded,
            total,
            Some(&version),
            Some(error.message.clone()),
        );
        return Err(error);
    }

    progress(
        EngineDownloadPhase::Extracting,
        downloaded,
        total,
        Some(&version),
        Some("正在解压".to_string()),
    );
    std::fs::create_dir_all(&scratch.dir)?;
    extract_archive(target.platform, &scratch.file, &scratch.dir)?;
    let staged = find_binary(&scratch.dir, target.platform.binary_name())?;

    progress(
        EngineDownloadPhase::Installing,
        downloaded,
        total,
        Some(&version),
        Some("正在安装".to_string()),
    );
    let version_dir = install_root.join(&version);
    if version_dir.exists() {
        std::fs::remove_dir_all(&version_dir)?;
    }
    std::fs::create_dir_all(&version_dir)?;
    let installed = version_dir.join(target.platform.binary_name());
    if std::fs::rename(&staged, &installed).is_err() {
        std::fs::copy(&staged, &installed)?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&installed, std::fs::Permissions::from_mode(0o755))?;
    }

    progress(
        EngineDownloadPhase::Done,
        downloaded,
        total,
        Some(&version),
        Some(format!("tailcat {version} 已安装")),
    );
    Ok(InstalledEngine {
        version,
        path: installed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(platform: Platform, arch: &str) -> Target {
        Target {
            platform,
            arch: arch.to_string(),
        }
    }

    #[test]
    fn asset_names_follow_the_official_convention() {
        assert_eq!(
            asset_name(&target(Platform::Linux, "x86_64"), "0.7.0").as_deref(),
            Some("tailcat_0.7.0_linux_amd64.tar.gz")
        );
        assert_eq!(
            asset_name(&target(Platform::Linux, "aarch64"), "0.7.0").as_deref(),
            Some("tailcat_0.7.0_linux_arm64.tar.gz")
        );
        assert_eq!(
            asset_name(&target(Platform::Linux, "armv7"), "0.7.0").as_deref(),
            Some("tailcat_0.7.0_linux_armv7.tar.gz")
        );
        assert_eq!(
            asset_name(&target(Platform::Windows, "x86_64"), "0.7.0").as_deref(),
            Some("tailcat_0.7.0_windows_amd64.zip")
        );
        assert_eq!(
            asset_name(&target(Platform::Windows, "aarch64"), "0.7.0").as_deref(),
            Some("tailcat_0.7.0_windows_arm64.zip")
        );
    }

    #[test]
    fn macos_and_unknown_targets_have_no_asset() {
        assert!(asset_name(&target(Platform::Macos, "aarch64"), "0.7.0").is_none());
        assert!(asset_name(&target(Platform::Other, "x86_64"), "0.7.0").is_none());
        assert!(asset_name(&target(Platform::Linux, "riscv64"), "0.7.0").is_none());
        assert!(asset_name(&target(Platform::Linux, "x86"), "0.7.0").is_none());

        let reason = unsupported_reason(&target(Platform::Macos, "aarch64"));
        assert!(
            reason.contains("brew install tailcat"),
            "macOS reason must point at Homebrew: {reason}"
        );
        let error = unsupported_error(&target(Platform::Macos, "aarch64"));
        assert_eq!(error.code, code::ENGINE_UNSUPPORTED_PLATFORM);
    }

    #[test]
    fn arch_names_are_normalised_for_assets() {
        assert_eq!(
            target(Platform::Linux, "x86_64").asset_arch(),
            Some("amd64")
        );
        assert_eq!(
            target(Platform::Linux, "aarch64").asset_arch(),
            Some("arm64")
        );
        assert_eq!(target(Platform::Linux, "armv7").asset_arch(), Some("armv7"));
        assert_eq!(target(Platform::Linux, "x86").asset_arch(), None);
        assert_eq!(target(Platform::Linux, "riscv64").asset_arch(), None);
        // Whatever this host reports, it must round-trip through the mapping.
        let detected = Target::detect();
        assert_eq!(detected.arch, detect_arch());
        assert_eq!(detected.platform, Platform::detect());
    }

    #[test]
    fn checksums_parse_and_skip_malformed_lines() {
        let good = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        let other = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let text = format!(
            "# generated by release tooling\n\
             \n\
             {good}  tailcat_0.7.0_linux_amd64.tar.gz\n\
             {other} *tailcat_0.7.0_windows_amd64.zip\n\
             not-a-hash  tailcat_0.7.0_linux_arm64.tar.gz\n\
             deadbeef  tailcat_0.7.0_linux_armv7.tar.gz\n\
             {good}\n\
             {good}  \n\
             {good}\n"
        );
        let parsed = parse_checksums(&text);
        assert_eq!(parsed.len(), 2, "only the two well-formed lines count");
        assert_eq!(
            parsed
                .get("tailcat_0.7.0_linux_amd64.tar.gz")
                .map(String::as_str),
            Some(good)
        );
        assert_eq!(
            parsed
                .get("tailcat_0.7.0_windows_amd64.zip")
                .map(String::as_str),
            Some(other)
        );
        assert!(!parsed.contains_key("tailcat_0.7.0_linux_arm64.tar.gz"));
        assert!(!parsed.contains_key("tailcat_0.7.0_linux_armv7.tar.gz"));
        assert!(parse_checksums("").is_empty());
    }

    #[test]
    fn checksums_are_normalised_to_lowercase() {
        let upper = "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD";
        let parsed = parse_checksums(&format!("{upper}  tailcat_0.7.0_linux_amd64.tar.gz"));
        assert_eq!(
            parsed
                .get("tailcat_0.7.0_linux_amd64.tar.gz")
                .map(String::as_str),
            Some(upper.to_ascii_lowercase().as_str())
        );
    }

    #[test]
    fn sha256_matches_known_vectors() {
        // FIPS 180-2 / NIST test vectors.
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_hex(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }

    #[test]
    fn checksum_verification_reports_both_digests() {
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        let actual = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        assert!(verify_checksum(expected, expected, "asset.tar.gz").is_ok());
        assert!(verify_checksum(&expected.to_uppercase(), expected, "asset.tar.gz").is_ok());

        let error = verify_checksum(expected, actual, "asset.tar.gz").expect_err("must fail");
        assert_eq!(error.code, code::ENGINE_CHECKSUM_MISMATCH);
        assert!(error.message.contains("asset.tar.gz"));
        assert!(
            error.message.contains(expected) && error.message.contains(actual),
            "the user-facing message must carry both digests: {}",
            error.message
        );
        let detail = error.detail.unwrap_or_default();
        assert!(
            detail.contains(expected),
            "detail must carry the expected digest: {detail}"
        );
        assert!(
            detail.contains(actual),
            "detail must carry the actual digest: {detail}"
        );
    }

    #[test]
    fn versions_are_strictly_validated() {
        assert_eq!(normalize_requested_version("0.7.0").unwrap(), "v0.7.0");
        assert_eq!(normalize_requested_version("v0.7.0").unwrap(), "v0.7.0");
        assert_eq!(
            normalize_requested_version(" 1.2.3-rc1 ").unwrap(),
            "v1.2.3-rc1"
        );
        for hostile in [
            "",
            "v",
            "../evil",
            "0.7.0/../../etc",
            "https://evil.test",
            "0.7.0 extra",
            "v0.7.0\nx",
        ] {
            assert!(
                normalize_requested_version(hostile).is_err(),
                "{hostile:?} must be rejected"
            );
        }
        assert_eq!(version_from_tag("v0.7.0").unwrap(), "0.7.0");
        assert_eq!(version_from_tag("0.7.0").unwrap(), "0.7.0");
        assert!(version_from_tag("v0.7.0/../x").is_err());
        assert!(version_from_tag("v").is_err());
    }

    #[test]
    fn url_allowlist_covers_official_hosts_only() {
        let hosts: Vec<String> = OFFICIAL_HOSTS.iter().map(|host| host.to_string()).collect();
        for raw in [
            "https://github.com/tailscale/tailcat/releases/download/v0.7.0/checksums.txt",
            "https://objects.githubusercontent.com/github-production-release-asset/x",
            "https://release-assets.githubusercontent.com/github-production/x",
            "https://api.github.com/repos/tailscale/tailcat/releases/latest",
        ] {
            assert!(
                is_allowed_url(&Url::parse(raw).unwrap(), &hosts, true),
                "{raw} should be allowed"
            );
        }
        for raw in [
            "http://github.com/tailscale/tailcat",
            "https://evil.test/tailcat",
            "https://github.com.evil.test/tailcat",
            "https://raw.githubusercontent.com/tailscale/tailcat/main/x",
            "file:///etc/passwd",
        ] {
            assert!(
                !is_allowed_url(&Url::parse(raw).unwrap(), &hosts, true),
                "{raw} must be rejected"
            );
        }
        // The offline integration test injects a local http origin.
        let local = vec!["127.0.0.1".to_string()];
        assert!(is_allowed_url(
            &Url::parse("http://127.0.0.1:8080/x").unwrap(),
            &local,
            false
        ));
        assert!(!is_allowed_url(
            &Url::parse("http://127.0.0.1:8080/x").unwrap(),
            &local,
            true
        ));
    }

    #[test]
    fn archive_paths_are_confined() {
        assert_eq!(
            safe_relative_path(Path::new("tailcat")).unwrap(),
            PathBuf::from("tailcat")
        );
        assert_eq!(
            safe_relative_path(Path::new("./dir/./tailcat")).unwrap(),
            PathBuf::from("dir/tailcat")
        );
        for hostile in ["../evil", "/etc/passwd", "dir/../../evil", "..", ""] {
            let error = safe_relative_path(Path::new(hostile)).expect_err(hostile);
            assert_eq!(
                error.code,
                code::PATH_TRAVERSAL,
                "{hostile} must be rejected"
            );
        }
    }
}
