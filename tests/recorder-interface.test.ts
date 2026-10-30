import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Recorder, formatRecordingTime } from "../src/components/Recorder";
import type { RecordingStatus } from "../src/use-instrument";
import type { PianoTake } from "../src/audio/recording";

const take: PianoTake = {
  mode: "piano", range: "split", leftBoost: 250, durationMs: 4200,
  strokes: [{ side: "right", slot: 0, startMs: 0, durationMs: 1200 }],
};
const render = (status: RecordingStatus, saved: PianoTake | null = null) =>
  renderToStaticMarkup(createElement(Recorder, {
    status, take: saved, elapsedMs: 1200, strokeCount: 1, message: "Ready when you are.",
    onRecord: vi.fn(), onPlay: vi.fn(), onStop: vi.fn(), onClear: vi.fn(),
  }));

describe("recorder controls", () => {
  it("disables playback without a take and offers it when a take is ready", () => {
    expect(render("idle")).toMatch(/disabled=""[^>]*>.*?Play recording/);
    expect(render("idle", take)).not.toContain('disabled=""');
    expect(render("idle", take)).toContain("Record new take");
  });
  it("provides an available stop or cancel action while busy", () => {
    expect(render("recording")).toContain("Stop recording");
    expect(render("playing", take)).toContain("Stop playback");
    expect(render("preparing", take)).toContain("Cancel");
    expect(render("recording")).not.toContain("Record new take");
    expect(render("playing", take)).toContain('aria-label="Piano recorder"');
    expect(render("playing", take)).toContain('role="status"');
  });
  it("formats minutes, seconds, and tenths without rounding up", () => {
    expect(formatRecordingTime(0)).toBe("00:00.0");
    expect(formatRecordingTime(61999)).toBe("01:01.9");
    expect(formatRecordingTime(600000)).toBe("10:00.0");
  });
});
