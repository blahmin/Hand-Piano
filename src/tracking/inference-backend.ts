import { createHandModel } from "./create-hand-model";
import type { DetectedHand } from "./hand-identity";
import type { TrackingRequest, TrackingResponse } from "./worker-protocol";

export interface InferenceBackend {
  readonly targetFps: number;
  detect(
    video: HTMLVideoElement,
    timestamp: number,
  ): DetectedHand[] | Promise<DetectedHand[]>;
  close(): void;
}

async function createMainBackend(baseUrl: string): Promise<InferenceBackend> {
  const model = await createHandModel(baseUrl);
  let closed = false;
  return {
    targetFps: 20,
    detect(video, timestamp) {
      const result = model.detectForVideo(video, timestamp);
      return result.landmarks.map((points) => ({ points, handedness: null }));
    },
    close() {
      if (!closed) {
        closed = true;
        model.close();
      }
    },
  };
}

function createWorkerBackend(baseUrl: string): Promise<InferenceBackend> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./hand-tracker.worker.ts", import.meta.url),
      { type: "module", name: "hand-piano-tracking" },
    );
    let ready = false;
    let closed = false;
    let processing = false;
    let pending: {
      resolve: (hands: DetectedHand[]) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    } | null = null;
    let shutdown: ReturnType<typeof setTimeout> | undefined;
    const startup = setTimeout(
      () => fail(new Error("Worker initialization timed out")),
      12000,
    );
    const post = (message: TrackingRequest, transfer: Transferable[] = []) =>
      worker.postMessage(message, transfer);

    function fail(error: Error) {
      clearTimeout(startup);
      if (!ready) {
        worker.terminate();
        reject(error);
      }
      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(error);
        pending = null;
      }
    }

    const backend: InferenceBackend = {
      targetFps: 30,
      async detect(video, timestamp) {
        if (closed || processing)
          throw new Error("Worker is unavailable or busy");
        processing = true;
        let bitmap: ImageBitmap | null = null;
        try {
          // Smaller transferable frames reduce copying/preprocessing without a
          // pixel-array round trip. Landmark coordinates remain normalized.
          const width = Math.min(480, video.videoWidth);
          bitmap = await createImageBitmap(video, {
            resizeWidth: width,
            resizeHeight: Math.max(
              1,
              Math.round((video.videoHeight * width) / video.videoWidth),
            ),
          });
          if (closed) {
            bitmap.close();
            throw new Error("Tracking stopped");
          }
          const frame = bitmap;
          return await new Promise<DetectedHand[]>(
            (resolveFrame, rejectFrame) => {
              const timeout = setTimeout(
                () => fail(new Error("Hand inference timed out")),
                1200,
              );
              pending = { resolve: resolveFrame, reject: rejectFrame, timeout };
              try {
                post({ type: "frame", bitmap: frame, timestamp }, [frame]);
              } catch (error) {
                frame.close();
                fail(
                  error instanceof Error
                    ? error
                    : new Error("Frame transfer failed"),
                );
              }
            },
          );
        } finally {
          processing = false;
        }
      },
      close() {
        if (closed) return;
        closed = true;
        clearTimeout(startup);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("Tracking stopped"));
          pending = null;
        }
        if (!ready) worker.terminate();
        else {
          // Give a healthy worker time to close its model; terminate a stalled one.
          shutdown = setTimeout(() => worker.terminate(), 500);
          try {
            post({ type: "dispose" });
          } catch {
            clearTimeout(shutdown);
            worker.terminate();
          }
        }
      },
    };
    worker.onmessage = ({ data }: MessageEvent<TrackingResponse>) => {
      if (data.type === "disposed") {
        clearTimeout(shutdown);
        worker.terminate();
        return;
      }
      if (closed) return;
      if (data.type === "ready") {
        ready = true;
        clearTimeout(startup);
        resolve(backend);
      } else if (data.type === "error") fail(new Error(data.message));
      else if (pending) {
        clearTimeout(pending.timeout);
        const completed = pending;
        pending = null;
        completed.resolve(data.detections);
      }
    };
    worker.onerror = (event) =>
      fail(new Error(event.message || "Tracking worker failed"));
    try {
      post({ type: "init", baseUrl });
    } catch (error) {
      fail(
        error instanceof Error
          ? error
          : new Error("Worker initialization failed"),
      );
    }
  });
}

export async function createInferenceBackend(): Promise<InferenceBackend> {
  const baseUrl = new URL(import.meta.env.BASE_URL, import.meta.url).href;
  if (
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof createImageBitmap === "function"
  ) {
    try {
      const worker = await createWorkerBackend(baseUrl);
      let fallback: Promise<InferenceBackend> | null = null;
      let closed = false;
      return {
        get targetFps() {
          return fallback ? 20 : 30;
        },
        async detect(video, timestamp) {
          if (!fallback) {
            try {
              return await worker.detect(video, timestamp);
            } catch (error) {
              if (closed) throw error;
              worker.close();
              fallback = createMainBackend(baseUrl);
            }
          }
          const main = await fallback;
          if (closed) {
            main.close();
            throw new Error("Tracking stopped");
          }
          return main.detect(video, timestamp);
        },
        close() {
          closed = true;
          worker.close();
          void fallback?.then((main) => main.close()).catch(() => {});
        },
      };
    } catch {
      /* Unsupported worker/GPU combinations retain the camera fallback. */
    }
  }
  return createMainBackend(baseUrl);
}
