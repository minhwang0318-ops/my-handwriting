/**
 * 기준 글자(Noto Sans KR)의 자모 영역을 미리 계산해 public/data에 JSON으로 저장한다.
 * 계산 방법은 src/lib/regions/algorithm.ts 참고 (브라우저도 같은 코드를 쓴다).
 *
 * 실행: npm run regions
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { decompose } from "../src/lib/hangul";
import { allRegistrationChars } from "../src/lib/hangul/charsets";
import { rleEncode, robustLabelBox, countLabel, bytesToBase64, type Mask } from "../src/lib/regions/core";
import { RegionComputer, sharedKey, ALL_LAYOUTS } from "../src/lib/regions/algorithm";
import type { GlyphFrame, JamoMasksFile, JamoBoxesFile } from "../src/lib/regions/types";

const ROOT = path.resolve(__dirname, "..");
const FONT_PATH = path.join(ROOT, "public/fonts/NotoSansKR-Regular.ttf");
const OUT_DIR = path.join(ROOT, "public/data");

const N = 128;
const FRAME: GlyphFrame = {
  size: N,
  fontScale: 1,
  baseline: 0.88, // Source Han 계열: 표의문자 em 상자 위 0.88, 아래 0.12
  fontFile: "/fonts/NotoSansKR-Regular.ttf",
};

GlobalFonts.registerFromPath(FONT_PATH, "RefFont");
const canvas = createCanvas(N, N);
const ctx = canvas.getContext("2d");
ctx.font = `${N * FRAME.fontScale}px RefFont`;
ctx.textBaseline = "alphabetic";
ctx.fillStyle = "#000";

function render(ch: string): Mask {
  ctx.clearRect(0, 0, N, N);
  const w = ctx.measureText(ch).width;
  ctx.fillText(ch, (N - w) / 2, N * FRAME.baseline);
  const data = ctx.getImageData(0, 0, N, N).data;
  const m = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) m[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return m;
}

const rc = new RegionComputer(render, N);
const hangulLabels = (ch: string) => rc.hangulLabels(ch);
const ink = (ch: string) => rc.ink(ch);

function main() {
  const t0 = Date.now();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1) 등록 글자 라벨맵
  const masks: JamoMasksFile = { frame: FRAME, chars: {}, shared: {} };
  // 브라우저에서 미리 계산 안 된 글자를 계산할 때 쓰도록 "배치 공유 획"도 저장한다
  for (const layout of ALL_LAYOUTS) for (const closed of [false, true]) masks.shared![sharedKey(layout, closed)] = rleEncode(rc.sharedStrokes(layout, closed));
  const problems: string[] = [];
  for (const ch of allRegistrationChars()) {
    if (decompose(ch)) {
      const r = hangulLabels(ch);
      if (r.emptySeeds.length) problems.push(`${ch}: 씨앗 없음 ${r.emptySeeds.join(",")}`);
      const s = decompose(ch)!;
      const need = s.jong ? [1, 2, 3] : [1, 2];
      for (const k of need) if (countLabel(r.labels, k) === 0) problems.push(`${ch}: 라벨 ${k} 비어 있음`);
      masks.chars[ch] = rleEncode(r.labels);
    } else {
      masks.chars[ch] = rleEncode(ink(ch)); // 1 = 전체
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, "jamo-masks.json"), JSON.stringify(masks));
  console.log(`masks: ${Object.keys(masks.chars).length}자, ${(Date.now() - t0) / 1000}s`);

  // 2) 한글 11,172자 자모 상자
  const bytes = new Uint8Array(11172 * 12);
  let emptyCount = 0;
  for (let i = 0; i < 11172; i++) {
    const ch = String.fromCodePoint(0xac00 + i);
    const r = hangulLabels(ch);
    if (r.emptySeeds.length) emptyCount++;
    for (let k = 1; k <= 3; k++) {
      // 잘못 칠해진 픽셀 몇 개에 상자가 끌려가지 않도록 양 끝 3%를 빼고 잡는다
      const b = robustLabelBox(r.labels, N, k);
      if (b) bytes.set(b, i * 12 + (k - 1) * 4);
    }
    // 메모리 절약: 상자 단계에서는 캐시가 계속 커지므로 표본 외 글자는 버린다
    if (i % 500 === 499) {
      process.stdout.write(`\rboxes ${i + 1}/11172`);
    }
  }
  const boxes: JamoBoxesFile = { frame: FRAME, boxes: bytesToBase64(bytes) };
  fs.writeFileSync(path.join(OUT_DIR, "jamo-boxes.json"), JSON.stringify(boxes));
  console.log(`\n받침 경계 빈 줄을 못 찾아 덩어리로 고른 글자: ${rc.splitFallbacks}개 (등록 글자 포함 누적)`);
  console.log(`boxes: 씨앗이 빈 글자 ${emptyCount}개, 총 ${(Date.now() - t0) / 1000}s`);

  if (problems.length) {
    console.log(`등록 글자 경고 ${problems.length}건:`);
    for (const p of problems.slice(0, 40)) console.log("  " + p);
  } else {
    console.log("등록 글자 경고 없음");
  }
}

main();
