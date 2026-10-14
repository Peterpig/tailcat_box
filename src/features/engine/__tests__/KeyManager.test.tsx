import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { api } from "@/lib/api";
import type { EngineStatus, SavedKey } from "@/lib/types";
import { useAppStore } from "@/store/app";
import { KeyManager } from "../KeyManager";

vi.mock("@/lib/api", () => ({
  api: {
    engineKeys: vi.fn(),
    engineRegions: vi.fn(),
    engineCreateKey: vi.fn(),
    engineDeleteKey: vi.fn(),
    openUrl: vi.fn(),
    openPath: vi.fn(),
  },
}));

const ENGINE: EngineStatus = {
  found: true,
  source: "path",
  path: "/usr/local/bin/tailcat",
  version: "0.4.0",
  configuredPath: null,
  keysDir: "/Users/dev/Library/Application Support/tailcat/keys",
  savedKeys: [],
  hasDefaultKey: false,
  hasClientKey: false,
  derpMapUrl: null,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ engine: ENGINE });
  vi.mocked(api.engineKeys).mockResolvedValue([]);
  vi.mocked(api.engineRegions).mockResolvedValue(["nyc", "sfo"]);
  vi.mocked(api.engineDeleteKey).mockResolvedValue(undefined);
});

async function openCreateDialog() {
  render(<KeyManager />);
  fireEvent.click(screen.getByRole("button", { name: "新建密钥" }));
  const dialog = await screen.findByRole("dialog");
  return { dialog };
}

describe("KeyManager", () => {
  it("explains that `default` is a magic name used automatically by serve", async () => {
    render(<KeyManager />);

    expect(await screen.findByText("default 是魔法名")).toBeInTheDocument();
    expect(screen.getByText(/serve 会自动使用它/)).toBeInTheDocument();
  });

  it("refuses to create a key without a name", async () => {
    const { dialog } = await openCreateDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }));

    expect(api.engineCreateKey).not.toHaveBeenCalled();
    expect(
      await screen.findByText("请填写密钥名称"),
    ).toBeInTheDocument();
  });

  it("refuses to create a key with illegal characters", async () => {
    const { dialog } = await openCreateDialog();

    fireEvent.change(within(dialog).getByLabelText(/名称/), {
      target: { value: "bad name!" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }));

    expect(api.engineCreateKey).not.toHaveBeenCalled();
    expect(
      await screen.findByText("密钥名只能包含字母、数字、点、下划线和连字符"),
    ).toBeInTheDocument();
  });

  it("shows the address returned for a new server key", async () => {
    const address = `tc${"A".repeat(60)}`;
    vi.mocked(api.engineCreateKey).mockResolvedValue({
      name: "server-1",
      client: false,
      address,
      publicKey: null,
      path: "/tmp/keys/server-1",
    });
    const { dialog } = await openCreateDialog();

    fireEvent.change(within(dialog).getByLabelText(/名称/), {
      target: { value: "server-1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }));

    await waitFor(() =>
      expect(api.engineCreateKey).toHaveBeenCalledWith({
        name: "server-1",
        client: false,
        region: null,
        fixedRegion: false,
        embedDerpMap: false,
        force: false,
      }),
    );
    expect(await screen.findByText(address)).toBeInTheDocument();
  });

  it("requires a second confirmation before deleting a key", async () => {
    const saved: SavedKey = {
      name: "default",
      client: false,
      isDefault: true,
      path: "/tmp/keys/default",
    };
    vi.mocked(api.engineKeys).mockResolvedValue([saved]);
    render(<KeyManager />);

    fireEvent.click(await screen.findByRole("button", { name: "删除 default" }));
    expect(api.engineDeleteKey).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    await waitFor(() =>
      expect(api.engineDeleteKey).toHaveBeenCalledWith("default"),
    );
  });
});
