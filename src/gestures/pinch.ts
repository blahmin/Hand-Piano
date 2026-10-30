import { GESTURE } from "../config";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}
export interface HandSnapshot {
  tracked: boolean;
  selected: number | null;
  held: number | null;
  pinching: boolean;
  armed: boolean;
  ratio: number | null;
  cursorX: number | null;
}
export type HandNoteEvent = { type: "on" | "off"; note: number };
export interface GestureResult {
  snapshot: HandSnapshot;
  events: HandNoteEvent[];
}

export function emptySnapshot(): HandSnapshot {
  return {
    tracked: false,
    selected: null,
    held: null,
    pinching: false,
    armed: false,
    ratio: null,
    cursorX: null,
  };
}

export function noteForPosition(
  displayX: number,
  minX: number = GESTURE.minX,
  maxX: number = GESTURE.maxX,
  slotCount = 8,
): number {
  return Math.max(
    0,
    Math.min(
      slotCount - 1,
      Math.floor(((displayX - minX) / (maxX - minX)) * slotCount),
    ),
  );
}

export function handFeatures(
  points: readonly Landmark[],
  width: number,
  height: number,
): { ratio: number; cursorX: number } | null {
  if (points.length !== 21 || width <= 0 || height <= 0) return null;
  if (
    points.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    return null;
  const required = [0, 4, 5, 8, 9, 13, 17].map((index) => points[index]!);
  if (required.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
    return null;
  const aspect = width / height;
  const distance = (a: Landmark, b: Landmark) =>
    Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const scale = distance(points[5]!, points[17]!);
  if (scale < 0.06 * aspect || scale > 0.55 * aspect) return null;
  const palmX =
    [0, 5, 9, 13, 17].reduce((sum, index) => sum + points[index]!.x, 0) / 5;
  return {
    ratio: distance(points[4]!, points[8]!) / scale,
    cursorX: 1 - palmX,
  };
}

/** Timestamp-based hysteresis; no model, DOM, audio, or React dependency. */
export class PinchController {
  constructor(
    private readonly playArea: { minX: number; maxX: number } = {
      minX: GESTURE.minX,
      maxX: GESTURE.maxX,
    },
    private slotCount = 8,
  ) {}
  setSlotCount(count: number): void {
    this.reset();
    this.slotCount = count;
  }
  private state = emptySnapshot();
  private lastSeen: number | null = null;
  private openSince: number | null = null;
  private closeSince: number | null = null;
  private releaseSince: number | null = null;
  private candidate: number | null = null;
  private candidateSince = 0;
  private nextPressAt = 0;

  reset(): GestureResult {
    const events: HandNoteEvent[] =
      this.state.held === null ? [] : [{ type: "off", note: this.state.held }];
    this.state = emptySnapshot();
    this.lastSeen =
      this.openSince =
      this.closeSince =
      this.releaseSince =
      this.candidate =
        null;
    this.nextPressAt = 0;
    return { snapshot: { ...this.state }, events };
  }

  tick(now: number): GestureResult {
    if (this.lastSeen !== null && now - this.lastSeen >= GESTURE.lostMs)
      return this.reset();
    return { snapshot: { ...this.state }, events: [] };
  }

  update(
    points: readonly Landmark[],
    width: number,
    height: number,
    now: number,
  ): GestureResult {
    const features = handFeatures(points, width, height);
    if (!features) return this.tick(now);
    const events: HandNoteEvent[] = [];
    if (this.lastSeen !== null && now - this.lastSeen >= GESTURE.lostMs)
      events.push(...this.reset().events);
    const delta =
      this.lastSeen === null ? 1000 : Math.max(0, now - this.lastSeen);
    this.lastSeen = now;
    const smooth = (before: number | null, next: number, tau: number) =>
      before === null
        ? next
        : before + (1 - Math.exp(-delta / tau)) * (next - before);
    const cursorX = smooth(
      this.state.cursorX,
      features.cursorX,
      GESTURE.cursorTauMs,
    );
    const ratio = smooth(this.state.ratio, features.ratio, GESTURE.pinchTauMs);
    this.state = {
      ...this.state,
      tracked: true,
      cursorX,
      ratio,
      pinching: ratio < GESTURE.closeRatio,
    };
    const next = noteForPosition(
      cursorX,
      this.playArea.minX,
      this.playArea.maxX,
      this.slotCount,
    );
    if (next !== this.candidate) {
      this.candidate = next;
      this.candidateSince = now;
    }
    if (
      this.state.held === null &&
      this.closeSince === null &&
      (this.state.selected === null || now - this.candidateSince >= 50)
    ) {
      this.state.selected = next;
    }

    if (!this.state.armed) {
      if (ratio > GESTURE.openRatio) {
        this.openSince ??= now;
        if (now - this.openSince >= GESTURE.armMs) this.state.armed = true;
      } else this.openSince = null;
    } else if (this.state.held !== null) {
      if (ratio > GESTURE.openRatio) {
        this.releaseSince ??= now;
        if (now - this.releaseSince >= GESTURE.openMs) {
          events.push({ type: "off", note: this.state.held });
          this.state.held = null;
          this.releaseSince = this.closeSince = null;
          this.nextPressAt = now + 80;
        }
      } else this.releaseSince = null;
    } else if (ratio < GESTURE.closeRatio && now >= this.nextPressAt) {
      this.closeSince ??= now;
      if (
        now - this.closeSince >= GESTURE.closeMs &&
        this.state.selected !== null
      ) {
        this.state.held = this.state.selected;
        events.push({ type: "on", note: this.state.held });
        this.closeSince = null;
      }
    } else this.closeSince = null;

    return { snapshot: { ...this.state }, events };
  }
}
