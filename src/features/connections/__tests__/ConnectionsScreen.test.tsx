import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { EngineStatus, ParsedAddress, TaskInfo } from "@/lib/types";
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
    updateSettings: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

import { api } from "@/lib/api";
import ConnectionsScreen from "../ConnectionsScreen";

/** Radix Tabs activates on mousedown, so drive it the way a pointer would. */
function openConnectTab() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "连接对端" }), {
    button: 0,
  });
}

const TOKEN = "tcABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnop";

const foundEngine: EngineStatus = {
  found: true,
  source: "path",
  path: "/opt/homebrew/bin/tailcat",
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
  error: {
    code: "ENGINE_NOT_FOUND",
    message: "未找到 tailcat 二进制文件",
    hint: "请在设置中指定路径",
    detail: null,
  },
};

const parsedAddress: ParsedAddress = {
  input: TOKEN,
  blob: TOKEN,
  dnsName: null,
  serverPublicKey: "nodekey:abcdef",
  regionId: 301,
  regionHosts: ["derp.example.com:443"],
  selfContained: true,
};

function makeTask(overrides: Partial<TaskInfo>): TaskInfo {
  return {
    id: "task-1",
    kind: "serve",
    status: "running",
    label: "监听服务 8080",
    pid: 4321,
    createdAt: "2026-10-14T02:00:00.000Z",
    startedAt: "2026-10-14T02:00:00.000Z",
    endedAt: null,
    argsSummary: ["tailcat", "serve", "--json", "8080"],
    address: null,
    listenAddr: null,
    detail: {},
    exitCode: null,
    exitSignal: null,
    error: null,
    ...overrides,
  };
}

describe("ConnectionsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.engineKeys).mockResolvedValue([]);
    vi.mocked(api.engineParse).mockResolvedValue(parsedAddress);
    vi.mocked(api.history).mockResolvedValue([]);
    vi.mocked(api.taskLogs).mockResolvedValue({ lines: [], nextSeq: 0 });
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
  });

  it("blocks the listener and points at settings when the engine is missing", async () => {
    const onNavigate = vi.fn();
    useAppStore.setState({ engine: missingEngine });

    render(<ConnectionsScreen onNavigate={onNavigate} />);

    expect(
      screen.getByText("无法启动任务：未检测到 tailcat 引擎"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /启动监听服务/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "前往设置" }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("reports invalid serve targets and refuses to submit", async () => {
    render(<ConnectionsScreen onNavigate={vi.fn()} />);

    const targets = screen.getByLabelText(/服务目标/);
    fireEvent.change(targets, { target: { value: "8080 70000" } });

    expect(screen.getByText(/70000/)).toBeInTheDocument();
    expect(screen.getByText(/超出允许范围/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /启动监听服务/ })).toBeDisabled();
    expect(api.startTask).not.toHaveBeenCalled();
  });

  it("warns about read-write sharing when the files service is selected", async () => {
    render(<ConnectionsScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "files" }));
    expect(screen.getByText("目录服务（files）")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /读写/ }));
    expect(
      screen.getByText("读写共享会让对端修改本机文件"),
    ).toBeInTheDocument();
    // A directory is mandatory for the files service.
    expect(screen.getByRole("button", { name: /启动监听服务/ })).toBeDisabled();
  });

  it("starts a listener and shows the returned address masked", async () => {
    vi.mocked(api.startTask).mockResolvedValue(makeTask({ address: TOKEN }));

    render(<ConnectionsScreen onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/服务目标/), {
      target: { value: "8080" },
    });
    fireEvent.click(screen.getByRole("button", { name: /启动监听服务/ }));

    expect(api.startTask).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "serve", targets: ["8080"], keyName: "new" }),
    );
    expect(await screen.findByText(truncateMiddle(TOKEN, 8, 6))).toBeInTheDocument();
    expect(screen.queryByText(TOKEN)).toBeNull();
    expect(
      screen.getByRole("button", { name: /复制分享文本/ }),
    ).toBeInTheDocument();
  });

  it("verifies a peer address and reports parse results", async () => {
    render(<ConnectionsScreen onNavigate={vi.fn()} />);

    openConnectTab();
    fireEvent.change(screen.getByLabelText(/对端地址/), {
      target: { value: TOKEN },
    });
    fireEvent.click(screen.getByRole("button", { name: "校验地址" }));

    expect(api.engineParse).toHaveBeenCalledWith(TOKEN);
    expect(await screen.findByText("解析结果")).toBeInTheDocument();
    expect(screen.getByText("nodekey:abcdef")).toBeInTheDocument();
    expect(screen.getByText("301")).toBeInTheDocument();
  });

  it("flags a malformed address before any backend call", async () => {
    render(<ConnectionsScreen onNavigate={vi.fn()} />);

    openConnectTab();
    const input = screen.getByLabelText(/对端地址/);
    fireEvent.change(input, { target: { value: "http://example.com" } });
    fireEvent.blur(input);

    expect(screen.getByText(/协议前缀/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "校验地址" })).toBeDisabled();
    expect(api.engineParse).not.toHaveBeenCalled();
  });

  it("starts a forward, shows the local address and opens it in a browser", async () => {
    vi.mocked(api.startTask).mockResolvedValue(
      makeTask({
        kind: "forward",
        label: "端口转发 → :8080",
        listenAddr: "127.0.0.1:41234",
      }),
    );

    render(<ConnectionsScreen onNavigate={vi.fn()} />);

    openConnectTab();
    fireEvent.change(screen.getByLabelText(/对端地址/), {
      target: { value: TOKEN },
    });
    fireEvent.change(screen.getByLabelText(/远端端口/), {
      target: { value: "8080" },
    });
    fireEvent.click(screen.getByRole("button", { name: /启动转发/ }));

    expect(api.startTask).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "forward",
        address: TOKEN,
        remotePort: 8080,
        localPort: 0,
        bindHost: "127.0.0.1",
      }),
    );
    expect(await screen.findByText("127.0.0.1:41234")).toBeInTheDocument();
    // History is written by the backend on task start, so the UI re-reads it.
    expect(api.history).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /在浏览器打开/ }));
    expect(api.openUrl).toHaveBeenCalledWith("http://127.0.0.1:41234");
  });

  it("blocks a non-loopback bind until the user opts in", async () => {
    vi.mocked(api.updateSettings).mockImplementation(async (patch) => ({
      ...DEFAULT_SETTINGS,
      ...patch,
    }));
    render(<ConnectionsScreen onNavigate={vi.fn()} />);

    openConnectTab();
    fireEvent.change(screen.getByLabelText(/对端地址/), {
      target: { value: TOKEN },
    });
    fireEvent.change(screen.getByLabelText(/远端端口/), {
      target: { value: "8080" },
    });
    fireEvent.change(screen.getByLabelText(/监听地址/), {
      target: { value: "0.0.0.0" },
    });

    expect(screen.getByText("非回环地址会把转发暴露到局域网")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /启动转发/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "允许非回环监听" }));
    expect(api.updateSettings).toHaveBeenCalledWith({ allowNonLoopbackBind: true });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /启动转发/ })).toBeEnabled();
    });
  });

  it("reports a path-probe failure as a real error instead of a neutral note", async () => {
    vi.mocked(api.enginePing).mockResolvedValue({
      ok: false,
      direct: false,
      pongs: [],
      error: {
        code: "NETWORK_ERROR",
        message: "context deadline exceeded",
        hint: null,
        detail: null,
      },
    });

    render(<ConnectionsScreen onNavigate={vi.fn()} />);

    openConnectTab();
    fireEvent.change(screen.getByLabelText(/对端地址/), {
      target: { value: TOKEN },
    });
    fireEvent.click(screen.getByRole("button", { name: /路径探测/ }));

    // 失败按真实错误呈现：错误码与文案都来自后端归一化后的结果。
    expect(await screen.findByText("context deadline exceeded")).toBeInTheDocument();
    expect(screen.getByText("NETWORK_ERROR")).toBeInTheDocument();
    // 旧的「仅供参考 / 不影响可用性判断」降级措辞不再出现。
    expect(screen.queryByText(/仅供参考/)).toBeNull();
    expect(screen.queryByText(/不影响可用性判断/)).toBeNull();
  });

  it("shows each hop RTT plus the DERP/direct path when the probe succeeds", async () => {
    vi.mocked(api.enginePing).mockResolvedValue({
      ok: true,
      direct: false,
      pongs: [
        { rttMs: 150.69, via: "DERP(tok)", direct: false },
        { rttMs: 3.2, via: "203.0.113.7:41641", direct: true },
      ],
      error: null,
    });

    render(<ConnectionsScreen onNavigate={vi.fn()} />);

    openConnectTab();
    fireEvent.change(screen.getByLabelText(/对端地址/), {
      target: { value: TOKEN },
    });
    fireEvent.click(screen.getByRole("button", { name: /路径探测/ }));

    // 每跳都展示 RTT 与路径（DERP 中继或直连）。
    expect(await screen.findByText(/151ms/)).toBeInTheDocument();
    expect(screen.getByText(/DERP\(tok\)/)).toBeInTheDocument();
    expect(screen.getByText(/3\.2ms/)).toBeInTheDocument();
    // 直连那一跳的单元格文本是「· 直连」，与说明文案里的「直连路径」区分开。
    expect(screen.getByText(/^· 直连$/)).toBeInTheDocument();
  });
});
