import { create } from "zustand";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { applyTheme, readStoredThemeMode, watchSystemTheme } from "@/lib/theme";
import { setLocale } from "@/lib/i18n";
import { quitErrorMessage, type QuitMode } from "@/components/layout/quit-guard.messages";
import type {
  EngineStatus,
  HistoryEntry,
  LogLine,
  Settings,
  SystemInfo,
  TaskInfo,
  TaskRequest,
  UserFacingError,
} from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { newId } from "@/lib/utils";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type { QuitMode };

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  error?: UserFacingError;
}

interface AppState {
  bootstrapped: boolean;
  system: SystemInfo | null;
  engine: EngineStatus | null;
  engineBusy: boolean;
  settings: Settings;
  history: HistoryEntry[];
  tasks: TaskInfo[];
  logs: Record<string, LogLine[]>;
  logSeq: Record<string, number>;
  toasts: Toast[];
  /** 非 null 表示后端请求了退出确认，值为当时运行中的任务数。 */
  quitPrompt: number | null;
  /** 退出确认正在执行，用于禁用按钮、防止重复点击。 */
  quitBusy: boolean;

  bootstrap: () => Promise<void>;
  refreshEngine: (path?: string | null) => Promise<EngineStatus | null>;
  refreshTasks: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  loadLogs: (id: string, reset?: boolean) => Promise<void>;
  startTask: (request: TaskRequest) => Promise<TaskInfo | null>;
  stopTask: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  stopAllTasks: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  pushToast: (toast: Omit<Toast, "id">) => string;
  dismissToast: (id: string) => void;
  failToast: (title: string, error: unknown) => string;
  dismissQuitPrompt: () => void;
  confirmQuit: (mode: QuitMode) => Promise<void>;
}

function sortTasks(tasks: TaskInfo[]): TaskInfo[] {
  return [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

let unsubscribeTheme: (() => void) | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  bootstrapped: false,
  system: null,
  engine: null,
  engineBusy: false,
  settings: { ...DEFAULT_SETTINGS },
  history: [],
  tasks: [],
  logs: {},
  logSeq: {},
  toasts: [],
  quitPrompt: null,
  quitBusy: false,

  async bootstrap() {
    if (get().bootstrapped) return;

    // Apply the persisted theme immediately so the first paint matches.
    applyTheme(readStoredThemeMode());

    try {
      const [system, settings] = await Promise.all([
        api.systemInfo(),
        api.settings(),
      ]);
      set({ system, settings });
      setLocale(settings.language);
      applyTheme(settings.theme);

      if (unsubscribeTheme) unsubscribeTheme();
      unsubscribeTheme = watchSystemTheme(() => {
        if (get().settings.theme === "system") applyTheme("system");
      });

      const [engine, tasks, history] = await Promise.all([
        api.engineStatus().catch((error) => {
          const normalized = normalizeError(error);
          return {
            found: false,
            source: "missing" as const,
            path: null,
            version: null,
            configuredPath: null,
            keysDir: null,
            savedKeys: [],
            hasDefaultKey: false,
            hasClientKey: false,
            derpMapUrl: null,
            error: normalized,
          } satisfies EngineStatus;
        }),
        api.tasks().catch(() => [] as TaskInfo[]),
        api.history().catch(() => [] as HistoryEntry[]),
      ]);
      set({ engine, tasks: sortTasks(tasks), history });
      set({ bootstrapped: true });
    } catch (error) {
      set({ bootstrapped: true });
      get().failToast("初始化失败", error);
    }
  },

  async refreshEngine(path) {
    set({ engineBusy: true });
    try {
      const engine = await api.engineDetect(path ?? get().settings.tailcatPath);
      set({ engine, engineBusy: false });
      return engine;
    } catch (error) {
      set({ engineBusy: false });
      get().failToast("检测引擎失败", error);
      return null;
    }
  },

  async refreshTasks() {
    try {
      set({ tasks: sortTasks(await api.tasks()) });
    } catch (error) {
      get().failToast("读取任务失败", error);
    }
  },

  async refreshHistory() {
    try {
      set({ history: await api.history() });
    } catch (error) {
      get().failToast("读取历史记录失败", error);
    }
  },

  async loadLogs(id, reset = false) {
    const sinceSeq = reset ? 0 : (get().logSeq[id] ?? 0);
    try {
      const page = await api.taskLogs(id, sinceSeq);
      set((state) => {
        const previous = reset ? [] : (state.logs[id] ?? []);
        return {
          logs: { ...state.logs, [id]: [...previous, ...page.lines] },
          logSeq: { ...state.logSeq, [id]: page.nextSeq },
        };
      });
    } catch (error) {
      get().failToast("读取日志失败", error);
    }
  },

  async startTask(request) {
    try {
      const task = await api.startTask(request);
      set((state) => ({
        tasks: sortTasks([
          task,
          ...state.tasks.filter((item) => item.id !== task.id),
        ]),
      }));
      return task;
    } catch (error) {
      get().failToast("任务启动失败", error);
      return null;
    }
  },

  async stopTask(id) {
    try {
      const task = await api.stopTask(id);
      set((state) => ({
        tasks: state.tasks.map((item) => (item.id === id ? task : item)),
      }));
    } catch (error) {
      get().failToast("停止任务失败", error);
    }
  },

  async removeTask(id) {
    try {
      await api.removeTask(id);
      set((state) => {
        const logs = { ...state.logs };
        delete logs[id];
        return {
          tasks: state.tasks.filter((item) => item.id !== id),
          logs,
        };
      });
    } catch (error) {
      get().failToast("移除任务失败", error);
    }
  },

  async stopAllTasks() {
    try {
      const tasks = await api.stopAllTasks();
      set({ tasks: sortTasks(tasks) });
    } catch (error) {
      get().failToast("停止全部任务失败", error);
    }
  },

  async updateSettings(patch) {
    const previous = get().settings;
    const optimistic = { ...previous, ...patch };
    set({ settings: optimistic });
    if (patch.theme) applyTheme(patch.theme);
    if (patch.language) setLocale(patch.language);
    try {
      const settings = await api.updateSettings(patch);
      set({ settings });
      applyTheme(settings.theme);
      setLocale(settings.language);
    } catch (error) {
      set({ settings: previous });
      applyTheme(previous.theme);
      setLocale(previous.language);
      get().failToast("保存设置失败", error);
    }
  },

  async resetSettings() {
    try {
      const settings = await api.resetSettings();
      set({ settings });
      applyTheme(settings.theme);
      setLocale(settings.language);
      get().pushToast({
        tone: "success",
        title: "已恢复默认设置",
      });
    } catch (error) {
      get().failToast("恢复默认设置失败", error);
    }
  },

  pushToast(toast) {
    const id = newId("toast");
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    if (toast.tone !== "danger") {
      window.setTimeout(() => get().dismissToast(id), 4200);
    }
    return id;
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
  },

  failToast(title, error) {
    const normalized = normalizeError(error);
    return get().pushToast({
      tone: "danger",
      title,
      description: normalized.message,
      error: normalized,
    });
  },

  dismissQuitPrompt() {
    // 确认进行中不允许关闭，避免按钮被禁用后弹窗仍消失。
    if (get().quitBusy) return;
    set({ quitPrompt: null });
  },

  async confirmQuit(mode) {
    if (get().quitBusy) return;
    set({ quitBusy: true });
    try {
      if (mode === "stop-and-quit") await api.stopAllTasks();
      await api.quit(true);
      // 正常情况下进程随即结束；重置状态让预览运行时也能继续使用。
      set({ quitPrompt: null, quitBusy: false });
    } catch (error) {
      set({ quitBusy: false });
      get().failToast(quitErrorMessage(mode), error);
    }
  },
}));

/** Subscribes the store to backend push events. Returns an unsubscribe fn. */
export function wireBackendEvents(): () => void {
  const disposers: (() => void)[] = [];
  let cancelled = false;

  const register = (promise: Promise<() => void>) => {
    void promise.then((dispose) => {
      if (cancelled) dispose();
      else disposers.push(dispose);
    });
  };

  register(
    api.onTaskUpdated(({ task }) => {
      useAppStore.setState((state) => ({
        tasks: sortTasks([
          task,
          ...state.tasks.filter((item) => item.id !== task.id),
        ]),
      }));
    }),
  );

  register(
    api.onTaskLog(({ id, line }) => {
      useAppStore.setState((state) => {
        const existing = state.logs[id] ?? [];
        const cap = state.settings.maxLogLines;
        const next = [...existing, line];
        return {
          logs: {
            ...state.logs,
            [id]: next.length > cap ? next.slice(next.length - cap) : next,
          },
          logSeq: { ...state.logSeq, [id]: line.seq + 1 },
        };
      });
    }),
  );

  register(
    api.onTaskRemoved(({ id }) => {
      useAppStore.setState((state) => {
        const logs = { ...state.logs };
        delete logs[id];
        return { tasks: state.tasks.filter((item) => item.id !== id), logs };
      });
    }),
  );

  register(
    api.onEngineChanged((engine) => {
      useAppStore.setState({ engine });
    }),
  );

  register(
    api.onSettingsChanged((settings) => {
      useAppStore.setState({ settings });
      applyTheme(settings.theme);
      setLocale(settings.language);
    }),
  );

  register(
    api.onQuitRequested((payload) => {
      // Rust 只在存在运行中任务时 emit，payload 里的 running 是权威计数，
      // 直接采用，不用前端自己统计出来的数字去猜。
      useAppStore.setState({ quitPrompt: payload.running });
    }),
  );

  return () => {
    cancelled = true;
    disposers.forEach((dispose) => dispose());
    disposers.length = 0;
  };
}

/* --- selectors ------------------------------------------------------------ */

export const selectRunningTasks = (state: AppState): TaskInfo[] =>
  state.tasks.filter(
    (task) => task.status === "running" || task.status === "starting",
  );

export const selectTasksByKind =
  (...kinds: TaskInfo["kind"][]) =>
  (state: AppState): TaskInfo[] =>
    state.tasks.filter((task) => kinds.includes(task.kind));

export const selectTask = (id: string) => (state: AppState) =>
  state.tasks.find((task) => task.id === id) ?? null;

export const selectLogs = (id: string) => (state: AppState) =>
  state.logs[id] ?? [];
