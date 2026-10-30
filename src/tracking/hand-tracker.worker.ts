import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandModel } from "./create-hand-model";
import type { TrackingRequest, TrackingResponse } from "./worker-protocol";

// Keep worker globals separate from the DOM types used by the React application.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TrackingRequest>) => void) | null;
  postMessage: (message: TrackingResponse) => void;
  close: () => void;
};
let model: HandLandmarker | null = null;

scope.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      model = await createHandModel(data.baseUrl, new OffscreenCanvas(1, 1));
      scope.postMessage({ type: "ready" });
    } else if (data.type === "dispose") {
      model?.close();
      model = null;
      scope.postMessage({ type: "disposed" });
      scope.close();
    } else {
      try {
        if (!model) throw new Error("Hand model is not ready");
        const result = model.detectForVideo(data.bitmap, data.timestamp);
        scope.postMessage({
          type: "result",
          detections: result.landmarks.map((points) => ({
            points,
            handedness: null,
          })),
        });
      } finally {
        data.bitmap.close();
      }
    }
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Hand inference failed",
    });
  }
};
