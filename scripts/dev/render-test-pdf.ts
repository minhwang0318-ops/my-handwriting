// 개발용: 시험 데이터로 PDF를 만들어 파일로 저장. 사용: tsx scripts/dev/render-test-pdf.ts out.pdf
import fs from "node:fs";
import { fakeSamples } from "../../src/lib/dev/fakeSamples";
import { DEFAULT_PROFILE } from "../../src/lib/style/profile";
import { prepareGlyph, type PreparedGlyph } from "../../src/lib/render/glyph";
import { layoutText, A4 } from "../../src/lib/render/layout";
import { buildPdf } from "../../src/lib/render/pdf";
import { hashSeed } from "../../src/lib/style/random";

(async () => {
  const m = new Map<string, PreparedGlyph[]>();
  for (const s of fakeSamples()) {
    if (!m.has(s.char)) m.set(s.char, []);
    m.get(s.char)!.push(prepareGlyph(s, DEFAULT_PROFILE));
  }
  const text = "가나다라 마아 이고. 다라 가나 아이 고마.\n이가 마라. 가다 나라 아마 고아.\n\n" + Array.from({ length: 60 }, () => "가나다 라마 아이고").join(" ") + " 하하 우리!";
  const r = layoutText(text, { get: (c) => m.get(c) ?? [] }, DEFAULT_PROFILE, A4, hashSeed(text));
  const doc = await buildPdf(r.pages, A4, DEFAULT_PROFILE);
  fs.writeFileSync(process.argv[2], Buffer.from(doc.output("arraybuffer") as ArrayBuffer));
  console.log(`pages=${r.pages.length} missing=${r.missing.join("")} bytes=${fs.statSync(process.argv[2]).size}`);
})();
