import { describe, expect, it, vi } from "vitest";
import { drawLandmarks } from "../src/tracking/draw-landmarks";

function canvasFixture() {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    roundRect: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText: vi.fn(),
  };
  const canvas = {
    width: 640,
    height: 480,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
}

describe("note selection in the camera overlay", () => {
  it("shows five chord targets per hand, using the actual chord labels", () => {
    const { canvas, context } = canvasFixture();
    drawLandmarks(canvas, [], false, "split", "chords");
    const labels = context.fillText.mock.calls.map((call) => call[0]);
    for (const chord of ["C", "Dm", "Em", "F", "G", "Am", "D", "A", "E", "Bm"])
      expect(labels).toContain(chord);
    expect(labels).not.toContain("C3");
    const cells = context.roundRect.mock.calls.filter((call) => call[3] === 34);
    expect(cells).toHaveLength(10);
    expect(cells[0]![2]).toBeCloseTo(((0.45 - 0.12) * 640) / 5 - 2);
  });
  it("draws both note strips and movement instructions without a separate chart", () => {
    const { canvas, context } = canvasFixture();
    drawLandmarks(canvas, [], false, "split");
    const labels = context.fillText.mock.calls.map((call) => call[0]);
    for (const note of [
      "C3",
      "D3",
      "E3",
      "F3",
      "G3",
      "A3",
      "B3",
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C5",
    ])
      expect(labels).toContain(note);
    expect(labels).toContain("← MOVE YOUR HAND →");
  });

  it("shows open-to-change guidance while a hand is holding a note", () => {
    const { canvas, context } = canvasFixture();
    drawLandmarks(
      canvas,
      [
        {
          side: "left",
          points: Array.from({ length: 21 }, () => ({ x: 0.75, y: 0.5, z: 0 })),
          pinching: true,
          note: "F3",
          cursorX: 0.25,
        },
      ],
      false,
      "split",
    );
    const labels = context.fillText.mock.calls.map((call) => call[0]);
    expect(labels).toContain("Left · F3");
    expect(labels).toContain("OPEN TO CHANGE");
    expect(labels).toContain("OPEN FINGERS TO CHANGE NOTE");
  });
});
