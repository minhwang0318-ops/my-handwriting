// 등록할 글자 목록
import { compose, choIndex, jungIndex, jongIndex, JONG } from "./index";

function uniq(list: string[]): string[] {
  return Array.from(new Set(list));
}

/** 1. 조합용 202자 (필수) */
export function compositionSet(): string[] {
  const out: string[] = [];
  const jongN = jongIndex("ㄴ");
  // 초성 19 × 모음 ㅏ, ㅗ, ㅘ × 받침 없음/ㄴ = 114
  for (const v of ["ㅏ", "ㅗ", "ㅘ"]) {
    for (let c = 0; c < 19; c++) {
      out.push(compose(c, jungIndex(v), 0));
      out.push(compose(c, jungIndex(v), jongN));
    }
  }
  // ㅇ + 모음 21 × 받침 없음/ㄴ = 42 (중복 제외)
  const o = choIndex("ㅇ");
  for (let v = 0; v < 21; v++) {
    out.push(compose(o, v, 0));
    out.push(compose(o, v, jongN));
  }
  // 아/오 + 받침 27 = 54 (중복 제외)
  for (const v of ["ㅏ", "ㅗ"]) {
    for (let j = 1; j < JONG.length; j++) out.push(compose(o, jungIndex(v), j));
  }
  return uniq(out);
}

/** 2. 영문 대소문자, 숫자, 기호 (86자) */
export const LATIN_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const LATIN_LOWER = "abcdefghijklmnopqrstuvwxyz";
export const DIGITS = "0123456789";
export const SYMBOLS = ".,!?'\"()-:;/~@#%&*+=[]<>";

export function latinSet(): string[] {
  return Array.from(LATIN_UPPER + LATIN_LOWER + DIGITS + SYMBOLS);
}

/** 3. 자주 쓰는 한글 (선택, 품질용). 조합용 202자와 겹치는 글자는 뺀다. */
const FREQUENT_RAW =
  "이다는의에하고을가지서한로기도를리사어대수자시일정국그인있들적" +
  "게주것부상제전보해라거니마요원장위성면방경여구비우세여제간관화개" +
  "공동되었나내우통문중때생학부터만히등년말음미분소식실작해야지요죠" +
  "네데까께며서야와과으며든던려도록까지했겠습니다니까세요어요해요에서" +
  "께서처럼보다같이라고이라며하며면서려고러도록듯재조차밖뿐마저부디" +
  "너무정말많이좋아싫어사랑행복감사미안축하생일선물편지친구가족엄빠" +
  "언니누나형동생오늘내일어제아침저녁밤시간주말월화수목금토학교회사" +
  "선생님공부숙제시험결과발표준비연락전화문자메일사진영화음악노래책" +
  "읽쓰듣말걷뛰먹마시자일놀웃울기쁘슬프화나걱정건강몸마음생각기억꿈" +
  "희망믿함께혼자우리너나저당신모두누구무엇어디언제왜어떻게얼마" +
  "했던할될된될을를줄알았없겠더라렇럼번째새된진짜계속다시항상벌써" +
  "아직조금많은작은큰높낮길짧빨리천천히열심히잘못된맞틀린것들처음" +
  "끝마지막중요필요문제해결방법이유결정경험발전변화사람세상나라도시";

export function frequentSet(): string[] {
  const comp = new Set(compositionSet());
  return uniq(Array.from(FREQUENT_RAW)).filter((c) => !comp.has(c));
}

export function allRegistrationChars(): string[] {
  return uniq([...compositionSet(), ...latinSet(), ...frequentSet()]);
}
