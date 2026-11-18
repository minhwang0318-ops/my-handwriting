// 변환에 쓸 글자 공급: 직접 쓴 글자 먼저, 없으면 자모 조합 (한글만)
import { isSyllable } from "@/lib/hangul";
import type { Sample } from "@/lib/strokes/types";
import type { StyleProfile } from "@/lib/style/profile";
import { buildInventory, composeVariants, type BoxFn } from "@/lib/compose/compose";
import { prepareGlyph, type PreparedGlyph } from "./glyph";
import type { GlyphSource } from "./layout";

export function buildGlyphSource(samples: Sample[], profile: StyleProfile, boxFn: BoxFn | null, useCompose: boolean): GlyphSource & { count: number } {
  const direct = new Map<string, PreparedGlyph[]>();
  for (const s of [...samples].sort((a, b) => a.createdAt - b.createdAt)) {
    if (!direct.has(s.char)) direct.set(s.char, []);
    direct.get(s.char)!.push(prepareGlyph(s, profile));
  }
  const inv = useCompose && boxFn ? buildInventory(samples, boxFn) : null;
  const composed = new Map<string, PreparedGlyph[]>();
  return {
    count: direct.size,
    get: (c) => {
      const d = direct.get(c);
      if (d) return d;
      if (!inv || !boxFn || !isSyllable(c)) return [];
      if (!composed.has(c)) composed.set(c, composeVariants(c, inv, boxFn, 2).map((x) => prepareGlyph(x.sample, profile)));
      return composed.get(c)!;
    },
  };
}
