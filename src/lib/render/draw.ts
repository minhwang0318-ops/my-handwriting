// 배치된 페이지 → 그리기 명령(폴리라인) → 캔버스 / PDF.
// 두 출력이 같은 명령을 쓰므로 미리보기와 내보내기 모양이 같다.
import type { StyleProfile } from "@/lib/style/profile";
import type { Page, PageSetup } from "./layout";

export interface Polyline {
  pts: [number, number][];
  /** mm */
  width: number;
  /** 조합으로 만든 글자의 획 (미리보기에서 색으로 구분할 때) */
  composed?: boolean;
}

export interface PageOps {
  paperLines: { x1: number; y1: number; x2: number; y2: number }[];
  ink: Polyline[];
}

export const PAPER_RGB: [number, number, number] = [178, 200, 226];

/** 필압 → 굵기(mm). pressure=0이면 일정, 1이면 0..2배까지 */
export function widthFor(profile: StyleProfile, p: number): number {
  const t = profile["5_획질감"];
  return t.pen_mm * Math.max(0.15, 1 - t.pressure + 2 * t.pressure * p);
}

/**
 * 획을 폴리라인으로. minStep(mm)보다 가까운 점은 건너뛰고,
 * 굵기가 widthStep 단위로 바뀔 때마다 새 폴리라인을 시작한다(앞 점과 이어지게).
 */
export function strokeToPolylines(pts: { x: number; y: number; p: number }[], profile: StyleProfile, minStep = 0.2, widthStep = 0.03): Polyline[] {
  if (!pts.length) return [];
  const q = (w: number) => Math.max(widthStep, Math.round(w / widthStep) * widthStep);
  const out: Polyline[] = [];
  let cur: Polyline = { pts: [[pts[0].x, pts[0].y]], width: q(widthFor(profile, pts[0].p)) };
  let last = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const isLast = i === pts.length - 1;
    if (!isLast && Math.hypot(p.x - last.x, p.y - last.y) < minStep) continue;
    const w = q(widthFor(profile, p.p));
    if (w !== cur.width && cur.pts.length > 1) {
      out.push(cur);
      cur = { pts: [[last.x, last.y]], width: w };
    } else cur.width = cur.pts.length > 1 ? cur.width : w;
    cur.pts.push([p.x, p.y]);
    last = p;
  }
  if (cur.pts.length === 1) cur.pts.push([cur.pts[0][0] + 0.001, cur.pts[0][1]]); // 점 하나짜리 획
  out.push(cur);
  return out;
}

export function buildPageOps(page: Page, setup: PageSetup, profile: StyleProfile): PageOps {
  const paperLines: PageOps["paperLines"] = [];
  if (setup.paper === "lined") {
    for (const y of page.lineYs) paperLines.push({ x1: 0, y1: y, x2: setup.widthMm, y2: y });
  } else if (setup.paper === "grid") {
    const step = 5;
    for (let x = step; x < setup.widthMm; x += step) paperLines.push({ x1: x, y1: 0, x2: x, y2: setup.heightMm });
    for (let y = step; y < setup.heightMm; y += step) paperLines.push({ x1: 0, y1: y, x2: setup.widthMm, y2: y });
  }
  const ink = page.glyphs.flatMap((g) =>
    g.strokes.flatMap((s) => strokeToPolylines(s, profile).map((pl) => (g.composed ? { ...pl, composed: true } : pl))),
  );
  return { paperLines, ink };
}

export interface CanvasDrawOptions {
  pxPerMm: number;
  showMissing?: boolean;
  /** 조합 글자를 다른 색으로 (미리보기 전용) */
  highlightComposed?: boolean;
}

export function drawPageToCanvas(
  ctx: CanvasRenderingContext2D,
  page: Page,
  ops: PageOps,
  setup: PageSetup,
  profile: StyleProfile,
  opt: CanvasDrawOptions,
) {
  const k = opt.pxPerMm;
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, setup.widthMm * k, setup.heightMm * k);
  ctx.strokeStyle = `rgb(${PAPER_RGB.join(",")})`;
  ctx.lineWidth = Math.max(1, 0.15 * k);
  ctx.beginPath();
  for (const l of ops.paperLines) {
    ctx.moveTo(l.x1 * k, l.y1 * k);
    ctx.lineTo(l.x2 * k, l.y2 * k);
  }
  ctx.stroke();

  const [r, g, b] = profile["1_일정함"].ink;
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const normal = `rgb(${r},${g},${b})`;
  for (const pl of ops.ink) {
    ctx.strokeStyle = opt.highlightComposed && pl.composed ? "rgb(24,128,170)" : normal;
    ctx.lineWidth = pl.width * k;
    ctx.beginPath();
    pl.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
    ctx.stroke();
  }

  if (opt.showMissing) {
    ctx.strokeStyle = "rgba(220,60,60,0.8)";
    ctx.fillStyle = "rgba(220,60,60,0.85)";
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const m of page.missing) {
      ctx.strokeRect(m.x * k, m.y * k, m.w * k, m.h * k);
      ctx.font = `${m.h * k * 0.5}px sans-serif`;
      ctx.fillText(m.char, (m.x + m.w / 2) * k, (m.y + m.h / 2) * k);
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** 각 페이지를 PNG로 저장 */
export async function exportPngs(pages: Page[], setup: PageSetup, profile: StyleProfile, baseName: string, dpi = 200) {
  const k = dpi / 25.4;
  for (let i = 0; i < pages.length; i++) {
    const cv = document.createElement("canvas");
    cv.width = Math.round(setup.widthMm * k);
    cv.height = Math.round(setup.heightMm * k);
    const ctx = cv.getContext("2d")!;
    drawPageToCanvas(ctx, pages[i], buildPageOps(pages[i], setup, profile), setup, profile, { pxPerMm: k });
    const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), "image/png"));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pages.length > 1 ? `${baseName}-${i + 1}.png` : `${baseName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    await new Promise((r) => setTimeout(r, 300));
  }
}
