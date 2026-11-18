// 자모 조합: 직접 쓴 글자에서 자모 획을 가져와 대상 글자의 기준 자모 상자에 맞춰 놓는다.
//  - 초성 6벌(배치 3종 × 받침 유무), 중성 2벌(받침 유무), 종성 2벌(가로형 모음 아래 / 그 외)
//  - 원래 글자의 기준 자모 상자 → 대상 글자의 기준 자모 상자로 옮긴다 (쓴 사람의 위치·크기 어긋남은 그대로 따라감)
//  - 가로세로 비율 변형은 ±35% 이내
import { decompose, choVariant, jungVariant, jongVariant, CHO, JUNG, JONG, type Syllable } from "@/lib/hangul";
import type { JamoStroke, Point, PointerKind, Sample } from "@/lib/strokes/types";

/** [x0, y0, x1, y1], em 기준 0..1 */
export type NBox = [number, number, number, number];
/** 글자의 기준 자모 상자 [초성, 중성, 종성] (없으면 null). 한글이 아니면 null */
export type BoxFn = (ch: string) => (NBox | null)[] | null;

export type Role = 1 | 2 | 3;
export const ROLE_NAME: Record<Role, string> = { 1: "초성", 2: "중성", 3: "종성" };

export interface JamoPiece {
  role: Role;
  /** 자모 번호 (초성 0..18, 중성 0..20, 종성 1..27) */
  letter: number;
  variant: string;
  sourceChar: string;
  sampleId: string;
  strokes: { points: Point[]; pointer: PointerKind }[];
  /** 원래 글자에서 이 자모의 기준 상자 */
  srcBox: NBox;
}

export function variantOf(role: Role, s: Syllable): string | null {
  if (role === 1) return choVariant(s);
  if (role === 2) return jungVariant(s);
  return jongVariant(s);
}

export function letterOf(role: Role, s: Syllable): number {
  return role === 1 ? s.cho : role === 2 ? s.jung : s.jong;
}

export function jamoName(role: Role, letter: number): string {
  return role === 1 ? CHO[letter] : role === 2 ? JUNG[letter] : JONG[letter];
}

/** role:letter → variant → 조각들 */
export type Inventory = Map<string, Map<string, JamoPiece[]>>;

/**
 * 직접 쓴 한글 벌들에서 자모 조각을 모은다.
 * exclude에 든 글자의 벌은 쓰지 않는다 (비교 화면에서 "자기 자신으로 조합"을 막기 위해).
 */
export function buildInventory(samples: Sample[], boxFn: BoxFn, exclude?: Set<string>): Inventory {
  const inv: Inventory = new Map();
  const sorted = [...samples].sort((a, b) => a.createdAt - b.createdAt);
  for (const sm of sorted) {
    if (exclude?.has(sm.char)) continue;
    const s = decompose(sm.char);
    const boxes = boxFn(sm.char);
    if (!s || !boxes) continue;
    for (const role of [1, 2, 3] as Role[]) {
      if (role === 3 && !s.jong) continue;
      const box = boxes[role - 1];
      const parts = sm.jamo.filter((j: JamoStroke) => j.label === role);
      if (!box || !parts.length) continue;
      const piece: JamoPiece = {
        role,
        letter: letterOf(role, s),
        variant: variantOf(role, s)!,
        sourceChar: sm.char,
        sampleId: sm.id,
        strokes: parts.map((j) => ({ points: j.points, pointer: sm.strokes[j.stroke]?.pointer ?? "mouse" })),
        srcBox: box,
      };
      const key = `${role}:${piece.letter}`;
      if (!inv.has(key)) inv.set(key, new Map());
      const byVar = inv.get(key)!;
      if (!byVar.has(piece.variant)) byVar.set(piece.variant, []);
      byVar.get(piece.variant)!.push(piece);
    }
  }
  return inv;
}

/** 원하는 벌이 없을 때 대신 쓸 벌의 순서 */
function fallbackOrder(role: Role, want: string, available: string[]): string[] {
  const score = (v: string) => {
    if (v === want) return 0;
    if (role === 1) {
      const [wl, wc] = want.split("-");
      const [vl, vc] = v.split("-");
      if (vl === wl) return 1; // 같은 배치, 받침 유무만 다름
      if (vc === wc) return 2; // 같은 받침 유무, 배치 다름
      return 3;
    }
    return 1;
  };
  return [...available].sort((a, b) => score(a) - score(b));
}

export interface ComposeOptions {
  /** 가로세로 비율 변형 한도 (0.35 = ±35%) */
  maxAspect: number;
  /** 후보가 여러 개일 때 몇 번째를 쓸지 (여러 벌 번갈아 쓰기) */
  pick: number;
}
export const DEFAULT_COMPOSE: ComposeOptions = { maxAspect: 0.35, pick: 0 };

export interface PieceUse {
  role: Role;
  jamo: string;
  sourceChar: string;
  sampleId: string;
  /** 원하는 벌(변형)을 그대로 썼는지 */
  exact: boolean;
  /** 비율 한도에 걸려 잘렸는지 */
  aspectClamped: boolean;
}

export interface Composed {
  sample: Sample;
  uses: PieceUse[];
}

/** 원래 상자 → 대상 상자 변환 (가운데 맞춤, 비율 변형 제한) */
export function boxTransform(src: NBox, dst: NBox, maxAspect: number) {
  const sw = Math.max(0.01, src[2] - src[0]);
  const sh = Math.max(0.01, src[3] - src[1]);
  const dw = Math.max(0.01, dst[2] - dst[0]);
  const dh = Math.max(0.01, dst[3] - dst[1]);
  let sx = dw / sw;
  let sy = dh / sh;
  const ratio = sx / sy;
  const lo = 1 - maxAspect;
  const hi = 1 + maxAspect;
  const clamped = ratio < lo || ratio > hi;
  if (clamped) {
    const g = Math.sqrt(sx * sy);
    const r = Math.min(hi, Math.max(lo, ratio));
    sx = g * Math.sqrt(r);
    sy = g / Math.sqrt(r);
  }
  const scx = (src[0] + src[2]) / 2;
  const scy = (src[1] + src[3]) / 2;
  const dcx = (dst[0] + dst[2]) / 2;
  const dcy = (dst[1] + dst[3]) / 2;
  return {
    sx,
    sy,
    clamped,
    apply: (p: Point): Point => ({ ...p, x: dcx + (p.x - scx) * sx, y: dcy + (p.y - scy) * sy }),
  };
}

/** 한글 한 글자를 조합한다. 필요한 자모 조각이 하나라도 없으면 null */
export function composeChar(ch: string, inv: Inventory, boxFn: BoxFn, opt: ComposeOptions = DEFAULT_COMPOSE): Composed | null {
  const s = decompose(ch);
  const boxes = boxFn(ch);
  if (!s || !boxes) return null;
  const roles: Role[] = s.jong ? [1, 2, 3] : [1, 2];
  const strokes: Sample["strokes"] = [];
  const jamo: JamoStroke[] = [];
  const uses: PieceUse[] = [];
  const ids: string[] = [];
  for (const role of roles) {
    const letter = letterOf(role, s);
    const byVar = inv.get(`${role}:${letter}`);
    const dst = boxes[role - 1];
    if (!byVar || !dst) return null;
    const want = variantOf(role, s)!;
    const order = fallbackOrder(role, want, [...byVar.keys()]);
    const variant = order[0];
    const cands = byVar.get(variant)!;
    const piece = cands[opt.pick % cands.length];
    const t = boxTransform(piece.srcBox, dst, opt.maxAspect);
    for (const st of piece.strokes) {
      const points = st.points.map(t.apply);
      jamo.push({ label: role, stroke: strokes.length, points });
      strokes.push({ points, pointer: st.pointer, start: 0 });
    }
    ids.push(piece.sampleId);
    uses.push({
      role,
      jamo: jamoName(role, letter),
      sourceChar: piece.sourceChar,
      sampleId: piece.sampleId,
      exact: variant === want,
      aspectClamped: t.clamped,
    });
  }
  return {
    sample: {
      id: `comp:${ch}:${ids.join("+")}`,
      char: ch,
      strokes,
      jamo,
      createdAt: 0,
      hasPressure: strokes.some((st) => st.pointer === "pen"),
    },
    uses,
  };
}

/** 같은 글자를 서로 다른 조각 조합으로 최대 n벌 */
export function composeVariants(ch: string, inv: Inventory, boxFn: BoxFn, n = 2, maxAspect = DEFAULT_COMPOSE.maxAspect): Composed[] {
  const out: Composed[] = [];
  const seen = new Set<string>();
  for (let pick = 0; pick < n * 2 && out.length < n; pick++) {
    const c = composeChar(ch, inv, boxFn, { maxAspect, pick });
    if (!c) break;
    if (seen.has(c.sample.id)) continue;
    seen.add(c.sample.id);
    out.push(c);
  }
  return out;
}
