import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteSelection } from "../src/config";

const state = vi.hoisted(() => ({
  activeNotes: [] as NoteSelection[],
  selectedLeft: null as number | null,
  selectedRight: null as number | null,
  lastNote: { side: "right", slot: 0 } as NoteSelection,
  trackedLeft: false,
  trackedRight: false,
  heldLeft: null as number | null,
  heldRight: null as number | null,
  mode: "piano" as "piano" | "chords",
}));

vi.mock("../src/use-instrument", () => ({
  useInstrument: () => ({
    videoRef: { current: null },
    canvasRef: { current: null },
    status: state.trackedLeft || state.trackedRight ? "live" : "idle",
    hands: {
      left: {
        tracked: state.trackedLeft,
        selected: state.selectedLeft,
        held: state.heldLeft,
        pinching: false,
        armed: state.trackedLeft,
        ratio: null,
        cursorX: null,
      },
      right: {
        tracked: state.trackedRight,
        selected: state.selectedRight,
        held: state.heldRight,
        pinching: false,
        armed: state.trackedRight,
        ratio: null,
        cursorX: null,
      },
    },
    activeNotes: state.activeNotes,
    lastNote: state.lastNote,
    notesPlayed: 0,
    error: null,
    fps: 30,
    volume: 75,
    leftBoost: 250,
    showLandmarks: true,
    range: "split",
    mode: state.mode,
    sampleStatus: "ready",
    start: vi.fn(),
    stop: vi.fn(),
    press: vi.fn(),
    release: vi.fn(),
    enableSound: vi.fn(),
    setVolume: vi.fn(),
    setLeftBoost: vi.fn(),
    setRange: vi.fn(),
    setMode: vi.fn(),
    toggleLandmarks: vi.fn(),
    recordingStatus: "idle",
    recordingElapsedMs: 0,
    recordedStrokeCount: 0,
    recordingMessage: "Ready when you are.",
    take: null,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    playRecording: vi.fn(),
    clearRecording: vi.fn(),
  }),
}));

import App from "../src/App";

beforeEach(() => {
  state.activeNotes = [];
  state.selectedLeft = state.selectedRight = null;
  state.lastNote = { side: "right", slot: 0 };
  state.trackedLeft = state.trackedRight = false;
  state.heldLeft = state.heldRight = null;
  state.mode = "piano";
});
const largeNote = (html: string) =>
  html.match(/class="large-note">(.*?)<\/div>/)?.[1];

describe("instrument display", () => {
  it("labels all ten recordings as chords with five keys per hand", () => {
    state.mode = "chords";
    const html = renderToStaticMarkup(createElement(App));
    for (const chord of ["C", "Dm", "Em", "F", "G"])
      expect(html).toContain(`aria-label="Play left ${chord} (`);
    for (const chord of ["Am", "D", "A", "E", "Bm"])
      expect(html).toContain(`aria-label="Play right ${chord} (`);
    expect(html).not.toContain("Play left C3");
    expect(html).not.toContain("Hz</span>");
    expect(html).not.toContain('id="hand-range"');
    expect(html).toContain('id="sound-mode"');
    expect(html).toContain("READY · LET IT RING");
    expect(html).toContain("whole chord plays and keeps ringing");
  });
  it("renders both eight-key fallback banks before camera permission", () => {
    const html = renderToStaticMarkup(createElement(App));
    for (const note of ["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4"])
      expect(html).toContain(`aria-label="Play left ${note} (`);
    for (const note of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"])
      expect(html).toContain(`aria-label="Play right ${note} (`);
    expect(html).toContain("Enable camera");
    expect(html).toContain("Play with keyboard");
  });

  it("displays the sounding manual note while a hand hovers another key", () => {
    state.trackedRight = true;
    state.selectedRight = 0;
    state.lastNote = { side: "right", slot: 4 };
    state.activeNotes = [state.lastNote];
    expect(largeNote(renderToStaticMarkup(createElement(App)))).toBe(
      "G<span>4</span>",
    );
  });

  it("displays a remaining held note after the most recent note is released", () => {
    state.lastNote = { side: "right", slot: 4 };
    state.activeNotes = [{ side: "left", slot: 2 }];
    expect(largeNote(renderToStaticMarkup(createElement(App)))).toBe(
      "E<span>3</span>",
    );
  });

  it("explains open, move, and pinch beside the camera without the note chart", () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain("Open your fingers");
    expect(html).toContain("Move your hand left or right");
    expect(html).toContain("Pinch to play");
    expect(html).toContain("Open again to choose another note.");
    expect(html).not.toContain("position-map");
    expect(html.indexOf('aria-label="How to change notes"')).toBeLessThan(
      html.indexOf('aria-label="Hand tracking camera"'),
    );
  });

  it("explains that an active pinch must open before changing notes", () => {
    state.trackedLeft = true;
    state.selectedLeft = state.heldLeft = 3;
    state.activeNotes = [{ side: "left", slot: 3 }];
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain("Playing — open thumb + index to change notes");
    expect(html).toContain("OPEN TO CHANGE NOTE");
  });
});
