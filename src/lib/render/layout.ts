// 글 → 페이지 배치. 단위 mm, 종이 왼쪽 위가 원점.
import { isSyllable } from "@/lib/hangul";
import type { StyleProfile } from "@/lib/style/profile";
import { AR1, gaussClamped, makeRng } from "@/lib/style/random";
import { deformGlyph, makeVariation, type GPoint, type PreparedGlyph } from "./glyph";

export type PaperKind = "lined" | "grid" | "blank";

export interface PageSetup {
  widthMm: number;
  heightMm: number;
  margin: { top: number; right: number; bottom: number; left: number };
  paper: PaperKind;
}

export const A4: PageSetup = {
  widthMm: 210,
  heightMm: 297,
  margin: { top: 22, right: 18, bottom: 20, left: 20 },
  paper: "lined",
};

/** em 상자 안에서 줄(괘선)에 닿는 높이 */
export const EM_BASELINE = 0.9;

export interface PlacedGlyph {
  char: string;
  sampleId: string;
  composed: boolean;
  /** 종이 위 획 (mm) */
  strokes: GPoint[][];
}

export interface MissingSlot {
  char: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Page {
  glyphs: PlacedGlyph[];
  missing: MissingSlot[];
  /** 괘선 y (mm). 줄노트일 때 그린다 */
  lineYs: number[];
}

export interface LayoutResult {
  pages: Page[];
  /** 글에 있지만 쓸 수 있는 벌이 없는 글자 (직접 쓴 적도 없고 조합도 안 되는 글자. 등장 순서, 중복 없음) */
  missing: string[];
}

export interface GlyphSource {
  /** 그 글자의 다듬은 벌들 (없으면 빈 배열) */
  get(char: string): PreparedGlyph[];
}

interface Token {
  kind: "word" | "space" | "newline";
  text: string;
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const norm = text.replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  const re = /\n|[  　]+|[^\s]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const t = m[0];
    if (t === "\n") out.push({ kind: "newline", text: t });
    else if (/^[  　]+$/.test(t)) out.push({ kind: "space", text: t });
    else out.push({ kind: "word", text: t });
  }
  return out;
}

/** 글자 종류별 크기 차이를 keep만큼 남기는 보정 배율 (한글만) */
function sizeNormalizer(source: GlyphSource, chars: string[], keep: number) {
  const heights: number[] = [];
  for (const c of new Set(chars)) {
    if (!isSyllable(c)) continue;
    for (const g of source.get(c)) heights.push(g.ink.y1 - g.ink.y0);
  }
  heights.sort((a, b) => a - b);
  const med = heights.length ? heights[heights.length >> 1] : 0;
  return (g: PreparedGlyph) => {
    if (!med || !isSyllable(g.char)) return 1;
    const h = Math.max(0.05, g.ink.y1 - g.ink.y0);
    // 1-keep 만큼만 중앙값 쪽으로 당긴다. 너무 큰 보정은 막는다.
    return Math.max(0.75, Math.min(1.3, Math.pow(med / h, 1 - keep)));
  };
}

export function layoutText(text: string, source: GlyphSource, profile: StyleProfile, page: PageSetup, seed: number): LayoutResult {
  const P1 = profile["1_일정함"];
  const P2 = profile["2_글자별차이"];
  const P3 = profile["3_이어지는변화"];
  const P4 = profile["4_간격"];
  const size = P1.size_mm;
  const pitch = P1.line_pitch_mm;
  const rng = makeRng(seed);

  const left = page.margin.left;
  const right = page.widthMm - page.margin.right;
  const usableW = right - left;
  const firstLine = page.margin.top + pitch;
  const linesPerPage = Math.max(1, Math.floor((page.heightMm - page.margin.bottom - firstLine) / pitch) + 1);

  const tokens = tokenize(text);
  const allChars = tokens.filter((t) => t.kind === "word").flatMap((t) => Array.from(t.text));
  const norm = sizeNormalizer(source, allChars, P2.keep_size_diff);
  const missingSet: string[] = [];
  const useCount = new Map<string, number>();

  const pages: Page[] = [];
  let pg: Page | null = null;
  let lineNo = -1;
  let cursor = 0;
  let lineY = 0;
  let slope = 0;
  let lineHasInk = false;
  const baseAR = new AR1(P3.baseline_sd_mm, P3.baseline_corr, rng);
  const sizeAR = new AR1(P3.size_sd, P3.size_corr, rng);

  const newPage = () => {
    pg = { glyphs: [], missing: [], lineYs: [] };
    for (let i = 0; i < linesPerPage; i++) pg.lineYs.push(firstLine + i * pitch);
    pages.push(pg);
  };
  const newLine = () => {
    lineNo++;
    const idx = lineNo % linesPerPage;
    if (idx === 0) newPage();
    lineY = firstLine + idx * pitch;
    cursor = left + gaussClamped(rng) * P4.left_margin_sd_mm;
    slope = gaussClamped(rng) * P3.line_slope_mm; // 한 줄 너비 동안 오르내리는 양
    baseAR.reset();
    sizeAR.reset();
    lineHasInk = false;
  };
  newLine();

  const meanGap = P4.char_gap * size;
  const charW = (c: string) => {
    const gs = source.get(c);
    if (!gs.length) return 0.8 * size;
    const g = gs[0];
    return (g.ink.x1 - g.ink.x0) * size * norm(g);
  };
  const wordWidth = (w: string) => Array.from(w).reduce((a, c) => a + charW(c) + meanGap, 0) - meanGap;

  const placeChar = (c: string) => {
    const gs = source.get(c);
    const curPage = pg!;
    if (!gs.length) {
      if (!missingSet.includes(c)) missingSet.push(c);
      const w = 0.8 * size;
      curPage.missing.push({ char: c, x: cursor, y: lineY - EM_BASELINE * size, w, h: size });
      cursor += w + meanGap;
      lineHasInk = true;
      return;
    }
    const k = useCount.get(c) ?? 0;
    useCount.set(c, k + 1);
    const g = gs[k % gs.length]; // 여러 벌이면 번갈아
    const v = makeVariation(profile, rng);
    const s = norm(g) * (1 + sizeAR.next());
    const strokesEm = deformGlyph(g, v, s);
    // 변형 뒤 잉크 왼쪽 끝을 커서에 맞춘다
    let ix0 = Infinity;
    let ix1 = -Infinity;
    for (const st of strokesEm) for (const p of st) {
      if (p.x < ix0) ix0 = p.x;
      if (p.x > ix1) ix1 = p.x;
    }
    if (!isFinite(ix0)) return;
    const x0 = cursor - ix0 * size;
    const drift = baseAR.next() + slope * ((cursor - left) / usableW);
    const y0 = lineY - EM_BASELINE * size + drift;
    curPage.glyphs.push({
      char: c,
      sampleId: g.sampleId,
      composed: g.composed,
      strokes: strokesEm.map((st) => st.map((p) => ({ x: x0 + p.x * size, y: y0 + p.y * size, p: p.p }))),
    });
    const gap = meanGap * Math.max(0, 1 + P4.char_gap_var * gaussClamped(rng, 1.6));
    cursor += (ix1 - ix0) * size + gap;
    lineHasInk = true;
  };

  for (const t of tokens) {
    if (t.kind === "newline") {
      newLine();
      continue;
    }
    if (t.kind === "space") {
      if (!lineHasInk) continue; // 줄 첫머리 공백은 무시
      const n = t.text.length;
      cursor += n * P4.word_space * size * Math.max(0.2, 1 + P4.word_space_var * gaussClamped(rng, 2));
      continue;
    }
    const w = wordWidth(t.text);
    if (lineHasInk && cursor + w > right) newLine();
    for (const c of Array.from(t.text)) {
      // 한 줄보다 긴 낱말은 글자 단위로 넘긴다
      if (lineHasInk && cursor + charW(c) > right + size * 0.3) newLine();
      placeChar(c);
    }
  }

  return { pages, missing: missingSet };
}
