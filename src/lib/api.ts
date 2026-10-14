import { call, subscribe } from "./ipc";
import { normalizeError } from "./errors";
import type {
  EngineDownloadInfo,
  EngineDownloadProgress,
  EngineStatus,
  HistoryEntry,
  KeyCreateRequest,
  KeyCreateResult,
  LocalEntry,
  LogEvent,
  ParsedAddress,
  PingResult,
  RemoteListing,
  RemovedEvent,
  SavedKey,
  Settings,
  SystemInfo,
  TaskEvent,
  TaskInfo,
  TaskLogPage,
  TaskRequest,
} from "./types";
import { EVENTS } from "./types";

/**
 * Typed facade over the IPC transport. UI code imports this module and never
 * touches `invoke` directly, so the command surface stays discoverable and
 * every failure arrives as a normalised `UserFacingError`.
 */
async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await call<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

export const api = {
  /* --- system ----------------------------------------------------------- */
  systemInfo: () => invoke<SystemInfo>("system_info"),
  openUrl: (url: string) => invoke<void>("system_open_url", { url }),
  openPath: (path: string) => invoke<void>("system_open_path", { path }),
  revealPath: (path: string) => invoke<void>("system_reveal", { path }),
  quit: (force = false) => invoke<void>("app_quit", { force }),

  /* --- engine ----------------------------------------------------------- */
  engineStatus: () => invoke<EngineStatus>("engine_status"),
  engineDetect: (path?: string | null) =>
    invoke<EngineStatus>("engine_detect", { path: path ?? null }),
  engineSetPath: (path: string | null) =>
    invoke<EngineStatus>("engine_set_path", { path }),
  engineSetDerpMap: (url: string | null) =>
    invoke<EngineStatus>("engine_set_derpmap", { url }),
  /** What the official release feed offers here; never rejects. */
  engineDownloadInfo: () =>
    invoke<EngineDownloadInfo>("engine_download_info"),
  /**
   * Downloads, verifies and installs the official binary and returns the
   * refreshed engine status. Watch `onEngineDownload` for progress.
   */
  engineDownload: (version?: string | null) =>
    invoke<EngineStatus>("engine_download", { version: version ?? null }),
  engineKeys: () => invoke<SavedKey[]>("engine_keys_list"),
  engineCreateKey: (request: KeyCreateRequest) =>
    invoke<KeyCreateResult>("engine_create_key", { request }),
  engineDeleteKey: (name: string) =>
    invoke<void>("engine_delete_key", { name }),
  engineRegions: () => invoke<string[]>("engine_regions"),
  engineParse: (address: string) =>
    invoke<ParsedAddress>("engine_parse", { address }),
  engineResolve: (address: string) =>
    invoke<string>("engine_resolve", { address }),
  enginePing: (address: string, untilDirect = false, timeoutSec = 10) =>
    invoke<PingResult>("engine_ping", { address, untilDirect, timeoutSec }),

  /* --- tasks ------------------------------------------------------------ */
  tasks: () => invoke<TaskInfo[]>("task_list"),
  task: (id: string) => invoke<TaskInfo | null>("task_get", { id }),
  taskLogs: (id: string, sinceSeq = 0, limit = 500) =>
    invoke<TaskLogPage>("task_logs", { id, sinceSeq, limit }),
  startTask: (request: TaskRequest) =>
    invoke<TaskInfo>("task_start", { request }),
  stopTask: (id: string) => invoke<TaskInfo>("task_stop", { id }),
  removeTask: (id: string) => invoke<void>("task_remove", { id }),
  stopAllTasks: () => invoke<TaskInfo[]>("task_stop_all"),

  /* --- files ------------------------------------------------------------ */
  listLocalDir: (path: string) => invoke<LocalEntry[]>("fs_list_dir", { path }),
  homeDir: () => invoke<string>("fs_home_dir"),
  listRemote: (address: string, path = "") =>
    invoke<RemoteListing>("remote_list", { address, path }),

  /* --- settings & history ----------------------------------------------- */
  settings: () => invoke<Settings>("settings_get"),
  updateSettings: (patch: Partial<Settings>) =>
    invoke<Settings>("settings_update", { patch }),
  resetSettings: () => invoke<Settings>("settings_reset"),
  exportSettings: (path: string) => invoke<void>("settings_export", { path }),
  importSettings: (path: string) => invoke<Settings>("settings_import", { path }),
  history: () => invoke<HistoryEntry[]>("history_list"),
  renameHistory: (id: string, note: string | null) =>
    invoke<HistoryEntry[]>("history_rename", { id, note }),
  removeHistory: (id: string) => invoke<HistoryEntry[]>("history_remove", { id }),
  clearHistory: () => invoke<HistoryEntry[]>("history_clear"),

  /* --- events ----------------------------------------------------------- */
  onTaskUpdated: (handler: (event: TaskEvent) => void) =>
    subscribe<TaskEvent>(EVENTS.taskUpdated, handler),
  onTaskLog: (handler: (event: LogEvent) => void) =>
    subscribe<LogEvent>(EVENTS.taskLog, handler),
  onTaskRemoved: (handler: (event: RemovedEvent) => void) =>
    subscribe<RemovedEvent>(EVENTS.taskRemoved, handler),
  onEngineChanged: (handler: (status: EngineStatus) => void) =>
    subscribe<EngineStatus>(EVENTS.engineChanged, handler),
  onEngineDownload: (handler: (progress: EngineDownloadProgress) => void) =>
    subscribe<EngineDownloadProgress>(EVENTS.engineDownload, handler),
  onSettingsChanged: (handler: (settings: Settings) => void) =>
    subscribe<Settings>(EVENTS.settingsChanged, handler),
  /**
   * Rust emits `{ "running": <count> }` alongside the quit request; the count
   * is the authoritative number of tasks the close would have interrupted.
   * Rust is the only emitter, so the payload is required rather than guessed
   * from whatever the frontend happens to have tracked.
   */
  onQuitRequested: (handler: (payload: { running: number }) => void) =>
    subscribe<{ running: number }>(EVENTS.quitRequested, handler),
};

export type Api = typeof api;
