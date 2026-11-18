import { describe, it, expect } from "vitest";
import { makeRng, AR1, hashSeed } from "@/lib/style/random";
import { DEFAULT_PROFILE, type StyleProfile } from "@/lib/style/profile";
import { resample, smooth, prepareGlyph, makeVariation, deformGlyph, type PreparedGlyph } from "@/lib/render/glyph";
import { layoutText, tokenize, A4, type GlyphSource } from "@/lib/render/layout";
import { strokeToPolylines, widthFor, buildPageOps } from "@/lib/render/draw";
import type { Sample } from "@/lib/strokes/types";

function sample(char: string, id: string, w = 0.6, h = 0.7, pointer: "pen" | "mouse" = "mouse"): Sample {
  // 사각형 테두리 한 획 (가로 w, 세로 h, 칸 가운데)
  const x0 = 0.5 - w / 2, x1 = 0.5 + w / 2, y0 = 0.5 - h / 2, y1 = 0.5 + h / 2;
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const points = corners.map(([x, y], i) => ({ x, y, p: 0.5, t: i * 50 }));
  return { id, char, strokes: [{ points, pointer, start: 0 }], jamo: [], createdAt: 0, hasPressure: pointer === "pen" };
}

function source(map: Record<string, Sample[]>, profile = DEFAULT_PROFILE): GlyphSource {
  const prepared = new Map<string, PreparedGlyph[]>();
  for (const [c, ss] of Object.entries(map)) prepared.set(c, ss.map((s) => prepareGlyph(s, profile)));
  return { get: (c) => prepared.get(c) ?? [] };
}

describe("난수와 AR(1)", () => {
  it("시드가 같으면 같은 수열", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(hashSeed("가나다")).toBe(hashSeed("가나다"));
    expect(hashSeed("가나다")).not.toBe(hashSeed("가나라"));
  });

  it("AR(1)은 정상 표준편차가 sd, 이웃 상관이 corr에 가깝다", () => {
    const ar = new AR1(1, 0.9, makeRng(7));
    const xs = Array.from({ length: 20000 }, () => ar.next());
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    let cov = 0;
    for (let i = 1; i < xs.length; i++) cov += (xs[i] - mean) * (xs[i - 1] - mean);
    const corr = cov / (xs.length - 1) / (sd * sd);
    expect(sd).toBeGreaterThan(0.85);
    expect(sd).toBeLessThan(1.1);
    expect(corr).toBeGreaterThan(0.85);
    expect(corr).toBeLessThan(0.94);
  });
});

describe("획 다듬기", () => {
  it("일정 간격으로 다시 찍고 끝점은 유지", () => {
    const r = resample([{ x: 0, y: 0, p: 0 }, { x: 0.1, y: 0, p: 1 }], 0.01);
    expect(r.length).toBe(11);
    expect(r[5].x).toBeCloseTo(0.05);
    expect(r[5].p).toBeCloseTo(0.5);
    expect(r.at(-1)!.x).toBeCloseTo(0.1);
  });
  it("매끄럽게 해도 양 끝은 그대로", () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i * 0.01, y: i % 2 ? 0.01 : 0, p: 0.5 }));
    const s = smooth(pts, 1.4);
    expect(s[0]).toEqual(pts[0]);
    expect(s.at(-1)).toEqual(pts.at(-1));
    // 지그재그가 줄어든다
    expect(Math.abs(s[10].y - s[11].y)).toBeLessThan(0.01);
  });
  it("필압 없는 획은 굵기 값이 완만하게 바뀐다", () => {
    const g = prepareGlyph(sample("가", "a"), DEFAULT_PROFILE);
    const ps = g.strokes[0].map((p) => p.p);
    expect(Math.max(...ps) - Math.min(...ps)).toBeGreaterThan(0.1);
    for (let i = 1; i < ps.length; i++) expect(Math.abs(ps[i] - ps[i - 1])).toBeLessThan(0.08);
  });
});

describe("글자 변형", () => {
  it("같은 글자도 찍을 때마다 다르지만, 휨은 em의 몇 % 안", () => {
    const g = prepareGlyph(sample("가", "a"), DEFAULT_PROFILE);
    const rng = makeRng(1);
    const a = deformGlyph(g, makeVariation(DEFAULT_PROFILE, rng), 1);
    const b = deformGlyph(g, makeVariation(DEFAULT_PROFILE, rng), 1);
    let maxDiff = 0;
    let maxMove = 0;
    a[0].forEach((p, i) => {
      maxDiff = Math.max(maxDiff, Math.hypot(p.x - b[0][i].x, p.y - b[0][i].y));
      maxMove = Math.max(maxMove, Math.hypot(p.x - g.strokes[0][i].x, p.y - g.strokes[0][i].y));
    });
    expect(maxDiff).toBeGreaterThan(0.002);
    // 회전 1.2°·크기 2.5%·휨 2.4px 기준으로 이동은 대략 0.1em 안
    expect(maxMove).toBeLessThan(0.1);
  });
  it("변형을 모두 0으로 하면 그대로", () => {
    const zero: StyleProfile = { ...DEFAULT_PROFILE, "2_글자별차이": { keep_size_diff: 1, elastic_px: 0, rot_deg: 0, scale_sd: 0 } };
    const g = prepareGlyph(sample("가", "a"), zero);
    const d = deformGlyph(g, makeVariation(zero, makeRng(3)), 1);
    d[0].forEach((p, i) => {
      expect(p.x).toBeCloseTo(g.strokes[0][i].x, 9);
      expect(p.y).toBeCloseTo(g.strokes[0][i].y, 9);
    });
  });
});

describe("배치", () => {
  const src = source({ 가: [sample("가", "a1"), sample("가", "a2", 0.5, 0.6)], 나: [sample("나", "n1")] });

  it("낱말·공백·줄바꿈 나누기", () => {
    expect(tokenize("가 나\n다").map((t) => t.kind)).toEqual(["word", "space", "word", "newline", "word"]);
  });

  it("같은 글자 여러 벌은 번갈아 쓴다", () => {
    const r = layoutText("가가가가", src, DEFAULT_PROFILE, A4, 1);
    expect(r.pages[0].glyphs.map((g) => g.sampleId)).toEqual(["a1", "a2", "a1", "a2"]);
  });

  it("쓴 적 없는 글자는 '없는 글자'로 모으고 그리지 않는다", () => {
    const r = layoutText("가다나 라다!", src, DEFAULT_PROFILE, A4, 1);
    expect(r.missing).toEqual(["다", "라", "!"]);
    expect(r.pages[0].glyphs.map((g) => g.char).join("")).toBe("가나");
    expect(r.pages[0].missing.length).toBe(4);
  });

  it("오른쪽 여백을 넘으면 줄을 바꾸고, 줄이 차면 페이지를 넘긴다", () => {
    const text = Array.from({ length: 400 }, () => "가나").join(" ");
    const r = layoutText(text, src, DEFAULT_PROFILE, A4, 2);
    expect(r.pages.length).toBeGreaterThan(1);
    const pitch = DEFAULT_PROFILE["1_일정함"].line_pitch_mm;
    for (const pg of r.pages) {
      for (const g of pg.glyphs) {
        for (const s of g.strokes) for (const p of s) {
          expect(p.x).toBeGreaterThan(A4.margin.left - 3);
          expect(p.x).toBeLessThan(A4.widthMm - A4.margin.right + 6);
          expect(p.y).toBeGreaterThan(A4.margin.top - 2);
          expect(p.y).toBeLessThan(A4.heightMm - A4.margin.bottom + pitch);
        }
      }
    }
  });

  it("같은 시드면 같은 결과, 다른 시드면 다른 결과", () => {
    const a = layoutText("가나 가나", src, DEFAULT_PROFILE, A4, 5);
    const b = layoutText("가나 가나", src, DEFAULT_PROFILE, A4, 5);
    const c = layoutText("가나 가나", src, DEFAULT_PROFILE, A4, 6);
    expect(a).toEqual(b);
    expect(a.pages[0].glyphs[0].strokes).not.toEqual(c.pages[0].glyphs[0].strokes);
  });

  it("줄 안 글자 높이는 이어지며 변한다 (이웃 글자 차이 < 전체 흩어짐)", () => {
    const text = Array.from({ length: 2000 }, () => "나").join("");
    const r = layoutText(text, src, { ...DEFAULT_PROFILE, "3_이어지는변화": { ...DEFAULT_PROFILE["3_이어지는변화"], line_slope_mm: 0 } }, A4, 9);
    // 글자별 잉크 아래끝 - 그 줄 괘선
    const offs: number[][] = [];
    for (const pg of r.pages) {
      const byLine = new Map<number, number[]>();
      for (const g of pg.glyphs) {
        const bottom = Math.max(...g.strokes.flat().map((p) => p.y));
        const line = pg.lineYs.reduce((best, y) => (Math.abs(y - bottom) < Math.abs(best - bottom) ? y : best), pg.lineYs[0]);
        if (!byLine.has(line)) byLine.set(line, []);
        byLine.get(line)!.push(bottom - line);
      }
      offs.push(...byLine.values());
    }
    let neigh = 0, n = 0, all: number[] = [];
    for (const l of offs) {
      for (let i = 1; i < l.length; i++) {
        neigh += Math.abs(l[i] - l[i - 1]);
        n++;
      }
      all = all.concat(l);
    }
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const spread = all.reduce((a, b) => a + Math.abs(b - mean), 0) / all.length;
    expect(neigh / n).toBeLessThan(spread);
  });
});

describe("그리기 명령", () => {
  it("굵기는 필압을 따른다", () => {
    expect(widthFor(DEFAULT_PROFILE, 1)).toBeGreaterThan(widthFor(DEFAULT_PROFILE, 0.5));
    expect(widthFor(DEFAULT_PROFILE, 0.5)).toBeCloseTo(DEFAULT_PROFILE["5_획질감"].pen_mm);
  });
  it("굵기가 바뀌면 폴리라인을 나누되 이어지게", () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i * 0.5, y: 0, p: i / 49 }));
    const pls = strokeToPolylines(pts, DEFAULT_PROFILE);
    expect(pls.length).toBeGreaterThan(3);
    for (let i = 1; i < pls.length; i++) expect(pls[i].pts[0]).toEqual(pls[i - 1].pts.at(-1));
  });
  it("줄노트·모눈·백지 괘선", () => {
    const r = layoutText("가", source({ 가: [sample("가", "a")] }), DEFAULT_PROFILE, A4, 1);
    expect(buildPageOps(r.pages[0], { ...A4, paper: "lined" }, DEFAULT_PROFILE).paperLines.length).toBe(r.pages[0].lineYs.length);
    expect(buildPageOps(r.pages[0], { ...A4, paper: "grid" }, DEFAULT_PROFILE).paperLines.length).toBeGreaterThan(90);
    expect(buildPageOps(r.pages[0], { ...A4, paper: "blank" }, DEFAULT_PROFILE).paperLines.length).toBe(0);
  });
});

describe("PDF", () => {
  it("페이지 수만큼 만든다", async () => {
    const { buildPdf } = await import("@/lib/render/pdf");
    const text = Array.from({ length: 400 }, () => "가나").join(" ");
    const src2 = source({ 가: [sample("가", "a")], 나: [sample("나", "n")] });
    const r = layoutText(text, src2, DEFAULT_PROFILE, A4, 1);
    const doc = await buildPdf(r.pages, A4, DEFAULT_PROFILE);
    expect(doc.getNumberOfPages()).toBe(r.pages.length);
    expect((doc.output("arraybuffer") as ArrayBuffer).byteLength).toBeGreaterThan(1000);
  });
});
