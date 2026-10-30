import {
  DEFAULT_LEFT_BOOST,
  DEFAULT_VOLUME,
  MAX_LEFT_BOOST,
  frequencyForMidi,
  CHORD_IDS,
} from "../config";
import type { ChordId, HandSide } from "../config";

const OUTPUT_GAIN = 0.9;
const MAX_VOICES = 24;
const RELEASE_SECONDS = 3;

interface Voice {
  sourceId: string;
  releasing: boolean;
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
  sample: boolean;
}

/** Small additive piano voice. All inputs share this engine and own their releases. */
export class PianoAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private leftBus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private voices = new Map<string, Voice>();
  private allVoices = new Set<Voice>();
  private volume = DEFAULT_VOLUME / 100;
  private leftBoost = DEFAULT_LEFT_BOOST / 100;
  private samples = new Map<ChordId, AudioBuffer>();
  private sampleLoad: Promise<void> | null = null;

  async enable(): Promise<void> {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * OUTPUT_GAIN;
      this.leftBus = this.context.createGain();
      this.leftBus.gain.value = this.leftBoost;
      this.leftBus.connect(this.master);
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -6;
      this.compressor.knee.value = 4;
      this.compressor.ratio.value = 10;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.12;
      this.master.connect(this.compressor);
      this.compressor.connect(this.context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
    if (this.context.state !== "running")
      throw new Error("Select Enable sound to resume audio.");
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(
        this.volume * OUTPUT_GAIN,
        this.context.currentTime,
        0.02,
      );
    }
  }

  /** Decode once before playing; the real-time note path never fetches or decodes. */
  async loadChords(): Promise<void> {
    if (this.samples.size === CHORD_IDS.length) return;
    if (this.sampleLoad) return this.sampleLoad;
    const context = this.context;
    if (!context || context.state === "closed")
      throw new Error("Enable sound first.");
    const pending = Promise.all(
      CHORD_IDS.map(async (id) => {
        const response = await fetch(
          `${import.meta.env.BASE_URL}audio/chords/${id.toLowerCase()}.wav`,
        );
        if (!response.ok) throw new Error(`Could not load chord ${id}.`);
        const buffer = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        return [id, buffer] as const;
      }),
    ).then((pairs) => {
      if (this.context !== context || context.state === "closed")
        throw new Error("Audio session ended.");
      this.samples = new Map(pairs);
    });
    this.sampleLoad = pending;
    try {
      await pending;
    } finally {
      if (this.sampleLoad === pending) this.sampleLoad = null;
    }
  }

  private makeRoom(): void {
    if (this.allVoices.size < MAX_VOICES) return;
    const oldestTail =
      [...this.allVoices].find((voice) => voice.releasing) ??
      this.allVoices.values().next().value!;
    this.stopVoice(oldestTail, 0.01);
    this.allVoices.delete(oldestTail);
  }

  chordOn(id: string, chord: ChordId, side: HandSide): boolean {
    const context = this.context;
    const buffer = this.samples.get(chord);
    if (
      !context ||
      context.state !== "running" ||
      !buffer ||
      !this.master ||
      !this.leftBus ||
      this.voices.has(id)
    )
      return false;
    this.makeRoom();
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = 0.8;
    source.connect(gain);
    gain.connect(side === "left" ? this.leftBus : this.master);
    const voice: Voice = {
      sourceId: id,
      releasing: false,
      sources: [source],
      gain,
      sample: true,
    };
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.allVoices.delete(voice);
      if (this.voices.get(id) === voice) this.voices.delete(id);
    };
    this.voices.set(id, voice);
    this.allVoices.add(voice);
    source.start(context.currentTime);
    return true;
  }

  setLeftBoost(value: number): void {
    this.leftBoost = Math.max(1, Math.min(MAX_LEFT_BOOST / 100, value));
    if (this.context && this.leftBus) {
      this.leftBus.gain.setTargetAtTime(
        this.leftBoost,
        this.context.currentTime,
        0.02,
      );
    }
  }

  noteOn(id: string, midi: number, side: HandSide = "right"): boolean {
    const context = this.context;
    if (
      !context ||
      context.state !== "running" ||
      !this.master ||
      !this.leftBus ||
      this.voices.has(id)
    )
      return false;
    this.makeRoom();
    const now = context.currentTime;
    const frequency = frequencyForMidi(midi);
    // Compensate by pitch, so the same note is equally loud in either bank.
    // Add 0.5 dB per semitone below middle C, capped at +6 dB for C3.
    const lowNoteBoost =
      10 ** (Math.max(0, Math.min(6, (60 - midi) * 0.5)) / 20);
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      Math.max(2200, Math.min(8000, frequency * 12)),
      now,
    );
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(800, frequency * 2.5),
      now + 1.5,
    );
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3 * lowNoteBoost, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.14 * lowNoteBoost, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.08 * lowNoteBoost, now + 2.8);
    filter.connect(gain);
    gain.connect(side === "left" ? this.leftBus : this.master);

    const oscillators = [1, 2, 3].map((harmonic) => {
      const oscillator = context.createOscillator();
      const partial = context.createGain();
      oscillator.type = harmonic === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency * harmonic;
      // Move some bass energy into audible upper harmonics instead of spending
      // all the available headroom on the low fundamental.
      partial.gain.value =
        harmonic === 1
          ? 0.8 - (lowNoteBoost - 1) * 0.15
          : 0.22 / harmonic +
            (lowNoteBoost - 1) * (harmonic === 2 ? 0.32 : 0.1);
      oscillator.connect(partial);
      partial.connect(filter);
      oscillator.onended = () => {
        oscillator.disconnect();
        partial.disconnect();
      };
      oscillator.start(now);
      return oscillator;
    });
    const voice: Voice = {
      sourceId: id,
      releasing: false,
      sources: oscillators,
      gain,
      sample: false,
    };
    const last = oscillators.at(-1)!;
    const previous = last.onended;
    last.onended = (event) => {
      previous?.call(last, event);
      this.allVoices.delete(voice);
      if (this.voices.get(id) === voice) this.voices.delete(id);
      gain.disconnect();
      filter.disconnect();
    };
    this.voices.set(id, voice);
    this.allVoices.add(voice);
    return true;
  }

  noteOff(id: string): void {
    const voice = this.voices.get(id);
    const context = this.context;
    if (!voice || !context) return;
    this.voices.delete(id);
    voice.releasing = true;
    // A chord is a one-shot recording: release frees the hand for the next chord,
    // while the complete original decay continues without a loop or pitch shift.
    if (voice.sample) return;
    const now = context.currentTime;
    voice.gain.gain.cancelAndHoldAtTime(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.6);
    voice.sources.forEach((source) => source.stop(now + RELEASE_SECONDS));
  }

  private stopVoice(voice: Voice, fadeSeconds: number): void {
    const context = this.context;
    if (!context) return;
    if (this.voices.get(voice.sourceId) === voice)
      this.voices.delete(voice.sourceId);
    voice.releasing = true;
    const now = context.currentTime;
    voice.gain.gain.cancelAndHoldAtTime(now);
    voice.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    voice.sources.forEach((source) => source.stop(now + fadeSeconds + 0.01));
  }

  allNotesOff(): void {
    // Stop/blur is an intentional silence command and also clears ringing tails.
    for (const voice of this.allVoices) this.stopVoice(voice, 0.03);
    this.voices.clear();
    this.allVoices.clear();
  }

  async dispose(): Promise<void> {
    this.allNotesOff();
    const context = this.context;
    this.master?.disconnect();
    this.leftBus?.disconnect();
    this.compressor?.disconnect();
    this.context = null;
    this.master = null;
    this.leftBus = null;
    this.compressor = null;
    this.samples.clear();
    this.sampleLoad = null;
    if (context && context.state !== "closed") await context.close();
  }
}
