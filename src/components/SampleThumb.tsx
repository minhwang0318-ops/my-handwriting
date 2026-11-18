"use client";
// 저장된 한 벌을 작게 보여준다. jamoColors=true면 자모 배정 결과를 색으로 표시.
import { useEffect, useRef } from "react";
import type { Sample } from "@/lib/strokes/types";
import { drawStrokes } from "./TraceCell";
import { drawGlyph } from "@/lib/regions/client";
import type { GlyphFrame } from "@/lib/regions/types";

const LABEL_INK: Record<number, string> = { 1: "#c0392b", 2: "#2c64c8", 3: "#23864a" };

export default function SampleThumb({
  sample,
  size = 64,
  jamoColors = false,
  refFrame,
}: {
  sample: Sample;
  size?: number;
  jamoColors?: boolean;
  /** 주면 기준 글자를 아주 연하게 깐다 (기준 글꼴을 미리 불러와야 함) */
  refFrame?: GlyphFrame;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const s = size * dpr;
    cv.width = s;
    cv.height = s;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, s, s);
    if (refFrame) {
      ctx.fillStyle = "#ececec";
      drawGlyph(ctx, refFrame, sample.char, 0, 0, s);
    }
    if (!jamoColors) {
      drawStrokes(ctx, sample.strokes, s);
      return;
    }
    // 자모 색으로 그리기
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const j of sample.jamo) {
      ctx.strokeStyle = LABEL_INK[j.label] ?? "#333";
      ctx.lineWidth = s * 0.024;
      ctx.beginPath();
      j.points.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)));
      ctx.stroke();
    }
    ctx.restore();
  }, [sample, size, jamoColors, refFrame]);
  return <canvas ref={ref} style={{ width: size, height: size, borderRadius: 8, boxShadow: "0 0 0 0.5px var(--separator)", display: "block" }} />;
}
