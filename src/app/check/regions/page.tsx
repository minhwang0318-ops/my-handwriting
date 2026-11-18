"use client";
// 1단계 확인 화면: 기준 글자의 자모 영역(초성/중성/종성 색)과 11,172자 자모 상자
import { useEffect, useRef, useState } from "react";
import { compositionSet, frequentSet, latinSet } from "@/lib/hangul/charsets";
import { decompose, CHO, JUNG, JONG, layoutOf } from "@/lib/hangul";
import type { JamoMasksFile } from "@/lib/regions/types";
import {
  loadMasks, loadRefFont, loadBoxes, drawColoredGlyph, drawGlyph, boxesOf,
} from "@/lib/regions/client";
import NavBar from "@/components/NavBar";
import styles from "./page.module.css";

const COLORS: [number, number, number, number][] = [
  [214, 69, 69, 255], // 초성
  [44, 112, 214, 255], // 중성
  [40, 150, 80, 255], // 종성
];

const SETS = {
  composition: { label: "조합용 202자", chars: compositionSet },
  frequent: { label: "자주 쓰는 한글", chars: frequentSet },
  latin: { label: "영문·숫자·기호", chars: latinSet },
} as const;
type SetKey = keyof typeof SETS;

const CELL = 64;

export default function RegionsCheckPage() {
  const [masks, setMasks] = useState<JamoMasksFile | null>(null);
  const [setKey, setSetKey] = useState<SetKey>("composition");
  const [stats, setStats] = useState<{ mean: number; worst: [string, number][] } | null>(null);
  const [boxText, setBoxText] = useState("한글손글씨뷁쀍꽃짧은옳왜");
  const gridRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLCanvasElement>(null);
  const [boxBytes, setBoxBytes] = useState<Uint8Array | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const onResize = () => setWidth(Math.min(window.innerWidth, 1100) - 32);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    (async () => {
      const m = await loadMasks();
      await loadRefFont(m.frame);
      const b = await loadBoxes();
      setBoxBytes(b.bytes);
      setMasks(m);
    })();
  }, []);

  // 자모 색 격자
  useEffect(() => {
    const cv = gridRef.current;
    if (!masks || !cv || !width) return;
    const list = SETS[setKey].chars();
    const dpr = window.devicePixelRatio || 1;
    const cols = Math.max(4, Math.floor(width / CELL));
    const rows = Math.ceil(list.length / cols);
    cv.style.width = `${cols * CELL}px`;
    cv.style.height = `${rows * CELL}px`;
    cv.width = cols * CELL * dpr;
    cv.height = rows * CELL * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const s = CELL * dpr;
    const scores: [string, number][] = [];
    list.forEach((ch, i) => {
      const x = (i % cols) * s;
      const y = Math.floor(i / cols) * s;
      ctx.strokeStyle = "#e3e3e3";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      const r = drawColoredGlyph(ctx, masks, ch, x, y, s, COLORS);
      if (r !== null) scores.push([ch, r]);
    });
    scores.sort((a, b) => a[1] - b[1]);
    const mean = scores.reduce((a, b) => a + b[1], 0) / Math.max(1, scores.length);
    setStats({ mean, worst: scores.slice(0, 5) });
  }, [masks, setKey, width]);

  // 자모 상자
  useEffect(() => {
    const cv = boxRef.current;
    if (!masks || !boxBytes || !cv) return;
    const list = Array.from(boxText).filter((c) => decompose(c));
    const dpr = window.devicePixelRatio || 1;
    const S = 120;
    cv.style.width = `${Math.max(1, list.length) * S}px`;
    cv.style.height = `${S}px`;
    cv.width = Math.max(1, list.length) * S * dpr;
    cv.height = S * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const s = S * dpr;
    const n = masks.frame.size;
    list.forEach((ch, i) => {
      const x = i * s;
      ctx.fillStyle = "#c8c8c8";
      drawGlyph(ctx, masks.frame, ch, x, 0, s);
      const boxes = boxesOf(boxBytes, ch);
      boxes?.forEach((b, k) => {
        if (!b) return;
        const c = COLORS[k];
        ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(x + (b[0] * s) / n, (b[1] * s) / n, ((b[2] - b[0]) * s) / n, ((b[3] - b[1]) * s) / n);
      });
    });
  }, [masks, boxBytes, boxText]);

  const first = Array.from(boxText).find((c) => decompose(c));
  const parts = first ? decompose(first)! : null;

  return (
    <>
      <NavBar />
      <main className="page wide">
        <h1 className="large-title">기준 글자 자모 영역</h1>
        <p className={styles.legend}>
          <span className={styles.l1}>초성</span>
          <span className={styles.l2}>중성(모음)</span>
          <span className={styles.l3}>종성(받침)</span>
        </p>
        {!masks && <p className="footnote">글꼴과 영역 데이터를 불러오는 중…</p>}

        <section className="section" style={{ marginTop: 16 }}>
          <div className="segmented" role="group" aria-label="글자 묶음">
            {(Object.keys(SETS) as SetKey[]).map((k) => (
              <button key={k} aria-pressed={k === setKey} onClick={() => setSetKey(k)}>
                {SETS[k].label}
                <span className="count tnum">{SETS[k].chars().length}</span>
              </button>
            ))}
          </div>
          {stats && (
            <p className="footnote tnum" style={{ margin: "10px 4px" }}>
              브라우저가 그린 글자와 미리 계산한 영역의 겹침: 평균 {(stats.mean * 100).toFixed(1)}%
              {" · "}가장 낮은 글자: {stats.worst.map(([c, v]) => `${c} ${(v * 100).toFixed(0)}%`).join(", ")}
            </p>
          )}
          <div className={styles.gridWrap}>
            <canvas ref={gridRef} />
          </div>
        </section>

        <section className="section">
          <h2 className="section-header">자모 상자 · 한글 11,172자, 조합 단계에서 사용</h2>
          <input className="field" style={{ maxWidth: 480 }} aria-label="확인할 글자" value={boxText} onChange={(e) => setBoxText(e.target.value)} />
          {parts && first && (
            <p className="section-footer">
              {first} = {CHO[parts.cho]} + {JUNG[parts.jung]} {parts.jong ? `+ ${JONG[parts.jong]}` : "(받침 없음)"} · 배치:{" "}
              {{ vertical: "세로형", horizontal: "가로형", mixed: "섞임형" }[layoutOf(parts.jung)]}
            </p>
          )}
          <div className={styles.gridWrap} style={{ marginTop: 12 }}>
            <canvas ref={boxRef} />
          </div>
        </section>
      </main>
    </>
  );
}
