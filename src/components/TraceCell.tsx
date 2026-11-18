"use client";
// 따라 쓰기 칸: 희미한 기준 글자(자모별 색) + 허용 띠 + 펜 입력
import { useCallback, useEffect, useRef, useState } from "react";
import type { JamoMasksFile } from "@/lib/regions/types";
import { drawColoredGlyph } from "@/lib/regions/client";
import type { JamoFields } from "@/lib/strokes/fields";
import type { Point, PointerKind, Stroke } from "@/lib/strokes/types";
import { TrackpadPen, type PadPoint } from "@/lib/strokes/trackpad";

// 자모 색: [허용 띠, 기준 글자]
export const JAMO_COLORS: Record<number, { band: [number, number, number]; glyph: [number, number, number] }> = {
  1: { band: [253, 228, 228], glyph: [236, 140, 140] },
  2: { band: [224, 234, 253], glyph: [128, 165, 236] },
  3: { band: [222, 244, 228], glyph: [120, 192, 142] },
};
const FAIL_BAND: [number, number, number] = [255, 205, 150];
const INK = "#1c2040";

interface Props {
  char: string;
  masks: JamoMasksFile;
  fields: JamoFields;
  strokes: Stroke[];
  onStroke: (s: Stroke) => void;
  /** 탈락한 자모 라벨 (띠를 주황색으로) */
  failed?: number[];
  bandWidth: number;
  size: number;
  disabled?: boolean;
  /** 맥북 트랙패드 모드: 스페이스를 누른 동안 또는 톡-톡 사이에는 버튼 없이 움직여도 그려진다 (마우스 포인터에만) */
  trackpad?: boolean;
  /** 펜이 내려갔는지 (트랙패드 모드 안내용) */
  onPenChange?: (down: boolean) => void;
}

/** 획 굵기: 펜은 필압, 그 외는 일정 */
export function strokeWidth(size: number, s: Stroke, p: Point) {
  const base = size * 0.024;
  return s.pointer === "pen" ? base * (0.35 + 1.1 * p.p) : base;
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], size: number, ox = 0, oy = 0) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) drawStrokeFrom(ctx, s, 0, size, ox, oy);
  ctx.restore();
}

function drawStrokeFrom(ctx: CanvasRenderingContext2D, s: Stroke, from: number, size: number, ox: number, oy: number) {
  const pts = s.points;
  if (pts.length === 1 && from === 0) {
    ctx.beginPath();
    ctx.arc(ox + pts[0].x * size, oy + pts[0].y * size, strokeWidth(size, s, pts[0]) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = Math.max(1, from); i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    ctx.lineWidth = strokeWidth(size, s, b);
    ctx.beginPath();
    ctx.moveTo(ox + a.x * size, oy + a.y * size);
    ctx.lineTo(ox + b.x * size, oy + b.y * size);
    ctx.stroke();
  }
}

/** 허용 띠 그림 (격자 해상도) */
function bandImage(fields: JamoFields, bandWidth: number, failed: number[]): HTMLCanvasElement {
  const n = fields.n;
  const cv = document.createElement("canvas");
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(n, n);
  const band = bandWidth * n;
  for (let i = 0; i < n * n; i++) {
    let best = 0;
    let bestD = Infinity;
    for (const k of fields.labels) {
      const d = fields.dist.get(k)![i];
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (bestD > band) continue;
    const c = failed.includes(best) ? FAIL_BAND : JAMO_COLORS[best]?.band ?? [230, 230, 230];
    img.data[i * 4] = c[0];
    img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export default function TraceCell({ char, masks, fields, strokes, onStroke, failed = [], bandWidth, size, disabled, trackpad = false, onPenChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ stroke: Stroke; id: number; t0: number } | null>(null);
  const penSeen = useRef(false);
  const firstStart = useRef<number | null>(null);
  const hover = useRef(false);
  const [penDown, setPenDown] = useState(false);
  const cbRef = useRef({ onStroke, onPenChange, disabled });
  cbRef.current = { onStroke, onPenChange, disabled };

  // 트랙패드 펜: 시작·추가·끝을 live 획으로 옮긴다
  const pad = useRef<TrackpadPen | null>(null);
  if (!pad.current) {
    pad.current = new TrackpadPen({
      start: (p: PadPoint) => {
        if (firstStart.current === null) firstStart.current = p.t;
        const stroke: Stroke = { points: [], pointer: "mouse", start: Math.round(p.t - firstStart.current) };
        live.current = { stroke, id: -1, t0: p.t };
        stroke.points.push({ x: p.x, y: p.y, p: 0.5, t: 0 });
        paintLiveRef.current(0);
        setPenDown(true);
        cbRef.current.onPenChange?.(true);
      },
      add: (p: PadPoint) => {
        const l = live.current;
        if (!l) return;
        const last = l.stroke.points[l.stroke.points.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.0015) return;
        const from = l.stroke.points.length;
        l.stroke.points.push({ x: p.x, y: p.y, p: 0.5, t: Math.round(p.t - l.t0) });
        paintLiveRef.current(from);
      },
      end: () => {
        const l = live.current;
        live.current = null;
        setPenDown(false);
        cbRef.current.onPenChange?.(false);
        if (l && l.stroke.points.length) cbRef.current.onStroke(l.stroke);
      },
    });
  }

  const redraw = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const s = size * dpr;
    cv.width = s;
    cv.height = s;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, s, s);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bandImage(fields, bandWidth, failed), 0, 0, s, s);
    // 가운데 십자 보조선
    ctx.strokeStyle = "#eee";
    ctx.lineWidth = dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const colors = [1, 2, 3].map((k) => [...JAMO_COLORS[k].glyph, 200] as [number, number, number, number]);
    drawColoredGlyph(ctx, masks, char, 0, 0, s, colors);
    drawStrokes(ctx, strokes, s);
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = dpr;
    ctx.strokeRect(dpr / 2, dpr / 2, s - dpr, s - dpr);
  }, [char, masks, fields, strokes, failed, bandWidth, size]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    firstStart.current = null;
    pad.current?.cancel();
  }, [char]);

  // 트랙패드 모드: 칸 위에 커서가 있을 때 스페이스 = 펜 내림, Esc = 펜 올림
  useEffect(() => {
    if (!trackpad) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") pad.current?.cancel();
      if (e.code !== "Space" || !hover.current || cbRef.current.disabled) return;
      e.preventDefault(); // 페이지 스크롤·버튼 눌림 막기
      if (!e.repeat) pad.current?.spaceDown();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (pad.current?.source === "space") e.preventDefault();
      pad.current?.spaceUp();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      pad.current?.cancel();
    };
  }, [trackpad]);
  useEffect(() => {
    if (!strokes.length) firstStart.current = null;
  }, [strokes.length]);

  const toPoint = (e: PointerEvent, t0: number): Point => {
    const r = ref.current!.getBoundingClientRect();
    const pen = e.pointerType === "pen";
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      p: pen ? Math.max(0.05, e.pressure || 0.5) : 0.5,
      t: Math.round(e.timeStamp - t0),
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPad(e)) {
      if (disabled || e.button !== 0) return;
      e.preventDefault();
      pad.current!.pointerDown(padPoint(e.nativeEvent));
      return;
    }
    if (disabled || live.current) return;
    if (e.pointerType === "pen") penSeen.current = true;
    // 펜을 쓰는 중에는 손바닥(터치) 입력을 무시
    if (e.pointerType === "touch" && penSeen.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      ref.current!.setPointerCapture(e.pointerId);
    } catch {
      // 일부 환경에서는 포인터 캡처가 안 될 수 있다. 칸 안에서는 그대로 동작한다.
    }
    const now = e.timeStamp;
    if (firstStart.current === null) firstStart.current = now;
    const pointer = (["pen", "touch", "mouse"].includes(e.pointerType) ? e.pointerType : "mouse") as PointerKind;
    const stroke: Stroke = { points: [], pointer, start: Math.round(now - firstStart.current) };
    live.current = { stroke, id: e.pointerId, t0: now };
    stroke.points.push(toPoint(e.nativeEvent, now));
    paintLive(0);
  };

  const paintLiveRef = useRef<(from: number) => void>(() => {});
  const paintLive = (from: number) => {
    const cv = ref.current;
    const l = live.current;
    if (!cv || !l) return;
    const ctx = cv.getContext("2d")!;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawStrokeFrom(ctx, l.stroke, from, cv.width, 0, 0);
    ctx.restore();
  };
  paintLiveRef.current = paintLive;

  const padPoint = (e: PointerEvent): PadPoint => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, t: e.timeStamp };
  };
  const isPad = (e: React.PointerEvent) => trackpad && e.pointerType === "mouse";

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    hover.current = true;
    if (isPad(e)) {
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of evs.length ? evs : [e.nativeEvent]) pad.current!.move(padPoint(ev));
      return;
    }
    const l = live.current;
    if (!l || e.pointerId !== l.id) return;
    e.preventDefault();
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const from = l.stroke.points.length;
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      const p = toPoint(ev, l.t0);
      const last = l.stroke.points[l.stroke.points.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.0015) continue;
      l.stroke.points.push(p);
    }
    paintLive(from);
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPad(e)) {
      pad.current!.pointerUp(padPoint(e.nativeEvent));
      return;
    }
    const l = live.current;
    if (!l || e.pointerId !== l.id) return;
    live.current = null;
    onStroke(l.stroke);
  };

  return (
    <canvas
      ref={ref}
      style={{
        width: size,
        height: size,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        display: "block",
        borderRadius: 6,
        cursor: trackpad ? "crosshair" : undefined,
        // 트랙패드 모드에서 펜이 내려가 있으면 테두리로 알려 준다
        outline: trackpad && penDown ? "3px solid #e05a2b" : undefined,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerEnter={() => (hover.current = true)}
      onPointerLeave={(e) => {
        hover.current = false;
        if (isPad(e)) pad.current!.cancel(); // 펜 내린 채 칸 밖으로 나가면 획을 끝낸다
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
