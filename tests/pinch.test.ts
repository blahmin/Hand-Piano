import { describe, expect, it } from "vitest";
import { frequencyForMidi } from "../src/config";
import {
  handFeatures,
  noteForPosition,
  PinchController,
} from "../src/gestures/pinch";
import type { Landmark } from "../src/gestures/pinch";

function fixture(ratio: number, shift = 0): Landmark[] {
  const points = Array.from({ length: 21 }, () => ({
    x: 0.5 + shift,
    y: 0.5,
    z: 0,
  }));
  points[0] = { x: 0.5 + shift, y: 0.75, z: 0 };
  points[5] = { x: 0.4 + shift, y: 0.5, z: 0 };
  points[9] = { x: 0.48 + shift, y: 0.48, z: 0 };
  points[13] = { x: 0.54 + shift, y: 0.49, z: 0 };
  points[17] = { x: 0.6 + shift, y: 0.5, z: 0 };
  points[8] = { x: 0.4 + shift, y: 0.3, z: 0 };
  points[4] = { x: 0.4 + shift + ratio * 0.2, y: 0.3, z: 0 };
  return points;
}

const update = (
  controller: PinchController,
  ratio: number,
  now: number,
  shift = 0,
) => controller.update(fixture(ratio, shift), 640, 480, now);
function arm(controller: PinchController) {
  for (const t of [0, 40, 80, 120]) update(controller, 0.8, t);
}

describe("landmark geometry and spatial mapping", () => {
  it("uses eight C-major slots, including safe boundaries", () => {
    expect(noteForPosition(0)).toBe(0);
    expect(noteForPosition(1)).toBe(7);
    for (let index = 0; index < 8; index++)
      expect(noteForPosition(0.12 + ((index + 0.5) * 0.76) / 8)).toBe(index);
    expect(frequencyForMidi(69)).toBe(440);
    expect(frequencyForMidi(72)).toBeCloseTo(523.251, 2);
  });
  it("corrects aspect ratio and normalizes hand size", () => {
    const points = fixture(0.5);
    points[4] = {
      x: points[8]!.x,
      y: points[8]!.y + (0.5 * 0.2 * 640) / 480,
      z: 0,
    };
    expect(handFeatures(points, 640, 480)?.ratio).toBeCloseTo(0.5);
    const scaled = points.map((p) => ({
      x: 0.5 + (p.x - 0.5) * 0.6,
      y: 0.5 + (p.y - 0.5) * 0.6,
      z: 0,
    }));
    expect(handFeatures(scaled, 640, 480)?.ratio).toBeCloseTo(0.5);
  });
  it("rejects missing, nonfinite, offscreen, and degenerate landmarks", () => {
    expect(handFeatures([], 640, 480)).toBeNull();
    const invalid = fixture(0.5);
    invalid[8]!.x = NaN;
    expect(handFeatures(invalid, 640, 480)).toBeNull();
    expect(handFeatures(fixture(0.5, 0.9), 640, 480)).toBeNull();
    const collapsed = fixture(0.5);
    collapsed[17] = { ...collapsed[5]! };
    expect(handFeatures(collapsed, 640, 480)).toBeNull();
  });
});

describe("deliberate pinch events", () => {
  it("requires an open hand before the first press", () => {
    const controller = new PinchController();
    for (const t of [0, 40, 80, 120, 160, 200])
      expect(update(controller, 0.15, t).events).toEqual([]);
  });
  it("plays once while held, freezes pitch, then releases", () => {
    const controller = new PinchController();
    arm(controller);
    const events = [160, 190, 220, 250].flatMap(
      (t) => update(controller, 0.15, t).events,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("on");
    const held = events[0]!.note;
    for (const t of [280, 310, 340, 370]) {
      const result = update(controller, 0.15, t, 0.3);
      expect(result.events).toEqual([]);
      expect(result.snapshot.held).toBe(held);
    }
    const releases = [400, 430, 460, 490].flatMap(
      (t) => update(controller, 0.8, t, 0.3).events,
    );
    expect(releases).toEqual([{ type: "off", note: held }]);
  });
  it("ignores a brief accidental closure", () => {
    const controller = new PinchController();
    arm(controller);
    expect(update(controller, 0.15, 160).events).toEqual([]);
    for (const t of [180, 210, 240])
      expect(update(controller, 0.8, t).events).toEqual([]);
  });
  it("releases on tracking loss and never retriggers a pinched reentry", () => {
    const controller = new PinchController();
    arm(controller);
    for (const t of [160, 190, 220, 250]) update(controller, 0.15, t);
    expect(controller.tick(399).events).toEqual([]);
    expect(controller.tick(400).events[0]?.type).toBe("off");
    for (const t of [410, 450, 490, 530])
      expect(update(controller, 0.15, t).events).toEqual([]);
    expect(controller.tick(540).snapshot.armed).toBe(false);
  });
  it("resets transition timers when observations are stale", () => {
    const controller = new PinchController();
    arm(controller);
    update(controller, 0.15, 160);
    const result = update(controller, 0.15, 400);
    expect(result.events).toEqual([]);
    expect(result.snapshot.armed).toBe(false);
  });
  it("selects both end notes with mirrored palm movement", () => {
    const first = new PinchController();
    const last = new PinchController();
    expect(update(first, 0.8, 0, 0.35).snapshot.selected).toBe(0);
    expect(update(last, 0.8, 0, -0.35).snapshot.selected).toBe(7);
  });
});
