// @refresh reset
// Remount media services during development so edits do not retain old audio instances.
import { useRef, useState } from "react";
import {
  frequencyForMidi,
  HAND_COLORS,
  MAX_LEFT_BOOST,
  notesForHand,
} from "./config";
import type { HandRange, InstrumentMode } from "./config";
import { Icon } from "./components/Icons";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { GestureGuide } from "./components/GestureGuide";
import { useInstrument } from "./use-instrument";

export default function App() {
  const instrument = useInstrument();
  const helpRef = useRef<HTMLDialogElement>(null);
  const [manualHint, setManualHint] = useState(false);
  const { status, hands, activeNotes, range, mode } = instrument;
  const chords = mode === "chords";
  const hand = hands.right.tracked ? hands.right : hands.left;
  const trackedCount = Object.values(hands).filter(
    (item) => item.tracked,
  ).length;
  const heldCount = Object.values(hands).filter(
    (item) => item.held !== null,
  ).length;
  const live = status === "live";
  const starting = status === "starting";
  const playing = activeNotes.length > 0;
  const sounding =
    activeNotes.find(
      (item) =>
        item.side === instrument.lastNote.side &&
        item.slot === instrument.lastNote.slot,
    ) ?? activeNotes.at(-1);
  const hovered =
    hands.right.selected !== null
      ? { side: "right" as const, slot: hands.right.selected }
      : hands.left.selected !== null
        ? { side: "left" as const, slot: hands.left.selected }
        : null;
  const selected = sounding ?? hovered ?? instrument.lastNote;
  const note = notesForHand(selected.side, range, mode)[selected.slot]!;
  const gestureLabel = !live
    ? "Waiting for your hand"
    : !hand.tracked
      ? "Bring your hands into view"
      : heldCount > 0
        ? "Playing — open thumb + index to change notes"
        : !hand.armed
          ? "Spread thumb + index apart to start"
          : "Move your whole hand left/right, then pinch to play";

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="#" aria-label="Hand Piano home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          hand<span>piano</span>
          <span className="wordmark-dot">®</span>
        </a>
        <div className="header-center">
          <span className="status-dot" /> A NEW WAY TO MAKE MUSIC
        </div>
        <button
          className="text-button help-button"
          onClick={() => helpRef.current?.showModal()}
        >
          <Icon name="help" size={17} /> How to play
        </button>
      </header>

      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="tiny-line" /> AN INSTRUMENT IN THE AIR
            </div>
            <h1>
              A little motion.
              <br className="mobile-break" /> <em>A lot of music.</em>
            </h1>
            <p>
              Open your fingers. Move your hand sideways to choose a note. Pinch
              to play.
            </p>
          </div>
          <div className="intro-stamp">
            <span>NO KEYS TO TOUCH.</span>
            <span>JUST A LITTLE MAGIC.</span>
            <svg viewBox="0 0 44 44" fill="none" aria-hidden="true">
              <path
                d="M5 8c8 0 6 16 15 16s6-16 14-16m0 0-1 10m1-10-10 3M20 24v13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </section>

        <GestureGuide />
        <div className="studio-grid">
          <section
            className={`camera-stage ${live ? "is-live" : ""}`}
            aria-label="Hand tracking camera"
          >
            <div className="camera-stage-top">
              <span className="camera-label">
                <span className={`status-dot ${live ? "is-on" : ""}`} />{" "}
                {live
                  ? "CAMERA LIVE"
                  : starting
                    ? "CONNECTING"
                    : "YOUR PLAY SPACE"}
              </span>
              <span className="stage-tag">01 / TWO-HAND TRACKING</span>
            </div>
            <video
              ref={instrument.videoRef}
              autoPlay
              muted
              playsInline
              className={`camera-video ${live ? "visible" : ""}`}
            />
            <canvas
              ref={instrument.canvasRef}
              className={`landmark-canvas ${live ? "visible" : ""}`}
            />
            {!live && (
              <div className="camera-welcome">
                <div className="camera-empty-icon">
                  <Icon name="camera" size={48} />
                </div>
                <h2>
                  {starting ? "Finding your rhythm…" : "Make room for play."}
                </h2>
                <p>
                  {starting
                    ? "Preparing local hand tracking and your camera."
                    : "Turn on your camera. Let your hands do the rest."}
                </p>
                <button
                  className="primary-button"
                  disabled={starting}
                  onClick={() => void instrument.start()}
                >
                  <Icon name="camera" size={18} />
                  {starting
                    ? "Connecting camera…"
                    : status === "error"
                      ? "Try camera again"
                      : "Enable camera"}
                  {!starting && <Icon name="arrow" size={17} />}
                </button>
                <span className="permission-note">
                  Your browser will ask for camera permission.
                </span>
                {starting && (
                  <button
                    className="text-button cancel-button"
                    onClick={instrument.stop}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
            {live && !hand.tracked && (
              <div className="tracking-prompt">
                <span className="scanning-ring" />
                <h2>Your hands belong here.</h2>
                <p>Keep thumb and index apart, then move your hand sideways.</p>
              </div>
            )}
            {live && (
              <div className="live-gesture-chip">
                <span className={`status-dot ${hand.tracked ? "is-on" : ""}`} />
                {gestureLabel}
              </div>
            )}
            <div className="camera-stage-bottom">
              <span>
                <Icon name="shield" size={13} /> PROCESSED ON YOUR DEVICE
              </span>
              <span>
                {live ? `${instrument.fps} FPS` : "PRIVATE BY DESIGN"}{" "}
                <span className="corner-mark">⌟</span>
              </span>
            </div>
            <div className="viewfinder corner-tl" />
            <div className="viewfinder corner-tr" />
            <div className="viewfinder corner-bl" />
            <div className="viewfinder corner-br" />
          </section>

          <aside className="session-panel">
            <div className="session-title">
              <span className="section-label">THE NOW PLAYING</span>
              <span
                className={`sound-indicator ${playing ? "is-playing" : ""}`}
                aria-label={playing ? "Sound playing" : "Sound idle"}
              >
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className={`note-display ${playing ? "is-playing" : ""}`}>
              <span className="note-overline">
                {playing
                  ? chords
                    ? "TRIGGERED CHORD"
                    : "SOUNDING NOTE"
                  : hand.tracked
                    ? chords
                      ? "SELECTED CHORD"
                      : "SELECTED NOTE"
                    : chords
                      ? "YOUR FIRST CHORD"
                      : "YOUR FIRST NOTE"}
              </span>
              <div className="large-note">
                {chords ? (
                  note.name
                ) : (
                  <>
                    {note.name.slice(0, -1)}
                    <span>{note.name.slice(-1)}</span>
                  </>
                )}
              </div>
              <span className="note-frequency">
                {chords ? (
                  <>
                    {note.solfege} chord <span className="note-divider">/</span>{" "}
                    Recorded piano
                  </>
                ) : (
                  <>
                    {frequencyForMidi(note.midi).toFixed(2)} <span>Hz</span>
                    <span className="note-divider">/</span>
                    {note.solfege}
                  </>
                )}
              </span>
            </div>
            <div className="gesture-readout">
              <div>
                <span className={`status-dot ${hand.tracked ? "is-on" : ""}`} />
                <span>
                  {heldCount > 0
                    ? `${heldCount} PINCHED`
                    : hand.tracked
                      ? `${trackedCount} HANDS DETECTED`
                      : "STANDBY"}
                </span>
              </div>
              <span>
                {instrument.notesPlayed.toString().padStart(2, "0")}{" "}
                <small>{chords ? "chords played" : "notes played"}</small>
              </span>
            </div>
            <div
              className="hand-note-cards"
              aria-label="Notes selected by each hand"
            >
              {(["left", "right"] as const).map((side) => {
                const snapshot = hands[side];
                const held = activeNotes.filter((input) => input.side === side);
                const slot = held.at(-1)?.slot ?? snapshot.selected;
                const currentNote =
                  slot === null || slot === undefined
                    ? null
                    : notesForHand(side, range, mode)[slot];
                return (
                  <div
                    key={side}
                    className={`hand-note-card ${held.length ? "is-playing" : ""}`}
                    style={{ color: HAND_COLORS[side] }}
                  >
                    <span>{side === "left" ? "LEFT HAND" : "RIGHT HAND"}</span>
                    <strong>{currentNote?.name ?? "—"}</strong>
                    <small>
                      {held.length
                        ? "OPEN TO CHANGE NOTE"
                        : snapshot.tracked
                          ? "MOVE ↔ THEN PINCH"
                          : "SHOW YOUR HAND"}
                    </small>
                  </div>
                );
              })}
            </div>
            <div className="session-bottom">
              <span className="instrument-dot" />
              <span>{chords ? "Recorded chords" : "Soft piano"}</span>
              <span>
                {chords
                  ? instrument.sampleStatus === "loading"
                    ? "LOADING…"
                    : instrument.sampleStatus === "ready"
                      ? "READY · LET IT RING"
                      : instrument.sampleStatus === "error"
                        ? "LOAD FAILED"
                        : "PRESS A KEY TO LOAD"
                  : "SUSTAIN ON"}
              </span>
            </div>
          </aside>
        </div>

        {instrument.error && (
          <div className="error-message" role="alert">
            <Icon name="help" size={18} />
            <span>{instrument.error}</span>
          </div>
        )}

        <div className="control-strip">
          <div className="input-controls">
            <button
              className={`control-button ${live || starting ? "is-active" : ""}`}
              onClick={
                live || starting
                  ? instrument.stop
                  : () => void instrument.start()
              }
            >
              <Icon name={live || starting ? "stop" : "camera"} size={16} />
              {live || starting ? "Stop camera" : "Camera off"}
            </button>
            <span className="control-separator" />
            <button
              className="control-button"
              aria-pressed={instrument.showLandmarks}
              onClick={instrument.toggleLandmarks}
            >
              <Icon name="eye" size={16} />
              Landmarks
              <span
                className={`mini-toggle ${instrument.showLandmarks ? "is-on" : ""}`}
              />
            </button>
          </div>
          <div className="range-control sound-control">
            <label htmlFor="sound-mode">Sound</label>
            <select
              id="sound-mode"
              value={mode}
              onChange={(event) =>
                instrument.setMode(event.target.value as InstrumentMode)
              }
            >
              <option value="chords">Recorded chords</option>
              <option value="piano">Piano</option>
            </select>
          </div>
          {!chords && (
            <div className="range-control">
              <label htmlFor="hand-range">Hand range</label>
              <select
                id="hand-range"
                value={range}
                onChange={(event) =>
                  instrument.setRange(event.target.value as HandRange)
                }
              >
                <option value="split">Split octaves</option>
                <option value="shared">Shared octave</option>
              </select>
            </div>
          )}
          <div className="volume-control">
            <Icon name="volume" size={17} />
            <label htmlFor="volume">Volume</label>
            <input
              id="volume"
              type="range"
              min="0"
              max="100"
              value={instrument.volume}
              onChange={(event) =>
                instrument.setVolume(Number(event.target.value))
              }
            />
            <span>{instrument.volume}%</span>
          </div>
          <div className="volume-control left-boost-control">
            <label htmlFor="left-boost">Left boost</label>
            <input
              id="left-boost"
              type="range"
              min="100"
              max={MAX_LEFT_BOOST}
              step="10"
              value={instrument.leftBoost}
              onChange={(event) =>
                instrument.setLeftBoost(Number(event.target.value))
              }
            />
            <span>{instrument.leftBoost}%</span>
          </div>
        </div>

        <PianoKeyboard
          activeNotes={activeNotes}
          hands={hands}
          range={range}
          mode={mode}
          onPress={instrument.press}
          onRelease={instrument.release}
        />
        <div className="manual-entry">
          <span>
            {manualHint
              ? chords
                ? "Left: Z X C V B · Right: A S D F G."
                : "Left: Z X C V B N M , · Right: A S D F G H J K."
              : "No camera? There’s still music to be made."}
          </span>
          <button
            className="text-button"
            onClick={() => {
              void instrument
                .enableSound()
                .then(() => setManualHint(true))
                .catch(() => setManualHint(false));
            }}
          >
            <Icon name="keyboard" size={15} />
            Play with keyboard
            <Icon name="arrow" size={15} />
          </button>
        </div>
      </main>

      <footer className="site-footer">
        <span>A SMALL EXPERIMENT IN HUMAN EXPRESSION.</span>
        <span>
          Made for the joy of making music.
          <span className="footer-spark">✳</span>
        </span>
      </footer>

      <dialog ref={helpRef} className="help-dialog">
        <button
          className="dialog-close"
          onClick={() => helpRef.current?.close()}
          aria-label="Close instructions"
          autoFocus
        >
          <Icon name="close" />
        </button>
        <span className="eyebrow">YOUR HANDS. YOUR INSTRUMENT.</span>
        <h2>A few notes on playing.</h2>
        <ol>
          <li>
            <strong>Enable your camera.</strong> Hold one or both hands in view.
            Keep thumb and index apart to get ready.{" "}
            {chords
              ? "Left: C, Dm, Em, F, G. Right: Am, D, A, E, Bm."
              : "Your left hand plays C3–C4; your right plays C4–C5."}
          </li>
          <li>
            <strong>Open, then move sideways.</strong> Slide your whole hand
            left or right. The note strip in the camera shows the key you are
            choosing. Green is the left side; purple is the right side.
          </li>
          <li>
            <strong>Make a pinch.</strong> Bring your thumb and index together.
            {chords
              ? "The whole chord plays and keeps ringing when you release."
              : "The note fades gently when you release."}{" "}
            To choose another key, open your fingers first, move sideways, then
            pinch again.
          </li>
        </ol>
        <p>
          {chords ? (
            <>
              Try <strong>C → G → Am → F</strong>. Let each chord ring as you
              choose the next.
            </>
          ) : (
            <>
              Try <strong>C C G G A A G</strong> — a little familiar tune.
            </>
          )}
        </p>
        <div className="help-keyboard">
          <Icon name="keyboard" /> You can also hold{" "}
          <strong>{chords ? "Z X C V B" : "Z X C V B N M ,"}</strong> for the
          left bank, <strong>{chords ? "A S D F G" : "A S D F G H J K"}</strong>{" "}
          for the right, or click the keys.
        </div>
        <p className="help-privacy">
          Camera frames stay on your device. Nothing is recorded or uploaded.
          Good lighting and a simple background help.
        </p>
        <button
          className="primary-button"
          onClick={() => helpRef.current?.close()}
        >
          Let’s play
          <Icon name="arrow" size={16} />
        </button>
      </dialog>
    </div>
  );
}
