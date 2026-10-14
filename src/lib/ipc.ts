import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

/**
 * Thin transport layer.
 *
 * In the packaged app every call is a Tauri command. When the frontend is
 * opened in a plain browser (`pnpm dev` without the Rust shell) we fall back to
 * an explicitly-labelled in-memory preview backend so the UI can still be
 * designed and tested. The preview backend is gated behind `import.meta.env.DEV`
 * so it is dead-code-eliminated from production bundles.
 */

type InvokeArgs = Record<string, unknown> | undefined;
type Unsubscribe = () => void;

export function isNativeRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    Object.prototype.hasOwnProperty.call(window, "__TAURI_INTERNALS__")
  );
}

export function isPreviewRuntime(): boolean {
  return !isNativeRuntime() && import.meta.env.DEV;
}

export async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  if (isNativeRuntime()) {
    return (await tauriInvoke(command, args)) as T;
  }
  if (import.meta.env.DEV) {
    const { previewInvoke } = await import("./preview-backend");
    return (await previewInvoke(command, args)) as T;
  }
  throw new Error(`IPC unavailable outside the Tauri runtime: ${command}`);
}

export async function subscribe<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<Unsubscribe> {
  if (isNativeRuntime()) {
    const unlisten = await tauriListen<T>(event, (message) =>
      handler(message.payload),
    );
    return () => {
      void unlisten();
    };
  }
  if (import.meta.env.DEV) {
    const { previewListen } = await import("./preview-backend");
    return previewListen(event, handler as (payload: unknown) => void);
  }
  return () => {};
}
