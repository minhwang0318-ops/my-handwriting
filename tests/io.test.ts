import { describe, it, expect } from "vitest";
import { buildExport, parseImport, planImport, validSample, summarize } from "@/lib/store/io";
import { mergeProfile, DEFAULT_PROFILE, PROFILE_FIELDS } from "@/lib/style/profile";
import { mergeValidate, DEFAULT_VALIDATE } from "@/lib/strokes/validate";
import type { Sample } from "@/lib/strokes/types";

const sample = (id: string, char = "가"): Sample => ({
  id,
  char,
  strokes: [{ pointer: "pen", start: 0, points: [{ x: 0.1, y: 0.2, p: 0.5, t: 0 }, { x: 0.3, y: 0.4, p: 0.7, t: 10 }] }],
  jamo: [{ label: 1, stroke: 0, points: [{ x: 0.1, y: 0.2, p: 0.5, t: 0 }] }],
  createdAt: 1,
  hasPressure: true,
});

describe("내보내기/가져오기", () => {
  it("내보낸 파일을 그대로 다시 읽을 수 있다", () => {
    const f = buildExport([sample("a"), sample("b", "나")], [{ char: "간", reasons: ["받침이 빠졌어요"], at: 1 }], { lastText: "안녕" });
    const r = parseImport(JSON.stringify(f));
    expect(r.skipped).toBe(0);
    expect(r.file.samples).toEqual(f.samples);
    expect(r.file.retry).toEqual(f.retry);
    expect(r.file.settings).toEqual({ lastText: "안녕" });
  });

  it("다른 파일·깨진 파일은 거절", () => {
    expect(() => parseImport("not json")).toThrow("JSON");
    expect(() => parseImport(JSON.stringify({ foo: 1 }))).toThrow("이 앱");
    expect(() => parseImport(JSON.stringify({ app: "my-handwriting", version: 99 }))).toThrow("새로운 버전");
  });

  it("모양이 잘못된 벌은 빼고 개수를 알려준다", () => {
    const bad = { ...sample("x"), strokes: [{ pointer: "pen", start: 0, points: [{ x: "1", y: 0, p: 0, t: 0 }] }] };
    const f = { ...buildExport([sample("a")], [], {}), samples: [sample("a"), bad, { id: 3 }] };
    const r = parseImport(JSON.stringify(f));
    expect(r.file.samples.map((s) => s.id)).toEqual(["a"]);
    expect(r.skipped).toBe(2);
    expect(validSample({ ...sample("y"), char: "가나" })).toBe(false);
  });

  it("합치기는 없는 벌만 더하고, 바꾸기는 전부 바꾼다", () => {
    const f = buildExport([sample("a"), sample("c")], [], { useCompose: false });
    const merge = planImport([sample("a"), sample("b")], f, "merge");
    expect(merge.put.map((s) => s.id)).toEqual(["c"]);
    expect(merge.removeAll).toBe(false);
    expect(merge.settings).toBeNull();
    const replace = planImport([sample("a"), sample("b")], f, "replace");
    expect(replace.put.length).toBe(2);
    expect(replace.removeAll).toBe(true);
    expect(replace.settings).toEqual({ useCompose: false });
  });

  it("요약", () => {
    expect(summarize([sample("a"), sample("b"), sample("c", "나")])).toEqual({ samples: 3, chars: 2 });
  });
});

describe("프로필·검증 설정 합치기", () => {
  it("예전 프로필(항목 빠짐)은 기본값으로 채운다", () => {
    const old = { "5_획질감": { pressure: 0.2, pressure_scale_px: 30, smooth_sigma: 1 } }; // pen_mm 없음
    const p = mergeProfile(old);
    expect(p["5_획질감"].pressure).toBe(0.2);
    expect(p["5_획질감"].pen_mm).toBe(DEFAULT_PROFILE["5_획질감"].pen_mm);
    expect(p["1_일정함"]).toEqual(DEFAULT_PROFILE["1_일정함"]);
  });
  it("이상한 값은 버린다", () => {
    const p = mergeProfile({ "1_일정함": { size_mm: "big", ink: [1, 2] }, "2_글자별차이": null });
    expect(p["1_일정함"].size_mm).toBe(10.5);
    expect(p["1_일정함"].ink).toEqual([28, 32, 60]);
    expect(mergeProfile(null)).toEqual(DEFAULT_PROFILE);
  });
  it("기본값은 모두 슬라이더 범위 안", () => {
    for (const f of PROFILE_FIELDS) {
      const v = (DEFAULT_PROFILE[f.group] as unknown as Record<string, number>)[f.key];
      expect(v, f.key).toBeGreaterThanOrEqual(f.min);
      expect(v, f.key).toBeLessThanOrEqual(f.max);
    }
    expect(PROFILE_FIELDS.length).toBe(21);
  });
  it("검증 설정", () => {
    expect(mergeValidate({ minInBand: 0.7, bandWidth: "x" })).toEqual({ ...DEFAULT_VALIDATE, minInBand: 0.7 });
  });
});
