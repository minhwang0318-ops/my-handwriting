import { describe, it, expect } from "vitest";
import {
  dilate, commonSeed, assignNearest, rleEncode, rleDecode, labelBox, countLabel,
  bytesToBase64, base64ToBytes, type Mask,
} from "@/lib/regions/core";

const N = 10;
function maskFrom(rows: string[]): Mask {
  const m = new Uint8Array(N * N);
  rows.forEach((r, y) => Array.from(r).forEach((c, x) => (m[y * N + x] = c === "#" ? 1 : 0)));
  return m;
}

describe("dilate", () => {
  it("한 점을 r만큼 정사각형으로 키운다", () => {
    const m = new Uint8Array(N * N);
    m[5 * N + 5] = 1;
    const d = dilate(m, N, 1);
    expect(countLabel(d, 1)).toBe(9);
    expect(d[4 * N + 4]).toBe(1);
    expect(d[3 * N + 5]).toBe(0);
  });
  it("가장자리에서도 안전", () => {
    const m = new Uint8Array(N * N);
    m[0] = 1;
    expect(countLabel(dilate(m, N, 2), 1)).toBe(9);
  });
});

describe("commonSeed", () => {
  it("문턱값을 높은 것부터 시도한다", () => {
    const ink = new Uint8Array(N * N).fill(1);
    const counts = new Uint16Array(N * N);
    for (let i = 0; i < 20; i++) counts[i] = 10; // 100% 공통 20픽셀
    for (let i = 20; i < 40; i++) counts[i] = 7; // 70%
    const strict = commonSeed(ink, { counts, total: 10 }, [1.0, 0.6], 12);
    expect(countLabel(strict, 1)).toBe(20);
    const relaxed = commonSeed(ink, { counts, total: 10 }, [1.0, 0.6], 30);
    expect(countLabel(relaxed, 1)).toBe(40);
  });
  it("잉크가 아닌 곳은 씨앗이 되지 않는다", () => {
    const ink = new Uint8Array(N * N);
    const counts = new Uint16Array(N * N).fill(5);
    expect(countLabel(commonSeed(ink, { counts, total: 5 }), 1)).toBe(0);
  });
});

describe("assignNearest", () => {
  it("잉크 픽셀을 더 가까운 씨앗에 배정한다", () => {
    const ink = maskFrom([
      "##########",
      "..........",
    ]);
    const a = maskFrom(["#........."]);
    const b = maskFrom([".........#"]);
    const lab = assignNearest(ink, [a, b], N);
    expect(Array.from(lab.slice(0, 10))).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    expect(lab[N]).toBe(0); // 잉크 아닌 곳은 0
  });
  it("두 씨앗이 겹치는 픽셀은 버리고, preferred가 있으면 그쪽", () => {
    const ink = maskFrom(["###......."]);
    const a = maskFrom(["##........"]);
    const b = maskFrom([".##......."]);
    const plain = assignNearest(ink, [a, b], N);
    expect(Array.from(plain.slice(0, 3))).toEqual([1, 1, 2]);
    const pref = assignNearest(ink, [a, b], N, 1);
    expect(Array.from(pref.slice(0, 3))).toEqual([1, 2, 2]);
  });
  it("geodesic: 이어진 획은 잉크를 따라 같은 씨앗으로", () => {
    // 가로획(1행) 오른쪽 끝 바로 아래에 다른 씨앗이 있어도, 가로획은 왼쪽 씨앗을 따라간다
    const ink = maskFrom(["##########", "..........", ".........#"]);
    const a = maskFrom(["#........."]);
    const b = maskFrom(["..........", "..........", ".........#"]);
    const plain = assignNearest(ink, [a, b], N);
    const geo = assignNearest(ink, [a, b], N, -1, true);
    expect(plain[9]).toBe(2);
    expect(geo[9]).toBe(1);
    expect(geo[2 * N + 9]).toBe(2);
  });

  it("씨앗과 떨어진 잉크 덩어리도 가까운 쪽으로 간다", () => {
    const ink = maskFrom(["#.......#.", "..........", "........#."]);
    const a = maskFrom(["#........."]);
    const b = maskFrom(["........#."]);
    const lab = assignNearest(ink, [a, b], N);
    expect(lab[2 * N + 8]).toBe(2);
  });
});

describe("RLE / 상자 / base64", () => {
  it("왕복", () => {
    const lab = new Uint8Array(N * N);
    lab.fill(2, 13, 27);
    lab.fill(3, 50, 51);
    const rle = rleEncode(lab);
    expect(rleDecode(rle, N * N)).toEqual(lab);
    expect(() => rleDecode(rle, N * N + 1)).toThrow();
  });
  it("라벨 상자", () => {
    const lab = new Uint8Array(N * N);
    lab[2 * N + 3] = 1;
    lab[4 * N + 6] = 1;
    expect(labelBox(lab, N, 1)).toEqual([3, 2, 7, 5]);
    expect(labelBox(lab, N, 2)).toBeNull();
  });
  it("base64", () => {
    const b = new Uint8Array([0, 1, 127, 128, 255]);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
  });
});

describe("튼튼한 상자", () => {
  it("동떨어진 픽셀 몇 개는 상자를 부풀리지 않는다", async () => {
    const { robustLabelBox } = await import("@/lib/regions/core");
    const n = 100;
    const lab = new Uint8Array(n * n);
    for (let y = 10; y < 50; y++) for (let x = 20; x < 40; x++) lab[y * n + x] = 1;
    lab[90 * n + 95] = 1; // 엉뚱한 픽셀 하나
    expect(labelBox(lab, n, 1)).toEqual([20, 10, 96, 91]);
    const r = robustLabelBox(lab, n, 1)!;
    expect(r[2]).toBeLessThanOrEqual(41);
    expect(r[3]).toBeLessThanOrEqual(51);
  });
});
