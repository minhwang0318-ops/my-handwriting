// 자모별 느슨한 검증. 획 모양·기울기·굵기는 보지 않는다.
import { distanceTransform, sampleField, type JamoFields } from "./fields";
import type { JamoStroke, Point } from "./types";

export interface ValidateConfig {
  /** 허용 띠 폭 (칸 너비 대비) */
  bandWidth: number;
  /** 자모 획 길이 중 자기 띠 안에 있어야 하는 비율 */
  minInBand: number;
  /** 기준 자모 중 획이 지나가야 하는 비율 */
  minCoverage: number;
  /** "지나간다"로 볼 획과 기준 픽셀 사이 거리 (칸 너비 대비) */
  coverRadius: number;
  /** 칸 밖 허용 여유 (칸 너비 대비). 이보다 더 나가면 탈락 */
  outsideMargin: number;
}

export const DEFAULT_VALIDATE: ValidateConfig = {
  bandWidth: 0.1,
  minInBand: 0.6,
  minCoverage: 0.5,
  coverRadius: 0.1,
  outsideMargin: 0.02,
};

/** 저장된 검증 설정을 기본값과 합친다 */
export function mergeValidate(saved: unknown): ValidateConfig {
  const out = { ...DEFAULT_VALIDATE };
  if (saved && typeof saved === "object") {
    for (const k of Object.keys(out) as (keyof ValidateConfig)[]) {
      const v = (saved as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}

export const VALIDATE_FIELDS: { key: keyof ValidateConfig; label: string; min: number; max: number; step: number; hint: string }[] = [
  { key: "bandWidth", label: "허용 띠 폭 (칸 대비)", min: 0.03, max: 0.25, step: 0.01, hint: "기준 자모 둘레 띠의 폭" },
  { key: "minInBand", label: "띠 안 비율 최소", min: 0.2, max: 0.95, step: 0.05, hint: "자모 획 길이 중 띠 안에 있어야 하는 비율" },
  { key: "minCoverage", label: "덮임 비율 최소", min: 0.1, max: 0.9, step: 0.05, hint: "기준 자모 중 획이 지나가야 하는 비율" },
  { key: "coverRadius", label: "덮임 거리 (칸 대비)", min: 0.03, max: 0.25, step: 0.01, hint: "이 거리 안을 지나면 덮었다고 봄" },
  { key: "outsideMargin", label: "칸 밖 여유 (칸 대비)", min: 0, max: 0.1, step: 0.005, hint: "이보다 더 나가면 탈락" },
];

export type JamoStatus = "pass" | "missing" | "offBand" | "lowCoverage";

export interface JamoResult {
  label: number;
  status: JamoStatus;
  /** 띠 안 비율 0..1 */
  inBand: number;
  /** 기준 자모를 지나간 비율 0..1 */
  coverage: number;
  /** 배정된 획 길이 (칸 너비 대비) */
  length: number;
}

export interface ValidationResult {
  pass: boolean;
  outside: boolean;
  jamo: JamoResult[];
}

/** 점 사이를 촘촘하게 채운다 (격자 px 0.5 간격) */
function densify(points: Point[], n: number): { x: number; y: number; w: number }[] {
  const out: { x: number; y: number; w: number }[] = [];
  if (points.length === 1) return [{ x: points[0].x, y: points[0].y, w: 1 / n }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len * n * 2));
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: len / steps });
    }
  }
  return out;
}

export function validate(f: JamoFields, jamo: JamoStroke[], cfg = DEFAULT_VALIDATE): ValidationResult {
  const n = f.n;
  const band = cfg.bandWidth * n;
  const cover = cfg.coverRadius * n;
  const m = cfg.outsideMargin;
  const outside = jamo.some((js) => js.points.some((p) => p.x < -m || p.y < -m || p.x > 1 + m || p.y > 1 + m));

  const results: JamoResult[] = f.labels.map((label) => {
    const pieces = jamo.filter((j) => j.label === label);
    const dense = pieces.flatMap((j) => densify(j.points, n));
    const length = dense.reduce((a, d) => a + d.w, 0);
    // 획이 하나도 배정되지 않았을 때만 "빠짐". 마침표처럼 톡 찍은 점도 획으로 친다.
    if (!pieces.length) return { label, status: "missing", inBand: 0, coverage: 0, length };

    const dist = f.dist.get(label)!;
    let inLen = 0;
    for (const d of dense) if (sampleField(dist, n, d.x, d.y) <= band) inLen += d.w;
    const inBand = inLen / length;

    // 사용자 획에서의 거리 지도로 기준 자모 덮임 비율
    const userMask = new Uint8Array(n * n);
    for (const d of dense) {
      const gx = Math.floor(d.x * n);
      const gy = Math.floor(d.y * n);
      if (gx >= 0 && gy >= 0 && gx < n && gy < n) userMask[gy * n + gx] = 1;
    }
    const userDist = distanceTransform(userMask, n);
    const ref = f.masks.get(label)!;
    let refCount = 0;
    let covered = 0;
    for (let i = 0; i < n * n; i++) {
      if (!ref[i]) continue;
      refCount++;
      if (userDist[i] <= cover) covered++;
    }
    const coverage = refCount ? covered / refCount : 0;

    const status: JamoStatus =
      inBand < cfg.minInBand ? "offBand" : coverage < cfg.minCoverage ? "lowCoverage" : "pass";
    return { label, status, inBand, coverage, length };
  });

  return { pass: !outside && results.every((r) => r.status === "pass"), outside, jamo: results };
}

export const LABEL_NAMES: Record<number, string> = { 1: "초성", 2: "모음", 3: "받침" };

export function describeFailure(r: ValidationResult, hangul: boolean): string[] {
  const out: string[] = [];
  if (r.outside) out.push("칸 밖으로 나갔어요");
  for (const j of r.jamo) {
    const name = hangul ? LABEL_NAMES[j.label] : "글자";
    const subj = hangul ? `${name}이` : "글자가"; // 초성·모음·받침은 모두 받침 있는 낱말
    if (j.status === "missing") out.push(`${subj} 빠졌어요`);
    else if (j.status === "offBand") out.push(`${name} 위치가 많이 벗어났어요 (띠 안 ${Math.round(j.inBand * 100)}%)`);
    else if (j.status === "lowCoverage") out.push(`${name} 크기가 기준과 많이 달라요 (덮은 비율 ${Math.round(j.coverage * 100)}%)`);
  }
  return out;
}
