import { describe, it, expect } from "vitest";
import { toGray, adaptiveThreshold, removeLongLines, connectedComponents, thin, trace, type BinMask } from "@/lib/photo/image";
import { filterNoise, findLines, groupChars, fitBoxes, splitByColumn, textChars, measureSpacing } from "@/lib/photo/segment";
import { boxToStrokes, EM_FILL } from "@/lib/photo/vectorize";

/** 흰 바탕에 검은 사각형들을 찍은 W×H 마스크 */
function canvas(w: number, h: number) {
  const m: BinMask = { w, h, data: new Uint8Array(w * h) };
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.data[y * w + x] = 1;
  };
  return { m, rect };
}

/** "글자" 하나 = 왼쪽 세로 덩어리 + 오른쪽 세로 덩어리 (가·나처럼 자모가 떨어진 글자 흉내) */
function drawChar(rect: (a: number, b: number, c: number, d: number) => void, x: number, y: number, size = 30) {
  rect(x, y + 4, x + 12, y + size - 4); // 초성
  rect(x + 18, y, x + 22, y + size); // 모음 세로획 (6px 떨어짐)
}

describe("이진화", () => {
  it("밝기가 고르지 않아도 글씨만 잡는다", () => {
    const w = 60, h = 20;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bg = 150 + x; // 왼쪽 어둡고 오른쪽 밝은 종이
        const ink = x % 20 >= 8 && x % 20 < 11 && y > 3 && y < 16;
        const v = ink ? bg - 80 : bg;
        rgba.set([v, v, v, 255], (y * w + x) * 4);
      }
    }
    const m = adaptiveThreshold(toGray(rgba, w, h), 15, 15);
    const ink = m.data.reduce((a, v) => a + v, 0);
    expect(ink).toBeGreaterThan(80);
    expect(ink).toBeLessThan(140);
    expect(m.data[10 * w + 2]).toBe(0); // 어두운 종이는 잉크가 아님
  });

  it("파란 괘선은 회색 변환에서 거의 지워진다", () => {
    const blue = toGray(new Uint8Array([170, 200, 235, 255]), 1, 1).data[0];
    const navy = toGray(new Uint8Array([28, 32, 60, 255]), 1, 1).data[0];
    expect(blue).toBeGreaterThan(180);
    expect(navy).toBeLessThan(40);
  });

  it("얇고 아주 긴 가로줄(괘선)만 지운다", () => {
    const { m, rect } = canvas(200, 40);
    rect(0, 20, 200, 22); // 괘선 (두께 2)
    rect(50, 5, 60, 35); // 글자 획 (괘선을 지나감)
    const out = removeLongLines(m, 120);
    expect(out.data[21 * 200 + 10]).toBe(0); // 괘선 지워짐
    expect(out.data[21 * 200 + 55]).toBe(1); // 글자 획은 남음 (두꺼움)
    expect(out.data[10 * 200 + 55]).toBe(1);
  });
});

describe("줄과 글자 나누기", () => {
  // 두 줄 × 글자 3개, 줄 안에서 글자 사이 12px, 둘째 줄은 글자 2개 + 띄어쓰기 + 1개
  const { m, rect } = canvas(220, 110);
  for (let i = 0; i < 3; i++) drawChar(rect, 10 + i * 34, 10);
  drawChar(rect, 10, 60);
  drawChar(rect, 44, 60);
  drawChar(rect, 110, 60);
  rect(150, 85, 153, 88); // 마침표
  const { labels, comps } = connectedComponents(m);
  const lines = findLines(filterNoise(comps), m.h);

  it("두 줄을 찾는다", () => {
    expect(lines.length).toBe(2);
  });

  it("자모 덩어리들을 글자(음절) 단위로 묶는다", () => {
    const g1 = groupChars(lines[0].comps);
    expect(g1.boxes.length).toBe(3);
    expect(g1.boxes.every((b) => b.comps.length === 2)).toBe(true);
    const g2 = groupChars(lines[1].comps);
    expect(g2.boxes.length).toBe(4); // 가나 다 + 마침표
    expect(textChars("가나 다.").length).toBe(4);
  });

  it("타이핑한 글자 수에 맞춰 합치거나 나눈다", () => {
    const g = groupChars(lines[0].comps);
    const merged = fitBoxes(g.boxes, 2, g.height, (b) => splitByColumn(m, b));
    expect(merged.length).toBe(2);
    const split = fitBoxes(g.boxes, 4, g.height, (b) => splitByColumn(m, b));
    expect(split.length).toBe(4);
    // 나눈 경계는 상자 안쪽
    for (const b of split) expect(b.x1).toBeGreaterThan(b.x0);
  });

  it("글자 간격과 띄어쓰기 폭을 잰다", () => {
    const g = groupChars(lines[1].comps);
    const chars = textChars("가나 다");
    expect(chars).toEqual(["가", "나", "다"]);
    const sp = measureSpacing(g.boxes.slice(0, 3), g.height, [false, true]);
    expect(sp.charGap!).toBeCloseTo(12 / g.height, 2);
    expect(sp.wordGap!).toBeGreaterThan(sp.charGap!);
  });

  it("글자 상자를 획으로 바꾼다 (칸 기준 좌표, 줄 높이로 크기 맞춤)", () => {
    const g = groupChars(lines[0].comps);
    const strokes = boxToStrokes(m, labels, g.boxes[0], { height: g.height, cy: g.cy });
    expect(strokes.length).toBeGreaterThanOrEqual(2); // 초성·모음 따로
    const ys = strokes.flatMap((s) => s.points.map((p) => p.y));
    const span = Math.max(...ys) - Math.min(...ys);
    expect(span).toBeGreaterThan(EM_FILL * 0.6);
    expect(span).toBeLessThan(EM_FILL * 1.1);
    const xs = strokes.flatMap((s) => s.points.map((p) => p.x));
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
});

describe("세선화·따라가기", () => {
  it("두꺼운 가로 막대 → 가는 한 줄", () => {
    const { m, rect } = canvas(40, 15);
    rect(5, 5, 35, 10);
    const sk = thin(m.data, 40, 15);
    const lines = trace(sk, 40, 15, 3);
    expect(lines.length).toBe(1);
    expect(lines[0].length).toBeGreaterThan(20);
    expect(sk.reduce((a, v) => a + v, 0)).toBeLessThan(40);
  });
});

describe("글자 짝 짓기 (동적 계획법)", () => {
  const box = (x0: number, x1: number, id: number) => ({ x0, x1, y0: 0, y1: 30, comps: [id] });
  it("자모 조각으로 잘게 나뉜 줄을 글자 너비에 맞게 묶는다", () => {
    // 글자 3개(각 너비 ~26), 각 글자는 조각 2개 + 마지막에 마침표 하나
    const parts = [box(0, 12, 1), box(16, 26, 2), box(36, 48, 3), box(52, 62, 4), box(72, 84, 5), box(88, 98, 6), box(104, 108, 7)];
    const out = fitBoxes(parts, ["가", "나", "다", "."], 30, () => null);
    expect(out.map((b) => [b.x0, b.x1])).toEqual([[0, 26], [36, 62], [72, 98], [104, 108]]);
  });
  it("한 군데 애매해도 뒤쪽이 밀리지 않는다", () => {
    // 둘째 글자의 두 조각 사이가 조금 넓음 (욕심쟁이 방식이면 엉뚱하게 합쳐질 수 있는 배치)
    const parts = [box(0, 24, 1), box(32, 40, 2), box(46, 58, 3), box(66, 90, 4), box(98, 122, 5)];
    const out = fitBoxes(parts, ["가", "나", "다", "라"], 30, () => null);
    expect(out.map((b) => b.comps)).toEqual([[1], [2, 3], [4], [5]]);
  });
});
