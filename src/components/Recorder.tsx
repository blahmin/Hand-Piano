import type { PianoTake } from "../audio/recording";
import type { RecordingStatus } from "../use-instrument";
import { Icon } from "./Icons";

interface Props {
  status: RecordingStatus;
  elapsedMs: number;
  strokeCount: number;
  take: PianoTake | null;
  message: string;
  onRecord: () => void;
  onStop: () => void;
  onPlay: () => void;
  onClear: () => void;
}

export function formatRecordingTime(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  return `${Math.floor(tenths / 600).toString().padStart(2, "0")}:${Math.floor(tenths / 10 % 60).toString().padStart(2, "0")}.${tenths % 10}`;
}

export function Recorder({ status, elapsedMs, strokeCount, take, message, onRecord, onStop, onPlay, onClear }: Props) {
  const busy = status !== "idle";
  return (
    <section className={`recorder ${status === "recording" ? "is-recording" : ""}`} aria-label="Piano recorder">
      <div className="recorder-heading">
        <span className="section-label">YOUR RECORDER</span>
        <div className="recorder-readout">
          <span className={`record-light ${status === "recording" ? "is-on" : ""}`} aria-hidden="true" />
          <output aria-label="Recording time" aria-live="off">{formatRecordingTime(elapsedMs)}</output>
          <span>{strokeCount} {strokeCount === 1 ? "stroke" : "strokes"}</span>
          {status === "playing" && take && (
            <span>/ {formatRecordingTime(take.durationMs)}</span>
          )}
        </div>
      </div>
      <div className="recorder-actions">
        {busy ? (
          <button className="recorder-button recorder-primary" onClick={onStop}>
            <Icon name="stop" size={15} />
            {status === "recording" ? "Stop recording" : status === "playing" ? "Stop playback" : "Cancel"}
          </button>
        ) : (
          <button className="recorder-button recorder-primary" onClick={onRecord}>
            <Icon name="record" size={15} /> {take ? "Record new take" : "Record"}
          </button>
        )}
        <button className="recorder-button" disabled={busy || !take} onClick={onPlay}>
          <Icon name="play" size={15} /> Play recording
        </button>
        <button className="recorder-button" disabled={busy || !take} onClick={onClear}>
          <Icon name="close" size={15} /> Clear
        </button>
      </div>
      <p className="recorder-message" role="status">{message}</p>
      <p className="recorder-note">
        {take ? "A new take replaces this recording. " : "Capture your timing, notes, and chords. "}
        Saved for this session only. No camera or microphone recording.
      </p>
    </section>
  );
}
