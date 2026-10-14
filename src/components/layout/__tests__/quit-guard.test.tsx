import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { api } from "@/lib/api";
import { useLocaleStore } from "@/lib/i18n";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { TaskInfo } from "@/lib/types";
import { useAppStore, wireBackendEvents } from "@/store/app";
import { QuitGuard } from "@/components/layout/quit-guard";

// 全部走打桩，测试不触碰真实 IPC。
vi.mock("@/lib/api", () => ({
  api: {
    stopAllTasks: vi.fn(),
    quit: vi.fn(),
    onTaskUpdated: vi.fn(),
    onTaskLog: vi.fn(),
    onTaskRemoved: vi.fn(),
    onEngineChanged: vi.fn(),
    onSettingsChanged: vi.fn(),
    onQuitRequested: vi.fn(),
  },
}));

function makeTask(id: string): TaskInfo {
  return {
    id,
    kind: "serve",
    status: "running",
    label: "任务",
    pid: 1234,
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
  };
}

/** 挂载守卫组件，并返回后端退出事件的处理函数（等价于真实事件到达）。 */
async function mountQuitGuard() {
  const dispose = wireBackendEvents();
  render(<QuitGuard />);
  await waitFor(() => expect(api.onQuitRequested).toHaveBeenCalled());
  const handler = vi.mocked(api.onQuitRequested).mock.calls[0][0];
  return { dispose, handler };
}

beforeEach(() => {
  vi.clearAllMocks();
  useLocaleStore.setState({ locale: "zh-CN" });
  useAppStore.setState({
    tasks: [],
    logs: {},
    logSeq: {},
    toasts: [],
    settings: { ...DEFAULT_SETTINGS },
    quitPrompt: null,
    quitBusy: false,
  });
  vi.mocked(api.onTaskUpdated).mockResolvedValue(() => {});
  vi.mocked(api.onTaskLog).mockResolvedValue(() => {});
  vi.mocked(api.onTaskRemoved).mockResolvedValue(() => {});
  vi.mocked(api.onEngineChanged).mockResolvedValue(() => {});
  vi.mocked(api.onSettingsChanged).mockResolvedValue(() => {});
  vi.mocked(api.onQuitRequested).mockResolvedValue(() => {});
  vi.mocked(api.stopAllTasks).mockResolvedValue([]);
  vi.mocked(api.quit).mockResolvedValue(undefined);
});

describe("QuitGuard", () => {
  it("未收到退出请求时不渲染对话框", async () => {
    await mountQuitGuard();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("收到退出请求后弹出对话框并显示运行中任务数量", async () => {
    useAppStore.setState({ tasks: [makeTask("a"), makeTask("b")] });
    const { handler } = await mountQuitGuard();

    act(() => handler({ running: 2 }));

    const dialog = await screen.findByRole("dialog");
    expect(useAppStore.getState().quitPrompt).toBe(2);
    expect(within(dialog).getByText(/仍有 2 个任务在运行/)).toBeInTheDocument();
  });

  it("计数以后端 payload 为准，而不是前端自己跟踪的任务数", async () => {
    // 后端才是运行中任务的权威来源：即使前端本地列表为空（例如刚启动、
    // 事件尚未同步），也必须按 payload 里的数量提示用户。
    useAppStore.setState({ tasks: [] });
    const { handler } = await mountQuitGuard();

    act(() => handler({ running: 3 }));

    const dialog = await screen.findByRole("dialog");
    expect(useAppStore.getState().quitPrompt).toBe(3);
    expect(within(dialog).getByText(/仍有 3 个任务在运行/)).toBeInTheDocument();
  });

  it("点击取消关闭对话框且不调用任何退出相关 IPC", async () => {
    useAppStore.setState({ tasks: [makeTask("a")] });
    const { handler } = await mountQuitGuard();
    act(() => handler({ running: 1 }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(useAppStore.getState().quitPrompt).toBeNull();
    expect(api.stopAllTasks).not.toHaveBeenCalled();
    expect(api.quit).not.toHaveBeenCalled();
  });

  it("确认「停止全部任务并退出」时先停止全部任务再退出", async () => {
    useAppStore.setState({ tasks: [makeTask("a")] });
    const { handler } = await mountQuitGuard();
    act(() => handler({ running: 1 }));

    fireEvent.click(
      await screen.findByRole("button", { name: "停止全部任务并退出" }),
    );

    await waitFor(() => expect(api.stopAllTasks).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.quit).toHaveBeenCalledWith(true));
  });

  it("确认「强制退出」时直接退出且不停止任务", async () => {
    useAppStore.setState({ tasks: [makeTask("a")] });
    const { handler } = await mountQuitGuard();
    act(() => handler({ running: 1 }));

    fireEvent.click(await screen.findByRole("button", { name: "强制退出" }));

    await waitFor(() => expect(api.quit).toHaveBeenCalledWith(true));
    expect(api.stopAllTasks).not.toHaveBeenCalled();
  });

  it("退出失败时给出可见错误提示并恢复可交互状态", async () => {
    vi.mocked(api.stopAllTasks).mockRejectedValue(new Error("boom"));
    useAppStore.setState({ tasks: [makeTask("a")] });
    const { handler } = await mountQuitGuard();
    act(() => handler({ running: 1 }));

    fireEvent.click(
      await screen.findByRole("button", { name: "停止全部任务并退出" }),
    );

    await waitFor(() => expect(useAppStore.getState().toasts).toHaveLength(1));
    expect(useAppStore.getState().toasts[0].tone).toBe("danger");
    expect(useAppStore.getState().quitBusy).toBe(false);
    expect(api.quit).not.toHaveBeenCalled();
  });
});
