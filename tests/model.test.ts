import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HandLandmarker,
  HandLandmarkerOptions,
} from "@mediapipe/tasks-vision";
import { createHandModel } from "../src/tracking/create-hand-model";

const mock = vi.hoisted(() => ({ resolve: vi.fn(), create: vi.fn() }));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: mock.resolve },
  HandLandmarker: { createFromOptions: mock.create },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ModuleFactory", undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("MediaPipe runtime initialization", () => {
  it("selects the module runtime in a worker and restores the cached factory before a CPU retry", async () => {
    const files = {
      wasmLoaderPath:
        "data:text/javascript,export default function Factory(){}",
      wasmBinaryPath: "/wasm/module.wasm",
    };
    mock.resolve.mockResolvedValue(files);
    const delegates: string[] = [];
    mock.create.mockImplementation(
      async (received, options: HandLandmarkerOptions) => {
        expect(received).toBe(files);
        expect(typeof Reflect.get(globalThis, "ModuleFactory")).toBe(
          "function",
        );
        Reflect.set(globalThis, "ModuleFactory", undefined);
        delegates.push(options.baseOptions?.delegate ?? "");
        if (delegates.length === 1) throw new Error("GPU unavailable");
        return {} as HandLandmarker;
      },
    );
    await createHandModel("/", {} as OffscreenCanvas);
    expect(mock.resolve).toHaveBeenCalledWith("/wasm", true);
    expect(delegates).toEqual(["GPU", "CPU"]);
  });

  it("keeps the classic runtime for the main-thread fallback", async () => {
    mock.resolve.mockResolvedValue({ wasmLoaderPath: "/wasm/classic.js" });
    mock.create.mockResolvedValue({});
    await createHandModel("/");
    expect(mock.resolve).toHaveBeenCalledWith("/wasm", false);
    expect(mock.create.mock.calls[0]![1]).toMatchObject({
      runningMode: "VIDEO",
      numHands: 2,
    });
  });
});
