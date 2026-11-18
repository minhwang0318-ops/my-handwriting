// PDF 내보내기. jsPDF는 변환 화면과 함께 불러온다 (나중에 불러오면 오프라인에서 처음 누를 때 실패할 수 있어서)
import { jsPDF } from "jspdf";
import type { StyleProfile } from "@/lib/style/profile";
import type { Page, PageSetup } from "./layout";
import { buildPageOps, PAPER_RGB } from "./draw";

/** PDF로 저장 (벡터) */
export async function exportPdf(pages: Page[], setup: PageSetup, profile: StyleProfile, fileName: string) {
  const doc = await buildPdf(pages, setup, profile);
  doc.save(fileName);
}

export async function buildPdf(pages: Page[], setup: PageSetup, profile: StyleProfile) {
  const doc = new jsPDF({ unit: "mm", format: [setup.widthMm, setup.heightMm], orientation: "portrait", compress: true, floatPrecision: 2 });
  const [r, g, b] = profile["1_일정함"].ink;
  pages.forEach((page, i) => {
    if (i) doc.addPage([setup.widthMm, setup.heightMm], "portrait");
    const ops = buildPageOps(page, setup, profile);
    doc.setDrawColor(...PAPER_RGB);
    doc.setLineWidth(0.15);
    for (const l of ops.paperLines) doc.line(l.x1, l.y1, l.x2, l.y2);
    doc.setDrawColor(r, g, b);
    doc.setLineCap("round");
    doc.setLineJoin("round");
    for (const pl of ops.ink) {
      doc.setLineWidth(pl.width);
      const [x0, y0] = pl.pts[0];
      const deltas: [number, number][] = [];
      for (let j = 1; j < pl.pts.length; j++) deltas.push([pl.pts[j][0] - pl.pts[j - 1][0], pl.pts[j][1] - pl.pts[j - 1][1]]);
      doc.lines(deltas, x0, y0, [1, 1], "S", false);
    }
  });
  return doc;
}

