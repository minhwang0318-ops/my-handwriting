// 사진 속 글씨를 줄과 글자(음절) 상자로 나누고, 타이핑한 글자와 짝을 짓는다.
// 자모 단위로 자르지 않는다 (요청서의 "안 된 방법" 1번). 한 글자(음절) 단위만 다룬다.
import type { BinMask, Component } from "./image";

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 이 상자에 든 덩어리 번호들 */
  comps: number[];
}

export interface Line {
  y0: number;
  y1: number;
  /** 이 줄 글자의 대표 높이(px): 덩어리 묶음 높이의 중앙값 */
  height: number;
  /** 대표 세로 중심(px) */
  cy: number;
  boxes: Box[];
}

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

/** 너무 작은 덩어리(먼지)는 뺀다. 기준: 덩어리 높이 중앙값의 일정 비율 */
export function filterNoise(comps: Component[], minAreaRatio = 0.02): Component[] {
  const med = median(comps.map((c) => (c.x1 - c.x0) * (c.y1 - c.y0)));
  return comps.filter((c) => c.area >= 4 && (c.x1 - c.x0) * (c.y1 - c.y0) >= med * minAreaRatio);
}

/**
 * 줄 찾기: 덩어리의 세로 범위를 가로로 투영해, 덩어리가 겹치는 높이 구간을 한 줄로 묶는다.
 * (픽셀 투영 대신 덩어리 범위를 쓰면 획 사이 빈 줄 때문에 한 줄이 쪼개지는 일이 줄어든다)
 */
export function findLines(comps: Component[], h: number): { y0: number; y1: number; comps: Component[] }[] {
  if (!comps.length) return [];
  const medH = median(comps.map((c) => c.y1 - c.y0));
  // 작은 덩어리(점, 짧은 획)는 줄 경계를 정하는 데 쓰지 않는다
  const big = comps.filter((c) => c.y1 - c.y0 >= medH * 0.5);
  const cover = new Int32Array(h + 1);
  for (const c of big) {
    // 위아래를 조금 줄여서 옆 줄과 살짝 겹친 획 때문에 두 줄이 붙지 않게 한다
    const pad = Math.floor((c.y1 - c.y0) * 0.15);
    cover[c.y0 + pad]++;
    cover[c.y1 - pad]--;
  }
  const bands: { y0: number; y1: number }[] = [];
  let run = 0;
  let start = -1;
  for (let y = 0; y < h; y++) {
    run += cover[y];
    if (run > 0 && start < 0) start = y;
    if (run <= 0 && start >= 0) {
      bands.push({ y0: start, y1: y });
      start = -1;
    }
  }
  if (start >= 0) bands.push({ y0: start, y1: h });
  // 너무 얇은 띠(밑줄 조각 등)는 버린다
  const good = bands.filter((b) => b.y1 - b.y0 >= medH * 0.4);
  const lines = good.map((b) => ({ ...b, comps: [] as Component[] }));
  for (const c of comps) {
    const cy = (c.y0 + c.y1) / 2;
    let best = -1;
    let bestD = Infinity;
    lines.forEach((l, i) => {
      const d = cy < l.y0 ? l.y0 - cy : cy > l.y1 ? cy - l.y1 : 0;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0 && bestD <= medH) lines[best].comps.push(c);
  }
  return lines.filter((l) => l.comps.length);
}

/**
 * 한 줄의 덩어리를 글자(음절) 상자로 묶는다.
 * 왼쪽부터, 다음 덩어리가 지금 상자와 가로로 겹치거나 가까우면서(글자 높이의 35% 이내)
 * 합친 너비가 글자 하나 정도(높이의 1.15배 이하)면 합친다. 음절 둘을 합치면 너비가 그보다 넓어지므로 걸러진다.
 */
export function groupChars(lineComps: Component[], opts = { gapRatio: 0.35, maxWidthRatio: 1.15 }): { boxes: Box[]; height: number; cy: number } {
  const comps = [...lineComps].sort((a, b) => a.x0 - b.x0);
  const H = median(comps.map((c) => c.y1 - c.y0)) || 1;
  // 글자 높이: 큰 덩어리 기준 (자모 덩어리 높이는 글자보다 작을 수 있어 위쪽 분위수)
  const hs = comps.map((c) => c.y1 - c.y0).sort((a, b) => a - b);
  const charH = hs[Math.floor(hs.length * 0.75)] || H;
  const boxes: Box[] = [];
  for (const c of comps) {
    const last = boxes[boxes.length - 1];
    if (last) {
      const overlap = Math.min(last.x1, c.x1) - Math.max(last.x0, c.x0);
      const cw = c.x1 - c.x0;
      const gap = c.x0 - last.x1;
      const mergedW = Math.max(last.x1, c.x1) - last.x0;
      const close = overlap > cw * 0.3 || gap <= charH * opts.gapRatio;
      if (close && mergedW <= charH * opts.maxWidthRatio) {
        last.x1 = Math.max(last.x1, c.x1);
        last.y0 = Math.min(last.y0, c.y0);
        last.y1 = Math.max(last.y1, c.y1);
        last.comps.push(c.id);
        continue;
      }
    }
    boxes.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, comps: [c.id] });
  }
  const cy = median(boxes.map((b) => (b.y0 + b.y1) / 2));
  // 줄의 글자 높이: 묶은 상자 높이의 위쪽 분위수 (점·쉼표 같은 작은 상자에 끌려가지 않게)
  const bh = boxes.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
  const height = bh[Math.floor(bh.length * 0.7)] || charH;
  return { boxes, height, cy };
}

/** 글자 종류별 예상 너비 (글자 높이 대비) */
export function targetWidth(ch: string): number {
  if (/[.,·'"`!?:;()\[\]-]/.test(ch)) return 0.3;
  if (/[a-z0-9]/.test(ch)) return 0.55;
  if (/[A-Z]/.test(ch)) return 0.7;
  return 0.85; // 한글 등
}

/**
 * 상자들을 타이핑한 글자(chars)와 짝 짓는다.
 *  1) 상자가 글자보다 적으면 가장 넓은 상자를 split으로 나눠 늘린다
 *  2) 이어진 상자들을 글자 수만큼의 묶음으로 나누는 방법 중, 각 묶음 너비가 그 글자의 예상 너비에 가깝고
 *     묶음 안의 빈틈이 작은 것을 고른다 (동적 계획법). 한 곳을 잘못 잘라도 줄 뒤쪽이 줄줄이 밀리지 않게.
 */
export function fitBoxes(boxes: Box[], chars: string[] | number, charH: number, split: (b: Box) => [Box, Box] | null): Box[] {
  const list = typeof chars === "number" ? Array.from({ length: chars }, () => "가") : chars;
  const n = list.length;
  let out = boxes.map((b) => ({ ...b, comps: [...b.comps] }));
  let guard = 0;
  while (out.length < n && guard++ < 1000) {
    let wi = 0;
    for (let i = 1; i < out.length; i++) if (out[i].x1 - out[i].x0 > out[wi].x1 - out[wi].x0) wi = i;
    const parts = out.length ? split(out[wi]) : null;
    if (!parts) break;
    out.splice(wi, 1, parts[0], parts[1]);
  }
  const m = out.length;
  if (m <= n || n === 0) return out;
  const H = Math.max(1, charH);
  // cost(i, j, k): out[i..j) 를 k번째 글자 하나로 묶는 비용
  const cost = (i: number, j: number, k: number) => {
    const w = (out[j - 1].x1 - out[i].x0) / H;
    let gap = 0;
    for (let t = i + 1; t < j; t++) gap = Math.max(gap, (out[t].x0 - out[t - 1].x1) / H);
    const d = w - targetWidth(list[k]);
    return d * d + 1.5 * Math.max(0, gap);
  };
  const INF = 1e18;
  // best[k][j]: 앞 k글자로 out[0..j)를 덮는 최소 비용
  const best = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  const from = Array.from({ length: n + 1 }, () => new Int32Array(m + 1).fill(-1));
  best[0][0] = 0;
  for (let k = 1; k <= n; k++) {
    for (let j = k; j <= m - (n - k); j++) {
      for (let i = k - 1; i < j; i++) {
        if (best[k - 1][i] >= INF) continue;
        const c = best[k - 1][i] + cost(i, j, k - 1);
        if (c < best[k][j]) {
          best[k][j] = c;
          from[k][j] = i;
        }
      }
    }
  }
  const groups: [number, number][] = [];
  let j = m;
  for (let k = n; k >= 1; k--) {
    const i = from[k][j];
    groups.unshift([i, j]);
    j = i;
  }
  out = groups.map(([i, jj]) => {
    const part = out.slice(i, jj);
    return {
      x0: part[0].x0,
      x1: Math.max(...part.map((b) => b.x1)),
      y0: Math.min(...part.map((b) => b.y0)),
      y1: Math.max(...part.map((b) => b.y1)),
      comps: part.flatMap((b) => b.comps),
    };
  });
  return out;
}

/** 상자를 세로 잉크 양이 가장 적은 열(가운데 30~70% 안)에서 둘로 나눈다 */
export function splitByColumn(mask: BinMask, b: Box): [Box, Box] | null {
  const w = b.x1 - b.x0;
  if (w < 4) return null;
  let bestX = -1;
  let best = Infinity;
  for (let x = b.x0 + Math.floor(w * 0.3); x <= b.x0 + Math.ceil(w * 0.7); x++) {
    let s = 0;
    for (let y = b.y0; y < b.y1; y++) s += mask.data[y * mask.w + x];
    // 가운데에 가까울수록 조금 유리하게
    const cost = s + Math.abs(x - (b.x0 + w / 2)) * 0.05;
    if (cost < best) {
      best = cost;
      bestX = x;
    }
  }
  if (bestX < 0) return null;
  // 나눈 뒤에도 같은 덩어리 번호를 가지되, 잘라 쓸 때 x 범위로 자른다
  return [
    { ...b, x1: bestX, comps: [...b.comps] },
    { ...b, x0: bestX, comps: [...b.comps] },
  ];
}

/** 타이핑한 줄에서 글자만 (공백 뺌) */
export const textChars = (line: string) => Array.from(line).filter((c) => c.trim());

/**
 * 맞춘 상자들 사이 간격으로 글자 간격·띄어쓰기 폭을 잰다 (글자 높이 대비).
 * spaceAfter[i]: 타이핑한 글에서 i번째 글자 뒤에 공백이 있었는지
 */
export function measureSpacing(boxes: Box[], charH: number, spaceAfter: boolean[]) {
  const gaps: number[] = [];
  const words: number[] = [];
  for (let i = 0; i < boxes.length - 1; i++) {
    const g = (boxes[i + 1].x0 - boxes[i].x1) / charH;
    (spaceAfter[i] ? words : gaps).push(g);
  }
  return { charGap: gaps.length ? median(gaps) : null, wordGap: words.length ? median(words) : null, nGaps: gaps.length, nWords: words.length };
}
