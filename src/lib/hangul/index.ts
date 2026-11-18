// 한글 음절 분해/합성과 모음 배치 분류.
// code = 0xAC00 + (초성×21 + 중성)×28 + 종성

export const SYLLABLE_BASE = 0xac00;
export const SYLLABLE_LAST = 0xd7a3;

export const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

export const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ",
  "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
] as const;

// 0번은 받침 없음
export const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ",
  "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ",
  "ㅌ", "ㅍ", "ㅎ",
] as const;

export interface Syllable {
  cho: number; // 0..18
  jung: number; // 0..20
  jong: number; // 0..27 (0 = 없음)
}

export function isSyllable(ch: string): boolean {
  if (!ch) return false;
  const c = ch.codePointAt(0)!;
  return c >= SYLLABLE_BASE && c <= SYLLABLE_LAST;
}

export function decompose(ch: string): Syllable | null {
  if (!isSyllable(ch)) return null;
  const off = ch.codePointAt(0)! - SYLLABLE_BASE;
  return {
    cho: Math.floor(off / (21 * 28)),
    jung: Math.floor(off / 28) % 21,
    jong: off % 28,
  };
}

export function compose(cho: number, jung: number, jong = 0): string {
  if (!(cho >= 0 && cho < 19 && jung >= 0 && jung < 21 && jong >= 0 && jong < 28)) {
    throw new RangeError(`bad jamo index ${cho},${jung},${jong}`);
  }
  return String.fromCodePoint(SYLLABLE_BASE + (cho * 21 + jung) * 28 + jong);
}

export const choIndex = (j: string) => (CHO as readonly string[]).indexOf(j);
export const jungIndex = (j: string) => (JUNG as readonly string[]).indexOf(j);
export const jongIndex = (j: string) => (JONG as readonly string[]).indexOf(j);

/** 모음 배치 3종 */
export type Layout = "vertical" | "horizontal" | "mixed";

const VERTICAL = new Set(["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅣ"]);
const HORIZONTAL = new Set(["ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ"]);
const MIXED = new Set(["ㅘ", "ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ"]);

export function layoutOf(jung: number): Layout {
  const j = JUNG[jung];
  if (VERTICAL.has(j)) return "vertical";
  if (HORIZONTAL.has(j)) return "horizontal";
  if (MIXED.has(j)) return "mixed";
  throw new RangeError(`bad jung ${jung}`);
}

export const LAYOUTS: Layout[] = ["vertical", "horizontal", "mixed"];

export function jungsOfLayout(layout: Layout): number[] {
  return JUNG.map((_, i) => i).filter((i) => layoutOf(i) === layout);
}

/** 초성 6벌: 배치 3종 × 받침 유무 */
export type ChoVariant = `${Layout}-${"open" | "closed"}`;
export function choVariant(s: Syllable): ChoVariant {
  return `${layoutOf(s.jung)}-${s.jong ? "closed" : "open"}`;
}

/** 중성 2벌: 받침 유무 */
export type JungVariant = "open" | "closed";
export function jungVariant(s: Syllable): JungVariant {
  return s.jong ? "closed" : "open";
}

/** 종성 2벌: 가로형 모음 아래 / 그 외 */
export type JongVariant = "underHorizontal" | "other";
export function jongVariant(s: Syllable): JongVariant | null {
  if (!s.jong) return null;
  return layoutOf(s.jung) === "horizontal" ? "underHorizontal" : "other";
}

/** 자모 역할 */
export type JamoRole = "cho" | "jung" | "jong";
export const ROLES: JamoRole[] = ["cho", "jung", "jong"];

/** 문자열을 글자 단위(코드포인트)로 나눈다 */
export function chars(text: string): string[] {
  return Array.from(text);
}
