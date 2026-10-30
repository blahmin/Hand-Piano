import type { HandLandmarker } from "@mediapipe/tasks-vision";

export async function createHandModel(
  baseUrl: string,
  canvas?: OffscreenCanvas,
): Promise<HandLandmarker> {
  const { FilesetResolver, HandLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );
  // The pinned API's useModule flag selects its official ES-module WASM loader.
  const files = await FilesetResolver.forVisionTasks(
    `${baseUrl}wasm`,
    Boolean(canvas),
  );
  const workerFactory: unknown = canvas
    ? (await import(/* @vite-ignore */ files.wasmLoaderPath)).default
    : null;
  const options = {
    baseOptions: { modelAssetPath: `${baseUrl}models/hand_landmarker.task` },
    runningMode: "VIDEO" as const,
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
    ...(canvas ? { canvas } : {}),
  };
  const create = (delegate: "GPU" | "CPU") => {
    if (workerFactory) {
      // MediaPipe consumes and clears this global. Reassign before CPU retry,
      // since an imported module is cached and will not execute a second time.
      (
        globalThis as typeof globalThis & { ModuleFactory: unknown }
      ).ModuleFactory = workerFactory;
    }
    return HandLandmarker.createFromOptions(files, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate },
    });
  };
  try {
    return await create("GPU");
  } catch {
    return create("CPU");
  }
}
