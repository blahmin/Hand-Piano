import { describe, expect, it } from "vitest";
import { notesForHand } from "../src/config";
import type { HandSide } from "../src/config";
import { DualHandController } from "../src/gestures/dual-hand";
import type { Landmark } from "../src/gestures/pinch";
import { HandIdentity } from "../src/tracking/hand-identity";
import type { TrackedHand } from "../src/tracking/hand-identity";

function hand(
  side: HandSide,
  ratio: number,
  displayX = side === "left" ? 0.28 : 0.72,
  id = side === "left" ? 1 : 2,
): TrackedHand {
  const shift = 1 - displayX - 0.504;
  const points: Landmark[] = Array.from({ length: 21 }, () => ({
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
  return { id, side, points };
}

function playBoth(controller: DualHandController) {
  for (const t of [0, 40, 80, 120])
    controller.update([hand("left", 0.8), hand("right", 0.8)], 640, 480, t);
  return [160, 190, 220, 250].flatMap(
    (t) =>
      controller.update([hand("left", 0.15), hand("right", 0.15)], 640, 480, t)
        .events,
  );
}

describe("two independent hand instruments", () => {
  it("maps five full chord recordings per hand without transposing them", () => {
    const left = notesForHand("left", "split", "chords");
    const right = notesForHand("right", "split", "chords");
    expect(left.map((note) => note.sampleId)).toEqual([
      "C",
      "Dm",
      "Em",
      "F",
      "G",
    ]);
    expect(right.map((note) => note.sampleId)).toEqual([
      "Am",
      "D",
      "A",
      "E",
      "Bm",
    ]);
    expect(notesForHand("left", "shared", "chords")).toBe(left);
    const controller = new DualHandController(5);
    const selections = controller.update(
      [hand("left", 0.8, 0.43), hand("right", 0.8, 0.86)],
      640,
      480,
      0,
    );
    expect(selections.hands.left.selected).toBe(4);
    expect(selections.hands.right.selected).toBe(4);
    controller.setSlotCount(8);
    const next = controller.update([hand("left", 0.15, 0.43)], 640, 480, 40);
    expect(next.hands.left.selected).toBe(7);
    expect(next.hands.left.armed).toBe(false);
    expect(next.events).toEqual([]);
  });
  it("maps the left bank to C3–C4 and the right bank to C4–C5", () => {
    expect(notesForHand("left", "split").map((note) => note.midi)).toEqual([
      48, 50, 52, 53, 55, 57, 59, 60,
    ]);
    expect(notesForHand("right", "split").map((note) => note.midi)).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72,
    ]);
    expect(notesForHand("left", "shared").map((note) => note.midi)).toEqual(
      notesForHand("right", "shared").map((note) => note.midi),
    );
  });

  it("reaches all eight notes within each hand's own half of the camera", () => {
    const low = new DualHandController().update(
      [hand("left", 0.8, 0.14), hand("right", 0.8, 0.57)],
      640,
      480,
      0,
    );
    const high = new DualHandController().update(
      [hand("left", 0.8, 0.43), hand("right", 0.8, 0.86)],
      640,
      480,
      0,
    );
    expect(low.hands.left.selected).toBe(0);
    expect(low.hands.right.selected).toBe(0);
    expect(high.hands.left.selected).toBe(7);
    expect(high.hands.right.selected).toBe(7);
  });

  it("starts two voices once and releases only the hand that opens", () => {
    const controller = new DualHandController();
    expect(playBoth(controller)).toEqual([
      { type: "on", side: "left", note: 3 },
      { type: "on", side: "right", note: 4 },
    ]);
    const releases = [280, 310, 340, 370].flatMap(
      (t) =>
        controller.update([hand("right", 0.15), hand("left", 0.8)], 640, 480, t)
          .events,
    );
    expect(releases).toEqual([{ type: "off", side: "left", note: 3 }]);
    const held = controller.tick(380);
    expect(held.hands.left.held).toBeNull();
    expect(held.hands.right.held).toBe(4);
  });

  it("releases a missing hand while the other remains tracked and sounding", () => {
    const controller = new DualHandController();
    playBoth(controller);
    for (const t of [280, 310, 340, 370])
      controller.update([hand("left", 0.15)], 640, 480, t);
    const result = controller.update([hand("left", 0.15)], 640, 480, 400);
    expect(result.events).toEqual([{ type: "off", side: "right", note: 4 }]);
    expect(result.hands.left.held).toBe(3);
    expect(result.hands.right.tracked).toBe(false);
  });

  it("rearms a replacement identity without disturbing the other hand", () => {
    const controller = new DualHandController();
    playBoth(controller);
    const result = controller.update(
      [hand("left", 0.15, 0.28, 99), hand("right", 0.15)],
      640,
      480,
      280,
    );
    expect(result.events).toEqual([{ type: "off", side: "left", note: 3 }]);
    expect(result.hands.left.armed).toBe(false);
    expect(result.hands.right.held).toBe(4);
  });
});

describe("stable hand identities", () => {
  it("assigns banks from the visible half even when anatomical labels disagree", () => {
    const identity = new HandIdentity();
    const result = identity.update(
      [
        { points: hand("left", 0.8).points, handedness: "right" },
        { points: hand("right", 0.8).points, handedness: "left" },
      ],
      0,
    );
    expect(result.map((item) => item.side)).toEqual(["left", "right"]);
    const controls = new DualHandController().update(result, 640, 480, 0);
    expect(controls.hands.left.selected).toBe(3);
    expect(controls.hands.right.selected).toBe(4);
  });

  it("keeps note owners when detection order and handedness labels change", () => {
    const identity = new HandIdentity();
    const left = hand("left", 0.8);
    const right = hand("right", 0.8);
    const initial = identity.update(
      [
        { points: left.points, handedness: "left" },
        { points: right.points, handedness: "right" },
      ],
      0,
    );
    const reversed = identity.update(
      [
        { points: right.points, handedness: "left" },
        { points: left.points, handedness: "right" },
      ],
      33,
    );
    expect(reversed.map((item) => [item.id, item.side])).toEqual([
      [initial[1]!.id, "right"],
      [initial[0]!.id, "left"],
    ]);
  });

  it("suppresses ambiguous overlapping palms and expires old identities", () => {
    const identity = new HandIdentity();
    const initial = identity.update(
      [{ points: hand("left", 0.8).points, handedness: "left" }],
      0,
    );
    expect(
      identity.update(
        [
          { points: hand("left", 0.8, 0.48).points, handedness: "left" },
          { points: hand("right", 0.8, 0.52).points, handedness: "right" },
        ],
        33,
      ),
    ).toEqual([]);
    const returned = identity.update(
      [{ points: hand("left", 0.8).points, handedness: "left" }],
      400,
    );
    expect(returned[0]!.id).not.toBe(initial[0]!.id);
  });
});
