import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ForwardsScreen from "@/features/forwards/ForwardsScreen";
import { api } from "@/lib/api";
import {
  DEFAULT_SETTINGS,
  type ParsedAddress,
  type TaskInfo,
  type TaskRequest,
} from "@/lib/types";
import { useAppStore } from "@/store/app";

vi.mock("@/lib/api", () => ({
  api: {
    engineParse: vi.fn(),
    startTask: vi.fn(),
    stopTask: vi.fn(),
    removeTask: vi.fn(),
    taskLogs: vi.fn(),
    openUrl: vi.fn(),
  },
}));

const noop = () => {};

/**
 * `userEvent.setup()` cannot stub `navigator.clipboard` in this repo's jsdom
 * setup (the property is non-configurable), so interactions use `fireEvent`.
 */
function setValue(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit(buttonName: string) {
  const form = screen.getByRole("button", { name: buttonName }).closest("form");
  if (!form) throw new Error(`no form for button ${buttonName}`);
  fireEvent.submit(form);
}

function parsedAddress(): ParsedAddress {
  return {
    input: "tcTESTTOKEN",
    blob: "tcTESTTOKEN",
    dnsName: null,
    serverPublicKey: null,
    regionId: null,
    regionHosts: [],
    selfContained: false,
  };
}

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    id: "task-1",
    kind: "forward",
    status: "running",
    label: "端口转发 → :8080",
    pid: 4242,
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    endedAt: null,
    argsSummary: ["tailcat", "<地址>", "8080"],
    address: null,
    listenAddr: "127.0.0.1:54321",
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
    engine: null,
    settings: { ...DEFAULT_SETTINGS },
  });

  vi.mocked(api.engineParse).mockResolvedValue(parsedAddress());
  vi.mocked(api.taskLogs).mockResolvedValue({ lines: [], nextSeq: 0 });
  vi.mocked(api.startTask).mockImplementation(async (request: TaskRequest) =>
    makeTask({ id: "task-new", kind: request.kind, label: request.label ?? "任务" }),
  );
  vi.mocked(api.stopTask).mockImplementation(async (id: string) =>
    makeTask({ id, status: "stopped", endedAt: "2026-01-01T00:05:00.000Z" }),
  );
  vi.mocked(api.removeTask).mockResolvedValue(undefined);
  vi.mocked(api.openUrl).mockResolvedValue(undefined);
});

describe("ForwardsScreen", () => {
  it("shows the empty state with the serve prerequisite", () => {
    render(<ForwardsScreen onNavigate={noop} />);

    expect(screen.getByText("暂无端口转发任务")).toBeInTheDocument();
    expect(
      screen.getByText(/对端先执行 tailcat serve <端口> 暴露服务/),
    ).toBeInTheDocument();
  });

  it("reports an out-of-range remote port and never reaches the backend", async () => {
    render(<ForwardsScreen onNavigate={noop} />);

    setValue(/远端端口/, "99999");
    submit("启动转发");

    expect(await screen.findByText(/端口范围是 0-65535/)).toBeInTheDocument();
    expect(api.engineParse).not.toHaveBeenCalled();
    expect(api.startTask).not.toHaveBeenCalled();
  });

  it("warns about a non-loopback bind and blocks it until settings allow it", async () => {
    render(<ForwardsScreen onNavigate={noop} />);

    setValue(/监听地址/, "0.0.0.0");

    expect(screen.getByText("局域网内其他设备可访问此端口。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启动转发" })).toBeDisabled();

    act(() => {
      useAppStore.setState({
        settings: { ...DEFAULT_SETTINGS, allowNonLoopbackBind: true },
      });
    });

    expect(screen.getByRole("button", { name: "启动转发" })).toBeEnabled();
  });

  it("shows the listen address reported by the backend", () => {
    useAppStore.setState({ tasks: [makeTask({ listenAddr: "127.0.0.1:61234" })] });
    render(<ForwardsScreen onNavigate={noop} />);

    expect(screen.getByText("127.0.0.1:61234")).toBeInTheDocument();
  });

  it("stops and removes a task through the store", async () => {
    const task = makeTask();
    useAppStore.setState({ tasks: [task] });
    render(<ForwardsScreen onNavigate={noop} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "停止" }));
    });
    expect(api.stopTask).toHaveBeenCalledWith(task.id);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "删除" }));
    });
    expect(api.removeTask).toHaveBeenCalledWith(task.id);
  });

  it("parses the address and launches a forward with the submitted values", async () => {
    render(<ForwardsScreen onNavigate={noop} />);

    setValue(/远端地址/, "peer.example.com");
    setValue(/远端端口/, "8080");
    setValue(/本地端口/, "13306");
    submit("启动转发");

    await waitFor(() => expect(api.startTask).toHaveBeenCalledTimes(1));
    expect(api.engineParse).toHaveBeenCalledWith("peer.example.com");
    expect(api.startTask).toHaveBeenCalledWith({
      kind: "forward",
      address: "peer.example.com",
      remotePort: 8080,
      localPort: 13306,
      bindHost: "127.0.0.1",
      label: undefined,
    });
  });
});
