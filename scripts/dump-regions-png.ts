// 디버그: 지정 글자들의 자모 라벨맵을 PNG 한 장으로 저장. 사용: tsx scripts/dump-regions-png.ts out.png 가각혼...
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { rleDecode, robustLabelBox } from "../src/lib/regions/core";
import { RegionComputer } from "../src/lib/regions/algorithm";
import { createCanvas as cc, GlobalFonts } from "@napi-rs/canvas";
GlobalFonts.registerFromPath(path.resolve(__dirname, "../public/fonts/NotoSansKR-Regular.ttf"), "RefFont");
const rcv = cc(128, 128);
const rctx = rcv.getContext("2d");
rctx.font = "128px RefFont";
const rc = new RegionComputer((ch) => {
  rctx.clearRect(0, 0, 128, 128);
  const w = rctx.measureText(ch).width;
  rctx.fillText(ch, (128 - w) / 2, 128 * 0.88);
  const d = rctx.getImageData(0, 0, 128, 128).data;
  return new Uint8Array(128 * 128).map((_, i) => (d[i * 4 + 3] >= 128 ? 1 : 0));
}, 128);
const masks = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../public/data/jamo-masks.json"), "utf8"));
const [out, text] = process.argv.slice(2);
const list = Array.from(text);
const N = masks.frame.size, cols = 12, rows = Math.ceil(list.length / cols);
const cv = createCanvas(cols * N, rows * N); const ctx = cv.getContext("2d");
ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
const colors = [[0,0,0],[220,60,60],[40,120,220],[40,160,80]];
const img = ctx.getImageData(0, 0, cv.width, cv.height);
list.forEach((ch, idx) => {
  const rle = masks.chars[ch];
  // 등록 글자가 아니면 같은 알고리즘으로 바로 계산 (shared는 직접 계산하므로 느림)
  const lab = rle ? rleDecode(rle, N * N) : rc.labels(ch); const ox = (idx % cols) * N, oy = Math.floor(idx / cols) * N;
  for (let i = 0; i < N * N; i++) if (lab[i]) { const p = ((oy + (i / N | 0)) * cv.width + ox + i % N) * 4; const c = colors[lab[i]]; img.data[p]=c[0]; img.data[p+1]=c[1]; img.data[p+2]=c[2]; }
});
ctx.putImageData(img, 0, 0);
// 자모 상자(양 끝 3% 뺀 것)도 그린다
list.forEach((ch, idx) => {
  const lab = masks.chars[ch] ? rleDecode(masks.chars[ch], N * N) : rc.labels(ch);
  const ox = (idx % cols) * N, oy = Math.floor(idx / cols) * N;
  ["#c33", "#36c", "#393"].forEach((col, k) => {
    const b = robustLabelBox(lab, N, k + 1);
    if (!b) return;
    ctx.strokeStyle = col;
    ctx.strokeRect(ox + b[0] + 0.5, oy + b[1] + 0.5, b[2] - b[0] - 1, b[3] - b[1] - 1);
  });
});
ctx.strokeStyle = "#ddd"; for (let i = 0; i < list.length; i++) ctx.strokeRect((i % cols) * N, Math.floor(i / cols) * N, N, N);
fs.writeFileSync(out, cv.toBuffer("image/png"));
