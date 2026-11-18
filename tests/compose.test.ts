import { describe, it, expect } from "vitest";
import { decompose, layoutOf } from "@/lib/hangul";
import { compositionSet } from "@/lib/hangul/charsets";
import {
  buildInventory, composeChar, composeVariants, boxTransform, type BoxFn, type NBox,
} from "@/lib/compose/compose";
import type { Sample, JamoStroke } from "@/lib/strokes/types";

/**
 * 가짜 기준 상자: 배치·받침 유무에 따라 다른 자리
 *  세로형: 초성 왼쪽, 중성 오른쪽 / 가로형: 초성 위, 중성 아래 / 섞임형: 초성 왼쪽 위, 중성 ㄱ자
 *  받침 있으면 위쪽 둘을 위로 압축, 받침은 아래
 */
const boxFn: BoxFn = (ch) => {
  const s = decompose(ch);
  if (!s) return null;
  const top = 0.08;
  const bottom = s.jong ? 0.6 : 0.92;
  const lay = layoutOf(s.jung);
  let cho: NBox, jung: NBox;
  if (lay === "vertical") {
    cho = [0.1, top, 0.55, bottom];
    jung = [0.62, top, 0.9, bottom];
  } else if (lay === "horizontal") {
    const mid = top + (bottom - top) * 0.55;
    cho = [0.25, top, 0.75, mid];
    jung = [0.1, mid + 0.02, 0.9, bottom];
  } else {
    const mid = top + (bottom - top) * 0.5;
    cho = [0.12, top, 0.5, mid];
    jung = [0.1, top, 0.9, bottom];
  }
  const jong: NBox | null = s.jong ? [lay === "horizontal" ? 0.2 : 0.15, 0.66, 0.85, 0.94] : null;
  return [cho, jung, jong];
};

/** 기준 상자 안에 자모마다 대각선 한 획을 쓴 가짜 벌 (offset만큼 비켜 씀) */
function fakeSample(ch: string, id: string, offset = 0): Sample {
  const boxes = boxFn(ch)!;
  const strokes: Sample["strokes"] = [];
  const jamo: JamoStroke[] = [];
  boxes.forEach((b, k) => {
    if (!b) return;
    const points = [
      { x: b[0] + offset, y: b[1], p: 0.5, t: 0 },
      { x: b[2] + offset, y: b[3], p: 0.5, t: 10 },
    ];
    jamo.push({ label: k + 1, stroke: strokes.length, points });
    strokes.push({ points, pointer: "mouse", start: 0 });
  });
  return { id, char: ch, strokes, jamo, createdAt: 0, hasPressure: false };
}

describe("상자 변환", () => {
  it("원래 상자를 대상 상자에 맞춘다", () => {
    const t = boxTransform([0, 0, 0.5, 0.5], [0.5, 0.5, 1, 1], 0.35);
    expect(t.apply({ x: 0, y: 0, p: 0, t: 0 })).toMatchObject({ x: 0.5, y: 0.5 });
    expect(t.apply({ x: 0.5, y: 0.5, p: 0, t: 0 })).toMatchObject({ x: 1, y: 1 });
    expect(t.clamped).toBe(false);
  });
  it("가로세로 비율 변형은 ±35%까지만", () => {
    // 가로 2배, 세로 0.5배 → 비율 4배를 요구
    const t = boxTransform([0, 0, 0.2, 0.4], [0, 0, 0.4, 0.2], 0.35);
    expect(t.clamped).toBe(true);
    expect(t.sx / t.sy).toBeCloseTo(1.35);
    // 넓이 배율(기하평균)은 유지
    expect(Math.sqrt(t.sx * t.sy)).toBeCloseTo(1);
  });
});

describe("자모 조합", () => {
  const samples = compositionSet().map((c, i) => fakeSample(c, `s${i}`));
  const inv = buildInventory(samples, boxFn);

  it("조합용 202자만 있으면 한글 11,172자를 모두 조합할 수 있다", () => {
    let ok = 0;
    for (let code = 0xac00; code <= 0xd7a3; code++) if (composeChar(String.fromCodePoint(code), inv, boxFn)) ok++;
    expect(ok).toBe(11172);
  });

  it("벌(변형)은 정확히 맞는 것을 쓴다", () => {
    for (const ch of ["뷁", "쀍", "꽃", "읊", "희", "괜", "듣"]) {
      const c = composeChar(ch, inv, boxFn)!;
      expect(c.uses.every((u) => u.exact)).toBe(true);
    }
    const c = composeChar("꽃", inv, boxFn)!;
    expect(c.uses.map((u) => u.jamo)).toEqual(["ㄲ", "ㅗ", "ㅊ"]);
    // 초성 ㄲ(가로형, 받침 있음)은 '꼰'에서, 받침 ㅊ(가로형 아래)은 '옻'에서
    expect(c.uses[0].sourceChar).toBe("꼰");
    expect(c.uses[2].sourceChar).toBe("옻");
  });

  it("조각을 대상 글자의 기준 상자에 놓는다", () => {
    const c = composeChar("뷁", inv, boxFn)!;
    const boxes = boxFn("뷁")!;
    c.sample.jamo.forEach((j) => {
      const b = boxes[j.label - 1]!;
      for (const p of j.points) {
        // 비율 제한 때문에 조금 넘칠 수 있다
        expect(p.x).toBeGreaterThan(b[0] - 0.15);
        expect(p.x).toBeLessThan(b[2] + 0.15);
        expect(p.y).toBeGreaterThan(b[1] - 0.15);
        expect(p.y).toBeLessThan(b[3] + 0.15);
      }
    });
  });

  it("쓴 사람의 위치 어긋남은 그대로 따라간다", () => {
    const shifted = compositionSet().map((c, i) => fakeSample(c, `t${i}`, 0.03));
    const inv2 = buildInventory(shifted, boxFn);
    const a = composeChar("뷁", inv, boxFn)!;
    const b = composeChar("뷁", inv2, boxFn)!;
    expect(b.sample.strokes[0].points[0].x - a.sample.strokes[0].points[0].x).toBeGreaterThan(0.01);
  });

  it("맞는 벌이 없으면 비슷한 벌로 대신하고 표시한다", () => {
    // ㄱ 초성은 '가'(세로형·받침 없음) 하나만, 모음 ㅏ·받침 ㄴ도 있음
    const few = ["가", "안"].map((c, i) => fakeSample(c, `f${i}`));
    const inv3 = buildInventory(few, boxFn);
    const c = composeChar("간", inv3, boxFn)!;
    expect(c).not.toBeNull();
    expect(c.uses.find((u) => u.role === 1)!.exact).toBe(false); // 받침 있는 ㄱ 초성이 없어서 대신함
    expect(c.uses.find((u) => u.role === 2)!.exact).toBe(true); // ㅏ(받침 있음)는 '안'에서
  });

  it("필요한 자모가 하나라도 없으면 조합하지 않는다", () => {
    const inv4 = buildInventory([fakeSample("가", "g")], boxFn);
    expect(composeChar("각", inv4, boxFn)).toBeNull(); // 받침 ㄱ 없음
    expect(composeChar("A", inv4, boxFn)).toBeNull();
  });

  it("자기 자신은 빼고 조합할 수 있다 (비교 화면용)", () => {
    const inv5 = buildInventory(samples, boxFn, new Set(["꼰"]));
    const c = composeChar("꼰", inv5, boxFn)!;
    expect(c.uses.every((u) => u.sourceChar !== "꼰")).toBe(true);
  });

  it("여러 벌이 있으면 다른 조합을 만든다", () => {
    const two = [...samples, ...compositionSet().map((c, i) => fakeSample(c, `u${i}`, 0.01))];
    const inv6 = buildInventory(two, boxFn);
    const vs = composeVariants("뷁", inv6, boxFn, 2);
    expect(vs.length).toBe(2);
    expect(vs[0].sample.id).not.toBe(vs[1].sample.id);
  });
});
