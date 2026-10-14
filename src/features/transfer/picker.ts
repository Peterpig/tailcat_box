import { open } from "@tauri-apps/plugin-dialog";

/**
 * Thin wrappers around the native dialog plugin.
 *
 * They normalise "user cancelled" to an empty result and let real failures
 * bubble up so the caller can show a toast instead of silently doing nothing.
 */

function normalize(picked: string | string[] | null): string[] {
  if (!picked) return [];
  const list = Array.isArray(picked) ? picked : [picked];
  return list.filter((item) => typeof item === "string" && item.length > 0);
}

export async function pickDirectory(title?: string): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title });
  return typeof picked === "string" && picked.length > 0 ? picked : null;
}

export async function pickFiles(title?: string): Promise<string[]> {
  return normalize(await open({ directory: false, multiple: true, title }));
}

export async function pickDirectories(title?: string): Promise<string[]> {
  return normalize(await open({ directory: true, multiple: true, title }));
}
