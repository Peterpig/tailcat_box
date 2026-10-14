import { isNativeRuntime } from "./ipc";
import { normalizeError } from "./errors";

/**
 * Clipboard access that works in both the Tauri shell and a browser preview.
 * Returns a normalised error instead of throwing so callers can show a toast.
 */
export async function writeClipboard(text: string): Promise<{ ok: boolean; error?: unknown }> {
  try {
    if (isNativeRuntime()) {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(text);
      return { ok: true };
    }
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}
