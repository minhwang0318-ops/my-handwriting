/**
 * 개발용 시험 데이터: 기준 글꼴의 자모 영역을 가늘게 깎은 "뼈대"를 획으로 바꾼다.
 * 진짜 손글씨가 아니다. 자모 조합 위치 계산과 비교 화면이 동작하는지 보는 데만 쓴다.
 * (글꼴 뼈대에 떨림을 입혀 손글씨처럼 쓰는 방식은 제품 기능으로 쓰지 않는다 — 요청서의 "안 된 방법" 2번)
 *
 * 자모마다 위치·크기를 조금씩 비틀어서(사람이 기준과 다르게 쓰는 것을 흉내),
 * 직접 쓴 글자와 조합 글자가 같은 모양이 되지 않게 한다.
 *
 * 실행: npx tsx scripts/dev/build-skeleton-samples.ts  → public/dev/skeleton-samples.json
 */
import fs from "node:fs";
import path from "node:path";
import { rleDecode } from "../../src/lib/regions/core";
import { buildJamoFields } from "../../src/lib/strokes/fields";
import { assignStrokes } from "../../src/lib/strokes/assign";
import { validate } from "../../src/lib/strokes/validate";
import { allRegistrationChars } from "../../src/lib/hangul/charsets";
import { makeRng, gaussClamped } from "../../src/lib/style/random";
import type { JamoMasksFile } from "../../src/lib/regions/types";
import type { Sample, Stroke } from "../../src/lib/strokes/types";

const ROOT = path.resolve(__dirname, "../..");
const masks: JamoMasksFile = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/jamo-masks.json"), "utf8"));
const N = masks.frame.size;

/** Zhang–Suen 세선화 */
function thin(src: Uint8Array): Uint8Array {
  const m = src.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : m[y * N + x]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const del: number[] = [];
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (!m[y * N + x]) continue;
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const b = p.reduce((a, v) => a + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) a++;
          if (a !== 1) continue;
          if (step === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          del.push(y * N + x);
        }
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

/** 뼈대 픽셀 → 폴리라인들 (끝점에서 시작해 이웃을 따라감) */
function trace(sk: Uint8Array): [number, number][][] {
  const seen = new Uint8Array(N * N);
  const nb = (i: number) => {
    const x = i % N;
    const y = (i / N) | 0;
    const out: number[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && sk[yy * N + xx]) out.push(yy * N + xx);
    }
    return out;
  };
  const lines: [number, number][][] = [];
  const startOrder = [...Array(N * N).keys()].filter((i) => sk[i]).sort((a, b) => nb(a).length - nb(b).length);
  for (const s of startOrder) {
    if (seen[s]) continue;
    const line: [number, number][] = [];
    let cur = s;
    while (cur >= 0) {
      seen[cur] = 1;
      line.push([(cur % N) + 0.5, ((cur / N) | 0) + 0.5]);
      cur = nb(cur).find((j) => !seen[j]) ?? -1;
    }
    if (line.length >= 1) lines.push(line);
  }
  return lines;
}

const rng = makeRng(20261117);
const out: Sample[] = [];
let failed = 0;
for (const ch of allRegistrationChars()) {
  const rle = masks.chars[ch];
  if (!rle) continue;
  const labels = rleDecode(rle, N * N);
  const fields = buildJamoFields(labels, N);
  const strokes: Stroke[] = [];
  for (const k of fields.labels) {
    // 자모마다 사람처럼 조금 비켜 쓰기
    const dx = gaussClamped(rng) * 0.012;
    const dy = gaussClamped(rng) * 0.012;
    const sc = 1 + gaussClamped(rng) * 0.05;
    const mask = fields.masks.get(k)!;
    let cx = 0, cy = 0, cnt = 0;
    for (let i = 0; i < N * N; i++) {
      if (mask[i]) {
        cx += i % N;
        cy += (i / N) | 0;
        cnt++;
      }
    }
    cx /= cnt;
    cy /= cnt;
    const lines = trace(thin(mask));
    if (!lines.length) lines.push([[cx + 0.5, cy + 0.5]]); // 작은 점은 세선화하면 사라지므로 중심 한 점으로
    for (const line of lines) {
      const pts = line.filter((_, i) => i % 2 === 0 || i === line.length - 1);
      strokes.push({
        pointer: "mouse",
        start: 0,
        points: pts.map(([x, y], i) => ({
          x: Math.round(((cx + (x - cx) * sc) / N + dx) * 1e4) / 1e4,
          y: Math.round(((cy + (y - cy) * sc) / N + dy) * 1e4) / 1e4,
          p: 0.5,
          t: i * 8,
        })),
      });
    }
  }
  const jamo = assignStrokes(fields, strokes);
  if (!validate(fields, jamo).pass) {
    failed++;
    console.log(`검증 탈락: ${ch}`);
  }
  out.push({ id: `test-skel-${ch}`, char: ch, strokes, jamo, createdAt: out.length, hasPressure: false });
}
fs.mkdirSync(path.join(ROOT, "public/dev"), { recursive: true });
const file = path.join(ROOT, "public/dev/skeleton-samples.json");
fs.writeFileSync(file, JSON.stringify(out));
console.log(`${out.length}자, 검증 탈락 ${failed}자, ${(fs.statSync(file).size / 1e6).toFixed(1)}MB`);
