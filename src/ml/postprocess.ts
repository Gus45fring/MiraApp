import { CONFIG } from '../config';
import type { Letterbox } from './preprocess';

export type Detection = {
  classId: number;
  className: string;
  score: number;
  // box in the ORIGINAL photo's pixel coordinates
  box: { x1: number; y1: number; x2: number; y2: number };
};

function undoLetterbox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lb: Letterbox,
) {
  return {
    x1: clamp((x1 - lb.padX) / lb.scale, 0, lb.origW),
    y1: clamp((y1 - lb.padY) / lb.scale, 0, lb.origH),
    x2: clamp((x2 - lb.padX) / lb.scale, 0, lb.origW),
    y2: clamp((y2 - lb.padY) / lb.scale, 0, lb.origH),
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Default YOLO26 export: output0 is [1, 300, 6] = [x1, y1, x2, y2, conf, classId]
 * per row, already de-duplicated (no NMS needed) - just filter by confidence.
 */
function parseEndToEnd(
  output: Float32Array | number[],
  letterbox: Letterbox,
): Detection[] {
  const detections: Detection[] = [];
  const numRows = output.length / 6;

  for (let i = 0; i < numRows; i++) {
    const base = i * 6;
    const score = output[base + 4];
    if (score < CONFIG.CONFIDENCE_THRESHOLD) continue;

    const classId = Math.round(output[base + 5]);
    const box = undoLetterbox(
      output[base],
      output[base + 1],
      output[base + 2],
      output[base + 3],
      letterbox,
    );

    detections.push({
      classId,
      className: CONFIG.CLASS_NAMES[classId] ?? `class_${classId}`,
      score,
      box,
    });
  }

  return detections.sort((a, b) => b.score - a.score);
}

/**
 * end2end=False export: output0 is [1, 4 + numClasses, numBoxes], channel-major
 * (cx, cy, w, h, then one row of scores per class). Needs manual NMS.
 */
function parseOneToMany(
  output: Float32Array | number[],
  dims: readonly number[],
  letterbox: Letterbox,
): Detection[] {
  const numChannels = dims[1];
  const numBoxes = dims[2];
  const numClasses = numChannels - 4;

  type Candidate = Detection & { area: number };
  const candidates: Candidate[] = [];

  for (let i = 0; i < numBoxes; i++) {
    let bestScore = -Infinity;
    let bestClass = -1;
    for (let c = 0; c < numClasses; c++) {
      const score = output[(4 + c) * numBoxes + i];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    if (bestScore < CONFIG.CONFIDENCE_THRESHOLD) continue;

    const cx = output[0 * numBoxes + i];
    const cy = output[1 * numBoxes + i];
    const w = output[2 * numBoxes + i];
    const h = output[3 * numBoxes + i];

    const box = undoLetterbox(
      cx - w / 2,
      cy - h / 2,
      cx + w / 2,
      cy + h / 2,
      letterbox,
    );

    candidates.push({
      classId: bestClass,
      className: CONFIG.CLASS_NAMES[bestClass] ?? `class_${bestClass}`,
      score: bestScore,
      box,
      area: Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1),
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const iou = (a: Candidate, b: Candidate) => {
    const x1 = Math.max(a.box.x1, b.box.x1);
    const y1 = Math.max(a.box.y1, b.box.y1);
    const x2 = Math.min(a.box.x2, b.box.x2);
    const y2 = Math.min(a.box.y2, b.box.y2);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / (a.area + b.area - inter + 1e-6);
  };

  const kept: Candidate[] = [];
  for (const cand of candidates) {
    const overlapsKept = kept.some(
      k => k.classId === cand.classId && iou(k, cand) > CONFIG.IOU_THRESHOLD,
    );
    if (!overlapsKept) kept.push(cand);
  }

  return kept;
}

export function parseModelOutput(
  output: Float32Array | number[],
  dims: readonly number[],
  letterbox: Letterbox,
): Detection[] {
  return CONFIG.END_TO_END
    ? parseEndToEnd(output, letterbox)
    : parseOneToMany(output, dims, letterbox);
}
