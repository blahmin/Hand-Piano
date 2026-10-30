import { HAND_PLAY_AREAS } from "../config";
import type { HandSide } from "../config";
import type { TrackedHand } from "../tracking/hand-identity";
import { emptySnapshot, PinchController } from "./pinch";
import type { GestureResult, HandSnapshot } from "./pinch";

export type HandStates = Record<HandSide, HandSnapshot>;
export interface DualHandEvent {
  type: "on" | "off";
  side: HandSide;
  note: number;
}
export interface DualHandResult {
  hands: HandStates;
  events: DualHandEvent[];
}
export const emptyHands = (): HandStates => ({
  left: emptySnapshot(),
  right: emptySnapshot(),
});

/** Each hand owns its own pinch, selected pitch, release, and loss timer. */
export class DualHandController {
  constructor(slotCount = 8) {
    this.setSlotCount(slotCount);
  }
  private controllers = {
    left: new PinchController(HAND_PLAY_AREAS.left),
    right: new PinchController(HAND_PLAY_AREAS.right),
  };
  private identities: Record<HandSide, number | null> = {
    left: null,
    right: null,
  };

  setSlotCount(count: number): void {
    this.reset();
    this.controllers.left.setSlotCount(count);
    this.controllers.right.setSlotCount(count);
  }

  private combine(results: Record<HandSide, GestureResult>): DualHandResult {
    return {
      hands: { left: results.left.snapshot, right: results.right.snapshot },
      events: (["left", "right"] as const).flatMap((side) =>
        results[side].events.map((event) => ({ ...event, side })),
      ),
    };
  }

  update(
    hands: readonly TrackedHand[],
    width: number,
    height: number,
    now: number,
  ): DualHandResult {
    const results = {} as Record<HandSide, GestureResult>;
    for (const side of ["left", "right"] as const) {
      const hand = hands.find((candidate) => candidate.side === side);
      const controller = this.controllers[side];
      const replaced =
        hand && hand.id !== this.identities[side]
          ? controller.reset().events
          : [];
      if (hand) this.identities[side] = hand.id;
      const result = hand
        ? controller.update(hand.points, width, height, now)
        : controller.tick(now);
      results[side] = {
        snapshot: result.snapshot,
        events: [...replaced, ...result.events],
      };
    }
    return this.combine(results);
  }

  tick(now: number): DualHandResult {
    return this.combine({
      left: this.controllers.left.tick(now),
      right: this.controllers.right.tick(now),
    });
  }

  reset(): DualHandResult {
    this.identities = { left: null, right: null };
    return this.combine({
      left: this.controllers.left.reset(),
      right: this.controllers.right.reset(),
    });
  }
}
