import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "@/lib/api";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { TaskInfo } from "@/lib/types";
import { useAppStore } from "@/store/app";
import ShareScreen from "@/features/share/ShareScreen";

vi.mock("@/lib/api", () => ({
  api: {
    startTask: vi.fn(),
    stopTask: vi.fn(),
    removeTask: vi.fn(),
    taskLogs: vi.fn(),
    tasks: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const ADDRESS =
  "tcAbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKlMnOpQrStU";
const MASKED = `${ADDRESS.slice(0, 8)}…${ADDRESS.slice(-6)}`;

function makeTask(overrides: Partial<TaskInfo> & Pick<TaskInfo, "id">): TaskInfo {
  return {
    kind: "share",
    status: "running",
    label: "目录共享",
    pid: 4321,
    createdAt: "2026-10-14T10:00:00.000Z",
    startedAt: "2026-10-14T10:00:00.000Z",
    endedAt: null,
    argsSummary: ["tailcat", "serve"],
    address: null,
    listenAddr: null,
    detail: {},
    exitCode: null,
    exitSignal: null,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    tasks: [],
    logs: {},
    logSeq: {},
    toasts: [],
    settings: { ...DEFAULT_SETTINGS },
  });
  vi.mocked(api.taskLogs).mockResolvedValue({ lines: [], nextSeq: 0 });
});

describe("ShareScreen", () => {
  it("未选择目录时拒绝启动共享任务", async () => {
    render(<ShareScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "开始共享" }));

    expect(await screen.findByText("请先选择共享目录")).toBeInTheDocument();
    expect(api.startTask).not.toHaveBeenCalled();
  });

  it("只读是默认模式，选择读写后显示风险提示", async () => {
    render(<ShareScreen onNavigate={vi.fn()} />);

    expect(screen.getByLabelText(/只读/)).toBeChecked();
    expect(screen.queryByText(/读写共享风险/)).toBeNull();

    fireEvent.click(screen.getByLabelText(/读写/));

    expect(await screen.findByText(/读写共享风险/)).toBeInTheDocument();
    // Anchored on the callout body: the read-only hint also says "写入或删除".
    expect(screen.getByText(/^对端可以写入或删除/)).toBeInTheDocument();
  });

  it("只写投递箱说明对端无法读取或列目录", async () => {
    render(<ShareScreen onNavigate={vi.fn()} />);

    // 锚定在扁平的 wo 选项上：新增的 wo+ 也包含「只写投递箱」字样。
    fireEvent.click(screen.getByLabelText(/^只写投递箱（wo）/));

    // The option hint and the warning callout both mention this; anchor on the
    // callout's own opening words so the assertion stays unambiguous.
    expect(await screen.findByText(/^只写投递箱：/)).toBeInTheDocument();
    expect(screen.queryByText(/读写共享风险/)).toBeNull();
  });

  it("启动共享后展示脱敏地址与模式徽标", async () => {
    vi.mocked(open).mockResolvedValue("/tmp/pub");
    vi.mocked(api.startTask).mockResolvedValue(
      makeTask({ id: "share-1", address: ADDRESS }),
    );

    render(<ShareScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "选择共享目录" }));
    expect(await screen.findByText("/tmp/pub")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始共享" }));

    await waitFor(() =>
      expect(api.startTask).toHaveBeenCalledWith({
        kind: "share",
        dir: "/tmp/pub",
        mode: "ro",
      }),
    );
    expect(await screen.findByText(MASKED)).toBeInTheDocument();
    expect(screen.getByText("只读")).toBeInTheDocument();
  });

  it("选择读写后启动的任务带上 rw 模式", async () => {
    vi.mocked(open).mockResolvedValue("/tmp/pub");
    vi.mocked(api.startTask).mockResolvedValue(
      makeTask({ id: "share-2", address: ADDRESS }),
    );

    render(<ShareScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/读写/));
    fireEvent.click(screen.getByRole("button", { name: "选择共享目录" }));
    expect(await screen.findByText("/tmp/pub")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始共享" }));

    await waitFor(() =>
      expect(api.startTask).toHaveBeenCalledWith({
        kind: "share",
        dir: "/tmp/pub",
        mode: "rw",
      }),
    );
    expect(await screen.findByText("读写")).toBeInTheDocument();
  });
});
