// 시드 고정 난수. 같은 글·같은 시드면 항상 같은 결과가 나온다.

export type Rng = () => number;

/** mulberry32 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열 → 32비트 시드 */
export function hashSeed(s: string, salt = 0): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** 표준정규 (Box–Muller) */
export function gauss(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 절단 표준정규 (|z| ≤ limit) */
export function gaussClamped(rng: Rng, limit = 2.5): number {
  for (let i = 0; i < 8; i++) {
    const z = gauss(rng);
    if (Math.abs(z) <= limit) return z;
  }
  return 0;
}

/**
 * AR(1): x_t = corr·x_{t-1} + sqrt(1-corr²)·sd·z.
 * 정상 분포의 표준편차가 sd가 되도록 잡는다. 첫 값은 정상 분포에서 뽑는다.
 */
export class AR1 {
  private x: number | null = null;
  constructor(private sd: number, private corr: number, private rng: Rng) {}
  next(): number {
    const z = gaussClamped(this.rng);
    if (this.x === null) this.x = this.sd * z;
    else this.x = this.corr * this.x + Math.sqrt(1 - this.corr * this.corr) * this.sd * z;
    return this.x;
  }
  reset() {
    this.x = null;
  }
}
