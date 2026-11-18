"use client";
// 브라우저에서 기준 글자와 자모 영역을 쓰는 도구들 (따라 쓰기·검증·조합 화면에서 공용)
import { asset } from "@/lib/basePath";
import { assignNearest, base64ToBytes, rleDecode } from "./core";
import { RegionComputer } from "./algorithm";
import type { GlyphFrame, JamoBoxesFile, JamoMasksFile } from "./types";

export const REF_FONT_FAMILY = "HwRefFont";

let fontPromise: Promise<void> | null = null;
export function loadRefFont(frame: GlyphFrame): Promise<void> {
  if (!fontPromise) {
    fontPromise = (async () => {
      const face = new FontFace(REF_FONT_FAMILY, `url(${asset(frame.fontFile)})`);
      await face.load();
      document.fonts.add(face);
    })();
  }
  return fontPromise;
}

let masksPromise: Promise<JamoMasksFile> | null = null;
export function loadMasks(): Promise<JamoMasksFile> {
  if (!masksPromise) masksPromise = fetch(asset("/data/jamo-masks.json"), { cache: "no-cache" }).then((r) => r.json());
  return masksPromise;
}

let boxesPromise: Promise<{ frame: GlyphFrame; bytes: Uint8Array }> | null = null;
export function loadBoxes() {
  if (!boxesPromise) {
    boxesPromise = fetch(asset("/data/jamo-boxes.json"), { cache: "no-cache" })
      .then((r) => r.json() as Promise<JamoBoxesFile>)
      .then((f) => ({ frame: f.frame, bytes: base64ToBytes(f.boxes) }));
  }
  return boxesPromise;
}

export type Box = [number, number, number, number];

/** 한글 음절의 자모 상자 (frame.size 기준 px). 없는 자모는 null */
export function boxesOf(bytes: Uint8Array, ch: string): (Box | null)[] | null {
  const code = ch.codePointAt(0)! - 0xac00;
  if (code < 0 || code >= 11172) return null;
  const out: (Box | null)[] = [];
  for (let k = 0; k < 3; k++) {
    const b = Array.from(bytes.slice(code * 12 + k * 4, code * 12 + k * 4 + 4)) as Box;
    out.push(b[2] > b[0] ? b : null);
  }
  return out;
}

/**
 * 라벨맵 (0=배경). 미리 계산한 글자(등록 글자 473자)는 그 값을 쓰고,
 * 그 밖의 글자는 브라우저에서 빌드 스크립트와 같은 방법(src/lib/regions/algorithm.ts)으로 계산한다.
 * 이때 글자 수십 개를 그려야 해서 한 글자에 수백 ms 걸릴 수 있다. loadRefFont가 끝난 뒤에만 쓸 수 있다.
 */
const computedCache = new Map<string, Uint8Array | null>();
let computer: RegionComputer | null = null;
function browserComputer(masks: JamoMasksFile): RegionComputer {
  if (computer) return computer;
  const n = masks.frame.size;
  const cv = document.createElement("canvas");
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  const render = (ch: string) => {
    ctx.clearRect(0, 0, n, n);
    ctx.fillStyle = "#000";
    drawGlyph(ctx, masks.frame, ch, 0, 0, n);
    const data = ctx.getImageData(0, 0, n, n).data;
    const m = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) m[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
    return m;
  };
  const shared = new Map(Object.entries(masks.shared ?? {}).map(([k, rle]) => [k, rleDecode(rle, n * n)]));
  computer = new RegionComputer(render, n, shared);
  return computer;
}

export function labelsOf(masks: JamoMasksFile, ch: string): Uint8Array | null {
  const rle = masks.chars[ch];
  const n = masks.frame.size;
  if (rle) return rleDecode(rle, n * n);
  if (computedCache.has(ch)) return computedCache.get(ch)!;
  if (typeof document === "undefined") return null;
  const rc = browserComputer(masks);
  const ink = rc.ink(ch);
  const out = ink.reduce((a, v) => a + v, 0) >= 4 ? rc.labels(ch) : null; // 글꼴에 없는 글자
  computedCache.set(ch, out);
  return out;
}

/** 미리 계산하지 않고 브라우저에서 계산한 라벨인지 */
export const isApproxLabels = (masks: JamoMasksFile, ch: string) => !masks.chars[ch];

/** 평면 전체에 "가장 가까운 자모" 라벨을 채운 지도. 브라우저 렌더링과 1~2px 어긋나도 색을 칠할 수 있게. */
const fieldCache = new Map<string, Uint8Array>();
export function labelField(masks: JamoMasksFile, ch: string): Uint8Array | null {
  const hit = fieldCache.get(ch);
  if (hit) return hit;
  const lab = labelsOf(masks, ch);
  if (!lab) return null;
  const n = masks.frame.size;
  const max = Math.max(...lab);
  const seeds = [];
  for (let k = 1; k <= max; k++) seeds.push(lab.map((v) => (v === k ? 1 : 0)));
  const field = assignNearest(new Uint8Array(n * n).fill(1), seeds, n);
  fieldCache.set(ch, field);
  return field;
}

/** 기준 글자를 칸(x, y, 한 변 s)에 그린다. 스크립트와 같은 규칙. */
export function drawGlyph(ctx: CanvasRenderingContext2D, frame: GlyphFrame, ch: string, x: number, y: number, s: number) {
  ctx.save();
  ctx.font = `${s * frame.fontScale}px ${REF_FONT_FAMILY}`;
  ctx.textBaseline = "alphabetic";
  const w = ctx.measureText(ch).width;
  ctx.fillText(ch, x + (s - w) / 2, y + s * frame.baseline);
  ctx.restore();
}

/**
 * 기준 글자를 자모별 색으로 칠해 그린다.
 * colors[k-1] = 라벨 k의 색. 반환값: 브라우저 잉크 중 미리 계산한 라벨맵 잉크와 겹친 비율(정렬 확인용).
 */
export function drawColoredGlyph(
  ctx: CanvasRenderingContext2D,
  masks: JamoMasksFile,
  ch: string,
  x: number,
  y: number,
  s: number,
  colors: [number, number, number, number][],
): number | null {
  const field = labelField(masks, ch);
  const lab = labelsOf(masks, ch);
  if (!field || !lab) return null;
  const n = masks.frame.size;
  const px = Math.round(s);
  const off = document.createElement("canvas");
  off.width = px;
  off.height = px;
  const octx = off.getContext("2d")!;
  octx.fillStyle = "#000";
  drawGlyph(octx, masks.frame, ch, 0, 0, px);
  const img = octx.getImageData(0, 0, px, px);
  let ink = 0;
  let hit = 0;
  for (let yy = 0; yy < px; yy++) {
    for (let xx = 0; xx < px; xx++) {
      const p = (yy * px + xx) * 4;
      const a = img.data[p + 3];
      if (!a) continue;
      const gi = Math.min(n - 1, Math.floor((yy * n) / px)) * n + Math.min(n - 1, Math.floor((xx * n) / px));
      const k = field[gi];
      const c = colors[k - 1] ?? [0, 0, 0, 255];
      img.data[p] = c[0];
      img.data[p + 1] = c[1];
      img.data[p + 2] = c[2];
      img.data[p + 3] = Math.round((a * c[3]) / 255);
      if (a >= 128) {
        ink++;
        if (lab[gi]) hit++;
      }
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.drawImage(off, x, y, s, s);
  return ink ? hit / ink : null;
}
