export const NOTES = [
  { name: "C4", midi: 60, shortcut: "A", solfege: "Do" },
  { name: "D4", midi: 62, shortcut: "S", solfege: "Re" },
  { name: "E4", midi: 64, shortcut: "D", solfege: "Mi" },
  { name: "F4", midi: 65, shortcut: "F", solfege: "Fa" },
  { name: "G4", midi: 67, shortcut: "G", solfege: "Sol" },
  { name: "A4", midi: 69, shortcut: "H", solfege: "La" },
  { name: "B4", midi: 71, shortcut: "J", solfege: "Ti" },
  { name: "C5", midi: 72, shortcut: "K", solfege: "Do" },
] as const;

export const DEFAULT_VOLUME = 75;
export const DEFAULT_LEFT_BOOST = 250;
export const MAX_LEFT_BOOST = 300;

export type HandSide = "left" | "right";
export type HandRange = "split" | "shared";
export type InstrumentMode = "piano" | "chords";
export const CHORD_IDS = [
  "C",
  "Dm",
  "Em",
  "F",
  "G",
  "Am",
  "D",
  "A",
  "E",
  "Bm",
] as const;
export type ChordId = (typeof CHORD_IDS)[number];
export interface NoteSelection {
  side: HandSide;
  slot: number;
}
export const HAND_COLORS: Record<HandSide, string> = {
  left: "#b5f5ce",
  right: "#ccbaff",
};
export const HAND_PLAY_AREAS = {
  left: { minX: 0.12, maxX: 0.45 },
  right: { minX: 0.55, maxX: 0.88 },
} as const;
const LEFT_SHORTCUTS = ["Z", "X", "C", "V", "B", "N", "M", ","];

export interface InstrumentKey {
  readonly name: string;
  readonly midi: number;
  readonly shortcut: string;
  readonly solfege: string;
  readonly sampleId?: ChordId;
}

function buildNoteBank(
  side: HandSide,
  octaveShift: number,
): readonly InstrumentKey[] {
  return Object.freeze(
    NOTES.map((note, index) =>
      Object.freeze({
        ...note,
        name: `${note.name.slice(0, -1)}${Number(note.name.slice(-1)) + octaveShift}`,
        midi: note.midi + octaveShift * 12,
        shortcut: side === "left" ? LEFT_SHORTCUTS[index]! : note.shortcut,
      }),
    ),
  );
}

const rightBank = buildNoteBank("right", 0);
const NOTE_BANKS = {
  split: { left: buildNoteBank("left", -1), right: rightBank },
  shared: { left: buildNoteBank("left", 0), right: rightBank },
} as const;

const CHORD_ROOTS = [60, 62, 64, 65, 67, 69, 62, 69, 64, 59];
const CHORD_BANKS = Object.fromEntries(
  (["left", "right"] as const).map((side) => [
    side,
    Object.freeze(
      CHORD_IDS.slice(side === "left" ? 0 : 5, side === "left" ? 5 : 10).map(
        (name, slot) =>
          Object.freeze({
            name,
            sampleId: name,
            midi: CHORD_ROOTS[slot + (side === "left" ? 0 : 5)]!,
            shortcut:
              side === "left" ? LEFT_SHORTCUTS[slot]! : NOTES[slot]!.shortcut,
            solfege: name.endsWith("m") ? "Minor" : "Major",
          }),
      ),
    ),
  ]),
) as Record<HandSide, readonly InstrumentKey[]>;

export function notesForHand(
  side: HandSide,
  range: HandRange,
  mode: InstrumentMode = "piano",
): readonly InstrumentKey[] {
  return mode === "chords" ? CHORD_BANKS[side] : NOTE_BANKS[range][side];
}

export const GESTURE = {
  closeRatio: 0.32,
  openRatio: 0.48,
  closeMs: 40,
  openMs: 45,
  armMs: 100,
  lostMs: 150,
  cursorTauMs: 50,
  pinchTauMs: 20,
  minX: 0.12,
  maxX: 0.88,
} as const;

export const frequencyForMidi = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
