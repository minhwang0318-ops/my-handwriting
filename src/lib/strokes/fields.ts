// 거리 지도. 격자 n×n, 값은 격자 px 단위(근사 유클리드, 3-4 챔퍼).

const INF = 1e9;

/** mask가 1인 곳까지의 거리 */
export function distanceTransform(mask: Uint8Array, n: number): Float32Array {
  const d = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) d[i] = mask[i] ? 0 : INF;
  const a = 1;
  const b = Math.SQRT2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + a);
      if (y > 0) {
        v = Math.min(v, d[i - n] + a);
        if (x > 0) v = Math.min(v, d[i - n - 1] + b);
        if (x < n - 1) v = Math.min(v, d[i - n + 1] + b);
      }
      d[i] = v;
    }
  }
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      let v = d[i];
      if (x < n - 1) v = Math.min(v, d[i + 1] + a);
      if (y < n - 1) {
        v = Math.min(v, d[i + n] + a);
        if (x < n - 1) v = Math.min(v, d[i + n + 1] + b);
        if (x > 0) v = Math.min(v, d[i + n - 1] + b);
      }
      d[i] = v;
    }
  }
  return d;
}

/** 기준 글자 하나의 자모별 정보 */
export interface JamoFields {
  n: number;
  /** 존재하는 라벨 목록 (예: [1,2] 또는 [1,2,3]) */
  labels: number[];
  /** 라벨 → 그 자모의 기준 잉크 마스크 */
  masks: Map<number, Uint8Array>;
  /** 라벨 → 그 자모 기준 잉크까지의 거리 */
  dist: Map<number, Float32Array>;
}

export function buildJamoFields(labelMap: Uint8Array, n: number): JamoFields {
  const labels = Array.from(new Set(Array.from(labelMap).filter((v) => v > 0))).sort();
  const masks = new Map<number, Uint8Array>();
  const dist = new Map<number, Float32Array>();
  for (const k of labels) {
    const m = labelMap.map((v) => (v === k ? 1 : 0));
    masks.set(k, m);
    dist.set(k, distanceTransform(m, n));
  }
  return { n, labels, masks, dist };
}

/** 정규화 좌표(0..1)의 거리 지도 값. 칸 밖은 가장자리 값 + 바깥 거리 */
export function sampleField(field: Float32Array, n: number, x: number, y: number): number {
  const gx = x * n - 0.5;
  const gy = y * n - 0.5;
  const cx = Math.min(n - 1, Math.max(0, Math.round(gx)));
  const cy = Math.min(n - 1, Math.max(0, Math.round(gy)));
  const outside = Math.hypot(gx - cx, gy - cy);
  return field[cy * n + cx] + (outside > 0.5 ? outside : 0);
}
