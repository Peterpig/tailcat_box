import type { LogLine } from "@/lib/types";

/**
 * Progress parsed from a real `scp` stderr line.
 *
 * `tailcat cp` shells out to the system `scp`, so the only honest source of
 * progress is scp's own stderr. Nothing here is estimated or interpolated:
 * when no percentage can be parsed the caller must show "progress unavailable"
 * rather than a made-up bar.
 */
export interface ScpProgress {
  /** 0-100, taken from an actual `NN%` token on the line. */
  percent: number;
  file: string | null;
  transferred: string | null;
  rate: string | null;
  eta: string | null;
  /** The raw stderr text the values came from. */
  text: string;
}

/**
 * Canonical scp progress line:
 * `report.pdf  12%  1200KB  3.4MB/s  00:03 ETA`
 */
const FULL_LINE_RE =
  /^\s*(.*?)\s*(\d{1,3})%\s+([\d.]+\s*[KMGTP]?i?B)\s+([\d.]+\s*[KMGTP]?i?B\/s)\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s+ETA)?\s*$/i;

/** Any `NN%` token, used when the line is a bare percentage. */
const PERCENT_RE = /(?:^|[^\d.])(\d{1,3})\s*%/;

/**
 * Parses a single line of scp stderr. Returns null when the line carries no
 * usable percentage, including out-of-range values such as `101%`.
 */
export function parseScpProgressText(text: string): ScpProgress | null {
  const full = FULL_LINE_RE.exec(text);
  if (full) {
    const percent = Number(full[2]);
    if (percent < 0 || percent > 100) return null;
    return {
      percent,
      file: full[1].trim() || null,
      transferred: full[3].replace(/\s+/g, ""),
      rate: full[4].replace(/\s+/g, ""),
      eta: full[5],
      text,
    };
  }

  const simple = PERCENT_RE.exec(text);
  if (!simple) return null;
  const percent = Number(simple[1]);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return { percent, file: null, transferred: null, rate: null, eta: null, text };
}

/** The subset of a task's log that scp writes its progress to. */
export function stderrLines(lines: readonly LogLine[]): LogLine[] {
  return lines.filter((line) => line.stream === "stderr");
}

/**
 * Scans a task's log backwards for the newest parseable progress line, so the
 * most recent percentage wins. Returns null when nothing is parseable.
 */
export function parseScpProgress(lines: readonly LogLine[]): ScpProgress | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.stream !== "stderr") continue;
    // A single captured "line" can still hold several \r-separated updates.
    const segments = line.text.split(/[\r\n]+/);
    for (let j = segments.length - 1; j >= 0; j -= 1) {
      const parsed = parseScpProgressText(segments[j]);
      if (parsed) return parsed;
    }
  }
  return null;
}
