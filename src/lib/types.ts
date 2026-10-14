/**
 * Shared IPC contract between the React frontend and the Rust/Tauri backend.
 *
 * This file is the single source of truth for every payload crossing the
 * boundary. Rust mirrors these shapes in `src-tauri/src/model.rs`; when one
 * side changes, the other must change in the same commit.
 */

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export const ERROR_CODES = [
  "ENGINE_NOT_FOUND",
  "ENGINE_UNUSABLE",
  "ENGINE_VERSION_FAILED",
  "ENGINE_UNSUPPORTED_PLATFORM",
  "ENGINE_DOWNLOAD_FAILED",
  "ENGINE_CHECKSUM_MISMATCH",
  "ADDRESS_INVALID",
  "ADDRESS_UNRESOLVED",
  "PORT_IN_USE",
  "PORT_INVALID",
  "PATH_NOT_ALLOWED",
  "PATH_NOT_FOUND",
  "PATH_TRAVERSAL",
  "PERMISSION_DENIED",
  "DISK_FULL",
  "NETWORK_ERROR",
  "DERP_UNREACHABLE",
  "CONNECT_FAILED",
  "PROCESS_FAILED",
  "TASK_NOT_FOUND",
  "TASK_NOT_RUNNING",
  "TASK_ALREADY_RUNNING",
  "UNSUPPORTED",
  "CANCELLED",
  "CONFIG_ERROR",
  "IO_ERROR",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Every backend failure is normalised into this shape before it reaches the UI. */
export interface UserFacingError {
  code: ErrorCode;
  /** Short, already-localised-by-backend-neutral sentence for the UI. */
  message: string;
  /** Optional actionable next step ("安装 tailcat" / "换一个端口"). */
  hint: string | null;
  /** Raw diagnostic text. Never rendered by default; copied on demand. */
  detail: string | null;
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

export type EngineSource = "bundled" | "path" | "custom" | "missing";

export interface EngineStatus {
  found: boolean;
  source: EngineSource;
  /** Absolute path of the resolved `tailcat` binary, or null when missing. */
  path: string | null;
  /** Version reported by `tailcat version`, e.g. "0.4.0". */
  version: string | null;
  /** Custom path configured in settings, if any. */
  configuredPath: string | null;
  /** Directory the CLI uses for saved keys (`$CONFIG/tailcat/keys`). */
  keysDir: string | null;
  /** Saved server key names reported by `tailcat genkey --list`. */
  savedKeys: string[];
  /** True when the magic `default` server key exists. */
  hasDefaultKey: boolean;
  /** True when the magic `client-default` identity key exists. */
  hasClientKey: boolean;
  /** Effective DERP map URL (`--derpmap-url`), null means the built-in default. */
  derpMapUrl: string | null;
  error: UserFacingError | null;
}

export interface SavedKey {
  name: string;
  client: boolean;
  isDefault: boolean;
  path: string | null;
}

export interface KeyCreateRequest {
  name: string;
  client: boolean;
  region: string | null;
  fixedRegion: boolean;
  embedDerpMap: boolean;
  force: boolean;
}

/** Result of `tailcat genkey`: a token for servers, a public key for clients. */
export interface KeyCreateResult {
  name: string;
  client: boolean;
  /** `tc...` address blob (server keys only). */
  address: string | null;
  /** `nodekey:...` public key (client keys only). */
  publicKey: string | null;
  /** Path the private key was written to, when the CLI reported it. */
  path: string | null;
}

export interface ParsedAddress {
  /** Raw input the user supplied. */
  input: string;
  /** `tc...` connection token, when the input was one. */
  blob: string | null;
  /** DNS name used instead of a token, when the input was one. */
  dnsName: string | null;
  serverPublicKey: string | null;
  regionId: number | null;
  regionHosts: string[];
  /** True when the token embeds full DERP node metadata. */
  selfContained: boolean;
}

export interface PingResult {
  ok: boolean;
  direct: boolean;
  pongs: { rttMs: number; via: string; direct: boolean }[];
  error: UserFacingError | null;
}

/**
 * What the official release feed offers for this machine, as reported by
 * `engine_download_info`. That command never fails: when the feed cannot be
 * reached, `version` and `assetName` are null and `reason` explains why.
 */
export interface EngineDownloadInfo {
  /** False when upstream publishes no binary for this platform/architecture. */
  supported: boolean;
  /** "macos" | "linux" | "windows" (or "unknown" on an unlisted OS). */
  platform: string;
  /** "x86_64" | "aarch64" | "armv7" | other. */
  arch: string;
  /** Latest official version without a leading "v"; null when unknown. */
  version: string | null;
  /** Asset file name, e.g. `tailcat_0.7.0_linux_amd64.tar.gz`. */
  assetName: string | null;
  /**
   * Chinese explanation plus the manual fallback. Set when the platform is
   * unsupported (macOS points at Homebrew) and when the release feed could not
   * be read or has no matching asset.
   */
  reason: string | null;
}

export type EngineDownloadPhase =
  | "checking"
  | "downloading"
  | "verifying"
  | "extracting"
  | "installing"
  | "done"
  | "error";

/**
 * Payload of the `tailcat://engine-download` event. `downloaded` is the real
 * number of bytes written to disk so far; the backend never estimates it.
 */
export interface EngineDownloadProgress {
  phase: EngineDownloadPhase;
  /** Bytes written so far. */
  downloaded: number;
  /** Total asset size from `Content-Length`; null when the server omits it. */
  total: number | null;
  version: string | null;
  /** Chinese, user-facing note; carries the reason on failure. */
  message: string | null;
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export type TaskKind =
  | "serve"
  | "forward"
  | "service"
  | "recv"
  | "share"
  | "send"
  | "ssh";

export type TaskStatus =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

/** Extra, kind-specific facts surfaced in task detail views. */
export type TaskDetailValue = string | number | boolean | null;

export interface TaskInfo {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  /** User-facing label, e.g. "端口转发 127.0.0.1:3306". */
  label: string;
  /** Process id while running; null after exit. */
  pid: number | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  /** argv actually executed, with credential-bearing arguments redacted. */
  argsSummary: string[];
  /** Connection token, when the task owns one. Sensitive: hidden by default. */
  address: string | null;
  /** Local listen address (`127.0.0.1:8080`) when the task listens locally. */
  listenAddr: string | null;
  detail: Record<string, TaskDetailValue>;
  exitCode: number | null;
  exitSignal: string | null;
  error: UserFacingError | null;
}

export type LogStream = "stdout" | "stderr" | "app";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogLine {
  seq: number;
  ts: string;
  stream: LogStream;
  level: LogLevel;
  /** Already redacted of credentials by the backend. */
  text: string;
}

export interface TaskLogPage {
  lines: LogLine[];
  /** Pass back as `sinceSeq` to fetch only newer lines. */
  nextSeq: number;
}

export interface ServeRequest {
  kind: "serve";
  label?: string;
  /** Ports / ranges / service names, e.g. ["8080", "8000-8010", "files"]. */
  targets: string[];
  /** Directory for the `files` service (and its `--files` suffix mode). */
  filesDir?: string | null;
  /**
   * `--files` access mode. tailcat v0.7.0 adds `wo+` (recursive write-only
   * drop box); the Rust side mirrors this in `model.rs::FilesMode`.
   */
  filesMode?: "ro" | "rw" | "wo" | "wo+";
  /** `--key`; "new" forces an ephemeral key, a name uses a saved key. */
  keyName?: string | null;
  /** `--allow` list; empty array means "allow everyone". */
  allow?: string[];
  /** `--full-address` (embed DERP node info in the token). */
  fullAddress?: boolean;
}

export interface ForwardRequest {
  kind: "forward";
  label?: string;
  /** Remote token or DNS name of the tailcat server. */
  address: string;
  /** Port served by the remote `tailcat serve` for this mapping. */
  remotePort: number;
  /** Local listener; 0 requests an OS-assigned port. */
  localPort: number;
  /** Bind address; defaults to 127.0.0.1 unless the user opts into exposure. */
  bindHost: string;
  keyName?: string | null;
}

export interface ServiceRequest {
  kind: "service";
  label?: string;
  address: string;
  remotePort: number;
  localPort: number;
  bindHost: string;
  /** Suggested URL scheme for the "open in browser" affordance. */
  scheme: "http" | "https";
  keyName?: string | null;
}

export interface RecvRequest {
  kind: "recv";
  label?: string;
  /** Directory that receives the dropped files. */
  dir: string;
  keyName?: string | null;
}

export interface ShareRequest {
  kind: "share";
  label?: string;
  dir: string;
  /** Same four modes as `ServeRequest.filesMode` (tailcat v0.7.0). */
  mode: "ro" | "rw" | "wo" | "wo+";
  keyName?: string | null;
  fullAddress?: boolean;
}

export interface SendRequest {
  kind: "send";
  label?: string;
  /** Local paths (files or directories with `recursive`). */
  sources: string[];
  /** Remote token or DNS name. */
  address: string;
  /** Remote path; "" means the served root / home directory. */
  remotePath: string;
  recursive: boolean;
  preserveTimes: boolean;
  keyName?: string | null;
}

export interface SshRequest {
  kind: "ssh";
  label?: string;
  address: string;
  user?: string | null;
  port?: number | null;
  command?: string | null;
}

export type TaskRequest =
  | ServeRequest
  | ForwardRequest
  | ServiceRequest
  | RecvRequest
  | ShareRequest
  | SendRequest
  | SshRequest;

export interface TaskEvent {
  task: TaskInfo;
}

export interface LogEvent {
  id: string;
  line: LogLine;
}

export interface RemovedEvent {
  id: string;
}

/* -------------------------------------------------------------------------- */
/* Files                                                                      */
/* -------------------------------------------------------------------------- */

export interface LocalEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
  modified: string | null;
}

export interface RemoteEntry {
  name: string;
  size: number | null;
  mode: string | null;
  modified: string | null;
  isDir: boolean;
}

export interface RemoteListing {
  path: string;
  entries: RemoteEntry[];
}

/* -------------------------------------------------------------------------- */
/* Settings & history                                                         */
/* -------------------------------------------------------------------------- */

export type ThemeMode = "light" | "dark" | "system";
export type LanguageCode = "zh-CN" | "en";
export type LogLevelName = "error" | "warn" | "info" | "debug";

export interface Settings {
  version: number;
  theme: ThemeMode;
  language: LanguageCode;
  /** Explicit path to a `tailcat` binary; null means auto-detect. */
  tailcatPath: string | null;
  /** Prefer a binary shipped next to the app over one found on PATH. */
  preferBundled: boolean;
  /** Custom DERP map URL passed as `--derpmap-url`. */
  derpMapUrl: string | null;
  /** Screen shown when the app starts. */
  startScreen: "home" | "last";
  logLevel: LogLevelName;
  logDir: string | null;
  /** Hide connection tokens in the UI until revealed. */
  redactAddresses: boolean;
  /** Ask before quitting while tasks are running. */
  confirmOnQuit: boolean;
  /** Keep local listeners on loopback unless explicitly overridden. */
  allowNonLoopbackBind: boolean;
  /** Maximum log lines retained per task. */
  maxLogLines: number;
  /** Maximum recent-connection entries retained. */
  historyLimit: number;
}

export type HistoryKind = "serve" | "forward" | "service" | "share" | "send";

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  address: string;
  label: string;
  note: string | null;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
}

export interface SystemInfo {
  os: "macos" | "windows" | "linux" | "unknown";
  arch: string;
  appVersion: string;
  configDir: string;
  logDir: string;
  /** Path of a binary bundled with the app, when one was shipped. */
  bundledTailcatPath: string | null;
  /** True when running inside the Tauri shell rather than a browser preview. */
  native: boolean;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export const EVENTS = {
  taskUpdated: "tailcat://task-updated",
  taskLog: "tailcat://task-log",
  taskRemoved: "tailcat://task-removed",
  engineChanged: "tailcat://engine-changed",
  engineDownload: "tailcat://engine-download",
  settingsChanged: "tailcat://settings-changed",
  quitRequested: "tailcat://quit-requested",
} as const;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: "system",
  language: "zh-CN",
  tailcatPath: null,
  preferBundled: true,
  derpMapUrl: null,
  startScreen: "home",
  logLevel: "info",
  logDir: null,
  redactAddresses: true,
  confirmOnQuit: true,
  allowNonLoopbackBind: false,
  maxLogLines: 2000,
  historyLimit: 50,
};
