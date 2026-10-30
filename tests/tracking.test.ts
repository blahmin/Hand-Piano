import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cameraError, openCamera, stopCamera } from "../src/tracking/camera";
import { HandTracker } from "../src/tracking/hand-tracker";
import type {
  TrackingRequest,
  TrackingResponse,
} from "../src/tracking/worker-protocol";

const model = vi.hoisted(() => ({
  close: vi.fn(),
  detectForVideo: vi.fn(() => ({ landmarks: [] })),
}));
const create = vi.hoisted(() => vi.fn());
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  HandLandmarker: { createFromOptions: create },
}));
beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue(model);
});
afterEach(() => vi.unstubAllGlobals());

describe("camera boundary", () => {
  it("requests video only and closes every media track", async () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    const stream = { getTracks: () => tracks };
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    await openCamera();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false }),
    );
    stopCamera(stream as unknown as MediaStream);
    expect(tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(
      true,
    );
  });
  it("explains permission denial and insecure origins", async () => {
    vi.stubGlobal("window", { isSecureContext: false });
    await expect(openCamera()).rejects.toThrow("localhost or HTTPS");
    expect(
      cameraError(new DOMException("Denied", "NotAllowedError")),
    ).toContain("permission");
    expect(cameraError(new DOMException("Missing", "NotFoundError"))).toContain(
      "No webcam",
    );
  });
});

describe("hand tracking adapter", () => {
  it("keeps a steady 20fps fallback cadence despite callback jitter", async () => {
    const tracker = await HandTracker.create();
    let scheduled: ((now: number) => void) | undefined;
    const video = {
      readyState: 4,
      currentTime: 0,
      requestVideoFrameCallback: (callback: (now: number) => void) => {
        scheduled = callback;
        return 123;
      },
      cancelVideoFrameCallback: vi.fn(),
    };
    tracker.start(video as unknown as HTMLVideoElement, vi.fn(), vi.fn());
    // A slightly early callback should not halve the useful tracking rate.
    for (let frame = 0; frame < 90; frame++) {
      video.currentTime = frame / 30;
      scheduled!(frame * 33.2);
    }
    expect(model.detectForVideo.mock.calls.length).toBeGreaterThanOrEqual(55);
    expect(model.detectForVideo.mock.calls.length).toBeLessThanOrEqual(61);
    tracker.close();
  });

  it("falls back from GPU to CPU and closes only once", async () => {
    create
      .mockRejectedValueOnce(new Error("GPU unavailable"))
      .mockResolvedValueOnce(model);
    const tracker = await HandTracker.create();
    expect(create.mock.calls[0]![1].baseOptions.delegate).toBe("GPU");
    expect(create.mock.calls[0]![1].numHands).toBe(2);
    expect(create.mock.calls[1]![1].baseOptions.delegate).toBe("CPU");
    tracker.close();
    tracker.close();
    expect(model.close).toHaveBeenCalledOnce();
  });
  it("processes only new frames, caps inference, and cancels on stop", async () => {
    const tracker = await HandTracker.create();
    let scheduled: ((now: number) => void) | undefined;
    const cancel = vi.fn();
    const video = {
      readyState: 4,
      currentTime: 1,
      requestVideoFrameCallback: vi.fn((callback: (now: number) => void) => {
        scheduled = callback;
        return 123;
      }),
      cancelVideoFrameCallback: cancel,
    };
    const onFrame = vi.fn();
    tracker.start(video as unknown as HTMLVideoElement, onFrame, vi.fn());
    scheduled!(100);
    scheduled!(140); // Same decoded frame: skip.
    video.currentTime = 2;
    scheduled!(155);
    video.currentTime = 3;
    scheduled!(160); // Five milliseconds after inference: skip.
    expect(model.detectForVideo).toHaveBeenCalledTimes(2);
    expect(onFrame).toHaveBeenCalledTimes(2);
    tracker.close();
    scheduled!(200);
    expect(model.detectForVideo).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledWith(123);
  });
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  static rejectStartup = false;
  onmessage: ((event: MessageEvent<TrackingResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn(
    (message: TrackingRequest, _transfer: Transferable[] = []) => {
      if (message.type === "init")
        queueMicrotask(() =>
          this.respond(
            FakeWorker.rejectStartup
              ? { type: "error", message: "Worker GPU unavailable" }
              : { type: "ready" },
          ),
        );
      if (message.type === "dispose")
        queueMicrotask(() => this.respond({ type: "disposed" }));
    },
  );
  constructor() {
    FakeWorker.instances.push(this);
  }
  respond(data: TrackingResponse) {
    this.onmessage?.({ data } as MessageEvent<TrackingResponse>);
  }
}

function workerEnvironment(rejectStartup = false) {
  FakeWorker.instances = [];
  FakeWorker.rejectStartup = rejectStartup;
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  const capturedTimes: number[] = [];
  const capture = vi.fn(
    async (video: HTMLVideoElement, _options: ImageBitmapOptions) => {
      capturedTimes.push(video.currentTime);
      return bitmap;
    },
  );
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("createImageBitmap", capture);
  return { bitmap, capture, capturedTimes };
}

function videoFrames(
  tracker: HandTracker,
  onFrame = vi.fn(),
  onError = vi.fn(),
) {
  let scheduled: ((now: number) => void) | undefined;
  const video = {
    readyState: 4,
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 480,
    requestVideoFrameCallback: (callback: (now: number) => void) => {
      scheduled = callback;
      return 1;
    },
    cancelVideoFrameCallback: vi.fn(),
  };
  tracker.start(video as unknown as HTMLVideoElement, onFrame, onError);
  return {
    onFrame,
    onError,
    tick(now: number, frame: number) {
      video.currentTime = frame / 30;
      scheduled!(now);
    },
  };
}

describe("off-thread hand inference", () => {
  it("transfers one resized frame, drops busy frames, and processes the newest next", async () => {
    const { bitmap, capture, capturedTimes } = workerEnvironment();
    const tracker = await HandTracker.create();
    const frames = videoFrames(tracker);
    const worker = FakeWorker.instances[0]!;
    frames.tick(100, 1);
    await vi.waitFor(
      () =>
        expect(
          worker.postMessage.mock.calls.some(
            ([message]) => message.type === "frame",
          ),
        ).toBe(true),
      { interval: 1 },
    );
    frames.tick(134, 2);
    expect(capture).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    expect(capture.mock.calls[0]![1]).toEqual({
      resizeWidth: 480,
      resizeHeight: 360,
    });
    expect(
      worker.postMessage.mock.calls.find(
        ([message]) => message.type === "frame",
      )![1],
    ).toEqual([bitmap]);
    worker.respond({ type: "result", detections: [] });
    await vi.waitFor(() => expect(frames.onFrame).toHaveBeenCalledOnce(), {
      interval: 1,
    });
    frames.tick(168, 3);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2), {
      interval: 1,
    });
    expect(capturedTimes).toEqual([1 / 30, 3 / 30]);
    tracker.close();
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledOnce(), {
      interval: 1,
    });
  });

  it("retains main-thread tracking when worker initialization fails", async () => {
    workerEnvironment(true);
    const tracker = await HandTracker.create();
    expect(FakeWorker.instances[0]!.terminate).toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
    const frames = videoFrames(tracker);
    frames.tick(100, 1);
    expect(frames.onFrame).toHaveBeenCalledOnce();
    tracker.close();
  });

  it("recovers from a worker frame failure without losing camera playback", async () => {
    workerEnvironment();
    const tracker = await HandTracker.create();
    const frames = videoFrames(tracker);
    const worker = FakeWorker.instances[0]!;
    frames.tick(100, 1);
    await vi.waitFor(
      () =>
        expect(
          worker.postMessage.mock.calls.some(
            ([message]) => message.type === "frame",
          ),
        ).toBe(true),
      { interval: 1 },
    );
    worker.respond({
      type: "error",
      message: "ImageBitmap inference unsupported",
    });
    await vi.waitFor(() => expect(frames.onFrame).toHaveBeenCalledOnce(), {
      interval: 1,
    });
    expect(create).toHaveBeenCalledOnce();
    expect(frames.onError).not.toHaveBeenCalled();
    tracker.close();
  });
});
