import { useCallback, useEffect, useRef, useState } from "react";
import { PianoAudio } from "./audio/piano";
import { RecordingPlayback, StrokeRecorder } from "./audio/recording";
import type { PianoTake } from "./audio/recording";
import {
  DEFAULT_LEFT_BOOST,
  DEFAULT_VOLUME,
  MAX_LEFT_BOOST,
  notesForHand,
} from "./config";
import type {
  HandRange,
  HandSide,
  InstrumentMode,
  NoteSelection,
} from "./config";
import { DualHandController, emptyHands } from "./gestures/dual-hand";
import type { DualHandResult, HandStates } from "./gestures/dual-hand";
import { cameraError, openCamera, stopCamera } from "./tracking/camera";
import { drawLandmarks } from "./tracking/draw-landmarks";
import { HandTracker } from "./tracking/hand-tracker";

export type CameraStatus = "idle" | "starting" | "live" | "error";
export type RecordingStatus = "idle" | "preparing" | "recording" | "playing";

export function useInstrument() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [audio] = useState(() => new PianoAudio());
  const [gesture] = useState(() => new DualHandController(5));
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [hands, setHands] = useState<HandStates>(emptyHands);
  const [activeNotes, setActiveNotes] = useState<NoteSelection[]>([]);
  const [lastNote, setLastNote] = useState<NoteSelection>({
    side: "right",
    slot: 0,
  });
  const [notesPlayed, setNotesPlayed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [leftBoost, setLeftBoostState] = useState(100);
  const [mode, setModeState] = useState<InstrumentMode>("chords");
  const modeRef = useRef<InstrumentMode>("chords");
  const [sampleStatus, setSampleStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const samplesReady = useRef(false);
  const leftLevels = useRef({ piano: DEFAULT_LEFT_BOOST, chords: 100 });
  const [range, setRangeState] = useState<HandRange>("split");
  const rangeRef = useRef<HandRange>("split");
  const [showLandmarks, setShowLandmarks] = useState(true);
  const showLandmarksRef = useRef(true);
  const trackerRef = useRef<HandTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const requestedInputs = useRef(new Map<string, NoteSelection>());
  const soundingInputs = useRef(new Map<string, NoteSelection>());
  const latestHands = useRef(emptyHands());
  const [recorder] = useState(() => new StrokeRecorder());
  const [take, setTake] = useState<PianoTake | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("idle");
  const recordingStatusRef = useRef<RecordingStatus>("idle");
  const recordingGeneration = useRef(0);
  const playbackRef = useRef<RecordingPlayback | null>(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [recordedStrokeCount, setRecordedStrokeCount] = useState(0);
  const [recordingMessage, setRecordingMessage] = useState("Ready when you are.");

  const changeRecordingStatus = useCallback((next: RecordingStatus) => {
    recordingStatusRef.current = next;
    setRecordingStatus(next);
  }, []);

  const finishRecording = useCallback(() => {
    if (recordingStatusRef.current !== "recording") return;
    const saved = recorder.stop(performance.now());
    setTake(saved);
    setRecordedStrokeCount(saved?.strokes.length ?? 0);
    setRecordingElapsedMs(saved?.durationMs ?? 0);
    setRecordingMessage(saved ? "Your take is ready to play." : "No strokes captured. Try recording again.");
    changeRecordingStatus("idle");
  }, [changeRecordingStatus, recorder]);

  const publishNotes = useCallback(() => {
    const unique = new Map(
      [...soundingInputs.current.values()].map((note) => [
        `${note.side}:${note.slot}`,
        note,
      ]),
    );
    setActiveNotes([...unique.values()]);
  }, []);

  const release = useCallback(
    (id: string) => {
      requestedInputs.current.delete(id);
      recorder.noteOff(id, performance.now());
      audio.noteOff(id);
      if (soundingInputs.current.delete(id)) publishNotes();
    },
    [audio, publishNotes, recorder],
  );

  const playNow = useCallback(
    (id: string, input: NoteSelection) => {
      const note = notesForHand(input.side, rangeRef.current, modeRef.current)[
        input.slot
      ];
      if (!note) return;
      const started = note.sampleId
        ? audio.chordOn(id, note.sampleId, input.side)
        : audio.noteOn(id, note.midi, input.side);
      if (!started) return;
      recorder.noteOn(id, input, performance.now());
      soundingInputs.current.set(id, input);
      setLastNote(input);
      setNotesPlayed((count) => count + 1);
      publishNotes();
    },
    [audio, publishNotes, recorder],
  );

  const enableSound = useCallback(async () => {
    try {
      await audio.enable();
      audio.setLeftBoost(leftLevels.current[modeRef.current] / 100);
    } catch (reason) {
      setError(
        "Sound could not start. Try a piano key again and check your browser audio settings.",
      );
      throw reason;
    }
    if (modeRef.current === "chords") {
      if (!samplesReady.current) setSampleStatus("loading");
      try {
        await audio.loadChords();
        samplesReady.current = true;
        setSampleStatus("ready");
        setError((previous) =>
          previous?.startsWith("Chord recordings could not load.")
            ? null
            : previous,
        );
      } catch (reason) {
        setSampleStatus("error");
        setError(
          "Chord recordings could not load. Try again or choose Piano in the Sound menu.",
        );
        throw reason;
      }
    }
  }, [audio]);

  const press = useCallback(
    (id: string, slot: number, side: HandSide) => {
      if (recordingStatusRef.current === "preparing" || recordingStatusRef.current === "playing") return;
      if (requestedInputs.current.has(id)) return;
      const request = { side, slot };
      requestedInputs.current.set(id, request);
      void enableSound()
        .then(() => {
          if (
            requestedInputs.current.get(id) === request &&
            recordingStatusRef.current !== "preparing" &&
            recordingStatusRef.current !== "playing"
          ) playNow(id, request);
        })
        .catch(() => {
          if (requestedInputs.current.get(id) === request)
            requestedInputs.current.delete(id);
        });
    },
    [enableSound, playNow],
  );

  const applyGesture = useCallback(
    (result: DualHandResult) => {
      if (recordingStatusRef.current === "preparing" || recordingStatusRef.current === "playing") return;
      for (const event of result.events) {
        if (event.type === "on")
          playNow(`hand:${event.side}`, { side: event.side, slot: event.note });
        else release(`hand:${event.side}`);
      }
      const changed = (["left", "right"] as const).some((side) => {
        const before = latestHands.current[side];
        const after = result.hands[side];
        return (
          before.selected !== after.selected ||
          before.held !== after.held ||
          before.tracked !== after.tracked ||
          before.armed !== after.armed
        );
      });
      latestHands.current = result.hands;
      if (changed) {
        setHands(result.hands);
      }
    },
    [playNow, release],
  );

  const silence = useCallback(() => {
    const previous = recordingStatusRef.current;
    recordingGeneration.current += 1;
    finishRecording();
    playbackRef.current?.stop();
    playbackRef.current = null;
    changeRecordingStatus("idle");
    if (previous === "playing") setRecordingMessage("Playback stopped. Your take is ready to play.");
    if (previous === "preparing") setRecordingMessage("Cancelled. Ready when you are.");
    requestedInputs.current.clear();
    soundingInputs.current.clear();
    audio.allNotesOff();
    gesture.reset();
    latestHands.current = emptyHands();
    setHands(emptyHands());
    setActiveNotes([]);
  }, [audio, changeRecordingStatus, finishRecording, gesture]);

  const startRecording = async () => {
    if (recordingStatusRef.current !== "idle") return;
    silence();
    const session = recordingGeneration.current;
    changeRecordingStatus("preparing");
    setRecordingMessage("Preparing sound…");
    try {
      await enableSound();
      if (session !== recordingGeneration.current) return;
      recorder.start({
        mode: modeRef.current,
        range: rangeRef.current,
        leftBoost: leftLevels.current[modeRef.current],
      }, performance.now());
      setTake(null);
      setRecordedStrokeCount(0);
      setRecordingElapsedMs(0);
      setRecordingMessage("Recording your strokes. Play with your hands, keyboard, or the keys below.");
      changeRecordingStatus("recording");
    } catch {
      if (session !== recordingGeneration.current) return;
      changeRecordingStatus("idle");
      setRecordingMessage("Sound could not start. Try recording again.");
    }
  };

  const playRecording = async () => {
    if (!take || recordingStatusRef.current !== "idle") return;
    silence();
    // Restore the take's banks so both playback and key highlights match it.
    modeRef.current = take.mode;
    rangeRef.current = take.range;
    setModeState(take.mode);
    setRangeState(take.range);
    setLastNote({ side: "right", slot: 0 });
    gesture.setSlotCount(take.mode === "chords" ? 5 : 8);
    leftLevels.current[take.mode] = take.leftBoost;
    setLeftBoostState(take.leftBoost);
    const session = recordingGeneration.current;
    changeRecordingStatus("preparing");
    setRecordingMessage("Preparing playback…");
    setRecordingElapsedMs(0);
    try {
      await enableSound();
      if (session !== recordingGeneration.current) return;
      const playback = new RecordingPlayback(playNow, release, () => {
        silence();
        setRecordingElapsedMs(take.durationMs);
        setRecordingMessage("Playback finished. Play it again or start a new take.");
      });
      playbackRef.current = playback;
      changeRecordingStatus("playing");
      setRecordingMessage("Playing your take. Live keys resume when playback stops.");
      playback.start(take);
    } catch {
      if (session !== recordingGeneration.current) return;
      changeRecordingStatus("idle");
      setRecordingMessage("Playback could not start. Your take is still here; try again.");
    }
  };

  const stopRecording = () => {
    const previous = recordingStatusRef.current;
    silence();
    if (previous === "playing" || previous === "preparing") {
      setRecordingElapsedMs(take?.durationMs ?? 0);
      setRecordingMessage(previous === "playing" ? "Playback stopped. Your take is ready to play." : "Cancelled. Ready when you are.");
    }
  };

  const clearRecording = () => {
    if (recordingStatusRef.current !== "idle") return;
    setTake(null);
    setRecordedStrokeCount(0);
    setRecordingElapsedMs(0);
    setRecordingMessage("Take cleared. Ready when you are.");
  };

  useEffect(() => {
    if (recordingStatus !== "recording" && recordingStatus !== "playing") return;
    const timer = window.setInterval(() => {
      if (recordingStatusRef.current === "recording") {
        setRecordingElapsedMs(recorder.elapsed(performance.now()));
        setRecordedStrokeCount(recorder.count);
      } else if (recordingStatusRef.current === "playing" && playbackRef.current) {
        setRecordingElapsedMs(Math.min(take?.durationMs ?? 0, playbackRef.current.elapsedMs));
      }
    }, 100);
    return () => clearInterval(timer);
  }, [recorder, recordingStatus, take]);

  const cleanupSession = useCallback(() => {
    generation.current += 1;
    trackerRef.current?.close();
    trackerRef.current = null;
    stopCamera(streamRef.current);
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    const canvas = canvasRef.current;
    if (canvas) drawLandmarks(canvas, []);
    silence();
    setFps(0);
  }, [silence]);

  const stop = useCallback(() => {
    cleanupSession();
    setStatus("idle");
  }, [cleanupSession]);

  const start = useCallback(async () => {
    cleanupSession();
    const session = generation.current;
    setStatus("starting");
    setError(null);
    const soundReady = enableSound();
    const cameraReady = openCamera().then((stream) => {
      if (generation.current !== session) {
        stopCamera(stream);
        return null;
      }
      streamRef.current = stream;
      return stream;
    });
    const modelReady = HandTracker.create().then((tracker) => {
      if (generation.current !== session) {
        tracker.close();
        return null;
      }
      trackerRef.current = tracker;
      return tracker;
    });
    try {
      const [stream, tracker] = await Promise.all([
        cameraReady,
        modelReady,
        soundReady,
      ]);
      if (generation.current !== session || !stream || !tracker) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      video.srcObject = stream;
      await video.play();
      if (generation.current !== session) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      let frameCount = 0;
      let rateStartedAt = performance.now();
      const fail = (reason: unknown) => {
        if (generation.current !== session) return;
        cleanupSession();
        setStatus("error");
        setError(cameraError(reason));
      };
      stream.getVideoTracks().forEach((track) => {
        track.onended = () =>
          fail(
            new Error(
              "The camera disconnected. Reconnect it and try again; keyboard mode still works.",
            ),
          );
      });
      tracker.start(
        video,
        (tracked, now) => {
          if (generation.current !== session) return;
          const result =
            modeRef.current === "chords" && !samplesReady.current
              ? gesture.reset()
              : gesture.update(
                  tracked,
                  video.videoWidth,
                  video.videoHeight,
                  now,
                );
          applyGesture(result);
          if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          drawLandmarks(
            canvas,
            tracked.map((hand) => {
              const snapshot = result.hands[hand.side];
              const slot = snapshot.held ?? snapshot.selected;
              return {
                side: hand.side,
                points: hand.points,
                pinching: snapshot.held !== null,
                cursorX: snapshot.cursorX,
                note:
                  slot === null
                    ? null
                    : notesForHand(
                        hand.side,
                        rangeRef.current,
                        modeRef.current,
                      )[slot]!.name,
              };
            }),
            showLandmarksRef.current,
            rangeRef.current,
            modeRef.current,
          );
          frameCount += 1;
          if (now - rateStartedAt >= 1000) {
            setFps(Math.round((frameCount * 1000) / (now - rateStartedAt)));
            frameCount = 0;
            rateStartedAt = now;
          }
        },
        fail,
      );
      setStatus("live");
    } catch (reason) {
      if (generation.current !== session) return;
      cleanupSession();
      setStatus("error");
      setError(cameraError(reason));
    }
  }, [applyGesture, cleanupSession, enableSound, gesture]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey)
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select") || target.isContentEditable)
      )
        return;
      if (document.querySelector("dialog[open]")) return;
      for (const side of ["left", "right"] as const) {
        const slot = notesForHand(
          side,
          rangeRef.current,
          modeRef.current,
        ).findIndex(
          (note) => note.shortcut.toLowerCase() === event.key.toLowerCase(),
        );
        if (slot >= 0) {
          event.preventDefault();
          press(`key:${event.code}`, slot, side);
          return;
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => release(`key:${event.code}`);
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    const watchdog = window.setInterval(() => {
      if (Object.values(latestHands.current).some((hand) => hand.tracked))
        applyGesture(gesture.tick(performance.now()));
    }, 50);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", silence);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(watchdog);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", silence);
      document.removeEventListener("visibilitychange", onVisibility);
      cleanupSession();
      void audio.dispose();
    };
  }, [
    applyGesture,
    audio,
    cleanupSession,
    gesture,
    press,
    release,
    silence,
    stop,
  ]);

  const setVolume = (next: number) => {
    setVolumeState(next);
    audio.setVolume(next / 100);
  };
  const setLeftBoost = (next: number) => {
    if (recordingStatusRef.current !== "idle") return;
    const value = Math.max(100, Math.min(MAX_LEFT_BOOST, next));
    setLeftBoostState(value);
    leftLevels.current[modeRef.current] = value;
    audio.setLeftBoost(value / 100);
  };
  const setMode = (next: InstrumentMode) => {
    if (recordingStatusRef.current !== "idle") return;
    if (next === modeRef.current) return;
    silence();
    modeRef.current = next;
    setModeState(next);
    setLastNote({ side: "right", slot: 0 });
    gesture.setSlotCount(next === "chords" ? 5 : 8);
    setLeftBoostState(leftLevels.current[next]);
    audio.setLeftBoost(leftLevels.current[next] / 100);
    setError(null);
    void enableSound().catch(() => {});
  };
  const setRange = (next: HandRange) => {
    if (recordingStatusRef.current !== "idle") return;
    silence();
    rangeRef.current = next;
    setRangeState(next);
  };
  const toggleLandmarks = () => {
    showLandmarksRef.current = !showLandmarksRef.current;
    setShowLandmarks(showLandmarksRef.current);
  };

  return {
    videoRef,
    canvasRef,
    status,
    hands,
    activeNotes,
    lastNote,
    notesPlayed,
    error,
    fps,
    volume,
    setVolume,
    leftBoost,
    setLeftBoost,
    mode,
    setMode,
    sampleStatus,
    range,
    setRange,
    showLandmarks,
    toggleLandmarks,
    start,
    stop,
    press,
    release,
    enableSound,
    take,
    recordingStatus,
    recordingElapsedMs,
    recordedStrokeCount,
    recordingMessage,
    startRecording,
    stopRecording,
    playRecording,
    clearRecording,
  };
}
