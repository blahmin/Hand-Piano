# Third-party assets

- **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision`, version pinned in `package.json`): Google, Apache License 2.0. Includes the locally copied WASM runtime. Source: https://github.com/google-ai-edge/mediapipe
- **Hand Landmarker model bundle**, float16/version 1: downloaded from Google's official MediaPipe model distribution. Source: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task . See Google's model overview/model card for asset terms and limitations: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker . Its Apache 2.0 license is preserved in `public/models/LICENSE.txt`.
- **React and React DOM**: Meta and contributors, MIT License.
- **Vite and the React plugin**: Vite contributors, MIT License.

- **Recorded piano chords** in `public/audio/chords`: extracted for this local demo from **YouTube Piano (Chords) - Play Piano (Chords) with Computer Keyboard**, creator **Play With Keyboard**, using the video and timestamps supplied by the user. Source: https://www.youtube.com/watch?v=qWX31yz68Ns . The source's redistribution license has not been established; these recordings are not represented as MIT, Apache, or Creative Commons assets. Confirm redistribution rights or replace with appropriately licensed recordings before publishing these audio assets. Extraction metadata and hashes are in `public/audio/chords/manifest.json`.

Piano mode is synthesized by application code. No photographs, external fonts, or analytics are included. The local app serves the prepared chord WAVs directly and does not embed or fetch YouTube media at runtime.
