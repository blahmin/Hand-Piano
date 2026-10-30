import type { HandSide } from "../config";
import type { Landmark } from "../gestures/pinch";

export interface DetectedHand {
  points: readonly Landmark[];
  handedness: HandSide | null;
}

export interface TrackedHand {
  id: number;
  side: HandSide;
  points: readonly Landmark[];
}

interface Track {
  id: number;
  side: HandSide;
  x: number;
  y: number;
  lastSeen: number;
}

/** Two short-lived identities; detection-array order is never a note owner. */
export class HandIdentity {
  private tracks: Track[] = [];
  private nextId = 0;

  update(detections: readonly DetectedHand[], now: number): TrackedHand[] {
    const observations = detections
      .flatMap((hand) => {
        const palm = [0, 5, 9, 13, 17].map((index) => hand.points[index]);
        if (
          palm.some(
            (point) =>
              !point || !Number.isFinite(point.x) || !Number.isFinite(point.y),
          )
        )
          return [];
        return [
          {
            ...hand,
            x: palm.reduce((sum, point) => sum + point!.x, 0) / 5,
            y: palm.reduce((sum, point) => sum + point!.y, 0) / 5,
          },
        ];
      })
      .slice(0, 2);
    this.tracks = this.tracks.filter((track) => now - track.lastSeen < 350);
    if (
      observations.length === 2 &&
      Math.hypot(
        observations[0]!.x - observations[1]!.x,
        observations[0]!.y - observations[1]!.y,
      ) < 0.09
    ) {
      this.tracks = [];
      return [];
    }

    const pairs = observations
      .flatMap((hand, observation) =>
        this.tracks.map((track) => ({
          observation,
          track,
          distance: Math.hypot(hand.x - track.x, hand.y - track.y),
        })),
      )
      .sort((a, b) => a.distance - b.distance);
    const assigned = new Map<number, Track>();
    const usedIds = new Set<number>();
    for (const pair of pairs) {
      if (
        pair.distance > 0.3 ||
        assigned.has(pair.observation) ||
        usedIds.has(pair.track.id)
      )
        continue;
      assigned.set(pair.observation, pair.track);
      usedIds.add(pair.track.id);
    }

    return observations.map((hand, index) => {
      let track = assigned.get(index);
      if (!track) {
        // Banks follow the visible mirrored half, so a detector label cannot
        // strand a hand in the opposite bank's unreachable play area.
        let side: HandSide = 1 - hand.x < 0.5 ? "left" : "right";
        if ([...assigned.values()].some((other) => other.side === side))
          side = side === "left" ? "right" : "left";
        this.tracks = this.tracks.filter((old) => old.side !== side);
        track = {
          id: this.nextId++,
          side,
          x: hand.x,
          y: hand.y,
          lastSeen: now,
        };
        this.tracks.push(track);
        assigned.set(index, track);
      }
      track.x = hand.x;
      track.y = hand.y;
      track.lastSeen = now;
      return { id: track.id, side: track.side, points: hand.points };
    });
  }
}
