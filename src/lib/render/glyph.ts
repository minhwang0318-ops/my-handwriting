// 저장된 한 벌(벡터 획)을 그리기 좋게 다듬고, 찍을 때마다 조금씩 다르게 변형한다.
// 좌표는 em(칸) 기준 0..1.
import type { Sample } from "@/lib/strokes/types";
import { PX, type StyleProfile } from "@/lib/style/profile";
import { gaussClamped, hashSeed, makeRng, type Rng } from "@/lib/style/random";

export interface GPoint {
  x: number;
  y: number;
  /** 0..1 필압 (없는 입력은 획을 따라 완만하게 바뀌는 값을 만들어 넣음) */
  p: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PreparedGlyph {
  char: string;
  sampleId: string;
  /** 자모 조합으로 만든 글자인지 */
  composed: boolean;
  strokes: GPoint[][];
  ink: Box;
}

/** 획을 일정 간격(spacing, em)으로 다시 찍는다 */
export function resample(pts: { x: number; y: number; p: number }[], spacing: number): GPoint[] {
  if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y, p: p.p }));
  const out: GPoint[] = [{ x: pts[0].x, y: pts[0].y, p: pts[0].p }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    let d = spacing - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t });
      d += spacing;
    }
    carry = len - (d - spacing);
  }
  const last = pts[pts.length - 1];
  const end = out[out.length - 1];
  if (Math.hypot(last.x - end.x, last.y - end.y) > spacing * 0.3) out.push({ x: last.x, y: last.y, p: last.p });
  return out;
}

/** 가우시안 매끄럽게 (양 끝점은 고정) */
export function smooth(pts: GPoint[], sigma: number, keys: ("x" | "y" | "p")[] = ["x", "y"]): GPoint[] {
  if (sigma <= 0 || pts.length < 3) return pts.map((p) => ({ ...p }));
  const r = Math.ceil(sigma * 3);
  const w = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const out = pts.map((p) => ({ ...p }));
  for (let i = 1; i < pts.length - 1; i++) {
    // 끝으로 갈수록 창을 줄여 끝점이 끌려가지 않게 한다
    const rr = Math.min(r, i, pts.length - 1 - i);
    for (const k of keys) {
      let s = 0;
      let ws = 0;
      for (let j = -rr; j <= rr; j++) {
        s += pts[i + j][k] * w[j + r];
        ws += w[j + r];
      }
      out[i][k] = s / ws;
    }
  }
  return out;
}

/** 필압이 없는 획: 길이를 따라 완만하게 변하는 값 + 시작·끝이 약간 가늘어짐 */
function synthPressure(pts: GPoint[], scale: number, rng: Rng): void {
  const f1 = 1 / scale;
  const f2 = 1 / (scale * 0.53);
  const ph1 = rng() * Math.PI * 2;
  const ph2 = rng() * Math.PI * 2;
  let s = 0;
  const total = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const wave = 0.16 * Math.sin(2 * Math.PI * f1 * s + ph1) + 0.07 * Math.sin(2 * Math.PI * f2 * s + ph2);
    const edge = Math.min(s, total - s);
    const taper = Math.min(1, edge / 0.04);
    pts[i].p = Math.max(0.05, Math.min(1, (0.5 + wave) * (0.7 + 0.3 * taper)));
  }
}

export function inkBox(strokes: GPoint[][]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }
  if (!isFinite(x0)) return { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 };
  return { x0, y0, x1, y1 };
}

export function prepareGlyph(sample: Sample, profile: StyleProfile): PreparedGlyph {
  const t = profile["5_획질감"];
  const rng = makeRng(hashSeed(sample.id));
  const strokes = sample.strokes.map((st) => {
    let pts = resample(st.points, PX);
    pts = smooth(pts, t.smooth_sigma, ["x", "y"]);
    if (st.pointer === "pen") pts = smooth(pts, 2, ["p"]);
    else synthPressure(pts, t.pressure_scale_px * PX, rng);
    return pts;
  });
  return { char: sample.char, sampleId: sample.id, composed: sample.id.startsWith("comp:"), strokes, ink: inkBox(strokes) };
}

/** 한 번 찍을 때의 변형 값 */
export interface Variation {
  rot: number; // rad
  scale: number;
  slant: number;
  elastic: { ax: number; fx: number; fy: number; ph: number; axis: 0 | 1 }[];
  amp: number; // em
}

export function makeVariation(profile: StyleProfile, rng: Rng): Variation {
  const v = profile["2_글자별차이"];
  const elastic = Array.from({ length: 4 }, (_, i) => ({
    ax: 0.5 + rng() * 0.5,
    fx: (0.5 + rng() * 1.1) * (rng() < 0.5 ? -1 : 1),
    fy: (0.5 + rng() * 1.1) * (rng() < 0.5 ? -1 : 1),
    ph: rng() * Math.PI * 2,
    axis: (i % 2) as 0 | 1,
  }));
  return {
    rot: (gaussClamped(rng) * v.rot_deg * Math.PI) / 180,
    scale: 1 + gaussClamped(rng) * v.scale_sd,
    slant: profile["1_일정함"].slant,
    elastic,
    amp: v.elastic_px * PX,
  };
}

/** 부드러운 무작위 변위장 (각 축 성분 2개씩, 진폭 ≈ amp) */
export function elasticOffset(v: Variation, x: number, y: number): [number, number] {
  let dx = 0;
  let dy = 0;
  for (const e of v.elastic) {
    const s = e.ax * Math.sin(2 * Math.PI * (e.fx * x + e.fy * y) + e.ph);
    if (e.axis === 0) dx += s;
    else dy += s;
  }
  // 성분 2개 합의 최대 진폭은 약 2 → amp로 맞춤
  return [(dx / 2) * v.amp * 1.4, (dy / 2) * v.amp * 1.4];
}

/**
 * 변형: 잉크 중심 기준 회전·크기(extraScale 포함) + 기울기(밑변 기준 전단) + 부드러운 휨.
 * 결과도 em 좌표.
 */
export function deformGlyph(g: PreparedGlyph, v: Variation, extraScale: number): GPoint[][] {
  const cx = (g.ink.x0 + g.ink.x1) / 2;
  const cy = (g.ink.y0 + g.ink.y1) / 2;
  const s = v.scale * extraScale;
  const c = Math.cos(v.rot);
  const si = Math.sin(v.rot);
  return g.strokes.map((st) =>
    st.map((p) => {
      const [ex, ey] = elasticOffset(v, p.x, p.y);
      const lx = (p.x + ex - cx) * s;
      const ly = (p.y + ey - cy) * s;
      let x = cx + lx * c - ly * si;
      const y = cy + lx * si + ly * c;
      x += -v.slant * (y - g.ink.y1); // 아래쪽을 고정하고 위를 기울임
      return { x, y, p: p.p };
    }),
  );
}
