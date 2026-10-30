import type { DetectedHand } from "./hand-identity";

export type TrackingRequest =
  | { type: "init"; baseUrl: string }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number }
  | { type: "dispose" };

export type TrackingResponse =
  | { type: "ready" }
  | { type: "result"; detections: DetectedHand[] }
  | { type: "error"; message: string }
  | { type: "disposed" };
