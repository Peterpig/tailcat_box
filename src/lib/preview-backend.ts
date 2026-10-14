/**
 * Browser preview backend (development only).
 *
 * It exists so the interface can be built and reviewed without launching the
 * Rust shell. It is NOT a simulation of the tailcat network: no tunnel is
 * created, no traffic flows, and the UI surfaces a persistent banner while it
 * is active. `SystemInfo.native` is false, which the shell uses to label the
 * whole session as a preview.
 */

import type {
  EngineDownloadInfo,
  EngineDownloadPhase,
  EngineDownloadProgress,
  EngineStatus,
  HistoryEntry,
  LogLine,
  Settings,
  SystemInfo,
  TaskInfo,
  TaskLogPage,
  TaskRequest,
} from "./types";
import { DEFAULT_SETTINGS, EVENTS } from "./types";
import { makeError } from "./errors";

type Handler = (payload: unknown) => void;

const handlers = new Map<string, Set<Handler>>();
const tasks = new Map<string, TaskInfo>();
const logs = new Map<string, LogLine[]>();
let settings: Settings = { ...DEFAULT_SETTINGS };
let history: HistoryEntry[] = [];

function emit(event: string, payload: unknown): void {
  handlers.get(event)?.forEach((handler) => handler(payload));
}

export function previewListen(event: string, handler: Handler): () => void {
  const set = handlers.get(event) ?? new Set<Handler>();
  set.add(handler);
  handlers.set(event, set);
  return () => set.delete(handler);
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function pushLog(id: string, text: string, stream: LogLine["stream"] = "app"): void {
  const list = logs.get(id) ?? [];
  const line: LogLine = {
    seq: list.length,
    ts: nowIso(),
    stream,
    level: stream === "stderr" ? "warn" : "info",
    text,
  };
  list.push(line);
  logs.set(id, list);
  emit(EVENTS.taskLog, { id, line });
}

function updateTask(id: string, patch: Partial<TaskInfo>): TaskInfo | null {
  const current = tasks.get(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  tasks.set(id, next);
  emit(EVENTS.taskUpdated, { task: next });
  return next;
}

function demoAddress(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let out = "tc";
  for (let i = 0; i < 60; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function startTask(request: TaskRequest): TaskInfo {
  const id = nextId("task");
  const task: TaskInfo = {
    id,
    kind: request.kind,
    status: "starting",
    label: request.label?.trim() || defaultLabel(request),
    pid: Math.floor(1000 + Math.random() * 60000),
    createdAt: nowIso(),
    startedAt: null,
    endedAt: null,
    argsSummary: ["tailcat", request.kind, "…（预览模式，未真实执行）"],
    address: null,
    listenAddr: null,
    detail: { preview: true },
    exitCode: null,
    exitSignal: null,
    error: null,
  };
  tasks.set(id, task);
  logs.set(id, []);
  emit(EVENTS.taskUpdated, { task });

  window.setTimeout(() => {
    const patch: Partial<TaskInfo> = {
      status: "running",
      startedAt: nowIso(),
    };
    if (request.kind === "serve" || request.kind === "recv" || request.kind === "share") {
      patch.address = demoAddress();
    }
    if (request.kind === "forward" || request.kind === "service") {
      const port = request.localPort || 41000 + Math.floor(Math.random() * 900);
      patch.listenAddr = `${request.bindHost}:${port}`;
      patch.detail = { ...task.detail, localPort: port };
    }
    updateTask(id, patch);
    pushLog(id, "预览模式：未连接本机 tailcat，此任务不会产生真实网络流量。", "stderr");
  }, 220);

  return tasks.get(id) as TaskInfo;
}

function defaultLabel(request: TaskRequest): string {
  switch (request.kind) {
    case "serve":
      return `监听服务 ${request.targets.join(",")}`;
    case "forward":
      return `端口转发 → :${request.remotePort}`;
    case "service":
      return `服务访问 :${request.remotePort}`;
    case "recv":
      return "文件接收";
    case "share":
      return "目录共享";
    case "send":
      return "文件发送";
    case "ssh":
      return "SSH 会话";
    default:
      return "任务";
  }
}

function previewEngine(): EngineStatus {
  return {
    found: false,
    source: "missing",
    path: null,
    version: null,
    configuredPath: null,
    keysDir: null,
    savedKeys: [],
    hasDefaultKey: false,
    hasClientKey: false,
    derpMapUrl: settings.derpMapUrl,
    error: makeError(
      "ENGINE_NOT_FOUND",
      "预览模式：浏览器环境无法访问本机 tailcat CLI",
      "请使用 `pnpm tauri:dev` 启动桌面应用以连接真实引擎",
      null,
    ),
  };
}

/** What the release feed offers in preview mode: a Linux desktop, latest v0.7.0. */
function previewDownloadInfo(): EngineDownloadInfo {
  return {
    supported: true,
    platform: "linux",
    arch: "x86_64",
    version: "0.7.0",
    assetName: "tailcat_0.7.0_linux_amd64.tar.gz",
    reason: null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Preview-only download: emits the same `tailcat://engine-download` phases the
 * Rust backend does, then reports a demo installation. No file is written.
 */
async function previewDownload(version: string | null): Promise<EngineStatus> {
  const resolved = version?.trim() || "0.7.0";
  const total = 12_400_000;
  const emitProgress = (progress: EngineDownloadProgress) =>
    emit(EVENTS.engineDownload, progress);

  emitProgress({
    phase: "checking",
    downloaded: 0,
    total: null,
    version: resolved,
    message: null,
  });
  await sleep(120);

  for (const fraction of [0.25, 0.6, 1]) {
    emitProgress({
      phase: "downloading",
      downloaded: Math.round(total * fraction),
      total,
      version: resolved,
      message: null,
    });
    await sleep(120);
  }

  const stages: EngineDownloadPhase[] = ["verifying", "extracting", "installing"];
  for (const phase of stages) {
    emitProgress({
      phase,
      downloaded: total,
      total,
      version: resolved,
      message: null,
    });
    await sleep(120);
  }

  emitProgress({
    phase: "done",
    downloaded: total,
    total,
    version: resolved,
    message: null,
  });

  const path = "(预览模式) /usr/local/bin/tailcat";
  return {
    ...previewEngine(),
    found: true,
    source: "custom",
    path,
    version: resolved,
    configuredPath: path,
    error: null,
  };
}

function previewSystemInfo(): SystemInfo {
  return {
    os: "unknown",
    arch: "unknown",
    appVersion: "0.1.0-preview",
    configDir: "(预览模式)",
    logDir: "(预览模式)",
    bundledTailcatPath: null,
    native: false,
  };
}

export async function previewInvoke(
  command: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  switch (command) {
    case "system_info":
      return previewSystemInfo();
    case "engine_status":
    case "engine_detect":
    case "engine_set_path":
      return previewEngine();
    case "engine_set_derpmap":
      settings = { ...settings, derpMapUrl: (args?.url as string | null) ?? null };
      return previewEngine();
    case "engine_download_info":
      return previewDownloadInfo();
    case "engine_download":
      return previewDownload((args?.version as string | null) ?? null);
    case "engine_keys_list":
      return [];
    case "engine_ping":
      return {
        ok: false,
        direct: false,
        pongs: [],
        error: makeError(
          "ENGINE_NOT_FOUND",
          "预览模式无法执行 ping",
          "请启动桌面应用",
          null,
        ),
      };
    case "engine_parse":
      throw makeError(
        "ENGINE_NOT_FOUND",
        "预览模式无法解析地址令牌",
        "请启动桌面应用",
        null,
      );
    case "task_list":
      return [...tasks.values()];
    case "task_get":
      return tasks.get(String(args?.id)) ?? null;
    case "task_logs": {
      const id = String(args?.id);
      const since = Number(args?.sinceSeq ?? 0);
      const all = logs.get(id) ?? [];
      const page: TaskLogPage = {
        lines: all.filter((line) => line.seq >= since),
        nextSeq: all.length,
      };
      return page;
    }
    case "task_start": {
      const request = args?.request as TaskRequest;
      return startTask(request);
    }
    case "task_stop": {
      const id = String(args?.id);
      pushLog(id, "预览模式：已停止任务。");
      return updateTask(id, {
        status: "stopped",
        endedAt: nowIso(),
        exitCode: 0,
      });
    }
    case "task_remove": {
      const id = String(args?.id);
      tasks.delete(id);
      logs.delete(id);
      emit(EVENTS.taskRemoved, { id });
      return null;
    }
    case "task_stop_all":
      return [...tasks.keys()].map((id) =>
        updateTask(id, { status: "stopped", endedAt: nowIso(), exitCode: 0 }),
      );
    case "settings_get":
      return settings;
    case "settings_update":
      settings = { ...settings, ...((args?.patch as Partial<Settings>) ?? {}) };
      emit(EVENTS.settingsChanged, settings);
      return settings;
    case "settings_reset":
      settings = { ...DEFAULT_SETTINGS };
      emit(EVENTS.settingsChanged, settings);
      return settings;
    case "settings_export":
      throw makeError(
        "UNSUPPORTED",
        "预览模式不支持导出配置",
        "请启动桌面应用",
        null,
      );
    case "settings_import":
      throw makeError(
        "UNSUPPORTED",
        "预览模式不支持导入配置",
        "请启动桌面应用",
        null,
      );
    case "history_list":
      return history;
    case "history_rename": {
      const id = String(args?.id);
      history = history.map((entry) =>
        entry.id === id ? { ...entry, note: (args?.note as string) ?? null } : entry,
      );
      return history;
    }
    case "history_remove": {
      history = history.filter((entry) => entry.id !== String(args?.id));
      return history;
    }
    case "history_clear":
      history = [];
      return history;
    case "fs_list_dir":
    case "fs_home_dir":
      return command === "fs_home_dir" ? "(预览模式)" : [];
    case "remote_list":
      throw makeError(
        "ENGINE_NOT_FOUND",
        "预览模式无法列出远端文件",
        "请启动桌面应用",
        null,
      );
    case "system_open_url":
    case "system_open_path":
    case "system_reveal":
    case "app_quit":
      return null;
    default:
      throw makeError("INTERNAL", `预览模式未实现命令：${command}`, null, null);
  }
}
