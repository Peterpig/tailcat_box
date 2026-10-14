import { describe, expect, it } from "vitest";
import {
  parseScpProgress,
  parseScpProgressText,
  stderrLines,
} from "@/features/transfer/progress";
import type { LogLine } from "@/lib/types";

function logLine(
  text: string,
  stream: LogLine["stream"] = "stderr",
  seq = 0,
): LogLine {
  return { seq, ts: "2026-10-14T10:00:00.000Z", stream, level: "warn", text };
}

describe("parseScpProgressText", () => {
  it("parses a canonical scp progress line", () => {
    expect(
      parseScpProgressText("report.pdf  12%  1200KB  3.4MB/s  00:03 ETA"),
    ).toEqual({
      percent: 12,
      file: "report.pdf",
      transferred: "1200KB",
      rate: "3.4MB/s",
      eta: "00:03",
      text: "report.pdf  12%  1200KB  3.4MB/s  00:03 ETA",
    });
  });

  it("accepts a bare percentage without inventing the other fields", () => {
    expect(parseScpProgressText("100%")).toEqual({
      percent: 100,
      file: null,
      transferred: null,
      rate: null,
      eta: null,
      text: "100%",
    });
  });

  it("returns null when the line carries no percentage", () => {
    expect(parseScpProgressText("Connecting to peer…")).toBeNull();
    expect(parseScpProgressText("3.4MB/s 00:03")).toBeNull();
    expect(parseScpProgressText("")).toBeNull();
  });

  it("returns null for out-of-range percentages", () => {
    expect(parseScpProgressText("101%")).toBeNull();
    expect(parseScpProgressText("1234% 1MB 2MB/s 00:01")).toBeNull();
  });
});

describe("parseScpProgress", () => {
  it("uses the newest parseable stderr line", () => {
    const lines = [
      logLine("a.txt  10%  100KB  1.0MB/s  00:09", "stderr", 0),
      logLine("a.txt  55%  900KB  1.1MB/s  00:04", "stderr", 1),
      logLine("still going", "stderr", 2),
    ];
    expect(parseScpProgress(lines)?.percent).toBe(55);
  });

  it("ignores stdout lines", () => {
    const lines = [
      logLine("a.txt  10%  100KB  1.0MB/s  00:09", "stdout", 0),
      logLine("scp: /root/x: Permission denied", "stderr", 1),
    ];
    expect(parseScpProgress(lines)).toBeNull();
  });

  it("returns null when nothing is parseable", () => {
    expect(parseScpProgress([])).toBeNull();
    expect(
      parseScpProgress([logLine("scp: no such file", "stderr", 0)]),
    ).toBeNull();
  });

  it("reads \\r-separated updates inside a single captured line", () => {
    const lines = [logLine("0%\r50%\r100%  1MB  2MB/s  00:01", "stderr", 0)];
    expect(parseScpProgress(lines)?.percent).toBe(100);
  });

  it("filters stderr lines", () => {
    expect(
      stderrLines([
        logLine("out", "stdout", 0),
        logLine("err", "stderr", 1),
        logLine("app", "app", 2),
      ]).map((line) => line.text),
    ).toEqual(["err"]);
  });
});
