import type { CSSProperties } from "react";
import { memo } from "react";
import { HAND_COLORS, notesForHand } from "../config";
import type {
  HandRange,
  HandSide,
  InstrumentMode,
  NoteSelection,
} from "../config";
import type { HandStates } from "../gestures/dual-hand";
import { Icon } from "./Icons";

interface Props {
  activeNotes: NoteSelection[];
  hands: HandStates;
  range: HandRange;
  mode: InstrumentMode;
  onPress: (id: string, index: number, side: HandSide) => void;
  onRelease: (id: string) => void;
}

export const PianoKeyboard = memo(function PianoKeyboard({
  activeNotes,
  hands,
  range,
  mode,
  onPress,
  onRelease,
}: Props) {
  return (
    <section className="piano-section" aria-label="Virtual piano">
      <div className="piano-heading">
        <div>
          <span className="section-label">THE KEYS</span>
          <span className="scale-label">
            {mode === "chords" ? "Recorded chords" : "C major"} <span> / </span>{" "}
            {mode === "chords"
              ? "Five per hand"
              : range === "split"
                ? "Two octaves"
                : "Shared octave"}
          </span>
        </div>
        <span className="keyboard-hint">
          <Icon name="keyboard" size={16} /> Two hands. Two independent voices.
        </span>
      </div>
      <div className="piano-banks">
        {(["left", "right"] as const).map((side) => {
          const notes = notesForHand(side, range, mode);
          return (
            <div
              key={side}
              className="piano-bank"
              data-hand={side}
              style={{ "--hand-color": HAND_COLORS[side] } as CSSProperties}
            >
              <div className="bank-heading">
                <span>
                  <i />
                  {side === "left" ? "LEFT HAND" : "RIGHT HAND"}
                </span>
                <span>
                  {mode === "chords"
                    ? notes.map((note) => note.name).join(" · ")
                    : `${notes[0]!.name} — ${notes.at(-1)!.name}`}
                </span>
              </div>
              <div className="piano-case">
                <div className="piano-rail">
                  <span>
                    {mode === "chords"
                      ? "LET IT RING"
                      : side === "left"
                        ? "LOWER VOICE"
                        : "MELODY VOICE"}
                  </span>
                  <div className="rail-light" />
                  <span className="rail-right">MOVE · PINCH · PLAY</span>
                </div>
                <div
                  className="piano-keys"
                  style={{
                    gridTemplateColumns: `repeat(${notes.length}, minmax(0, 1fr))`,
                  }}
                >
                  {notes.map((note, index) => {
                    const active = activeNotes.some(
                      (input) => input.side === side && input.slot === index,
                    );
                    const hovered =
                      hands[side].tracked && hands[side].selected === index;
                    return (
                      <button
                        key={note.name}
                        type="button"
                        className={`piano-key ${active ? "is-active" : ""} ${hovered ? "is-selected" : ""}`}
                        aria-label={`Play ${side} ${note.name} (${note.shortcut})`}
                        aria-pressed={active}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          onPress(`pointer:${event.pointerId}`, index, side);
                        }}
                        onPointerUp={(event) =>
                          onRelease(`pointer:${event.pointerId}`)
                        }
                        onPointerCancel={(event) =>
                          onRelease(`pointer:${event.pointerId}`)
                        }
                        onLostPointerCapture={(event) =>
                          onRelease(`pointer:${event.pointerId}`)
                        }
                        onKeyDown={(event) => {
                          if (
                            (event.key === " " || event.key === "Enter") &&
                            !event.repeat
                          ) {
                            event.preventDefault();
                            onPress(`button:${side}:${index}`, index, side);
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === " " || event.key === "Enter") {
                            event.preventDefault();
                            onRelease(`button:${side}:${index}`);
                          }
                        }}
                        onBlur={() => onRelease(`button:${side}:${index}`)}
                      >
                        <span className="key-target" aria-hidden="true">
                          {hovered ? "●" : ""}
                        </span>
                        <span className="key-solfege">{note.solfege}</span>
                        <span className="key-note">
                          {mode === "chords" ? (
                            note.name
                          ) : (
                            <>
                              {note.name.slice(0, -1)}
                              <small>{note.name.slice(-1)}</small>
                            </>
                          )}
                        </span>
                        <kbd>{note.shortcut}</kbd>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="piano-caption">
        {mode === "chords"
          ? "Open → move to a chord → pinch. Release and choose another while it rings."
          : "Hold a low note with your left. Find a melody with your right."}
      </p>
    </section>
  );
});
