import type { ErrorCode, UserFacingError } from "./types";

const KNOWN_CODES = new Set<string>([
  "ENGINE_NOT_FOUND",
  "ENGINE_UNUSABLE",
  "ENGINE_VERSION_FAILED",
  "ENGINE_UNSUPPORTED_PLATFORM",
  "ENGINE_DOWNLOAD_FAILED",
  "ENGINE_CHECKSUM_MISMATCH",
  "ADDRESS_INVALID",
  "ADDRESS_UNRESOLVED",
  "PORT_IN_USE",
  "PORT_INVALID",
  "PATH_NOT_ALLOWED",
  "PATH_NOT_FOUND",
  "PATH_TRAVERSAL",
  "PERMISSION_DENIED",
  "DISK_FULL",
  "NETWORK_ERROR",
  "DERP_UNREACHABLE",
  "CONNECT_FAILED",
  "PROCESS_FAILED",
  "TASK_NOT_FOUND",
  "TASK_NOT_RUNNING",
  "TASK_ALREADY_RUNNING",
  "UNSUPPORTED",
  "CANCELLED",
  "CONFIG_ERROR",
  "IO_ERROR",
  "INTERNAL",
]);

export function makeError(
  code: ErrorCode,
  message: string,
  hint: string | null = null,
  detail: string | null = null,
): UserFacingError {
  return { code, message, hint, detail };
}

/**
 * Tauri rejects a command with a plain string. The Rust side serialises
 * `UserFacingError` as JSON, so parse it back when possible and degrade
 * gracefully when a third-party plugin throws something else.
 */
export function normalizeError(err: unknown): UserFacingError {
  if (isUserFacingError(err)) return err;

  if (typeof err === "string") {
    const parsed = tryParseJson(err);
    if (isUserFacingError(parsed)) return parsed;
    return makeError("INTERNAL", err, null, err);
  }

  if (err instanceof Error) {
    const parsed = tryParseJson(err.message);
    if (isUserFacingError(parsed)) return parsed;
    return makeError("INTERNAL", err.message, null, err.stack ?? null);
  }

  return makeError("INTERNAL", String(err), null, null);
}

export function isUserFacingError(value: unknown): value is UserFacingError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    KNOWN_CODES.has(candidate.code) &&
    typeof candidate.message === "string"
  );
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
