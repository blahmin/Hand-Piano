import { HandIdentity } from "./hand-identity";
import type { TrackedHand } from "./hand-identity";
import { createInferenceBackend } from "./inference-backend";
import type { InferenceBackend } from "./inference-backend";

export type FrameHandler = (hands: readonly TrackedHand[], now: number) => void;

export class HandTracker {
  private cancelFrame: (() => void) | null = null;
  private stopped = true;
  private closed = false;
  private busy = false;
  private identity = new HandIdentity();

  private constructor(private backend: InferenceBackend) {}

  static async create(): Promise<HandTracker> {
    return new HandTracker(await createInferenceBackend());
  }

  start(
    video: HTMLVideoElement,
    onFrame: FrameHandler,
    onError: (error: unknown) => void,
  ): void {
    this.stopped = false;
    let lastVideoTime = -1;
    let nextInferenceAt = -Infinity;
    const schedule = () => {
      if (this.stopped) return;
      if ("requestVideoFrameCallback" in video) {
        const id = video.requestVideoFrameCallback(process);
        this.cancelFrame = () => video.cancelVideoFrameCallback(id);
      } else {
        const id = requestAnimationFrame(process);
        this.cancelFrame = () => cancelAnimationFrame(id);
      }
    };
    const finish = (detections: Parameters<HandIdentity["update"]>[0]) => {
      if (!this.stopped) {
        const completedAt = performance.now();
        onFrame(this.identity.update(detections, completedAt), completedAt);
      }
    };
    const fail = (error: unknown) => {
      if (this.stopped) return;
      this.stopped = true;
      this.cancelFrame?.();
      onError(error);
    };
    const process = (now: number) => {
      if (this.stopped) return;
      if (
        !this.busy &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime &&
        now >= nextInferenceAt
      ) {
        lastVideoTime = video.currentTime;
        const intervalMs = 1000 / this.backend.targetFps;
        nextInferenceAt =
          !Number.isFinite(nextInferenceAt) ||
          now - nextInferenceAt > intervalMs * 2
            ? now + intervalMs
            : nextInferenceAt + intervalMs;
        this.busy = true;
        try {
          const result = this.backend.detect(video, now);
          if (result instanceof Promise)
            void result
              .then(finish)
              .catch(fail)
              .finally(() => {
                this.busy = false;
              });
          else {
            finish(result);
            this.busy = false;
          }
        } catch (error) {
          this.busy = false;
          fail(error);
        }
      }
      // Decoding/rendering continues while a worker is busy; intermediate
      // frames are dropped rather than queued behind old hand positions.
      schedule();
    };
    schedule();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopped = true;
    this.cancelFrame?.();
    this.cancelFrame = null;
    this.backend.close();
  }
}
