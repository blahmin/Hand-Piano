# Hand Piano

A little motion. A lot of music. A two-hand virtual piano played with a webcam, a thumb–index pinch, or your computer keyboard.

## Run locally

Install **Node.js 24 LTS** (including npm), then:

```sh
git clone https://github.com/blahmin/Hand-Piano.git
cd Hand-Piano
npm ci
npm run assets:prepare
npm run dev
```

Open **http://localhost:5173**. For an existing local checkout, begin at `npm ci`.

`assets:prepare` copies the matching MediaPipe WASM runtime from the installed package. It downloads the pretrained model only if the local model is missing. After preparation, all application assets and inference run locally; the application uses no CDN, backend, or external font service.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

Production preview uses **http://localhost:4173**. Dev and preview use fixed ports and fail clearly if the port is occupied.

## How to play

1. Select **Enable camera** and allow camera permission.
2. Hold one or both hands in good light with thumb and index apart until tracking is ready.
3. With thumb and index apart, slide your whole hand sideways. Watch the highlighted target in the camera strip change. The default **Recorded chords** mode has five chords per hand: **left: C, Dm, Em, F, G** (green); **right: Am, D, A, E, Bm** (purple).
4. Pinch thumb and index to play. Open to choose another chord while the recording finishes ringing. Each hand triggers independently. Holding a pinch does not repeat the sound.
5. Select **Stop camera** when finished.

To change keys: **open → move sideways → pinch again**. Moving while holding a pinch keeps the current note. The camera shows note strips, a position marker, and an open-to-change reminder. A simple three-step guide replaces the separate note chart. Individual fingers are not assigned different pitches.

The two banks are assigned from the visible mirrored camera halves, so place each hand on its matching side when entering the frame.

Without a camera, press **Z X C V B** for the left chords or **A S D F G** for the right chords. You can also click/touch the keys or focus a key and use Enter/Space. Audio starts after a user interaction. All ten recordings are preloaded and decoded once before playback; the note path performs no network requests or audio decoding.

Choose **Sound → Piano** for the original individual notes: **left C3–C4**, **right C4–C5**. Piano mode uses eight keys per hand: **Z X C V B N M ,** and **A S D F G H J K**. Its **Hand range** selector can put both hands in C4–C5 instead. Switching sounds or ranges silences existing voices and requires a fresh open pinch. Piano notes fade for three seconds after release; recorded chords play their complete 3.2-second samples. Stop, blur, and tab hiding still silence everything promptly.

**Left boost** controls the left bank's level independently, including notes already held. Piano starts at 250% to bring out the lower octave; recorded chords start at 100% because those samples are normalized. Each mode remembers its own setting during the session. Adjust between 100% and 300% to balance your speakers. The main Volume control starts at 75% and adjusts both banks.

### Recorded chord source

The ten samples were extracted from [YouTube Piano (Chords) by Play With Keyboard](https://www.youtube.com/watch?v=qWX31yz68Ns) using the supplied timestamps: C 0:15, Dm 0:30, Em 0:45, F 1:00, G 1:15, Am 1:30, D 1:45, A 2:00, E 2:15, Bm 0:00. These are complete chords, not single-note samples. They play at their original pitch and are not shifted to the Piano mode's octaves.

`public/audio/chords/manifest.json` records the cue positions, trims, durations, and SHA-256 hashes. Each local mono WAV has leading silence trimmed, its peak normalized to 0.85, and short edge fades. The ten samples total approximately 2.8 MB. Recreate them from a local copy of the source using Python 3 and FFmpeg:

```sh
python scripts/extract-chords.py path/to/source.mp4
```

The running app never contacts YouTube. See the audio attribution and license status in `THIRD_PARTY_NOTICES.md`.

## Architecture

```text
camera → MediaPipe landmarks → geometric pinch state machine → Web Audio
                                      ↓                         ↓
                               selected key              sounding-key UI
keyboard / mouse / touch ──────────────────────────────→ same audio engine
```

- `src/tracking`: camera lifecycle, local model loading, frame scheduling, stable hand identities, labeled landmark drawing.
- `src/gestures`: pure geometry, smoothing, independent pinch state machines, per-hand loss timeouts.
- `src/audio`: synthesized voices, decoded chord buffers, bounded polyphony, envelopes, volume, cleanup.
- `src/use-instrument.ts`: session orchestration and input ownership.
- `src/components`: accessible UI and virtual piano.
- `tests`: deterministic landmark fixtures and temporal gesture tests.

Inference uses a dedicated worker with transferable frames resized to at most 480 pixels wide when supported. It targets 30 results/second; unsupported or failed worker initialization/inference falls back to the main thread at a target of 20 results/second. GPU initialization also has a CPU fallback. Actual rates depend on hardware and lighting, and these targets are not measured guarantees. Only one inference may be in flight, stale intermediate frames are skipped, and only new decoded video frames are processed. React receives selected/held/tracking changes and once-per-second FPS diagnostics instead of every landmark. Overlay drawing remains imperative. One or two hands are supported. Detection-array order is not used as a note identity. Ambiguous overlapping palms require rearming. No custom model is trained.

The voice budget is 24, including released tails. When exceeded, the oldest released voice fades out first. Completed audio nodes disconnect, while decoded sample buffers are reused until audio disposal.

## Troubleshooting

- **Camera denied:** allow camera access in browser site settings, then retry. Keyboard playback remains available.
- **No camera / camera busy:** connect a webcam or close other camera apps.
- **No sound:** click a piano key; check volume and system output.
- **Chord recordings could not load:** retry a key, or select Sound → Piano. Confirm the ten WAV files exist under `public/audio/chords`. A failed load can be retried; partial loads never substitute incorrectly labeled sounds.
- **Tracking is uncertain:** improve lighting, face your palms toward the camera, keep hands apart and fingertips visible, and open thumb/index to rearm.
- **Vision assets missing:** run `npm run assets:prepare` again.
- **Unsupported browser:** use current Chrome for the demo. GPU initialization falls back to CPU. Manual input remains available if tracking fails.
- **Remote plain HTTP:** webcam access needs a secure context. Use localhost for the local demo.

The app releases notes on tracking loss, tab hiding, window blur, and camera stop. Tab hiding also stops the webcam. A fresh open pinch is required after losing tracking.

## 60-second demo

- 0–10 s: open localhost, enable camera, grant permission.
- 10–20 s: show landmarks and silent note selection.
- 20–35 s: open, move sideways along a camera note strip, and pinch; repeat across both banks.
- 35–50 s: play **C → G → Am → F** in Recorded chords mode; release each pinch to hear it ring while choosing the next. Or switch to Piano for low C3 plus a right-hand melody.
- 50–60 s: show keyboard fallback and stop the camera.

## Privacy and assets

Camera permission is explicit. The application requests video only, records nothing, and sends no camera frames to a server. Model/WASM assets are served by the same local Vite server. The model source, byte length, and SHA-256 are recorded in `public/models/manifest.json`.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for upstream licensing. Dependency installation and a missing model's initial download require internet access.

## Scope

This is a hackathon demo. Gesture thresholds and two-hand accuracy need real-camera testing on the presentation laptop. Extra gesture types, recording, custom training, cloud infrastructure, and extensive CI are intentionally outside this version.

### Manual acceptance check

- Enable the camera and confirm two colored hand skeletons and labeled note cursors.
- Select every note within each hand's half of the camera.
- Pinch both hands, then release just one; the other note should remain active.
- Move a held pinch; its pitch should stay fixed until release.
- Remove one hand; only its note should release.
- Verify that the camera note strips, position markers, and matching key highlights agree.
- In Recorded chords mode, reach all five chords on each side, then play C → G → Am → F.
- Release each chord quickly and confirm its full decay continues; retrigger while an older chord rings.
- Switch to Piano and verify eight keys per side and the original split octaves.
- Compare left and right levels in both modes and test rapid alternating pinches for visible input lag.
- Try both rows of keyboard shortcuts, then stop the camera.
