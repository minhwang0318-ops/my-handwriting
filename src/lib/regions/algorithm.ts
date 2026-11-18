/**
 * 기준 글자(Noto Sans KR)의 자모 영역 계산. 빌드 스크립트(Node)와 브라우저가 함께 쓴다.
 * 글자를 그리는 함수(render)만 바꿔 끼운다.
 *
 * 방법 (prototype의 base_parts 요지):
 *  - 같은 모음·받침에 초성만 바꾼 글자들의 공통 부분 → 모음+받침
 *  - 같은 초성·같은 배치의 글자들의 공통 부분 → 초성 (같은 배치 모음들이 공유하는 획은 뺌)
 *  - 받침은 기준 글꼴에서 맨 아래에 놓이므로 맨 아래 빈 줄 띠 또는 바닥의 획 덩어리로 고른다
 *    (손글씨에는 쓰지 않는 방법. 획이 깔끔하게 떨어진 기준 글꼴에서만 쓴다)
 *  - 대상 글자의 잉크 픽셀을 가장 가까운 씨앗에 배정
 */
import { compose, decompose, layoutOf, jungsOfLayout, jongIndex, JUNG, type Layout } from "@/lib/hangul";
import { dilate, commonSeed, assignNearest, type Mask, type VoteMap } from "./core";

export const DILATE = 2;
// 받침 있는 계열을 대표하는 받침 표본 (홑받침 + 겹받침 일부)
const SAMPLE_JONGS = ["ㄱ", "ㄴ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㄺ", "ㄶ"].map(jongIndex);
const jongSet = (closed: boolean) => (closed ? SAMPLE_JONGS : [0]);
const LEG_VOWELS = new Set<string>(["ㅜ", "ㅠ", "ㅝ", "ㅞ", "ㅟ"]);

export const sharedKey = (layout: Layout, closed: boolean) => `${layout}:${closed}`;

export interface RegionResult {
  labels: Uint8Array;
  emptySeeds: string[];
}

export class RegionComputer {
  private inkCache = new Map<string, Mask>();
  private dilCache = new Map<string, Mask>();
  private memo = new Map<string, VoteMap>();
  private sharedMemo = new Map<string, Mask>();
  private jongHeightMemo = new Map<string, number>();
  /** 받침 경계 빈 줄을 못 찾아 덩어리 규칙을 쓴 횟수 */
  splitFallbacks = 0;

  /**
   * @param render 글자 하나를 n×n 잉크 마스크로
   * @param shared 미리 계산한 "배치 공유 획" (없으면 직접 계산: 글자 1,500여 개를 그려야 해서 느림)
   */
  constructor(private render: (ch: string) => Mask, readonly n: number, shared?: Map<string, Mask>) {
    if (shared) for (const [k, v] of shared) this.sharedMemo.set(k, v);
  }

  ink(ch: string): Mask {
    let m = this.inkCache.get(ch);
    if (!m) this.inkCache.set(ch, (m = this.render(ch)));
    return m;
  }

  private dil(ch: string, r: number): Mask {
    const key = `${r}:${ch}`;
    let m = this.dilCache.get(key);
    if (!m) this.dilCache.set(key, (m = dilate(this.ink(ch), this.n, r)));
    return m;
  }

  private memoVote(key: string, make: () => string[], r = DILATE): VoteMap {
    key = `${key}:r${r}`;
    let v = this.memo.get(key);
    if (!v) {
      const chars = make();
      const counts = new Uint16Array(this.n * this.n);
      for (const c of chars) {
        const m = this.dil(c, r);
        for (let i = 0; i < counts.length; i++) counts[i] += m[i];
      }
      this.memo.set(key, (v = { counts, total: chars.length }));
    }
    return v;
  }

  /** 모음+받침: 같은 모음·받침에 초성만 바꾼 글자들 */
  private vjVote(jung: number, jong: number, r = DILATE) {
    return this.memoVote(`vj:${jung}:${jong}`, () => Array.from({ length: 19 }, (_, c) => compose(c, jung, jong)), r);
  }

  /** 초성: 같은 초성, 같은 배치, 같은 받침 유무, 모음(과 받침 종류)을 바꾼 글자들 */
  private choVote(cho: number, layout: Layout, closed: boolean, r = DILATE) {
    return this.memoVote(
      `cho:${cho}:${layout}:${closed}`,
      () => jungsOfLayout(layout).flatMap((v) => jongSet(closed).map((j) => compose(cho, v, j))),
      r,
    );
  }

  /** 같은 배치·받침 유무에서 초성과 모음을 모두 바꿔도 남는 획 (4px 허용, 85% 이상) */
  sharedStrokes(layout: Layout, closed: boolean): Mask {
    const key = sharedKey(layout, closed);
    let m = this.sharedMemo.get(key);
    if (m) return m;
    const v = this.memoVote(
      `shared:${key}`,
      () => Array.from({ length: 19 }, (_, c) => jungsOfLayout(layout).flatMap((j) => jongSet(closed).map((k) => compose(c, j, k)))).flat(),
      4,
    );
    const need = Math.ceil(0.85 * v.total);
    m = new Uint8Array(this.n * this.n).map((_, i) => (v.counts[i] >= need ? 1 : 0));
    this.sharedMemo.set(key, m);
    return m;
  }

  /**
   * 기준 글꼴에서 받침의 대략적인 높이(px). 종성 2벌(가로형 모음 아래 / 그 외)마다 대표 글자 하나로 잰다.
   *  - 그 외: "아"+받침. ㅇ과 ㅏ는 세로획 때문에 줄이 끊기지 않으므로 위에서 처음 만나는 빈 줄 아래가 받침.
   *  - 가로형 아래: "오"+받침. 가장 넓은 가로줄(ㅗ의 가로획) 아래 처음 만나는 빈 줄 아래가 받침.
   * 대표 글자에서 빈 줄을 못 찾아 터무니없이 작게 나오면(예: 안·앗) 같은 벌 받침들의 중앙값을 쓴다.
   */
  private jongHeight(jong: number, underHorizontal: boolean): number {
    const raw = this.jongHeightRaw(jong, underHorizontal);
    if (raw >= this.n * 0.18) return raw;
    const all: number[] = [];
    for (let j = 1; j < 28; j++) all.push(this.jongHeightRaw(j, underHorizontal));
    all.sort((a, b) => a - b);
    return all[all.length >> 1];
  }

  private jongHeightRaw(jong: number, underHorizontal: boolean): number {
    const N = this.n;
    const key = `${jong}:${underHorizontal}`;
    let h = this.jongHeightMemo.get(key);
    if (h !== undefined) return h;
    const m = this.ink(compose(11, underHorizontal ? 8 : 0, jong)); // ㅇ + ㅗ/ㅏ + 받침
    const rowCount = new Array<number>(N).fill(0);
    for (let i = 0; i < N * N; i++) if (m[i]) rowCount[(i / N) | 0]++;
    let first = rowCount.findIndex((c) => c > 0);
    const bottom = N - 1 - [...rowCount].reverse().findIndex((c) => c > 0);
    if (underHorizontal) {
      let best = first;
      for (let y = first; y < N * 0.75; y++) if (rowCount[y] > rowCount[best]) best = y;
      first = best;
    }
    let y = first;
    while (y < bottom && rowCount[y] > 0) y++;
    while (y < bottom && rowCount[y] === 0) y++;
    h = bottom - y + 1;
    this.jongHeightMemo.set(key, h);
    return h;
  }

  /**
   * 받침 픽셀.
   * 1) 아래에서부터 빈 줄 띠를 찾아, 그 아래 잉크 높이가 받침 높이의 0.7~1.5배인 첫 띠 아래를 받침으로 한다
   *    (ㅎ·ㅊ 받침 안쪽의 작은 틈은 높이가 모자라 건너뛴다).
   * 2) ㅜ·ㅠ·ㅝ·ㅞ·ㅟ처럼 다리가 받침과 같은 높이까지 내려오는(때로는 닿는) 모음은 바닥에서 받침 높이만큼을 자른다.
   * 3) 그 밖에 띠가 없으면 8방향 연결 덩어리 중 바닥에서 받침 높이 1.2배 안에 통째로 들어오는 덩어리를 받침으로 한다.
   */
  private jongMask(m: Mask, jong: number, underHorizontal: boolean, legVowel: boolean): Mask {
    const N = this.n;
    const rowHas = new Uint8Array(N);
    let bottom = -1;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (m[y * N + x]) {
          rowHas[y] = 1;
          break;
        }
      }
      if (rowHas[y]) bottom = y;
    }
    const h = this.jongHeight(jong, underHorizontal);
    const out = new Uint8Array(N * N);
    for (let y = bottom; y > N * 0.3 && !legVowel; y--) {
      if (!rowHas[y] && rowHas[y + 1]) {
        const below = bottom - y;
        if (below > 1.5 * h) break;
        if (below >= 0.7 * h) {
          for (let i = (y + 1) * N; i < N * N; i++) out[i] = m[i];
          return out;
        }
      }
    }
    if (legVowel) {
      const cut = Math.round(bottom - h + 1);
      for (let i = cut * N; i < N * N; i++) out[i] = m[i];
      return out;
    }
    this.splitFallbacks++;
    const comp = components(m, N);
    const top = new Map<number, number>();
    for (let i = 0; i < N * N; i++) {
      if (!comp[i]) continue;
      const y = (i / N) | 0;
      if (!top.has(comp[i]) || y < top.get(comp[i])!) top.set(comp[i], y);
    }
    const limit = bottom - 1.2 * h;
    for (let i = 0; i < N * N; i++) if (comp[i] && top.get(comp[i])! >= limit) out[i] = 1;
    return out;
  }

  hangulLabels(ch: string, debug = false): RegionResult & { debug?: unknown } {
    const N = this.n;
    const s = decompose(ch)!;
    const layout = layoutOf(s.jung);
    const closed = s.jong > 0;
    const m = this.ink(ch);
    const jongPx = closed ? this.jongMask(m, s.jong, layout === "horizontal", LEG_VOWELS.has(JUNG[s.jung])) : new Uint8Array(N * N);
    const above = (i: number) => !jongPx[i];
    // 초성 높이에 따라 모음 위치가 몇 px씩 움직이므로(예: 는, 을의 ㅡ) 모음+받침 공통 부분은 4px 허용 폭으로 찾는다.
    // 섞임형은 초성 자리가 좁아 4px 허용이면 모든 초성이 그 자리를 덮으므로 2px로 먼저 찾는다
    let vj = layout === "mixed" ? commonSeed(m, this.vjVote(s.jung, s.jong, 2), [1.0]) : new Uint8Array(N * N);
    if (vj.reduce((a, v) => a + v, 0) < 40) vj = commonSeed(m, this.vjVote(s.jung, s.jong, 4), [1.0, 0.95, 0.9]);
    // 초성 공통 부분에서 "배치 공유 획"(가로형의 ㅡ, 세로형의 세로획)을 뺀다.
    // (4px 허용 폭도 시도했으나 고·국처럼 가로획이 초성으로 칠해지는 글자가 생겨 2px 유지)
    // 섞임형은 모음 7개에 따라 초성 모양이 많이 달라 2px로는 씨앗이 너무 작다 → 4px 허용
    const choRaw =
      layout === "mixed"
        ? commonSeed(m, this.choVote(s.cho, layout, closed, 4), [1.0, 0.95, 0.9])
        : commonSeed(m, this.choVote(s.cho, layout, closed));
    const shared = this.sharedStrokes(layout, closed);
    // (19개 초성 모두에 공통인 모음+받침 획을 더 빼 보았으나, 섞임형(관·왜)에서는 초성 자리까지 지워져서 쓰지 않는다.
    //  주·수의 가로획 끝 문제는 아래 덩어리 정리로 푼다)
    // 섞임형은 초성 자리가 좁아 모든 초성이 겹치므로 "공유 획"이 초성 자리까지 덮는다.
    // 그래서 공유 획 중 모음+받침 공통 부분(vj)과도 겹치는 곳만 뺀다.
    const cho = choRaw.map((v, i) => (v && !(shared[i] && vj[i]) && above(i) ? 1 : 0));
    // 모음 씨앗(4px 허용)에 ㅇ 테두리 같은 초성 획이 묻어 들어오면 초성 쪽을 우선한다
    const choNear = dilate(cho, N, 1);
    const jung = vj.map((v, i) => (v && !choNear[i] && above(i) ? 1 : 0));
    const upper = m.map((v, i) => (v && above(i) ? 1 : 0));
    const before = debug ? seedStats(upper, [cho, jung], N) : null;
    cleanStraySeeds(upper, [cho, jung], N, 0.3);
    // (떠돌이 정리 뒤에 넣는다: 가로획은 초성에 붙어 있어 떠돌이로 지워지기 쉽다)
    // 섞임형: 초성은 좁으므로, 칸 너비 52% 이상 이어지는 가로 줄은 모음(ㅗ·ㅜ·ㅡ)의 가로획으로 본다.
    // 이 가로획은 초성마다 높이가 조금씩 달라 공통 부분으로 잡히지 않고, 초성에 붙어 있어 초성 색으로 번지기 쉽다.
    if (layout === "mixed") {
      for (let y = 0; y < N; y++) {
        let x = 0;
        while (x < N) {
          if (!upper[y * N + x]) {
            x++;
            continue;
          }
          let e = x;
          while (e < N && upper[y * N + e]) e++;
          if (e - x >= 0.52 * N) {
            for (let k = x; k < e; k++) {
              jung[y * N + k] = 1;
              cho[y * N + k] = 0;
            }
          }
          x = e;
        }
      }
    }
    const after = debug ? seedStats(upper, [cho, jung], N) : null;
    const labels = assignNearest(upper, [cho, jung], N, -1, true);
    for (let i = 0; i < N * N; i++) if (jongPx[i]) labels[i] = 3;
    const emptySeeds: string[] = [];
    if (!cho.some((v) => v)) emptySeeds.push("cho");
    if (!jung.some((v) => v)) emptySeeds.push("jung");
    return debug ? { labels, emptySeeds, debug: { before, after, seeds: { cho, jung, choRaw, vj, shared } } } : { labels, emptySeeds };
  }

  /** 한글이면 자모 라벨, 아니면 잉크 전체 = 1 */
  labels(ch: string): Uint8Array {
    return decompose(ch) ? this.hangulLabels(ch).labels : this.ink(ch).slice();
  }
}

function seedStats(ink: Mask, seeds: Mask[], N: number) {
  const comp = components(ink, N);
  const out: Record<number, number[]> = {};
  for (let i = 0; i < N * N; i++) {
    if (!comp[i]) continue;
    out[comp[i]] ??= [0, ...seeds.map(() => 0)];
    out[comp[i]][0]++;
    seeds.forEach((sd, k) => sd[i] && out[comp[i]][k + 1]++);
  }
  return out; // 덩어리 번호 → [픽셀 수, 초성 씨앗, 모음 씨앗]
}

/**
 * 떠돌이 씨앗 정리: 두 자모 이상의 씨앗이 섞인 덩어리에서, 어떤 자모의 씨앗 중 이 덩어리에 있는 것이
 * 그 자모 전체 씨앗의 strayShare 미만이면 묻어 들어온 것으로 보고 지운다 (seeds를 직접 고침).
 * 예: 주·웨의 ㅜ 가로획에 묻은 초성 씨앗, 위의 ㅇ 테두리에 묻은 모음 씨앗.
 * 반대로 관처럼 초성이 모음에 붙어 한 덩어리여도, 초성 씨앗 대부분이 거기 있으면 남긴다.
 */
export function cleanStraySeeds(ink: Mask, seeds: Mask[], N: number, strayShare: number) {
  const comp = components(ink, N);
  const counts = new Map<number, number[]>();
  for (let i = 0; i < N * N; i++) {
    if (!comp[i]) continue;
    let c = counts.get(comp[i]);
    if (!c) counts.set(comp[i], (c = seeds.map(() => 0)));
    seeds.forEach((sd, k) => sd[i] && c![k]++);
  }
  const totals = seeds.map(() => 0);
  for (const c of counts.values()) c.forEach((v, k) => (totals[k] += v));
  const drop = new Map<number, Set<number>>();
  for (const [id, c] of counts) {
    const present = c.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
    if (present.length < 2) continue;
    const stray = present.filter((k) => c[k] < strayShare * totals[k]);
    if (stray.length === present.length) continue; // 전부 떠돌이면 아무것도 안 지운다
    if (stray.length) drop.set(id, new Set(stray));
  }
  for (let i = 0; i < N * N; i++) {
    const d = comp[i] ? drop.get(comp[i]) : undefined;
    if (d) for (const k of d) seeds[k][i] = 0;
  }
}

/** 8방향 연결 덩어리 번호 (0 = 배경) */
export function components(m: Mask, N: number): Int32Array {
  const id = new Int32Array(N * N);
  const stack: number[] = [];
  let next = 0;
  for (let i = 0; i < N * N; i++) {
    if (!m[i] || id[i]) continue;
    id[i] = ++next;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % N;
      const y = (p / N) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          const q = yy * N + xx;
          if (m[q] && !id[q]) {
            id[q] = next;
            stack.push(q);
          }
        }
      }
    }
  }
  return id;
}

export const ALL_LAYOUTS: Layout[] = ["vertical", "horizontal", "mixed"];
