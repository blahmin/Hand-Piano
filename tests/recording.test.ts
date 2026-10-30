import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordingPlayback, StrokeRecorder } from "../src/audio/recording";
import type { PianoTake, RecordingSettings } from "../src/audio/recording";

const settings: RecordingSettings = { mode: "piano", range: "split", leftBoost: 250 };

describe("stroke recording", () => {
  it("keeps overlapping input releases separate and records repeated strokes", () => {
    const recorder = new StrokeRecorder();
    recorder.start(settings, 1000);
    recorder.noteOn("key:KeyA", { side: "right", slot: 0 }, 1100);
    recorder.noteOn("pointer:1", { side: "right", slot: 0 }, 1150);
    recorder.noteOn("hand:left", { side: "left", slot: 4 }, 1150);
    recorder.noteOn("key:KeyA", { side: "right", slot: 0 }, 1200);
    recorder.noteOff("key:KeyA", 1300);
    recorder.noteOn("key:KeyA", { side: "right", slot: 1 }, 1400);
    recorder.noteOff("pointer:1", 1450);
    recorder.noteOff("missing", 1500);
    const take = recorder.stop(1600)!;
    expect(take.strokes).toEqual([
      { side: "right", slot: 0, startMs: 100, durationMs: 200 },
      { side: "right", slot: 0, startMs: 150, durationMs: 300 },
      { side: "left", slot: 4, startMs: 150, durationMs: 450 },
      { side: "right", slot: 1, startMs: 400, durationMs: 200 },
    ]);
    expect(take.durationMs).toBe(3600);
    expect(take).toMatchObject(settings);
    recorder.noteOn("after-stop", { side: "right", slot: 2 }, 1700);
    expect(recorder.count).toBe(4);
    expect(recorder.stop(1800)).toBeNull();
  });

  it("preserves the complete chord decay and takes a copy of the configuration", () => {
    const recorder = new StrokeRecorder();
    const config: RecordingSettings = { mode: "chords", range: "shared", leftBoost: 100 };
    recorder.start(config, 0);
    config.mode = "piano";
    const note = { side: "left" as const, slot: 0 };
    recorder.noteOn("chord", note, 500);
    note.slot = 4;
    recorder.noteOff("chord", 550);
    const take = recorder.stop(600)!;
    expect(take.mode).toBe("chords");
    expect(take.strokes[0]!.slot).toBe(0);
    expect(take.durationMs).toBe(3700);
    recorder.start(settings, 1000);
    expect(recorder.count).toBe(0);
    expect(recorder.stop(1500)).toBeNull();
    expect(take.strokes).toHaveLength(1);
  });

  it("keeps leading and trailing rests in a take", () => {
    const recorder = new StrokeRecorder();
    recorder.start(settings, 1000);
    recorder.noteOn("key", { side: "right", slot: 2 }, 2000);
    recorder.noteOff("key", 2500);
    const take = recorder.stop(9000)!;
    expect(take.strokes[0]!.startMs).toBe(1000);
    expect(take.durationMs).toBe(8000);
  });
});

afterEach(() => vi.useRealTimers());

describe("recording playback", () => {
  const take: PianoTake = {
    ...settings,
    durationMs: 4000,
    strokes: [
      { side: "left", slot: 0, startMs: 100, durationMs: 300 },
      { side: "right", slot: 4, startMs: 200, durationMs: 800 },
      { side: "left", slot: 1, startMs: 400, durationMs: 0 },
    ],
  };
  const setup = () => {
    vi.useFakeTimers();
    let clock = 0;
    const press = vi.fn();
    const release = vi.fn();
    const finished = vi.fn();
    const playback = new RecordingPlayback(press, release, finished, () => clock);
    const advance = (ms: number) => {
      // Timeouts and the monotonic performance clock advance together.
      for (let i = 0; i < ms; i++) {
        clock++;
        vi.advanceTimersByTime(1);
      }
    };
    return { playback, press, release, finished, advance };
  };

  it("replays both hands with independent holds and waits for the final decay", () => {
    const { playback, press, release, finished, advance } = setup();
    playback.start(take);
    advance(99);
    expect(press).not.toHaveBeenCalled();
    advance(1);
    expect(press).toHaveBeenLastCalledWith("playback:0", { side: "left", slot: 0 });
    advance(100);
    expect(press).toHaveBeenLastCalledWith("playback:1", { side: "right", slot: 4 });
    advance(200);
    expect(release.mock.calls).toEqual([["playback:0"], ["playback:2"]]);
    expect(press).toHaveBeenLastCalledWith("playback:2", { side: "left", slot: 1 });
    advance(600);
    expect(release).toHaveBeenLastCalledWith("playback:1");
    expect(finished).not.toHaveBeenCalled();
    advance(3000);
    expect(finished).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels queued strokes and releases every active playback input", () => {
    const { playback, press, release, finished, advance } = setup();
    playback.start(take);
    advance(250);
    playback.stop();
    expect(release.mock.calls).toEqual([["playback:0"], ["playback:1"]]);
    expect(vi.getTimerCount()).toBe(0);
    advance(5000);
    expect(press).toHaveBeenCalledTimes(2);
    expect(finished).not.toHaveBeenCalled();
    playback.stop();
    expect(release).toHaveBeenCalledTimes(2);
    playback.start(take);
    advance(100);
    expect(press).toHaveBeenCalledTimes(3);
  });
});
