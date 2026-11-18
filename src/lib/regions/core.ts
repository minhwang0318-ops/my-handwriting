// 기준 글자 자모 영역 계산의 순수 함수들 (빌드 스크립트와 테스트에서 공용).
// 마스크는 N×N Uint8Array (0/1), 라벨맵은 0=배경, 1=초성, 2=중성, 3=종성 (영문 등은 1=전체).

export type Mask = Uint8Array;

/** 정사각형(체비쇼프) 팽창. 가로/세로 분리 처리. */
export function dilate(mask: Mask, n: number, r: number): Mask {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(n * n);
  const out = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0;
      for (let dx = -r; dx <= r && !v; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < n && mask[y * n + xx]) v = 1;
      }
      tmp[y * n + x] = v;
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0;
      for (let dy = -r; dy <= r && !v; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < n && tmp[yy * n + x]) v = 1;
      }
      out[y * n + x] = v;
    }
  }
  return out;
}

/** 여러 마스크의 픽셀별 개수 */
export function countMap(masks: Mask[], n: number): Uint16Array {
  const c = new Uint16Array(n * n);
  for (const m of masks) for (let i = 0; i < c.length; i++) c[i] += m[i];
  return c;
}

export interface VoteMap {
  counts: Uint16Array;
  total: number;
}

/**
 * 대상 글자의 잉크 중 "공통 부분"에 해당하는 씨앗 픽셀.
 * 문턱값을 높은 것부터 시도해 최소 픽셀 수를 넘는 첫 결과를 쓴다.
 */
export function commonSeed(
  ink: Mask,
  vote: VoteMap,
  thresholds = [1.0, 0.9, 0.8, 0.65],
  minPixels = 12,
): Mask {
  let last = new Uint8Array(ink.length);
  for (const t of thresholds) {
    const need = Math.max(1, Math.ceil(t * vote.total));
    const seed = new Uint8Array(ink.length);
    let cnt = 0;
    for (let i = 0; i < ink.length; i++) {
      if (ink[i] && vote.counts[i] >= need) {
        seed[i] = 1;
        cnt++;
      }
    }
    last = seed;
    if (cnt >= minPixels) return seed;
  }
  return last;
}

/**
 * 잉크 픽셀마다 가장 가까운 씨앗의 라벨을 준다 (격자 위 다중 출발 BFS, 8방향).
 * seeds[k]는 라벨 k+1. 두 씨앗에 동시에 속한 픽셀은 씨앗에서 뺀다.
 * 단, preferred(0부터)가 주어지면 그 씨앗과 겹치는 픽셀은 그 씨앗 것으로 한다.
 * (모음 씨앗은 초성·받침을 모두 바꿔 얻으므로 깨끗하지만, 초성·받침 씨앗에는
 *  같은 배치 모음들이 공유하는 가로획이 섞여 들어올 수 있다.)
 * geodesic이면 거리를 잉크를 따라 잰다 (가로획 끝이 옆 자모의 다리 끝에 끌려가지 않게).
 */
export function assignNearest(ink: Mask, seeds: Mask[], n: number, preferred = -1, geodesic = false): Uint8Array {
  const label = new Uint8Array(n * n);
  const dist = new Int32Array(n * n).fill(-1);
  const queue = new Int32Array(n * n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n * n; i++) {
    let owner = 0;
    let multi = false;
    for (let k = 0; k < seeds.length; k++) {
      if (seeds[k][i]) {
        if (owner) multi = true;
        else owner = k + 1;
      }
    }
    if (multi && preferred >= 0 && seeds[preferred][i]) {
      owner = preferred + 1;
      multi = false;
    }
    if (owner && !multi) {
      label[i] = owner;
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  // geodesic: 먼저 잉크를 따라서만 퍼뜨리고(이어진 획은 같은 씨앗을 따라가게), 못 닿은 곳만 칸 전체로 퍼뜨린다
  if (geodesic) {
    while (head < tail) {
      const i = queue[head++];
      const x = i % n;
      const y = (i / n) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const j = yy * n + xx;
          if (dist[j] !== -1 || !ink[j]) continue;
          dist[j] = dist[i] + 1;
          label[j] = label[i];
          queue[tail++] = j;
        }
      }
    }
    head = 0;
    tail = 0;
    for (let i = 0; i < n * n; i++) if (dist[i] !== -1) queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % n;
    const y = (i / n) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const j = yy * n + xx;
        if (dist[j] !== -1) continue;
        dist[j] = dist[i] + 1;
        label[j] = label[i];
        queue[tail++] = j;
      }
    }
  }
  const out = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) if (ink[i]) out[i] = label[i];
  return out;
}

/** 라벨맵 런렝스 부호화: [값, 길이, 값, 길이, ...] */
export function rleEncode(labels: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < labels.length) {
    const v = labels[i];
    let j = i + 1;
    while (j < labels.length && labels[j] === v) j++;
    out.push(v, j - i);
    i = j;
  }
  return out;
}

export function rleDecode(rle: number[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let p = 0;
  for (let k = 0; k < rle.length; k += 2) {
    out.fill(rle[k], p, p + rle[k + 1]);
    p += rle[k + 1];
  }
  if (p !== size) throw new Error(`RLE size mismatch ${p} != ${size}`);
  return out;
}

/** 라벨 k의 경계 상자 [x0, y0, x1, y1] (x1, y1은 포함 안 함). 없으면 null */
export function labelBox(labels: Uint8Array, n: number, k: number): [number, number, number, number] | null {
  let x0 = n, y0 = n, x1 = -1, y1 = -1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (labels[y * n + x] === k) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

/**
 * 라벨 k의 "튼튼한" 경계 상자: x·y 각각 trim 비율만큼 양 끝 픽셀을 빼고 잡는다.
 * 잘못 칠해진 픽셀 몇 개 때문에 상자가 부풀지 않게 한다.
 */
export function robustLabelBox(labels: Uint8Array, n: number, k: number, trim = 0.03): [number, number, number, number] | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === k) {
      xs.push(i % n);
      ys.push((i / n) | 0);
    }
  }
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = (arr: number[], t: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(t * (arr.length - 1))))];
  return [q(xs, trim), q(ys, trim), q(xs, 1 - trim) + 1, q(ys, 1 - trim) + 1];
}

export function countLabel(labels: Uint8Array, k: number): number {
  let c = 0;
  for (let i = 0; i < labels.length; i++) if (labels[i] === k) c++;
  return c;
}

// ---- base64 (브라우저/Node 공용) ----
export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
