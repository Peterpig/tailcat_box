import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "@/lib/api";
import type {
  EngineDownloadInfo,
  EngineDownloadProgress,
  EngineStatus,
  UserFacingError,
} from "@/lib/types";
import { useAppStore } from "@/store/app";
import { DownloadPanel } from "../DownloadPanel";

vi.mock("@/lib/api", () => ({
  api: {
    engineDownloadInfo: vi.fn(),
    engineDownload: vi.fn(),
    onEngineDownload: vi.fn(),
  },
}));

const LINUX_INFO: EngineDownloadInfo = {
  supported: true,
  platform: "linux",
  arch: "x86_64",
  version: "0.7.0",
  assetName: "tailcat_0.7.0_linux_amd64.tar.gz",
  reason: null,
};

const MACOS_INFO: EngineDownloadInfo = {
  supported: false,
  platform: "macos",
  arch: "aarch64",
  version: null,
  assetName: null,
  reason:
    "官方未提供 macOS 平台的 tailcat 二进制产物。请改用 Homebrew 安装：brew install tailcat",
};

const INSTALLED: EngineStatus = {
  found: true,
  source: "custom",
  path: "/Users/dev/.local/bin/tailcat",
  version: "0.7.0",
  configuredPath: "/Users/dev/.local/bin/tailcat",
  keysDir: null,
  savedKeys: [],
  hasDefaultKey: false,
  hasClientKey: false,
  derpMapUrl: null,
  error: null,
};

let emitProgress: ((progress: EngineDownloadProgress) => void) | null = null;
const unsubscribe = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  emitProgress = null;
  useAppStore.setState({ engine: null, toasts: [] });
  vi.mocked(api.onEngineDownload).mockImplementation(async (handler) => {
    emitProgress = handler as (progress: EngineDownloadProgress) => void;
    return unsubscribe;
  });
});

describe("DownloadPanel", () => {
  it("hides the download button and repeats the Homebrew reason on macOS", async () => {
    vi.mocked(api.engineDownloadInfo).mockResolvedValue(MACOS_INFO);

    render(<DownloadPanel />);

    expect(await screen.findByText("macos · aarch64")).toBeInTheDocument();
    expect(
      screen.getByText(/brew install tailcat/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下载并安装" }),
    ).toBeNull();
  });

  it("downloads and shows a percentage when the backend reports a total", async () => {
    vi.mocked(api.engineDownloadInfo).mockResolvedValue(LINUX_INFO);
    let resolveDownload!: (status: EngineStatus) => void;
    vi.mocked(api.engineDownload).mockImplementation(
      () =>
        new Promise<EngineStatus>((resolve) => {
          resolveDownload = resolve;
        }),
    );

    render(<DownloadPanel />);
    await screen.findByText("tailcat_0.7.0_linux_amd64.tar.gz");

    fireEvent.click(screen.getByRole("button", { name: "下载并安装" }));
    await waitFor(() => expect(emitProgress).not.toBeNull());
    expect(api.engineDownload).toHaveBeenCalledWith(null);

    act(() => {
      emitProgress?.({
        phase: "downloading",
        downloaded: 840,
        total: 2000,
        version: "0.7.0",
        message: null,
      });
    });

    expect(await screen.findByText("42%")).toBeInTheDocument();
    expect(screen.getByText("已下载 840 B / 2.0 KB")).toBeInTheDocument();

    act(() => resolveDownload(INSTALLED));
    expect(await screen.findByText("引擎已安装")).toBeInTheDocument();
    expect(screen.getByText(INSTALLED.path as string)).toBeInTheDocument();
  });

  it("stays indeterminate and never invents a percentage without a total", async () => {
    vi.mocked(api.engineDownloadInfo).mockResolvedValue(LINUX_INFO);
    vi.mocked(api.engineDownload).mockResolvedValue(INSTALLED);

    render(<DownloadPanel />);
    await screen.findByText("tailcat_0.7.0_linux_amd64.tar.gz");

    fireEvent.click(screen.getByRole("button", { name: "下载并安装" }));
    await waitFor(() => expect(emitProgress).not.toBeNull());

    act(() => {
      emitProgress?.({
        phase: "downloading",
        downloaded: 4096,
        total: null,
        version: "0.7.0",
        message: null,
      });
    });

    expect(
      await screen.findByText("总大小未知，正在下载…"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("surfaces a checksum mismatch and never claims success", async () => {
    vi.mocked(api.engineDownloadInfo).mockResolvedValue(LINUX_INFO);
    const mismatch: UserFacingError = {
      code: "ENGINE_CHECKSUM_MISMATCH",
      message:
        "下载的 tailcat_0.7.0_linux_amd64.tar.gz 校验和不匹配：期望 SHA256 3f9a…，实际 91c2…。文件可能已损坏或被篡改",
      hint: "请重试；若持续失败，请在官方 Releases 页面手动下载并核对 SHA256",
      detail: "expected sha256: 3f9a…\nactual sha256:   91c2…",
    };
    vi.mocked(api.engineDownload).mockRejectedValue(mismatch);

    render(<DownloadPanel />);
    await screen.findByText("tailcat_0.7.0_linux_amd64.tar.gz");

    fireEvent.click(screen.getByRole("button", { name: "下载并安装" }));

    expect(await screen.findByText(/校验和不匹配/)).toBeInTheDocument();
    expect(screen.getByText("ENGINE_CHECKSUM_MISMATCH")).toBeInTheDocument();
    expect(screen.queryByText("引擎已安装")).toBeNull();
  });

  it("disables the button and the version input while a download is running", async () => {
    vi.mocked(api.engineDownloadInfo).mockResolvedValue(LINUX_INFO);
    let resolveDownload!: (status: EngineStatus) => void;
    vi.mocked(api.engineDownload).mockImplementation(
      () =>
        new Promise<EngineStatus>((resolve) => {
          resolveDownload = resolve;
        }),
    );

    render(<DownloadPanel />);
    await screen.findByText("tailcat_0.7.0_linux_amd64.tar.gz");

    const button = screen.getByRole("button", { name: "下载并安装" });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByLabelText("安装版本")).toBeDisabled();

    act(() => resolveDownload(INSTALLED));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "下载并安装" }),
      ).not.toBeDisabled(),
    );
  });
});
