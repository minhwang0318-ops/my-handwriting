// PWA 아이콘 생성. 실행: npx tsx scripts/build-icons.ts
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(__dirname, "..");
GlobalFonts.registerFromPath(path.join(ROOT, "public/fonts/NotoSansKR-Regular.ttf"), "RefFont");
const out = path.join(ROOT, "public/icons");
fs.mkdirSync(out, { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]] as const) {
  const cv = createCanvas(size, size);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#1c2040";
  ctx.font = `${size * 0.62}px RefFont`;
  const w = ctx.measureText("손").width;
  ctx.fillText("손", (size - w) / 2, size * 0.74);
  fs.writeFileSync(path.join(out, name), cv.toBuffer("image/png"));
}
console.log("icons written");
