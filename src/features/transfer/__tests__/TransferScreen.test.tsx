import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "@/lib/api";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { LogLine, TaskInfo } from "@/lib/types";
import { useAppStore } from "@/store/app";
import TransferScreen from "@/features/transfer/TransferScreen";

vi.mock("@/lib/api", () => ({
  api: {
    startTask: vi.fn(),
    stopTask: vi.fn(),
    removeTask: vi.fn(),
    taskLogs: vi.fn(),
    tasks: vi.fn(),
    listRemote: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const ADDRESS =
  "tcAbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKlMnOpQrStU";
const MASKED = `${ADDRESS.slice(0, 8)}…${ADDRESS.slice(-6)}`;

function makeTask(
  overrides: Partial<TaskInfo> & Pick<TaskInfo, "id" | "kind">,
): TaskInfo {
  return {
    status: "running",
    label: "任务",
    pid: 4321,
    createdAt: "2026-10-14T10:00:00.000Z",
    startedAt: "2026-10-14T10:00:00.000Z",
    endedAt: null,
    argsSummary: ["tailcat"],
    address: null,
    listenAddr: null,
    detail: {},
    exitCode: null,
    exitSignal: null,
    error: null,
    ...overrides,
  };
}

function logLine(
  text: string,
  stream: LogLine["stream"] = "stderr",
  seq = 0,
): LogLine {
  return { seq, ts: "2026-10-14T10:00:00.000Z", stream, level: "warn", text };
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

/** Radix Tabs activate on mousedown, so drive the trigger the way a pointer would. */
function openSendTab() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "发送文件" }), {
    button: 0,
  });
  return screen.getByRole("tabpanel", { name: "发送文件" });
}

describe("TransferScreen / 接收文件", () => {
  it("未选择目录时拒绝启动接收任务", async () => {
    render(<TransferScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "开始接收" }));

    expect(await screen.findByText("请先选择目录")).toBeInTheDocument();
    expect(api.startTask).not.toHaveBeenCalled();
  });

  it("启动接收任务后展示地址令牌与复制发送命令", async () => {
    vi.mocked(open).mockResolvedValue("/tmp/inbox");
    vi.mocked(api.startTask).mockResolvedValue(
      makeTask({ id: "recv-1", kind: "recv", label: "文件接收", address: ADDRESS }),
    );

    const { container } = render(<TransferScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "选择目录" }));
    expect(await screen.findByText("/tmp/inbox")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始接收" }));

    await waitFor(() =>
      expect(api.startTask).toHaveBeenCalledWith({
        kind: "recv",
        dir: "/tmp/inbox",
      }),
    );
    expect(await screen.findByText(MASKED)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "复制发送命令" }),
    ).toBeInTheDocument();
    // What is painted on screen stays masked while redaction is on…
    expect(
      screen.getByText(`tailcat cp <文件> ${MASKED}:`),
    ).toBeInTheDocument();
    // …and the token never reaches the DOM as plain text; the copy button holds
    // the full value instead.
    expect(container.textContent ?? "").not.toContain(ADDRESS);
  });
});

describe("TransferScreen / 发送文件", () => {
  it("校验非法地址与绝对远端路径，且不启动任务", async () => {
    render(<TransferScreen onNavigate={vi.fn()} />);
    const panel = openSendTab();

    // The required marker is part of the label text, so match on a substring.
    fireEvent.change(within(panel).getByLabelText(/对端地址/), {
      target: { value: "not a valid address" },
    });
    fireEvent.change(within(panel).getByLabelText("远端路径"), {
      target: { value: "/etc/passwd" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "开始发送" }));

    expect(await screen.findByText(/地址格式不正确/)).toBeInTheDocument();
    expect(screen.getByText(/远端路径必须是相对路径/)).toBeInTheDocument();
    expect(api.startTask).not.toHaveBeenCalled();
  });

  it("提交合法表单时把选项原样传给 startTask", async () => {
    vi.mocked(open).mockResolvedValue(["/tmp/dir"]);
    vi.mocked(api.startTask).mockResolvedValue(
      makeTask({ id: "send-1", kind: "send", label: "文件发送" }),
    );

    render(<TransferScreen onNavigate={vi.fn()} />);
    const panel = openSendTab();

    fireEvent.click(within(panel).getByRole("button", { name: "选择目录" }));
    expect(await within(panel).findByText("/tmp/dir")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText(/对端地址/), {
      target: { value: ADDRESS },
    });
    fireEvent.change(within(panel).getByLabelText("远端路径"), {
      target: { value: "uploads" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "开始发送" }));

    await waitFor(() =>
      expect(api.startTask).toHaveBeenCalledWith({
        kind: "send",
        sources: ["/tmp/dir"],
        address: ADDRESS,
        remotePath: "uploads",
        // Picking a folder turns `-r` on: scp cannot send a directory without it.
        recursive: true,
        preserveTimes: false,
      }),
    );
  });

  it("从 scp stderr 解析出百分比时显示进度条", async () => {
    useAppStore.setState({
      tasks: [makeTask({ id: "send-1", kind: "send", label: "文件发送" })],
      logs: {
        "send-1": [
          logLine("scp output noise", "stdout", 0),
          logLine("report.pdf  42%  1.2MB  3.4MB/s  00:03 ETA", "stderr", 1),
        ],
      },
    });

    render(<TransferScreen onNavigate={vi.fn()} />);
    openSendTab();

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByText(/report\.pdf · 1\.2MB · 3\.4MB\/s · 00:03/)).toBeInTheDocument();
  });

  it("无法解析百分比时显示「进度不可用（以日志为准）」", async () => {
    useAppStore.setState({
      tasks: [makeTask({ id: "send-1", kind: "send", label: "文件发送" })],
      logs: { "send-1": [logLine("scp: connecting…", "stderr", 0)] },
    });

    render(<TransferScreen onNavigate={vi.fn()} />);
    openSendTab();

    expect(
      await screen.findByText("进度不可用（以日志为准）"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
