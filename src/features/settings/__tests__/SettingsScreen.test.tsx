import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "@/lib/api";
import { DEFAULT_SETTINGS, type EngineStatus, type SystemInfo } from "@/lib/types";
import { useAppStore } from "@/store/app";
import SettingsScreen from "../SettingsScreen";

vi.mock("@/lib/api", () => ({
  api: {
    systemInfo: vi.fn(),
    openUrl: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(undefined),
    revealPath: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
    engineStatus: vi.fn(),
    engineDetect: vi.fn(),
    engineSetPath: vi.fn(),
    engineSetDerpMap: vi.fn(),
    engineKeys: vi.fn(),
    engineCreateKey: vi.fn(),
    engineDeleteKey: vi.fn(),
    engineRegions: vi.fn(),
    engineParse: vi.fn(),
    engineResolve: vi.fn(),
    enginePing: vi.fn(),
    tasks: vi.fn(),
    task: vi.fn(),
    taskLogs: vi.fn(),
    startTask: vi.fn(),
    stopTask: vi.fn(),
    removeTask: vi.fn(),
    stopAllTasks: vi.fn(),
    listLocalDir: vi.fn(),
    homeDir: vi.fn(),
    listRemote: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    resetSettings: vi.fn(),
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
    history: vi.fn(),
    renameHistory: vi.fn(),
    removeHistory: vi.fn(),
    clearHistory: vi.fn(),
    onTaskUpdated: vi.fn(),
    onTaskLog: vi.fn(),
    onTaskRemoved: vi.fn(),
    onEngineChanged: vi.fn(),
    onSettingsChanged: vi.fn(),
    onQuitRequested: vi.fn(),
  },
}));

const MISSING_ENGINE: EngineStatus = {
  found: false,
  source: "missing",
  path: null,
  version: null,
  configuredPath: null,
  keysDir: null,
  savedKeys: [],
  hasDefaultKey: false,
  hasClientKey: false,
  derpMapUrl: null,
  error: null,
};

const SYSTEM: SystemInfo = {
  os: "macos",
  arch: "arm64",
  appVersion: "0.1.0",
  configDir: "/tmp/tailcat-box",
  logDir: "/tmp/tailcat-box/logs",
  bundledTailcatPath: null,
  native: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    engine: MISSING_ENGINE,
    history: [],
    tasks: [],
    system: SYSTEM,
  });
  vi.mocked(api.engineKeys).mockResolvedValue([]);
  vi.mocked(api.engineRegions).mockResolvedValue([]);
  vi.mocked(api.updateSettings).mockImplementation(async (patch) => ({
    ...DEFAULT_SETTINGS,
    ...patch,
  }));
  vi.mocked(api.engineSetDerpMap).mockResolvedValue(MISSING_ENGINE);
  vi.mocked(api.resetSettings).mockResolvedValue({ ...DEFAULT_SETTINGS });
});

describe("SettingsScreen", () => {
  it("applies the theme through the store when a theme is picked", async () => {
    render(<SettingsScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "深色" }));

    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith({ theme: "dark" }),
    );
  });

  it("rejects a non-https DERP map URL before calling the backend", async () => {
    render(<SettingsScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "引擎" }));
    const input = await screen.findByLabelText("DERP Map 地址");
    fireEvent.change(input, {
      target: { value: "http://example.com/derpmap.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(api.engineSetDerpMap).not.toHaveBeenCalled();
    expect(
      await screen.findByText("DERP Map 必须使用 https 地址"),
    ).toBeInTheDocument();
  });

  it("shows repair guidance when the engine is missing", async () => {
    render(<SettingsScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "引擎" }));

    expect(await screen.findByText(/brew install tailcat/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开官方 Releases" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/不会自动下载或执行来源不明的脚本/),
    ).toBeInTheDocument();
  });

  it("reports a ping failure as a real error instead of an informational note", async () => {
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
    render(<SettingsScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "引擎" }));
    fireEvent.change(await screen.findByLabelText("地址令牌 / DNS 名称"), {
      target: { value: `tc${"A".repeat(30)}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "探测" }));

    // 失败就是失败：展示后端归一化后的错误码与文案。
    expect(await screen.findByText("context deadline exceeded")).toBeInTheDocument();
    expect(screen.getByText("NETWORK_ERROR")).toBeInTheDocument();
    // 旧的「仅供参考 / 失败不代表不可用」措辞不再出现。
    expect(screen.queryByText(/仅供参考/)).toBeNull();
    expect(screen.queryByText(/即使数据链路完全正常/)).toBeNull();
  });

  it("requires a second confirmation before resetting settings", async () => {
    render(<SettingsScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "数据与配置" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复默认设置" }));

    expect(api.resetSettings).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "恢复默认" }));

    await waitFor(() => expect(api.resetSettings).toHaveBeenCalledTimes(1));
  });

  it("renders every section without crashing", async () => {
    render(<SettingsScreen onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "启动与退出" }));
    expect(
      screen.getByText("允许监听非回环地址"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "日志" }));
    expect(
      screen.getByLabelText("每个任务保留的日志行数"),
    ).toBeInTheDocument();
    expect(screen.getByText("/tmp/tailcat-box/logs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关于" }));
    expect(screen.getByText("/tmp/tailcat-box")).toBeInTheDocument();
    expect(screen.getByText(/不使用 Tailscale 控制平面/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看许可证" }));
    expect(
      await screen.findByText(/允许以源代码或二进制形式再分发/),
    ).toBeInTheDocument();
  });
});
