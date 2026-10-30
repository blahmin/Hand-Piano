import { HAND_COLORS, HAND_PLAY_AREAS, notesForHand } from "../config";
import type { HandRange, HandSide, InstrumentMode } from "../config";
import type { Landmark } from "../gestures/pinch";

const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
] as const;

export interface HandOverlay {
  side: HandSide;
  points: readonly Landmark[];
  pinching: boolean;
  note: string | null;
  cursorX: number | null;
}

type DrawingContext = CanvasRenderingContext2D;

function drawNoteStrip(
  context: DrawingContext,
  width: number,
  height: number,
  side: HandSide,
  range: HandRange,
  hand: HandOverlay | undefined,
  mode: InstrumentMode,
): void {
  const area = HAND_PLAY_AREAS[side];
  const start = area.minX * width;
  const notes = notesForHand(side, range, mode);
  const cellWidth = ((area.maxX - area.minX) * width) / notes.length;
  const y = height - 66;
  const color = HAND_COLORS[side];
  const selected = notes.findIndex((note) => note.name === hand?.note);
  context.save();
  context.textAlign = "center";
  context.font = `600 ${Math.min(16, cellWidth * 0.58)}px Arial, sans-serif`;
  for (const [index, note] of notes.entries()) {
    const x = start + index * cellWidth;
    if (selected === index) {
      context.fillStyle = `${color}18`;
      context.fillRect(x, 62, cellWidth, Math.max(0, y - 62));
    }
    context.strokeStyle = `${color}24`;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, 68);
    context.lineTo(x, y);
    context.stroke();
    context.fillStyle = selected === index ? color : "#0d1713e8";
    context.beginPath();
    context.roundRect(x + 1, y, cellWidth - 2, 34, 4);
    context.fill();
    context.fillStyle = selected === index ? "#142019" : color;
    context.fillText(note.name, x + cellWidth / 2, y + 22, cellWidth - 4);
  }
  if (hand?.cursorX !== null && hand?.cursorX !== undefined) {
    const markerX =
      hand.pinching && selected >= 0
        ? start + (selected + 0.5) * cellWidth
        : Math.max(
            start + 3,
            Math.min(
              start + notes.length * cellWidth - 3,
              hand.cursorX * width,
            ),
          );
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(markerX, y - 3);
    context.lineTo(markerX - 5, y - 12);
    context.lineTo(markerX + 5, y - 12);
    context.closePath();
    context.fill();
  }
  context.font = "11px Arial, sans-serif";
  context.fillStyle = color;
  context.fillText(
    hand?.pinching ? "OPEN FINGERS TO CHANGE NOTE" : "← MOVE YOUR HAND →",
    start + (cellWidth * notes.length) / 2,
    y - 23,
    cellWidth * notes.length,
  );
  context.restore();
}

function drawBackdrop(
  context: DrawingContext,
  width: number,
  height: number,
  range: HandRange,
  mode: InstrumentMode,
): void {
  context.save();
  context.setLineDash([5, 8]);
  context.strokeStyle = "#d6e1db45";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(width / 2, 56);
  context.lineTo(width / 2, height - 38);
  context.stroke();
  context.setLineDash([]);
  context.textAlign = "center";
  context.font = "12px Arial, sans-serif";
  for (const side of ["left", "right"] as const) {
    context.fillStyle = HAND_COLORS[side];
    const notes = notesForHand(side, range, mode);
    context.fillText(
      `${side.toUpperCase()} · ${mode === "chords" ? notes.map((note) => note.name).join("  ") : `${notes[0]!.name}–${notes.at(-1)!.name}`}`,
      width * (side === "left" ? 0.25 : 0.75),
      30,
    );
  }
  context.restore();
}

export function drawLandmarks(
  canvas: HTMLCanvasElement,
  hands: readonly HandOverlay[],
  showSkeleton = true,
  range: HandRange = "split",
  mode: InstrumentMode = "piano",
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  drawBackdrop(context, width, height, range, mode);
  for (const hand of hands) {
    const { points } = hand;
    if (points.length !== 21) continue;
    const color = HAND_COLORS[hand.side];
    context.strokeStyle = color;
    context.lineWidth = 2;
    // Plain strokes avoid dozens of per-landmark shadow filters each frame.
    context.shadowBlur = 0;
    if (showSkeleton) {
      context.beginPath();
      for (const [a, b] of CONNECTIONS) {
        context.moveTo((1 - points[a]!.x) * width, points[a]!.y * height);
        context.lineTo((1 - points[b]!.x) * width, points[b]!.y * height);
      }
      context.stroke();
      points.forEach((point, index) => {
        context.beginPath();
        context.arc(
          (1 - point.x) * width,
          point.y * height,
          index === 4 || index === 8 ? 5 : 3,
          0,
          Math.PI * 2,
        );
        context.fillStyle = index === 4 || index === 8 ? "#f7fff4" : color;
        context.fill();
      });
    }
    context.shadowBlur = 0;
    const palmY =
      ([0, 5, 9, 13, 17].reduce((sum, index) => sum + points[index]!.y, 0) /
        5) *
      height;
    const x = Math.max(
      50,
      Math.min(width - 50, (hand.cursorX ?? 1 - points[9]!.x) * width),
    );
    const y = Math.max(65, Math.min(height - 35, palmY));
    context.beginPath();
    context.arc(x, y, hand.pinching ? 13 : 9, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
    if (hand.pinching) {
      context.fillStyle = color;
      context.fill();
    }
    const label = `${hand.side === "left" ? "Left" : "Right"} · ${hand.note ?? "…"}`;
    context.font = "600 16px Arial, sans-serif";
    const labelWidth = Math.max(context.measureText(label).width + 22, 120);
    const labelX = Math.max(
      4,
      Math.min(width - labelWidth - 4, x - labelWidth / 2),
    );
    context.fillStyle = "#101911e8";
    context.beginPath();
    context.roundRect(labelX, y - 59, labelWidth, 43, 7);
    context.fill();
    context.fillStyle = color;
    context.fillText(label, labelX + 11, y - 40);
    context.font = "10px Arial, sans-serif";
    context.fillText(
      hand.pinching ? "OPEN TO CHANGE" : "MOVE LEFT / RIGHT",
      labelX + 11,
      y - 24,
    );
  }
  for (const side of ["left", "right"] as const)
    drawNoteStrip(
      context,
      width,
      height,
      side,
      range,
      hands.find((hand) => hand.side === side),
      mode,
    );
}
