"use client";
// 6단계: 예전에 쓴 편지·레포트 사진에서 내 글씨 가져오기 (반자동)
// 1) 사진 → 글씨만 흑백으로 (괘선 지움)  2) 줄·글자 덩어리 찾기  3) 타이핑한 내용과 짝 짓기
// 4) 확인·고치기  5) 획으로 바꿔 저장
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SampleThumb from "@/components/SampleThumb";
import { toGray, adaptiveThreshold, removeLongLines, connectedComponents, type BinMask } from "@/lib/photo/image";
import { filterNoise, findLines, groupChars, fitBoxes, splitByColumn, textChars, measureSpacing, type Box } from "@/lib/photo/segment";
import { boxToStrokes, EM_FILL } from "@/lib/photo/vectorize";
import { loadMasks, loadRefFont, labelsOf } from "@/lib/regions/client";
import type { JamoMasksFile } from "@/lib/regions/types";
import { buildJamoFields } from "@/lib/strokes/fields";
import { assignStrokes } from "@/lib/strokes/assign";
import { validate, describeFailure, mergeValidate, type ValidateConfig, DEFAULT_VALIDATE } from "@/lib/strokes/validate";
import { isSyllable } from "@/lib/hangul";
import type { Sample } from "@/lib/strokes/types";
import { getSetting, newId, setSetting, writeBulk } from "@/lib/store/db";
import { mergeProfile } from "@/lib/style/profile";
import styles from "./page.module.css";

const MAX_SIDE = 1800;

interface Item {
  key: string;
  line: number;
  box: Box;
  char: string;
  include: boolean;
  sample: Sample | null;
  problem: string;
}

interface Processed {
  mask: BinMask;
  labels: Int32Array;
  lines: { boxes: Box[]; height: number; cy: number }[];
}

function process(src: HTMLCanvasElement, sensitivity: number): Processed {
  const ctx = src.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = src;
  const img = ctx.getImageData(0, 0, w, h);
  const gray = toGray(img.data, w, h);
  const win = Math.max(15, Math.min(61, Math.round(Math.min(w, h) / 25) | 1));
  let mask = adaptiveThreshold(gray, win, sensitivity);
  mask = removeLongLines(mask, Math.round(w * 0.25));
  const { labels, comps } = connectedComponents(mask);
  const lines = findLines(filterNoise(comps), h).map((l) => groupChars(l.comps));
  return { mask, labels, lines };
}

/** 사진의 한 영역을 작게 그린다 */
function Crop({ src, box, size = 72 }: { src: HTMLCanvasElement; box: Box; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr;
    cv.height = size * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    const side = Math.max(bw, bh) * 1.15;
    const sx = (box.x0 + box.x1) / 2 - side / 2;
    const sy = (box.y0 + box.y1) / 2 - side / 2;
    ctx.drawImage(src, sx, sy, side, side, 0, 0, cv.width, cv.height);
  }, [src, box, size]);
  return <canvas ref={ref} style={{ width: size, height: size, border: "1px solid #ddd", borderRadius: 4 }} />;
}

export default function UploadPage() {
  const [masks, setMasks] = useState<JamoMasksFile | null>(null);
  const [cfg, setCfg] = useState<ValidateConfig>(DEFAULT_VALIDATE);
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [sensitivity, setSensitivity] = useState(15);
  const [showMask, setShowMask] = useState(true);
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [spacing, setSpacing] = useState<{ charGap: number | null; wordGap: number | null } | null>(null);
  const [msg, setMsg] = useState("");
  const viewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    (async () => {
      const m = await loadMasks();
      await loadRefFont(m.frame);
      setCfg(mergeValidate(await getSetting<unknown>("validateConfig", null)));
      setMasks(m);
    })();
  }, []);

  const loadFile = (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k);
      cv.height = Math.round(img.height * k);
      cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      setItems(null);
      setSpacing(null);
      setSrc(cv);
    };
    img.onerror = () => setMsg("사진을 열 수 없어요. JPG·PNG 사진을 골라 주세요.");
    img.src = url;
  };

  const rotate = (dir: 1 | -1) => {
    if (!src) return;
    const cv = document.createElement("canvas");
    cv.width = src.height;
    cv.height = src.width;
    const ctx = cv.getContext("2d")!;
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    setItems(null);
    setSrc(cv);
  };

  const proc = useMemo(() => (src ? process(src, sensitivity) : null), [src, sensitivity]);
  const typedLines = useMemo(() => text.split("\n").map((l) => l.trimEnd()).filter((l) => textChars(l).length), [text]);

  // 미리보기: 사진 + 잡힌 잉크 + 줄·글자 상자
  useEffect(() => {
    const cv = viewRef.current;
    if (!cv || !src || !proc) return;
    const maxW = Math.min(900, cv.parentElement!.clientWidth);
    const k = maxW / src.width;
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = `${maxW}px`;
    cv.style.height = `${src.height * k}px`;
    cv.width = Math.round(src.width * k * dpr);
    cv.height = Math.round(src.height * k * dpr);
    const ctx = cv.getContext("2d")!;
    const s = k * dpr;
    ctx.globalAlpha = showMask ? 0.35 : 1;
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
    if (showMask) {
      const m = proc.mask;
      const ov = document.createElement("canvas");
      ov.width = m.w;
      ov.height = m.h;
      const octx = ov.getContext("2d")!;
      const id = octx.createImageData(m.w, m.h);
      for (let i = 0; i < m.w * m.h; i++) if (m.data[i]) id.data.set([20, 30, 90, 255], i * 4);
      octx.putImageData(id, 0, 0);
      ctx.drawImage(ov, 0, 0, cv.width, cv.height);
    }
    const colors = ["#e05a2b", "#2c64c8", "#23864a", "#9b3fb5"];
    const lineBoxes = items ? groupBy(items) : proc.lines.map((l) => l.boxes);
    lineBoxes.forEach((boxes, li) => {
      ctx.strokeStyle = colors[li % colors.length];
      ctx.lineWidth = 1.5 * dpr;
      ctx.font = `${11 * dpr}px sans-serif`;
      ctx.fillStyle = ctx.strokeStyle;
      boxes.forEach((b, bi) => {
        ctx.strokeRect(b.x0 * s, b.y0 * s, (b.x1 - b.x0) * s, (b.y1 - b.y0) * s);
        if (items) ctx.fillText(items.filter((it) => it.line === li)[bi]?.char ?? "", b.x0 * s, b.y0 * s - 2 * dpr);
      });
    });
  }, [src, proc, showMask, items]);

  const match = () => {
    if (!proc || !masks || !src) return;
    const out: Item[] = [];
    const spacings: { charGap: number | null; wordGap: number | null; n: number }[] = [];
    const n = Math.min(proc.lines.length, typedLines.length);
    for (let li = 0; li < n; li++) {
      const line = proc.lines[li];
      const chars = textChars(typedLines[li]);
      const boxes = fitBoxes(line.boxes, chars, line.height, (b) => splitByColumn(proc.mask, b));
      // 띄어쓰기 위치 (i번째 글자 뒤에 공백?)
      const spaceAfter: boolean[] = [];
      let ci = -1;
      for (const c of Array.from(typedLines[li])) {
        if (c.trim()) {
          ci++;
          spaceAfter[ci] = false;
        } else if (ci >= 0) spaceAfter[ci] = true;
      }
      if (boxes.length === chars.length) {
        const sp = measureSpacing(boxes, line.height, spaceAfter);
        spacings.push({ charGap: sp.charGap, wordGap: sp.wordGap, n: boxes.length });
      }
      boxes.forEach((box, bi) => {
        const ch = chars[bi];
        out.push(makeItem(`${li}-${bi}`, li, box, ch ?? "", proc, line, masks, cfg));
      });
    }
    setItems(out);
    const cg = spacings.map((s) => s.charGap).filter((v): v is number => v !== null);
    const wg = spacings.map((s) => s.wordGap).filter((v): v is number => v !== null);
    const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);
    setSpacing({ charGap: med(cg), wordGap: med(wg) });
    setMsg(
      proc.lines.length !== typedLines.length
        ? `사진에서 찾은 줄(${proc.lines.length})과 입력한 줄(${typedLines.length}) 수가 달라요. 앞에서부터 ${n}줄만 짝 지었어요.`
        : "",
    );
  };

  const editChar = (key: string, ch: string) => {
    if (!proc || !masks) return;
    setItems((prev) =>
      prev!.map((it) => {
        if (it.key !== key) return it;
        const line = proc.lines[it.line];
        return makeItem(key, it.line, it.box, Array.from(ch).slice(-1)[0] ?? "", proc, line, masks, cfg);
      }),
    );
  };

  const save = async () => {
    const chosen = items?.filter((it) => it.include && it.sample) ?? [];
    if (!chosen.length) return;
    const now = Date.now();
    await writeBulk({ samples: chosen.map((it, i) => ({ ...it.sample!, id: `photo-${newId()}`, createdAt: now + i })) });
    setMsg(`${chosen.length}자를 내 글씨로 저장했어요. 따라 쓰기·변환·비교 화면에서 함께 쓰여요.`);
  };

  const applySpacing = async () => {
    if (!spacing) return;
    const p = mergeProfile(await getSetting<unknown>("styleProfile", null));
    if (spacing.charGap !== null) p["4_간격"].char_gap = Math.round(Math.max(-0.05, Math.min(0.3, spacing.charGap * EM_FILL)) * 1000) / 1000;
    if (spacing.wordGap !== null) p["4_간격"].word_space = Math.round(Math.max(0.1, Math.min(0.8, spacing.wordGap * EM_FILL)) * 100) / 100;
    await setSetting("styleProfile", p);
    setMsg(`스타일에 적용했어요: 글자 간격 ${p["4_간격"].char_gap}, 띄어쓰기 ${p["4_간격"].word_space} (칸 대비). 설정 화면에서 더 고칠 수 있어요.`);
  };

  const included = items?.filter((it) => it.include && it.sample).length ?? 0;

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.home}>
        ‹ 처음
      </Link>
      <h1>사진에서 내 글씨 가져오기</h1>
      <p className={styles.note}>
        예전에 쓴 편지나 레포트 사진을 올리고, 그 사진에 쓴 내용을 타이핑하면 글자마다 짝을 지어 내 글씨로 저장해요. 사진에는 쓴 순서와 필압이
        없어서, 따라 쓰기로 저장한 글자보다 품질이 낮을 수 있어요.
      </p>

      <section className={styles.card}>
        <h2>1. 사진 고르기</h2>
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
        <p className={styles.small}>글씨가 크고 반듯하게 찍힌 사진이 좋아요. 사진은 이 기기 안에서만 처리하고 어디에도 올리지 않아요.</p>
        {src && (
          <div className={styles.row}>
            <button onClick={() => rotate(-1)}>↺ 돌리기</button>
            <button onClick={() => rotate(1)}>↻ 돌리기</button>
            <label className={styles.slider}>
              잉크 감도 {sensitivity}
              <input type="range" min={4} max={40} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
            </label>
            <label>
              <input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} /> 잡힌 글씨 보기
            </label>
          </div>
        )}
        {src && proc && (
          <p className={styles.small}>
            찾은 줄 {proc.lines.length}개 · 글자 덩어리 {proc.lines.reduce((a, l) => a + l.boxes.length, 0)}개 (색깔 상자 = 줄마다 다른 색)
          </p>
        )}
        <div className={styles.view}>
          <canvas ref={viewRef} />
        </div>
      </section>

      {src && (
        <section className={styles.card}>
          <h2>2. 사진에 쓴 내용 입력</h2>
          <p className={styles.small}>사진의 줄 바꿈과 똑같이 한 줄씩 입력해 주세요. 띄어쓰기도 사진대로 넣으면 띄어쓰기 폭을 잴 수 있어요.</p>
          <textarea className={styles.text} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"예)\n오늘은 날씨가 좋다.\n친구와 산책을 했다."} />
          <div className={styles.row}>
            <span className={styles.small}>
              입력한 줄 {typedLines.length}개 / 사진에서 찾은 줄 {proc?.lines.length ?? 0}개
            </span>
            <button className={styles.primary} onClick={match} disabled={!typedLines.length || !masks}>
              짝 짓기
            </button>
          </div>
        </section>
      )}

      {items && (
        <section className={styles.card}>
          <h2>3. 확인하고 고치기</h2>
          <p className={styles.small}>
            왼쪽은 사진, 오른쪽은 획으로 바꾼 모습이에요. 글자가 틀리면 고치고, 잘못 잘린 칸은 체크를 빼 주세요. 기준과 많이 다른 칸은 처음부터 빠져 있어요.
          </p>
          <div className={styles.grid}>
            {items.map((it) => (
              <div key={it.key} className={`${styles.item} ${it.include ? "" : styles.off}`}>
                <div className={styles.pair}>
                  <Crop src={src!} box={it.box} />
                  {it.sample ? <SampleThumb sample={it.sample} size={72} /> : <div className={styles.empty}>획 없음</div>}
                </div>
                <div className={styles.row}>
                  <input className={styles.char} value={it.char} onChange={(e) => editChar(it.key, e.target.value)} />
                  <label className={styles.small}>
                    <input
                      type="checkbox"
                      checked={it.include}
                      disabled={!it.sample}
                      onChange={(e) => setItems((p) => p!.map((x) => (x.key === it.key ? { ...x, include: e.target.checked } : x)))}
                    />{" "}
                    저장
                  </label>
                </div>
                {it.problem && <div className={styles.problem}>{it.problem}</div>}
              </div>
            ))}
          </div>
          <div className={styles.row}>
            <button className={styles.primary} onClick={save} disabled={!included}>
              {included}자 저장
            </button>
            {spacing && (spacing.charGap !== null || spacing.wordGap !== null) && (
              <button onClick={applySpacing}>
                사진에서 잰 간격을 스타일에 적용 (글자 간격 {spacing.charGap !== null ? (spacing.charGap * EM_FILL).toFixed(3) : "-"}, 띄어쓰기{" "}
                {spacing.wordGap !== null ? (spacing.wordGap * EM_FILL).toFixed(2) : "-"})
              </button>
            )}
          </div>
        </section>
      )}
      {msg && <p className={styles.msg}>{msg}</p>}
    </main>
  );
}

function groupBy(items: Item[]): Box[][] {
  const out: Box[][] = [];
  for (const it of items) (out[it.line] ??= []).push(it.box);
  return out;
}

/** 상자 하나 → 저장할 벌 (자모 배정·검증까지) */
function makeItem(
  key: string,
  line: number,
  box: Box,
  ch: string,
  proc: Processed,
  frame: { height: number; cy: number },
  masks: JamoMasksFile,
  cfg: ValidateConfig,
): Item {
  if (!ch) return { key, line, box, char: "", include: false, sample: null, problem: "짝 지을 글자가 없어요" };
  const strokes = boxToStrokes(proc.mask, proc.labels, box, frame);
  if (!strokes.length) return { key, line, box, char: ch, include: false, sample: null, problem: "획을 찾지 못했어요" };
  const lab = labelsOf(masks, ch);
  const fields = lab ? buildJamoFields(lab, masks.frame.size) : null;
  const jamo = fields ? assignStrokes(fields, strokes) : strokes.map((s, i) => ({ label: 1, stroke: i, points: s.points }));
  let problem = "";
  let include = true;
  if (fields) {
    // 사진 글씨는 칸에 맞춰 쓴 게 아니므로 띠·덮임 거리는 1.5배로 넓히되,
    // 옆 글자 조각이 섞인 칸을 거르도록 띠 안 비율은 70% 이상을 요구한다
    const loose: ValidateConfig = {
      ...cfg,
      bandWidth: cfg.bandWidth * 1.5,
      coverRadius: cfg.coverRadius * 1.5,
      minInBand: Math.max(cfg.minInBand, 0.7),
      outsideMargin: 0.15,
    };
    const r = validate(fields, jamo, loose);
    if (!r.pass) {
      include = false;
      problem = describeFailure(r, isSyllable(ch)).join(", ") || "기준과 많이 달라요";
    }
  }
  const sample: Sample = { id: `photo-tmp-${key}`, char: ch, strokes, jamo, createdAt: 0, hasPressure: false, source: "photo" };
  return { key, line, box, char: ch, include, sample, problem };
}
