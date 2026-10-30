import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const wasm = new URL("public/wasm/", root);
const models = new URL("public/models/", root);
await mkdir(wasm, { recursive: true });
await mkdir(models, { recursive: true });
await cp(new URL("node_modules/@mediapipe/tasks-vision/wasm/", root), wasm, {
  recursive: true,
});

const model = new URL("hand_landmarker.task", models);
const source =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const expectedSha256 =
  "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1";
let bytes;
try {
  bytes = await readFile(model);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.log("Downloading the pretrained hand model (one-time setup)…");
  const response = await fetch(source);
  if (!response.ok)
    throw new Error(`Model download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(model, bytes);
}
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== expectedSha256)
  throw new Error(
    "The hand model checksum does not match the pinned version. Remove the damaged model and run assets:prepare again.",
  );
await writeFile(
  new URL("public/models/manifest.json", root),
  JSON.stringify({ source, sha256, bytes: bytes.length }, null, 2) + "\n",
);
console.log(
  `Local vision assets ready: ${fileURLToPath(models)} (${bytes.length} model bytes).`,
);
