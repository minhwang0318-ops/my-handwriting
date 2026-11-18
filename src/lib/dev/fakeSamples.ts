// 개발용 시험 데이터: 좌표로 만든 단순한 획 (진짜 손글씨 아님). 변환·내보내기 동작 확인에만 쓴다.
import type { Sample } from "@/lib/strokes/types";

export function fakeSamples(): Sample[] {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
  const g = () => { const u = rnd() || 1e-9; const v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  type P = [number, number];
  const L = (...pts: P[]) => pts;
  const ell = (cx: number, cy: number, rx: number, ry: number): P[] =>
    Array.from({ length: 25 }, (_, i) => [cx + rx * Math.cos(-Math.PI / 2 + (i / 24) * 2 * Math.PI * 1.03), cy + ry * Math.sin(-Math.PI / 2 + (i / 24) * 2 * Math.PI * 1.03)]);
  const giyeok = [L([0.12, 0.26], [0.48, 0.24], [0.42, 0.58], [0.16, 0.84])];
  const A = [L([0.72, 0.1], [0.73, 0.92]), L([0.73, 0.5], [0.89, 0.49])];
  const D: Record<string, P[][]> = {
    가: [...giyeok, ...A],
    나: [L([0.16, 0.2], [0.15, 0.75], [0.56, 0.74]), ...A],
    다: [L([0.5, 0.22], [0.15, 0.23]), L([0.15, 0.23], [0.15, 0.75], [0.56, 0.74]), ...A],
    라: [L([0.12, 0.2], [0.48, 0.2], [0.47, 0.47], [0.16, 0.48], [0.15, 0.76], [0.56, 0.75]), ...A],
    마: [L([0.15, 0.22], [0.16, 0.75]), L([0.15, 0.22], [0.5, 0.21], [0.5, 0.75]), L([0.16, 0.75], [0.5, 0.75]), ...A],
    아: [ell(0.33, 0.5, 0.17, 0.22), ...A],
    이: [ell(0.33, 0.5, 0.17, 0.22), L([0.72, 0.1], [0.73, 0.92])],
    고: [L([0.25, 0.2], [0.75, 0.2], [0.72, 0.5]), L([0.5, 0.52], [0.5, 0.72]), L([0.12, 0.75], [0.88, 0.74])],
    ".": [L([0.3, 0.84], [0.31, 0.86])],
  };
  const densify = (poly: P[]) => {
    const out: P[] = [];
    for (let i = 1; i < poly.length; i++) {
      const [a, b] = [poly[i - 1], poly[i]];
      const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.02));
      for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    out.push(poly[poly.length - 1]);
    return out;
  };
  const samples: Sample[] = [];
  for (const [ch, strokes] of Object.entries(D)) {
    for (let v = 0; v < 2; v++) {
      const pen = v === 1;
      const dx = g() * 0.015, dy = g() * 0.015, sc = 1 + g() * 0.04;
      let t = 0;
      const st = strokes.map((poly) => {
        const pts = densify(poly);
        const ph = rnd() * 6;
        const amp = 0.006 + rnd() * 0.006;
        const n = pts.length;
        const points = pts.map(([x, y], i) => ({
          x: 0.5 + (x - 0.5) * sc + dx + amp * Math.sin(ph + i * 0.35),
          y: 0.5 + (y - 0.5) * sc + dy + amp * Math.cos(ph + i * 0.3),
          p: pen ? Math.min(1, 0.25 + 0.7 * Math.sin(Math.PI * Math.min(1, (i + 1) / n))) : 0.5,
          t: i * 12,
        }));
        const s = { points, pointer: (pen ? "pen" : "mouse") as "pen" | "mouse", start: t };
        t += n * 12 + 200;
        return s;
      });
      samples.push({ id: `test-${ch}-${v}`, char: ch, strokes: st, jamo: [], createdAt: samples.length, hasPressure: pen });
    }
  }
  return samples;
}
