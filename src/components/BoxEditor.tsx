"use client";
// 사진 속 글자 상자를 손으로 고치는 창: 모서리·변을 끌어 크기를 바꾸고, 안쪽을 끌어 옮긴다.
import { useEffect, useRef, useState } from "react";

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Grip = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";

interface Props {
  src: HTMLCanvasElement;
  /** 처음 상자 */
  rect: Rect;
  /** 같은 줄의 다른 상자들 (흐리게 보여줌) */
  others: Rect[];
  /** 줄 글자 높이(px) — 보이는 범위를 정하는 데 씀 */
  lineHeight: number;
  char: string;
  onApply: (r: Rect) => void;
  onCancel: () => void;
}

const MIN = 4;

export default function BoxEditor({ src, rect, others, lineHeight, char, onApply, onCancel }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [r, setR] = useState<Rect>(rect);
  const drag = useRef<{ grip: Grip; sx: number; sy: number; start: Rect } | null>(null);
  const [width, setWidth] = useState(520);

  // 보이는 범위: 상자 둘레로 글자 1개 정도씩 여유 (사진 밖은 자름)
  const pad = lineHeight * 1.2;
  const view = {
    x0: Math.max(0, Math.min(rect.x0, r.x0) - pad),
    y0: Math.max(0, Math.min(rect.y0, r.y0) - pad * 0.6),
    x1: Math.min(src.width, Math.max(rect.x1, r.x1) + pad),
    y1: Math.min(src.height, Math.max(rect.y1, r.y1) + pad * 0.6),
  };
  // 끄는 동안 보이는 범위가 흔들리지 않게 처음 범위를 고정
  const viewRef = useRef(view);
  if (!drag.current) viewRef.current = view;
  const v = viewRef.current;
  const k = width / (v.x1 - v.x0);
  const height = (v.y1 - v.y0) * k;

  useEffect(() => {
    const f = () => setWidth(Math.min(620, window.innerWidth - 48));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext("2d")!;
    const s = k * dpr;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(src, v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0, 0, 0, cv.width, cv.height);
    const toC = (x: number, y: number) => [(x - v.x0) * s, (y - v.y0) * s];
    // 다른 상자: 흐린 점선
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = "rgba(60,90,200,0.5)";
    ctx.lineWidth = dpr;
    for (const o of others) {
      const [a, b] = toC(o.x0, o.y0);
      ctx.strokeRect(a, b, (o.x1 - o.x0) * s, (o.y1 - o.y0) * s);
    }
    ctx.setLineDash([]);
    // 상자 밖은 어둡게
    const [x0, y0] = toC(r.x0, r.y0);
    const [x1, y1] = toC(r.x1, r.y1);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, cv.width, y0);
    ctx.fillRect(0, y1, cv.width, cv.height - y1);
    ctx.fillRect(0, y0, x0, y1 - y0);
    ctx.fillRect(x1, y0, cv.width - x1, y1 - y0);
    ctx.strokeStyle = "#e05a2b";
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    // 손잡이
    const hs = 9 * dpr;
    ctx.fillStyle = "#e05a2b";
    for (const [hx, hy] of [
      [x0, y0], [(x0 + x1) / 2, y0], [x1, y0],
      [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2],
      [x0, y1], [(x0 + x1) / 2, y1], [x1, y1],
    ]) ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
  }, [src, r, others, width, height, k, v.x0, v.y0, v.x1, v.y1]);

  const toImg = (e: React.PointerEvent) => {
    const b = ref.current!.getBoundingClientRect();
    return { x: v.x0 + (e.clientX - b.left) / k, y: v.y0 + (e.clientY - b.top) / k };
  };

  const hit = (x: number, y: number): Grip | null => {
    const t = 14 / k; // 손가락으로도 잡히게 14px
    const nearL = Math.abs(x - r.x0) <= t;
    const nearR = Math.abs(x - r.x1) <= t;
    const nearT = Math.abs(y - r.y0) <= t;
    const nearB = Math.abs(y - r.y1) <= t;
    const inX = x >= r.x0 - t && x <= r.x1 + t;
    const inY = y >= r.y0 - t && y <= r.y1 + t;
    if (nearT && nearL) return "nw";
    if (nearT && nearR) return "ne";
    if (nearB && nearL) return "sw";
    if (nearB && nearR) return "se";
    if (nearT && inX) return "n";
    if (nearB && inX) return "s";
    if (nearL && inY) return "w";
    if (nearR && inY) return "e";
    if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return "move";
    return null;
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toImg(e);
    const g = hit(p.x, p.y);
    if (!g) return;
    e.preventDefault();
    try {
      ref.current!.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    drag.current = { grip: g, sx: p.x, sy: p.y, start: r };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    const p = toImg(e);
    if (!d) {
      const g = hit(p.x, p.y);
      const cur: Record<Grip, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize", move: "move" };
      ref.current!.style.cursor = g ? cur[g] : "default";
      return;
    }
    e.preventDefault();
    const dx = p.x - d.sx;
    const dy = p.y - d.sy;
    const s0 = d.start;
    let { x0, y0, x1, y1 } = s0;
    if (d.grip === "move") {
      x0 += dx; x1 += dx; y0 += dy; y1 += dy;
    } else {
      if (d.grip.includes("w")) x0 = Math.min(s0.x1 - MIN, s0.x0 + dx);
      if (d.grip.includes("e")) x1 = Math.max(s0.x0 + MIN, s0.x1 + dx);
      if (d.grip.includes("n")) y0 = Math.min(s0.y1 - MIN, s0.y0 + dy);
      if (d.grip.includes("s")) y1 = Math.max(s0.y0 + MIN, s0.y1 + dy);
    }
    const clamp = (val: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, val));
    setR({
      x0: Math.round(clamp(x0, 0, src.width - MIN)),
      y0: Math.round(clamp(y0, 0, src.height - MIN)),
      x1: Math.round(clamp(x1, MIN, src.width)),
      y1: Math.round(clamp(y1, MIN, src.height)),
    });
  };

  const onUp = () => {
    drag.current = null;
  };

  return (
    <div className="box-editor" style={{ background: "#fff", border: "2px solid #e05a2b", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <strong>&lsquo;{char || "?"}&rsquo; 상자 고치기</strong>
        <span style={{ fontSize: "0.8rem", color: "#666" }}>모서리·변을 끌면 크기, 안쪽을 끌면 위치가 바뀌어요</span>
      </div>
      <canvas
        ref={ref}
        style={{ width, height, display: "block", touchAction: "none", borderRadius: 6 }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={() => onApply(r)} style={btn(true)}>
          적용
        </button>
        <button onClick={() => setR(rect)} style={btn(false)}>
          처음 상자로
        </button>
        <button onClick={onCancel} style={btn(false)}>
          취소
        </button>
      </div>
    </div>
  );
}

const btn = (primary: boolean): React.CSSProperties => ({
  minHeight: 40,
  padding: "6px 14px",
  borderRadius: 10,
  border: `1px solid ${primary ? "#1c2040" : "#ccc"}`,
  background: primary ? "#1c2040" : "#fff",
  color: primary ? "#fff" : "#222",
});
