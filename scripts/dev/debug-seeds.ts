// 디버그: 글자의 씨앗을 그림으로. 회색=잉크, 빨강=초성 씨앗, 파랑=모음 씨앗, 연분홍=choRaw, 연파랑=vj, 노랑=배치 공유 획
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { RegionComputer } from "../../src/lib/regions/algorithm";
const N = 128;
GlobalFonts.registerFromPath(path.resolve(__dirname, "../../public/fonts/NotoSansKR-Regular.ttf"), "RefFont");
const cv = createCanvas(N, N);
const ctx = cv.getContext("2d");
ctx.font = `${N}px RefFont`;
const render = (ch: string) => {
  ctx.clearRect(0, 0, N, N);
  const w = ctx.measureText(ch).width;
  ctx.fillText(ch, (N - w) / 2, N * 0.88);
  const d = ctx.getImageData(0, 0, N, N).data;
  return new Uint8Array(N * N).map((_, i) => (d[i * 4 + 3] >= 128 ? 1 : 0));
};
const rc = new RegionComputer(render, N);
const [out, ...chars] = process.argv.slice(2);
const big = createCanvas(N * chars.length * 2, N);
const bctx = big.getContext("2d");
const img = bctx.createImageData(N * chars.length * 2, N);
chars.forEach((ch, ci) => {
  const r = rc.hangulLabels(ch, true) as { debug: { seeds: Record<string, Uint8Array> } };
  const ink = rc.ink(ch);
  const sd = r.debug.seeds;
  for (const panel of [0, 1]) {
    for (let i = 0; i < N * N; i++) {
      const x = (i % N) + (ci * 2 + panel) * N;
      const y = (i / N) | 0;
      const p = (y * N * chars.length * 2 + x) * 4;
      let c = [255, 255, 255];
      if (panel === 0) {
        if (ink[i]) c = [200, 200, 200];
        if (sd.cho[i]) c = [220, 40, 40];
        if (sd.jung[i]) c = [40, 90, 220];
      } else {
        if (ink[i]) c = [225, 225, 225];
        if (sd.shared[i]) c = [240, 220, 80];
        if (sd.vj[i]) c = [150, 180, 240];
        if (sd.choRaw[i]) c = [240, 150, 150];
      }
      img.data.set([...c, 255], p);
    }
  }
});
bctx.putImageData(img, 0, 0);
fs.writeFileSync(out, big.toBuffer("image/png"));
