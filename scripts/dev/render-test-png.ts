// 개발용: 글꼴 뼈대 시험 데이터로 "손글씨 사진" 흉내 PNG를 만든다 (사진 가져오기 화면 시험용).
// 진짜 손글씨가 아니다. 사용: tsx scripts/dev/render-test-png.ts out.png
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROFILE } from "../../src/lib/style/profile";
import { layoutText, type PageSetup } from "../../src/lib/render/layout";
import { buildPageOps, drawPageToCanvas } from "../../src/lib/render/draw";
import { buildGlyphSource } from "../../src/lib/render/source";
import { base64ToBytes } from "../../src/lib/regions/core";
import type { NBox } from "../../src/lib/compose/compose";
import type { Sample } from "../../src/lib/strokes/types";

const ROOT = path.resolve(__dirname, "../..");
const samples: Sample[] = JSON.parse(fs.readFileSync(path.join(ROOT, "public/dev/skeleton-samples.json"), "utf8"));
const boxesFile = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/jamo-boxes.json"), "utf8"));
const bytes = base64ToBytes(boxesFile.boxes);
const boxFn = (ch: string) => {
  const c = ch.codePointAt(0)! - 0xac00;
  if (c < 0 || c >= 11172) return null;
  return [0, 1, 2].map((k) => {
    const b = Array.from(bytes.slice(c * 12 + k * 4, c * 12 + k * 4 + 4));
    return b[2] > b[0] ? (b.map((v) => v / 128) as NBox) : null;
  });
};
const profile = { ...DEFAULT_PROFILE, "1_일정함": { ...DEFAULT_PROFILE["1_일정함"], line_pitch_mm: 14 }, "5_획질감": { ...DEFAULT_PROFILE["5_획질감"], pen_mm: 0.6 } };
const text = process.argv[3] ?? "오늘은 하늘이 맑고 바람이 시원합니다.\n내 손글씨로 쓴 편지예요.\n잘 지내죠?";
const setup: PageSetup = { widthMm: 150, heightMm: 70, margin: { top: 4, right: 8, bottom: 4, left: 8 }, paper: "lined" };
const r = layoutText(text, buildGlyphSource(samples, profile, boxFn, true), profile, setup, 7);
const k = 8; // px/mm
const cv = createCanvas(setup.widthMm * k, setup.heightMm * k);
const ctx = cv.getContext("2d") as unknown as CanvasRenderingContext2D;
drawPageToCanvas(ctx, r.pages[0], buildPageOps(r.pages[0], setup, profile), setup, profile, { pxPerMm: k });
fs.writeFileSync(process.argv[2], cv.toBuffer("image/png"));
console.log("pages", r.pages.length, "missing", r.missing.join(""));
