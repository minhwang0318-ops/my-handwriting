"use client";
// 변환: 직접 쓴 글자를 먼저 쓰고, 없으면 자모 조합으로 만든 글자를 쓴다. 스타일 프로필을 적용해 페이지로 그린다.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { allSamples, getSetting, setSetting } from "@/lib/store/db";
import type { Sample } from "@/lib/strokes/types";
import { DEFAULT_PROFILE, mergeProfile, type StyleProfile } from "@/lib/style/profile";
import { hashSeed } from "@/lib/style/random";
import { buildGlyphSource } from "@/lib/render/source";
import { layoutText, A4, type PageSetup, type PaperKind, type LayoutResult, type Page } from "@/lib/render/layout";
import { buildPageOps, drawPageToCanvas, exportPngs } from "@/lib/render/draw";
import { exportPdf } from "@/lib/render/pdf";
import { loadBoxes, loadMasks } from "@/lib/regions/client";
import { makeBoxFn } from "@/lib/compose/client";
import type { BoxFn } from "@/lib/compose/compose";
import NavBar from "@/components/NavBar";
import Icon from "@/components/Icon";
import styles from "./page.module.css";

const SAMPLE_TEXT = "안녕하세요. 오늘은 날씨가 좋네요.\n내 손글씨로 쓴 편지입니다.";

function PagePreview({ page, setup, profile, width, showMissing, highlight }: { page: Page; setup: PageSetup; profile: StyleProfile; width: number; showMissing: boolean; highlight: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const k = (width / setup.widthMm) * dpr;
    cv.width = Math.round(setup.widthMm * k);
    cv.height = Math.round(setup.heightMm * k);
    drawPageToCanvas(cv.getContext("2d")!, page, buildPageOps(page, setup, profile), setup, profile, { pxPerMm: k, showMissing, highlightComposed: highlight });
  }, [page, setup, profile, width, showMissing, highlight]);
  return <canvas ref={ref} className={styles.page} style={{ width, height: (width * setup.heightMm) / setup.widthMm }} />;
}

export default function ConvertPage() {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [profile, setProfile] = useState<StyleProfile>(DEFAULT_PROFILE);
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [paper, setPaper] = useState<PaperKind>("lined");
  const [margin, setMargin] = useState(A4.margin);
  const [shuffle, setShuffle] = useState(0);
  const [showMissing, setShowMissing] = useState(true);
  const [useCompose, setUseCompose] = useState(true);
  const [highlight, setHighlight] = useState(false);
  const [boxFn, setBoxFn] = useState<BoxFn | null>(null);
  const [busy, setBusy] = useState("");
  const [width, setWidth] = useState(360);
  const wrapRef = useRef<HTMLDivElement>(null);

  const reload = async () => setSamples(await allSamples());

  useEffect(() => {
    (async () => {
      setProfile(mergeProfile(await getSetting<unknown>("styleProfile", null)));
      const t = await getSetting("lastText", SAMPLE_TEXT);
      setText(t);
      setDebounced(t);
      const pageSetup = await getSetting<Partial<PageSetup>>("pageSetup", {});
      if (pageSetup.paper) setPaper(pageSetup.paper);
      if (pageSetup.margin) setMargin(pageSetup.margin);
      setUseCompose(await getSetting("useCompose", true));
      const [b, mk] = await Promise.all([loadBoxes(), loadMasks()]);
      setBoxFn(() => makeBoxFn(b.bytes, mk.frame.size));
      await reload();
    })();
    // 따라 쓰기 화면에서 돌아오면 새로 쓴 글자를 다시 불러온다
    const onVis = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(text);
      setSetting("lastText", text);
    }, 350);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    setSetting("pageSetup", { paper, margin });
  }, [paper, margin]);

  useEffect(() => {
    setSetting("useCompose", useCompose);
  }, [useCompose]);

  useEffect(() => {
    const f = () => setWidth(Math.min(620, (wrapRef.current?.clientWidth ?? window.innerWidth - 32)));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, [samples]);

  const source = useMemo(() => buildGlyphSource(samples ?? [], profile, boxFn, useCompose), [samples, profile, useCompose, boxFn]);

  const setup: PageSetup = useMemo(() => ({ ...A4, paper, margin }), [paper, margin]);

  const result: LayoutResult | null = useMemo(() => {
    if (!samples) return null;
    return layoutText(debounced, source, profile, setup, hashSeed(debounced, shuffle));
  }, [debounced, source, profile, setup, shuffle, samples]);

  const glyphCount = result?.pages.reduce((a, p) => a + p.glyphs.length, 0) ?? 0;
  const composedCount = result?.pages.reduce((a, p) => a + p.glyphs.filter((g) => g.composed).length, 0) ?? 0;

  const doPdf = async () => {
    if (!result) return;
    setBusy("PDF 만드는 중…");
    try {
      await exportPdf(result.pages, setup, profile, "내손글씨.pdf");
    } finally {
      setBusy("");
    }
  };
  const doPng = async () => {
    if (!result) return;
    setBusy("PNG 만드는 중…");
    try {
      await exportPngs(result.pages, setup, profile, "내손글씨");
    } finally {
      setBusy("");
    }
  };

  const m = (k: keyof PageSetup["margin"]) => (
    <label className="cell" key={k}>
      <span className="cell-main">{{ top: "위 여백", right: "오른쪽 여백", bottom: "아래 여백", left: "왼쪽 여백" }[k]}</span>
      <input
        className="field-inline"
        type="number"
        inputMode="decimal"
        min={5}
        max={60}
        value={margin[k]}
        onChange={(e) => setMargin({ ...margin, [k]: Math.max(5, Math.min(60, Number(e.target.value) || 0)) })}
      />
      <span className="cell-value">mm</span>
    </label>
  );

  const toggle = (label: string, sub: string | null, value: boolean, set: (v: boolean) => void) => (
    <label className="cell">
      <span className="cell-main">
        {label}
        {sub && <span className="cell-sub">{sub}</span>}
      </span>
      <input type="checkbox" className="switch" checked={value} onChange={(e) => set(e.target.checked)} />
    </label>
  );

  return (
    <>
      <NavBar />
      <main className="page">
        <h1 className="large-title">내 글씨로 바꾸기</h1>

        {samples && source.count === 0 && (
          <div className="notice warn" style={{ margin: "8px 0 0" }}>
            <div className="notice-title">
              <Icon name="info" />
              아직 등록한 글자가 없어요
            </div>
            <Link href="/write">따라 쓰기</Link>나 <Link href="/upload">사진에서 가져오기</Link>로 먼저 글자를 등록해 주세요.
          </div>
        )}

        <section className="section" style={{ marginTop: 16 }}>
          <h2 className="section-header">바꿀 글</h2>
          <textarea className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="바꿀 글을 붙여 넣으세요" rows={6} />
        </section>

        {result && result.missing.length > 0 && (
          <div className="notice error" style={{ marginTop: 16 }}>
            <div className="notice-title">
              <Icon name="warn" />
              없는 글자 {result.missing.length}개
            </div>
            직접 쓴 적이 없고{useCompose ? " 자모 조합도 안 돼서" : ""} 비워 두었어요. 미리보기에서 빨간 점선으로 보여요.
            <div className={styles.missingChars}>{result.missing.join(" ")}</div>
            <Link className="btn primary small" href={`/write?chars=${encodeURIComponent(result.missing.join(""))}`}>
              <Icon name="pen" />
              지금 쓰기
            </Link>
          </div>
        )}

        <section className="section">
          <h2 className="section-header">종이</h2>
          <div className="group">
            <div className="cell">
              <span className="cell-main">종류</span>
              <div className="segmented" role="group" aria-label="종이 종류">
                {(["lined", "grid", "blank"] as PaperKind[]).map((k) => (
                  <button key={k} aria-pressed={paper === k} onClick={() => setPaper(k)}>
                    {{ lined: "줄노트", grid: "모눈", blank: "백지" }[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="cell">
              <span className="cell-main">크기</span>
              <span className="cell-value">A4</span>
            </div>
            {m("top")}
            {m("bottom")}
            {m("left")}
            {m("right")}
          </div>
        </section>

        <section className="section">
          <h2 className="section-header">글자</h2>
          <div className="group">
            {toggle("자모 조합 사용", "직접 쓴 적 없는 글자를 내 자모로 만들어요", useCompose, setUseCompose)}
            {toggle("없는 글자 표시", "미리보기에만 빨간 점선", showMissing, setShowMissing)}
            {toggle("조합 글자 파랗게", "미리보기에만 표시", highlight, setHighlight)}
          </div>
          <p className="section-footer">
            <Link href="/compare">조합 품질 비교</Link> · <Link href="/settings">스타일 조정</Link>
          </p>
        </section>

        <div className={styles.actions}>
          <button className="btn gray" onClick={() => setShuffle((s) => s + 1)}>
            <Icon name="shuffle" />
            다시 섞기
          </button>
          <button className="btn primary" onClick={doPdf} disabled={!result || !glyphCount || !!busy}>
            <Icon name="download" />
            PDF 저장
          </button>
          <button className="btn" onClick={doPng} disabled={!result || !glyphCount || !!busy}>
            <Icon name="download" />
            PNG 저장
          </button>
        </div>
        <p className={`footnote tnum ${styles.stat}`} role="status">
          {busy ||
            (result
              ? `${result.pages.length}쪽 · 글자 ${glyphCount}개 (조합 ${composedCount}개) · 직접 쓴 글자 ${source.count}종`
              : "")}
        </p>

        <div ref={wrapRef} className={styles.pages}>
          {result?.pages.map((p, i) => (
            <figure key={i} className={styles.figure}>
              <PagePreview page={p} setup={setup} profile={profile} width={width} showMissing={showMissing} highlight={highlight} />
              <figcaption className="footnote tnum">
                {i + 1} / {result.pages.length}
              </figcaption>
            </figure>
          ))}
        </div>
      </main>
    </>
  );
}
