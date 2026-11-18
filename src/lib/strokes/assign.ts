// 획 → 자모 배정.
// 각 점을 가장 가까운 기준 자모에 붙이고, 획 길이(호의 길이) 가중으로 비율을 센다.
// 두 자모가 각각 splitShare(기본 25%) 이상이면 경계에서 획을 나눈다.
import { sampleField, type JamoFields } from "./fields";
import type { JamoStroke, Point, Stroke } from "./types";

export interface AssignOptions {
  /** 두 자모에 각각 이 비율 이상 걸치면 나눈다 */
  splitShare: number;
  /** 나눈 뒤 이 비율보다 짧은 조각은 옆 조각에 붙인다 */
  minPieceShare: number;
}

export const DEFAULT_ASSIGN: AssignOptions = { splitShare: 0.25, minPieceShare: 0.05 };

function nearestLabel(f: JamoFields, p: Point, among: number[]): number {
  let best = among[0];
  let bestD = Infinity;
  for (const k of among) {
    const d = sampleField(f.dist.get(k)!, f.n, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** 점 i가 대표하는 길이 (앞뒤 구간의 절반씩) */
function pointWeights(pts: Point[]): number[] {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  return pts.map((_, i) => ((seg[i - 1] ?? 0) + (seg[i] ?? 0)) / 2 || 1e-6);
}

export function assignStroke(f: JamoFields, stroke: Stroke, index: number, opt = DEFAULT_ASSIGN): JamoStroke[] {
  const pts = stroke.points;
  if (!pts.length) return [];
  if (f.labels.length === 1) return [{ label: f.labels[0], stroke: index, points: pts }];

  const w = pointWeights(pts);
  const total = w.reduce((a, b) => a + b, 0);
  let lab = pts.map((p) => nearestLabel(f, p, f.labels));

  const share = new Map<number, number>();
  lab.forEach((k, i) => share.set(k, (share.get(k) ?? 0) + w[i] / total));
  const major = f.labels.filter((k) => (share.get(k) ?? 0) >= opt.splitShare);

  if (major.length < 2) {
    let best = lab[0];
    for (const [k, s] of share) if (s > (share.get(best) ?? 0)) best = k;
    return [{ label: best, stroke: index, points: pts }];
  }

  // 주요 자모 둘 이상: 나머지 자모에 붙은 점은 주요 자모 중 가까운 쪽으로
  lab = pts.map((p, i) => (major.includes(lab[i]) ? lab[i] : nearestLabel(f, p, major)));

  // 연속 구간으로 묶기
  type Run = { label: number; from: number; to: number; len: number };
  let runs: Run[] = [];
  for (let i = 0; i < pts.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.label === lab[i]) {
      last.to = i;
      last.len += w[i];
    } else runs.push({ label: lab[i], from: i, to: i, len: w[i] });
  }
  // 짧은 조각은 더 긴 이웃에 붙인다 (지그재그 경계 정리)
  let changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    for (let r = 0; r < runs.length; r++) {
      if (runs[r].len / total >= opt.minPieceShare) continue;
      const prev = runs[r - 1];
      const next = runs[r + 1];
      const into = !prev ? next : !next ? prev : prev.len >= next.len ? prev : next;
      into.from = Math.min(into.from, runs[r].from);
      into.to = Math.max(into.to, runs[r].to);
      into.len += runs[r].len;
      runs.splice(r, 1);
      changed = true;
      break;
    }
    // 붙이고 나서 같은 라벨이 이웃하면 합친다
    const merged: Run[] = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last.label === r.label) {
        last.to = r.to;
        last.len += r.len;
      } else merged.push({ ...r });
    }
    runs = merged;
  }

  // 조각끼리 경계 점을 공유해 이어지게 한다
  return runs.map((r, i) => ({
    label: r.label,
    stroke: index,
    points: pts.slice(r.from, Math.min(pts.length, r.to + 1 + (i < runs.length - 1 ? 1 : 0))),
  }));
}

export function assignStrokes(f: JamoFields, strokes: Stroke[], opt = DEFAULT_ASSIGN): JamoStroke[] {
  return strokes.flatMap((s, i) => assignStroke(f, s, i, opt));
}
