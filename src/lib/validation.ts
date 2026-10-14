/**
 * Client-side input validation.
 *
 * These checks are a UX fast path only: the backend re-validates everything and
 * the authoritative check for a connection token is `tailcat parse`, which we
 * call before ever passing a token to another subcommand.
 */

export interface ValidationResult {
  ok: boolean;
  /** Machine-readable reason used to pick a localised message. */
  reason?:
    | "empty"
    | "bad_chars"
    | "too_short"
    | "too_long"
    | "out_of_range"
    | "not_absolute"
    | "bad_host"
    | "bad_port_range"
    | "reversed_range"
    | "bad_scheme";
  message?: string;
}

const BLOB_RE = /^tc[0-9A-Za-z_-]{20,}$/;
const DNS_RE = /^(?=.{1,253}$)([a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.)+[a-zA-Z]{2,}$/;

/** `tc...` tokens are case-sensitive base64url over CBOR. */
export function isAddressBlob(value: string): boolean {
  return BLOB_RE.test(value.trim());
}

export function isDnsName(value: string): boolean {
  return DNS_RE.test(value.trim());
}

export function validateAddress(value: string): ValidationResult {
  const text = value.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (/\s/.test(text)) {
    return { ok: false, reason: "bad_chars", message: "地址中不能包含空格" };
  }
  if (text.startsWith("tc")) {
    if (text.length < 22) return { ok: false, reason: "too_short" };
    if (text.length > 4096) return { ok: false, reason: "too_long" };
    if (!BLOB_RE.test(text)) {
      return {
        ok: false,
        reason: "bad_chars",
        message: "地址令牌包含非法字符（令牌区分大小写）",
      };
    }
    return { ok: true };
  }
  if (isDnsName(text)) return { ok: true };
  if (text.includes("://")) {
    return {
      ok: false,
      reason: "bad_scheme",
      message: "请只填写地址令牌或 DNS 名称，不要包含协议前缀",
    };
  }
  return {
    ok: false,
    reason: "bad_chars",
    message: "既不是 tc 开头的地址令牌，也不是合法的 DNS 名称",
  };
}

export function validatePort(value: string | number): ValidationResult {
  const text = String(value).trim();
  if (!text) return { ok: false, reason: "empty" };
  if (!/^\d+$/.test(text)) {
    return { ok: false, reason: "bad_chars", message: "端口必须是数字" };
  }
  const port = Number(text);
  if (port < 0 || port > 65535) {
    return { ok: false, reason: "out_of_range", message: "端口范围是 0-65535" };
  }
  return { ok: true };
}

/** Port 0 is only meaningful for a *local* listener (OS-assigned). */
export function validateListenPort(value: string | number): ValidationResult {
  const result = validatePort(value);
  if (!result.ok) return result;
  if (Number(value) === 0) return { ok: true };
  if (Number(value) < 1) {
    return { ok: false, reason: "out_of_range", message: "监听端口必须大于 0" };
  }
  return { ok: true };
}

export function validateRemotePort(value: string | number): ValidationResult {
  const result = validatePort(value);
  if (!result.ok) return result;
  const port = Number(value);
  if (port < 1) {
    return {
      ok: false,
      reason: "out_of_range",
      message: "远端端口必须大于 0（服务端不会监听 0 端口）",
    };
  }
  return { ok: true };
}

/**
 * A `serve` target: port, port range, or one of the CLI's service keywords.
 * Mirrors `tailcat serve --help`; anything else is rejected before exec.
 */
export const SERVE_SERVICES = ["all", "exit-node", "no-auth-ssh", "files"] as const;

export function validateServeTarget(value: string): ValidationResult {
  const text = value.trim();
  if (!text) return { ok: false, reason: "empty" };
  if ((SERVE_SERVICES as readonly string[]).includes(text)) return { ok: true };

  const range = /^(\d{1,5})-(\d{1,5})$/.exec(text);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start < 1 || start > 65535 || end < 1 || end > 65535) {
      return { ok: false, reason: "out_of_range", message: "端口范围是 1-65535" };
    }
    if (end < start) {
      return { ok: false, reason: "reversed_range", message: "端口范围起止顺序颠倒" };
    }
    return { ok: true };
  }

  const port = validateRemotePort(text);
  if (!port.ok) return port;
  return { ok: true };
}

export function parseServeTargets(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const HOST_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}|\[[0-9a-fA-F:]+\]|localhost|[a-zA-Z0-9._-]+)$/;

export function validateBindHost(value: string): ValidationResult {
  const text = value.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.includes(" ")) {
    return { ok: false, reason: "bad_chars", message: "监听地址不能包含空格" };
  }
  if (!HOST_RE.test(text)) {
    return { ok: false, reason: "bad_host", message: "监听地址不是合法的 IP 或主机名" };
  }
  return { ok: true };
}

export function isLoopbackHost(host: string): boolean {
  const text = host.trim().toLowerCase();
  return (
    text === "localhost" ||
    text === "127.0.0.1" ||
    text === "::1" ||
    text === "[::1]" ||
    text.startsWith("127.")
  );
}

/**
 * Rejects remote paths that try to escape the server's served root before the
 * CLI ever sees them. The CLI also confines paths with `os.Root`; this is a
 * second, earlier line of defence.
 */
export function validateRemotePath(value: string): ValidationResult {
  const text = value.trim();
  if (text.includes("\0")) {
    return { ok: false, reason: "bad_chars", message: "路径包含空字符" };
  }
  if (text.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(text)) {
    return {
      ok: false,
      reason: "not_absolute",
      message: "远端路径必须是相对路径（相对于服务端共享目录）",
    };
  }
  const segments = text.split(/[\\/]+/);
  if (segments.some((segment) => segment === "..")) {
    return {
      ok: false,
      reason: "bad_chars",
      message: "远端路径不能包含 ..（不允许路径穿越）",
    };
  }
  return { ok: true };
}

export function validateUrl(value: string): ValidationResult {
  const text = value.trim();
  if (!text) return { ok: false, reason: "empty" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "bad_scheme", message: "不是合法的 URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "bad_scheme", message: "只允许 http/https" };
  }
  return { ok: true };
}

/** Key names are written into a filename by the CLI; keep them boring. */
export function validateKeyName(value: string): ValidationResult {
  const text = value.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > 64) return { ok: false, reason: "too_long" };
  if (!/^[A-Za-z0-9._-]+$/.test(text)) {
    return {
      ok: false,
      reason: "bad_chars",
      message: "密钥名只能包含字母、数字、点、下划线和连字符",
    };
  }
  if (text.startsWith(".") || text.includes("..")) {
    return { ok: false, reason: "bad_chars", message: "密钥名不合法" };
  }
  return { ok: true };
}
