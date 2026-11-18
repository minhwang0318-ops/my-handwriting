// 사진 속 글자 상자 → 획(벡터). 잉크를 가늘게 깎아(세선화) 뼈대를 선으로 따라간다.
// 사진에는 쓴 순서·필압이 없으므로 획 순서는 임의이고 필압은 0.5로 둔다.
import type { Stroke } from "@/lib/strokes/types";
import { thin, trace } from "./image";
import type { Box } from "./segment";

/** 줄의 글자 높이를 칸(em)의 이 비율로 맞춘다 (따라 쓴 글자 잉크가 칸의 약 0.8을 차지하는 것과 비슷하게) */
export const EM_FILL = 0.8;

export interface LineFrame {
  /** 줄의 대표 글자 높이(px) */
  height: number;
  /** 줄의 대표 세로 중심(px) */
  cy: number;
}

/**
 * 상자 안의 잉크(그 상자에 묶인 덩어리만)를 획으로 바꾼다.
 * 크기는 줄 단위로 맞추므로, 같은 줄 안의 글자 크기·높이 차이는 쓴 그대로 남는다.
 */
export function boxToStrokes(
  mask: { w: number; data: Uint8Array },
  labels: Int32Array,
  box: Box,
  line: LineFrame,
  opts = { pad: 2, minLen: 3, step: 2 },
): Stroke[] {
  const ids = new Set(box.comps);
  const x0 = Math.max(0, box.x0 - opts.pad);
  const y0 = Math.max(0, box.y0 - opts.pad);
  const x1 = Math.min(mask.w, box.x1 + opts.pad);
  const y1 = box.y1 + opts.pad;
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw <= 0 || ch <= 0) return [];
  const crop = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const gx = x0 + x;
      const gy = y0 + y;
      if (gx < box.x0 || gx >= box.x1 || gy < box.y0 || gy >= box.y1) continue; // 상자 사각형 밖은 버린다 (나누거나 손으로 고친 상자)
      const i = gy * mask.w + gx;
      if (i < labels.length && ids.has(labels[i])) crop[y * cw + x] = 1;
    }
  }
  const lines = trace(thin(crop, cw, ch), cw, ch, opts.minLen);
  const s = EM_FILL / Math.max(1, line.height);
  const cx = (box.x0 + box.x1) / 2;
  let t = 0;
  return lines.map((ln) => {
    const pts = ln.filter((_, i) => i % opts.step === 0 || i === ln.length - 1);
    const stroke: Stroke = {
      pointer: "mouse",
      start: t,
      points: pts.map(([px, py], i) => ({
        x: Math.round((0.5 + (x0 + px - cx) * s) * 1e4) / 1e4,
        y: Math.round((0.5 + (y0 + py - line.cy) * s) * 1e4) / 1e4,
        p: 0.5,
        t: i * 10,
      })),
    };
    t += pts.length * 10 + 150;
    return stroke;
  });
}
