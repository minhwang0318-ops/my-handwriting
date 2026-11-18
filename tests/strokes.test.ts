import { describe, it, expect } from "vitest";
import { distanceTransform, buildJamoFields } from "@/lib/strokes/fields";
import { assignStroke, assignStrokes } from "@/lib/strokes/assign";
import { validate, DEFAULT_VALIDATE, describeFailure } from "@/lib/strokes/validate";
import type { Stroke } from "@/lib/strokes/types";

const N = 40;

/** 기준 글자 흉내: 1=왼쪽 세로획(x 0.2), 2=오른쪽 세로획(x 0.75), 3(선택)=아래 가로획(y 0.9) */
function labelMap(withJong = false): Uint8Array {
  const m = new Uint8Array(N * N);
  for (let y = 4; y < 28; y++) {
    for (let x = 7; x < 10; x++) m[y * N + x] = 1;
    for (let x = 29; x < 32; x++) m[y * N + x] = 2;
  }
  if (withJong) for (let x = 6; x < 34; x++) for (let y = 35; y < 37; y++) m[y * N + x] = 3;
  return m;
}

function line(x0: number, y0: number, x1: number, y1: number, steps = 30): Stroke {
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, p: 0.5, t: i * 10 };
  });
  return { points, pointer: "pen", start: 0 };
}

/** 기준을 그대로 따라 쓴 획 */
const leftBar = () => line(0.21, 0.11, 0.21, 0.69);
const rightBar = () => line(0.76, 0.11, 0.76, 0.69);
const bottomBar = () => line(0.16, 0.89, 0.84, 0.89);

describe("distanceTransform", () => {
  it("한 점에서의 거리 (근사 유클리드)", () => {
    const m = new Uint8Array(N * N);
    m[20 * N + 20] = 1;
    const d = distanceTransform(m, N);
    expect(d[20 * N + 20]).toBe(0);
    expect(d[20 * N + 25]).toBeCloseTo(5);
    expect(d[23 * N + 24]).toBeGreaterThan(4.5);
    expect(d[23 * N + 24]).toBeLessThan(5.5);
  });
});

describe("자모 배정", () => {
  const f = buildJamoFields(labelMap(), N);

  it("가까운 자모에 통째로 배정", () => {
    expect(assignStroke(f, leftBar(), 0).map((j) => j.label)).toEqual([1]);
    expect(assignStroke(f, rightBar(), 1).map((j) => j.label)).toEqual([2]);
  });

  it("두 자모에 25% 이상씩 걸치면 경계에서 나눈다", () => {
    // 왼쪽 획 아래에서 오른쪽 획 위로 이어 쓴 획 (이어 쓰기)
    const s: Stroke = {
      points: [...leftBar().points, ...line(0.21, 0.69, 0.76, 0.11).points.slice(1), ...rightBar().points.slice(1)],
      pointer: "pen",
      start: 0,
    };
    const parts = assignStroke(f, s, 0);
    expect(parts.map((p) => p.label)).toEqual([1, 2]);
    // 조각끼리 경계 점을 공유
    const a = parts[0].points.at(-1)!;
    const b = parts[1].points[0];
    expect(a).toEqual(b);
    // 점이 빠지거나 늘지 않음 (공유점 1개 제외)
    expect(parts[0].points.length + parts[1].points.length).toBe(s.points.length + 1);
  });

  it("한쪽이 25% 미만이면 나누지 않는다", () => {
    // 왼쪽 획 끝에 오른쪽으로 짧은 삐침
    const s: Stroke = {
      points: [...leftBar().points, ...line(0.21, 0.69, 0.4, 0.69, 5).points.slice(1)],
      pointer: "pen",
      start: 0,
    };
    expect(assignStroke(f, s, 0).map((j) => j.label)).toEqual([1]);
  });

  it("한글 아닌 글자(라벨 하나)는 그대로", () => {
    const one = buildJamoFields(labelMap().map((v) => (v ? 1 : 0)), N);
    expect(assignStroke(one, rightBar(), 0)).toHaveLength(1);
  });
});

describe("검증", () => {
  const f = buildJamoFields(labelMap(true), N);
  const run = (strokes: Stroke[]) => validate(f, assignStrokes(f, strokes));

  it("기준을 따라 쓰면 통과", () => {
    const r = run([leftBar(), rightBar(), bottomBar()]);
    expect(r.pass).toBe(true);
    expect(r.jamo.every((j) => j.inBand > 0.95 && j.coverage > 0.9)).toBe(true);
  });

  it("띠 안에서 조금 비켜 쓰고 기울여도 통과 (모양·기울기는 보지 않음)", () => {
    const r = run([line(0.24, 0.14, 0.18, 0.66), line(0.79, 0.12, 0.73, 0.7), line(0.18, 0.92, 0.82, 0.86)]);
    expect(r.pass).toBe(true);
  });

  it("자모가 빠지면 탈락", () => {
    const r = run([leftBar(), rightBar()]);
    expect(r.pass).toBe(false);
    expect(r.jamo.find((j) => j.label === 3)!.status).toBe("missing");
    expect(describeFailure(r, true)).toContain("받침이 빠졌어요");
  });

  it("점 하나로 찍은 글자(마침표 등)도 통과할 수 있다", () => {
    const dot = new Uint8Array(N * N);
    for (let y = 30; y < 33; y++) for (let x = 10; x < 13; x++) dot[y * N + x] = 1;
    const fd = buildJamoFields(dot, N);
    const tap: Stroke = { points: [{ x: 11.5 / N, y: 31.5 / N, p: 0.5, t: 0 }], pointer: "pen", start: 0 };
    expect(validate(fd, assignStrokes(fd, [tap])).pass).toBe(true);
  });

  it("칸 밖으로 나가면 탈락", () => {
    const r = run([leftBar(), line(0.76, 0.11, 0.76, 1.2), bottomBar()]);
    expect(r.outside).toBe(true);
    expect(r.pass).toBe(false);
  });

  it("너무 작게 쓰면 덮임 부족으로 탈락", () => {
    const r = run([line(0.21, 0.3, 0.21, 0.4), rightBar(), bottomBar()]);
    expect(r.jamo.find((j) => j.label === 1)!.status).toBe("lowCoverage");
  });

  it("띠 밖으로 많이 벗어나면 탈락, 수치는 설정으로 바꿀 수 있다", () => {
    const strokes = [line(0.38, 0.11, 0.38, 0.69), rightBar(), bottomBar()];
    // 왼쪽 획이 기준에서 칸의 약 0.16 떨어짐 → 기본 띠(0.1) 밖
    expect(validate(f, assignStrokes(f, strokes)).pass).toBe(false);
    const loose = { ...DEFAULT_VALIDATE, bandWidth: 0.2, coverRadius: 0.2 };
    expect(validate(f, assignStrokes(f, strokes), loose).pass).toBe(true);
  });
});
