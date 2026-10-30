import type { HandRange, InstrumentMode, NoteSelection } from "../config";

export interface RecordingSettings {
  mode: InstrumentMode;
  range: HandRange;
  leftBoost: number;
}

export interface RecordedStroke extends NoteSelection {
  startMs: number;
  durationMs: number;
}

export interface PianoTake extends RecordingSettings {
  durationMs: number;
  strokes: RecordedStroke[];
}

/** Capture successful note starts, with a separate release for each input. */
export class StrokeRecorder {
  private settings: RecordingSettings | null = null;
  private startedAt = 0;
  private strokes: RecordedStroke[] = [];
  private held = new Map<string, RecordedStroke>();

  get count(): number {
    return this.strokes.length;
  }

  elapsed(now: number): number {
    return Math.max(0, now - this.startedAt);
  }

  start(settings: RecordingSettings, now: number): void {
    this.settings = { ...settings };
    this.startedAt = now;
    this.strokes = [];
    this.held.clear();
  }

  noteOn(id: string, note: NoteSelection, now: number): void {
    if (!this.settings || this.held.has(id)) return;
    const stroke = { ...note, startMs: this.elapsed(now), durationMs: 0 };
    this.strokes.push(stroke);
    this.held.set(id, stroke);
  }

  noteOff(id: string, now: number): void {
    const stroke = this.held.get(id);
    if (!stroke) return;
    stroke.durationMs = Math.max(0, this.elapsed(now) - stroke.startMs);
    this.held.delete(id);
  }

  stop(now: number): PianoTake | null {
    if (!this.settings) return null;
    for (const id of this.held.keys()) this.noteOff(id, now);
    const settings = this.settings;
    this.settings = null;
    if (!this.strokes.length) return null;
    // Include the natural piano release or complete chord sample in playback.
    const durationMs = this.strokes.reduce(
      (end, stroke) => Math.max(
        end,
        stroke.startMs + (settings.mode === "chords" ? 3200 : stroke.durationMs + 3000),
      ),
      this.elapsed(now),
    );
    return { ...settings, durationMs, strokes: this.strokes.map((stroke) => ({ ...stroke })) };
  }
}

interface PlaybackEvent {
  at: number;
  id: string;
  note?: NoteSelection;
}

/** One cancellable timer, scheduled against the original playback clock. */
export class RecordingPlayback {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private held = new Set<string>();
  private running = false;

  constructor(
    private readonly press: (id: string, note: NoteSelection) => void,
    private readonly release: (id: string) => void,
    private readonly finished: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get elapsedMs(): number {
    return Math.max(0, this.now() - this.startedAt);
  }

  start(take: PianoTake): void {
    this.stop();
    const events: PlaybackEvent[] = take.strokes.flatMap((stroke, index) => {
      const id = `playback:${index}`;
      return [
        { at: stroke.startMs, id, note: { side: stroke.side, slot: stroke.slot } },
        { at: stroke.startMs + stroke.durationMs, id },
      ];
    }).sort((a, b) => a.at - b.at);
    let cursor = 0;
    this.startedAt = this.now();
    this.running = true;
    const tick = () => {
      this.timer = null;
      if (!this.running) return;
      const elapsed = this.elapsedMs;
      while (cursor < events.length && events[cursor]!.at <= elapsed) {
        const event = events[cursor++]!;
        if (event.note) {
          this.held.add(event.id);
          this.press(event.id, event.note);
        } else {
          this.held.delete(event.id);
          this.release(event.id);
        }
      }
      if (elapsed >= take.durationMs && cursor === events.length) {
        this.running = false;
        this.finished();
        return;
      }
      const next = events[cursor]?.at ?? take.durationMs;
      this.timer = setTimeout(tick, Math.max(1, next - this.elapsedMs));
    };
    tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const id of this.held) this.release(id);
    this.held.clear();
  }
}
