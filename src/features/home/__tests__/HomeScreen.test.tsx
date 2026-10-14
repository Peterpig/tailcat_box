import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { EngineStatus, HistoryEntry, TaskInfo } from "@/lib/types";
import { truncateMiddle } from "@/lib/format";
import { useAppStore } from "@/store/app";

vi.mock("@/lib/api", () => ({
  api: {
    history: vi.fn(),
    renameHistory: vi.fn(),
    removeHistory: vi.fn(),
    clearHistory: vi.fn(),
    startTask: vi.fn(),
    stopTask: vi.fn(),
    taskLogs: vi.fn(),
    engineKeys: vi.fn(),
    engineParse: vi.fn(),
    enginePing: vi.fn(),
    engineDetect: vi.fn(),
    openUrl: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import HomeScreen from "../HomeScreen";

const TOKEN = "tcABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnop";

const foundEngine: EngineStatus = {
  found: true,
  source: "bundled",
  path: "/Applications/Tailcat Box.app/Contents/MacOS/tailcat",
  version: "0.4.0",
  configuredPath: null,
  keysDir: "/Users/dev/Library/Application Support/tailcat/keys",
  savedKeys: [],
  hasDefaultKey: false,
  hasClientKey: false,
  derpMapUrl: null,
  error: null,
};

const missingEngine: EngineStatus = {
  ...foundEngine,
  found: false,
  source: "missing",
  path: null,
  version: null,
  keysDir: null,
  error: {
    code: "ENGINE_NOT_FOUND",
    message: "未找到 tailcat 二进制文件",
    hint: "请在设置中指定路径或重新安装",
    detail: null,
  },
};

const runningTask: TaskInfo = {
  id: "task-1",
  kind: "serve",
  status: "running",
  label: "监听服务 8080",
  pid: 4321,
  createdAt: "2026-10-14T02:00:00.000Z",
  // 固定时间戳：运行时长断言不依赖测试机器在渲染前恰好走了多少毫秒。
  startedAt: "2026-10-14T02:00:00.000Z",
  endedAt: null,
  argsSummary: ["tailcat", "serve", "8080"],
  address: TOKEN,
  listenAddr: null,
  detail: {},
  exitCode: null,
  exitSignal: null,
  error: null,
};

const historyEntry: HistoryEntry = {
  id: "hist-1",
  kind: "serve",
  address: TOKEN,
  label: "监听服务 8080",
  note: null,
  createdAt: "2026-10-13T02:00:00.000Z",
  lastUsedAt: "2026-10-14T02:00:00.000Z",
  useCount: 3,
};

function resetStore() {
  useAppStore.setState({
    engine: foundEngine,
    engineBusy: false,
    tasks: [],
    history: [],
    logs: {},
    logSeq: {},
    toasts: [],
    settings: { ...DEFAULT_SETTINGS },
  });
}

describe("HomeScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.history).mockResolvedValue([]);
    vi.mocked(api.renameHistory).mockResolvedValue([]);
    vi.mocked(api.removeHistory).mockResolvedValue([]);
    vi.mocked(api.taskLogs).mockResolvedValue({ lines: [], nextSeq: 0 });
    resetStore();
  });

  it("renders the empty state for tasks and history", () => {
    render(<HomeScreen onNavigate={vi.fn()} />);

    expect(screen.getByText("暂无活动任务")).toBeInTheDocument();
    expect(screen.getByText("还没有历史记录")).toBeInTheDocument();
    expect(screen.getByText("0.4.0")).toBeInTheDocument();
    expect(screen.getByText("内置二进制")).toBeInTheDocument();
  });

  it("guides to settings and disables engine actions when the engine is missing", async () => {
    const onNavigate = vi.fn();
    useAppStore.setState({ engine: missingEngine });

    render(<HomeScreen onNavigate={onNavigate} />);

    expect(screen.getByText("未检测到 tailcat 引擎")).toBeInTheDocument();
    expect(screen.getByText("未找到 tailcat 二进制文件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /创建监听服务/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /端口转发/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "前往设置" }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("shows running tasks with a masked token and stops them", async () => {
    vi.mocked(api.stopTask).mockResolvedValue({ ...runningTask, status: "stopped" });
    useAppStore.setState({ tasks: [runningTask] });

    // 冻结系统时间：startedAt 是固定值，运行时长必然是可确定的 1m 05s，
    // 不会因为机器繁忙、渲染晚于 1 秒而变成 1m 06s。
    // 只伪造 Date，保留真实的 setInterval，避免干扰 React 的调度。
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T02:01:05.000Z"));
    try {
      render(<HomeScreen onNavigate={vi.fn()} />);

      expect(screen.getByText("监听服务 8080")).toBeInTheDocument();
      expect(screen.getByText(truncateMiddle(TOKEN, 8, 6))).toBeInTheDocument();
      expect(screen.queryByText(TOKEN)).toBeNull();
      expect(screen.getByText(/1m 05s/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "停止" }));
      expect(api.stopTask).toHaveBeenCalledWith("task-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("renames a history note and refreshes the list", async () => {
    vi.mocked(api.history).mockResolvedValue([
      { ...historyEntry, note: "家里的 NAS" },
    ]);
    useAppStore.setState({ history: [historyEntry] });

    render(<HomeScreen onNavigate={vi.fn()} />);

    expect(screen.getByText("未添加备注")).toBeInTheDocument();
    expect(screen.getByText(truncateMiddle(TOKEN, 8, 6))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重命名备注" }));
    const note = await screen.findByLabelText("备注");
    fireEvent.change(note, { target: { value: "家里的 NAS" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(api.renameHistory).toHaveBeenCalledWith("hist-1", "家里的 NAS");
    expect(await screen.findByText("家里的 NAS")).toBeInTheDocument();
    expect(api.history).toHaveBeenCalled();
  });

  it("deletes a history entry after confirmation", async () => {
    vi.mocked(api.history).mockResolvedValue([]);
    useAppStore.setState({ history: [historyEntry] });

    render(<HomeScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "删除记录" }));
    expect(await screen.findByText("删除这条记录？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(api.removeHistory).toHaveBeenCalledWith("hist-1");
    await waitFor(() => {
      expect(screen.queryByText("监听服务 8080")).toBeNull();
    });
    expect(api.history).toHaveBeenCalled();
  });
});
