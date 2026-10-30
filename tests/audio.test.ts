import { afterEach, describe, expect, it, vi } from "vitest";
import { PianoAudio } from "../src/audio/piano";

class Parameter {
  value = 0;
  scheduled: number[] = [];
  targets: Array<{ value: number; start: number; timeConstant: number }> = [];
  setValueAtTime(value: number) {
    this.value = value;
    this.scheduled.push(value);
  }
  linearRampToValueAtTime(value: number) {
    this.value = value;
    this.scheduled.push(value);
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value;
    this.scheduled.push(value);
  }
  setTargetAtTime(value: number, start = 0, timeConstant = 0) {
    this.value = value;
    this.targets.push({ value, start, timeConstant });
  }
  cancelAndHoldAtTime() {
    /* Scheduling itself is verified by captured ramps. */
  }
}
class Node {
  gain = new Parameter();
  frequency = new Parameter();
  type = "";
  connect = vi.fn();
  disconnect = vi.fn();
}
class Oscillator extends Node {
  onended: ((event: Event) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}
class BufferSource extends Oscillator {
  buffer: AudioBuffer | null = null;
  playbackRate = new Parameter();
  loop = false;
}
class Compressor extends Node {
  threshold = new Parameter();
  knee = new Parameter();
  ratio = new Parameter();
  attack = new Parameter();
  release = new Parameter();
}
class Context {
  static latest: Context;
  state = "suspended";
  currentTime = 1;
  destination = new Node();
  oscillators: Oscillator[] = [];
  bufferSources: BufferSource[] = [];
  decodeAudioData = vi.fn(async () => ({ duration: 3.2 }) as AudioBuffer);
  gains: Node[] = [];
  compressor: Compressor | null = null;
  constructor() {
    Context.latest = this;
  }
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createGain() {
    const gain = new Node();
    this.gains.push(gain);
    return gain;
  }
  createBiquadFilter() {
    return new Node();
  }
  createDynamicsCompressor() {
    this.compressor = new Compressor();
    return this.compressor;
  }
  createOscillator() {
    const oscillator = new Oscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createBufferSource() {
    const source = new BufferSource();
    this.bufferSources.push(source);
    return source;
  }
}

afterEach(() => vi.unstubAllGlobals());
const setup = async () => {
  vi.stubGlobal("AudioContext", Context);
  const engine = new PianoAudio();
  await engine.enable();
  return { engine, context: Context.latest };
};

describe("audio voice ownership and lifecycle", () => {
  it("preloads each chord once, then plays complete overlapping one-shot recordings", async () => {
    const { engine, context } = await setup();
    const fetchSample = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    vi.stubGlobal("fetch", fetchSample);
    await Promise.all([engine.loadChords(), engine.loadChords()]);
    await engine.loadChords();
    expect(fetchSample).toHaveBeenCalledTimes(10);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(10);
    expect(
      fetchSample.mock.calls.map((call) => (call as unknown as string[])[0]),
    ).toContain("/audio/chords/bm.wav");
    engine.setLeftBoost(1);
    expect(engine.chordOn("hand:left", "C", "left")).toBe(true);
    expect(engine.chordOn("hand:left", "C", "left")).toBe(false);
    expect(engine.chordOn("hand:right", "Am", "right")).toBe(true);
    engine.noteOff("hand:left");
    expect(context.bufferSources[0]!.stop).not.toHaveBeenCalled();
    expect(engine.chordOn("hand:left", "Dm", "left")).toBe(true);
    context.bufferSources[0]!.onended?.(new Event("ended"));
    expect(engine.chordOn("hand:left", "F", "left")).toBe(false);
    expect(context.bufferSources[1]!.stop).not.toHaveBeenCalled();
    expect(context.oscillators).toHaveLength(0);
    expect(
      context.bufferSources.every(
        (source) => source.buffer?.duration === 3.2 && !source.loop,
      ),
    ).toBe(true);
    engine.allNotesOff();
    expect(
      context.bufferSources
        .slice(1)
        .every((source) => source.stop.mock.calls.length === 1),
    ).toBe(true);
  });

  it("rejects missing recordings and permits a complete preload retry", async () => {
    const { engine, context } = await setup();
    const fetchSample = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    vi.stubGlobal("fetch", fetchSample);
    await expect(engine.loadChords()).rejects.toThrow("Could not load chord");
    expect(engine.chordOn("hand:left", "C", "left")).toBe(false);
    fetchSample.mockImplementation(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    await engine.loadChords();
    expect(engine.chordOn("hand:right", "Bm", "right")).toBe(true);
    await engine.dispose();
    expect(context.bufferSources[0]!.stop).toHaveBeenCalledOnce();
    expect(engine.chordOn("hand:right", "Bm", "right")).toBe(false);
  });
  it("starts louder and routes overlapping notes through a compressor", async () => {
    const { context } = await setup();
    expect(context.gains[0]!.gain.value).toBeCloseTo(0.675);
    expect(context.gains[0]!.connect).toHaveBeenCalledWith(context.compressor);
    expect(context.compressor!.connect).toHaveBeenCalledWith(
      context.destination,
    );
    expect(context.compressor!.threshold.value).toBeLessThan(0);
    expect(context.compressor!.ratio.value).toBeGreaterThan(1);
  });

  it("boosts the low octave through attack and sustain", async () => {
    const { engine, context } = await setup();
    engine.noteOn("hand:left", 48);
    engine.noteOn("hand:right", 60);
    const envelopes = context.gains
      .filter((node) => node.gain.scheduled.length > 0)
      .map((node) => node.gain.scheduled);
    const [low, high] = envelopes;
    expect(low![1]! / high![1]!).toBeCloseTo(10 ** (6 / 20));
    expect(low!.at(-1)! / high!.at(-1)!).toBeCloseTo(10 ** (6 / 20));
    expect(high!.at(-1)!).toBeGreaterThan(0.025);
  });

  it("uses identical voice envelopes before applying the left bank boost", async () => {
    const { engine, context } = await setup();
    engine.noteOn("hand:left", 60, "left");
    engine.noteOn("hand:right", 60, "right");
    const envelopes = context.gains
      .filter((node) => node.gain.scheduled.length > 0)
      .map((node) => node.gain.scheduled);
    expect(envelopes[0]).toEqual(envelopes[1]);
  });

  it("boosts the entire left bank through a separate gain without changing the right bank", async () => {
    const { engine, context } = await setup();
    engine.noteOn("hand:left", 60, "left");
    engine.noteOn("hand:right", 60, "right");
    const voices = context.gains.filter(
      (node) => node.gain.scheduled.length > 0,
    );
    const leftBus = voices[0]!.connect.mock.calls[0]![0] as Node;
    expect(leftBus).not.toBe(context.gains[0]);
    expect(leftBus.gain.value).toBe(2.5);
    expect(leftBus.connect).toHaveBeenCalledWith(context.gains[0]);
    expect(voices[1]!.connect).toHaveBeenCalledWith(context.gains[0]);
    engine.setLeftBoost(3);
    expect(leftBus.gain.value).toBe(3);
    expect(context.oscillators).toHaveLength(6);
    expect(
      context.oscillators.every((node) => node.stop.mock.calls.length === 0),
    ).toBe(true);
  });

  it("requires audio activation, then resumes one reusable context", async () => {
    const { engine, context } = await setup();
    await engine.enable();
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(engine.noteOn("keyboard", 69)).toBe(true);
    expect(
      context.oscillators.map((oscillator) => oscillator.frequency.value),
    ).toEqual([440, 880, 1320]);
    expect(engine.noteOn("keyboard", 69)).toBe(false);
    expect(context.oscillators).toHaveLength(3);
  });
  it("releases one source without stopping another source on the same pitch", async () => {
    const { engine, context } = await setup();
    engine.noteOn("gesture", 60);
    engine.noteOn("keyboard", 60);
    engine.noteOff("gesture");
    expect(
      context.oscillators
        .slice(0, 3)
        .every((oscillator) => oscillator.stop.mock.calls.length === 1),
    ).toBe(true);
    expect(
      context.oscillators
        .slice(3)
        .every((oscillator) => oscillator.stop.mock.calls.length === 0),
    ).toBe(true);
    engine.allNotesOff();
    expect(
      context.oscillators
        .slice(0, 3)
        .every((oscillator) => oscillator.stop.mock.calls.length === 2),
    ).toBe(true);
    expect(
      context.oscillators
        .slice(3)
        .every((oscillator) => oscillator.stop.mock.calls.length === 1),
    ).toBe(true);
    expect(context.gains.some((gain) => gain.gain.scheduled.at(-1) === 0)).toBe(
      true,
    );
  });

  it("lets released chords ring and allows a new note while their tails fade", async () => {
    const { engine, context } = await setup();
    engine.noteOn("hand:left", 48, "left");
    engine.noteOn("hand:right", 64, "right");
    engine.noteOff("hand:left");
    engine.noteOff("hand:right");
    expect(
      context.oscillators.every(
        (oscillator) =>
          oscillator.stop.mock.calls[0]![0] >= context.currentTime + 2.5,
      ),
    ).toBe(true);
    const envelopes = context.gains.filter(
      (node) => node.gain.scheduled.length > 0,
    );
    expect(
      envelopes.every((node) => node.gain.targets.at(-1)!.timeConstant >= 0.5),
    ).toBe(true);
    expect(engine.noteOn("hand:left", 52, "left")).toBe(true);
    context.oscillators[2]!.onended?.(new Event("ended"));
    expect(engine.noteOn("hand:left", 55, "left")).toBe(false);
  });

  it("bounds ringing tails during rapid retriggering", async () => {
    const { engine, context } = await setup();
    for (let index = 0; index < 60; index++) {
      engine.noteOn("keyboard", 60 + (index % 8));
      engine.noteOff("keyboard");
    }
    const ringing = context.oscillators.filter(
      (oscillator) =>
        oscillator.stop.mock.calls.at(-1)![0] > context.currentTime + 2,
    );
    expect(ringing.length).toBeLessThanOrEqual(24 * 3);
    engine.allNotesOff();
    expect(
      context.oscillators.every(
        (oscillator) =>
          oscillator.stop.mock.calls.at(-1)![0] < context.currentTime + 0.1,
      ),
    ).toBe(true);
  });
  it("updates volume and closes resources on disposal", async () => {
    const { engine, context } = await setup();
    engine.setVolume(0);
    expect(context.gains[0]!.gain.value).toBe(0);
    engine.noteOn("pointer", 72);
    await engine.dispose();
    expect(context.close).toHaveBeenCalledOnce();
    expect(context.compressor!.disconnect).toHaveBeenCalledOnce();
    expect(
      context.oscillators.every(
        (oscillator) => oscillator.stop.mock.calls.length === 1,
      ),
    ).toBe(true);
    expect(engine.noteOn("after-disposal", 60)).toBe(false);
  });
});
