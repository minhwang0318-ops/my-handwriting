import { describe, it, expect } from "vitest";
import {
  decompose, compose, layoutOf, jungIndex, choVariant, jungVariant, jongVariant,
  isSyllable, jungsOfLayout, CHO, JUNG, JONG,
} from "@/lib/hangul";
import { compositionSet, latinSet, frequentSet, allRegistrationChars } from "@/lib/hangul/charsets";

describe("decompose / compose", () => {
  it("분해 예시", () => {
    expect(decompose("가")).toEqual({ cho: 0, jung: 0, jong: 0 });
    expect(decompose("힣")).toEqual({ cho: 18, jung: 20, jong: 27 });
    const s = decompose("한")!;
    expect([CHO[s.cho], JUNG[s.jung], JONG[s.jong]]).toEqual(["ㅎ", "ㅏ", "ㄴ"]);
    const w = decompose("뷁")!;
    expect([CHO[w.cho], JUNG[w.jung], JONG[w.jong]]).toEqual(["ㅂ", "ㅞ", "ㄺ"]);
  });

  it("한글 음절이 아니면 null", () => {
    for (const c of ["A", "1", "ㄱ", "ㅏ", " ", ""]) expect(decompose(c)).toBeNull();
    expect(isSyllable("漢")).toBe(false);
  });

  it("11,172자 전부 왕복", () => {
    let n = 0;
    for (let code = 0xac00; code <= 0xd7a3; code++) {
      const ch = String.fromCodePoint(code);
      const s = decompose(ch)!;
      expect(compose(s.cho, s.jung, s.jong)).toBe(ch);
      n++;
    }
    expect(n).toBe(11172);
  });

  it("범위 밖 인덱스는 에러", () => {
    expect(() => compose(19, 0, 0)).toThrow();
    expect(() => compose(0, 21, 0)).toThrow();
    expect(() => compose(0, 0, 28)).toThrow();
  });
});

describe("배치 분류", () => {
  it("모음 21개가 3종으로 빠짐없이 나뉜다", () => {
    expect(jungsOfLayout("vertical").map((i) => JUNG[i]).join("")).toBe("ㅏㅐㅑㅒㅓㅔㅕㅖㅣ");
    expect(jungsOfLayout("horizontal").map((i) => JUNG[i]).join("")).toBe("ㅗㅛㅜㅠㅡ");
    expect(jungsOfLayout("mixed").map((i) => JUNG[i]).join("")).toBe("ㅘㅙㅚㅝㅞㅟㅢ");
  });

  it("변형 선택", () => {
    expect(layoutOf(jungIndex("ㅢ"))).toBe("mixed");
    expect(choVariant(decompose("각")!)).toBe("vertical-closed");
    expect(choVariant(decompose("고")!)).toBe("horizontal-open");
    expect(choVariant(decompose("광")!)).toBe("mixed-closed");
    expect(jungVariant(decompose("가")!)).toBe("open");
    expect(jungVariant(decompose("간")!)).toBe("closed");
    expect(jongVariant(decompose("가")!)).toBeNull();
    expect(jongVariant(decompose("곤")!)).toBe("underHorizontal");
    expect(jongVariant(decompose("간")!)).toBe("other");
    expect(jongVariant(decompose("관")!)).toBe("other");
  });
});

describe("등록 글자 목록", () => {
  it("조합용은 202자이고 모두 한글", () => {
    const s = compositionSet();
    expect(s.length).toBe(202);
    expect(new Set(s).size).toBe(202);
    expect(s.every(isSyllable)).toBe(true);
    for (const c of ["가", "간", "꼬", "환", "의", "읜", "앍", "옳", "앟"]) expect(s).toContain(c);
  });

  it("모든 자모가 조합용 글자 어딘가에 있다", () => {
    const parts = compositionSet().map((c) => decompose(c)!);
    for (let i = 0; i < 19; i++) expect(parts.some((p) => p.cho === i)).toBe(true);
    for (let i = 0; i < 21; i++) expect(parts.some((p) => p.jung === i)).toBe(true);
    for (let i = 1; i < 28; i++) expect(parts.some((p) => p.jong === i)).toBe(true);
  });

  it("초성 6벌 × 19, 중성 2벌 × 21, 종성 2벌 × 27이 모두 채워진다", () => {
    const parts = compositionSet().map((c) => decompose(c)!);
    const cho = new Set(parts.map((p) => `${p.cho}:${choVariant(p)}`));
    expect(cho.size).toBe(19 * 6);
    const jung = new Set(parts.map((p) => `${p.jung}:${jungVariant(p)}`));
    expect(jung.size).toBe(21 * 2);
    const jong = new Set(parts.filter((p) => p.jong).map((p) => `${p.jong}:${jongVariant(p)}`));
    expect(jong.size).toBe(27 * 2);
  });

  it("영문·숫자·기호 86자", () => {
    const s = latinSet();
    expect(s.length).toBe(86);
    expect(new Set(s).size).toBe(86);
  });

  it("자주 쓰는 한글은 약 200자, 조합용과 겹치지 않음", () => {
    const f = frequentSet();
    expect(f.length).toBeGreaterThan(170);
    expect(f.length).toBeLessThan(260);
    expect(f.every(isSyllable)).toBe(true);
    const comp = new Set(compositionSet());
    expect(f.some((c) => comp.has(c))).toBe(false);
    expect(new Set(allRegistrationChars()).size).toBe(allRegistrationChars().length);
  });
});
