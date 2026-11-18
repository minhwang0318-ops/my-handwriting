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
    <label className={styles.num}>
      {{ top: "위", right: "오른쪽", bottom: "아래", left: "왼쪽" }[k]}
      <input
        type="number"
        inputMode="decimal"
        min={5}
        max={60}
        value={margin[k]}
        onChange={(e) => setMargin({ ...margin, [k]: Math.max(5, Math.min(60, Number(e.target.value) || 0)) })}
      />
    </label>
  );

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.home}>
        ‹ 처음
      </Link>
      <h1>내 글씨로 바꾸기</h1>

      {samples && source.count === 0 && (
        <p className={styles.warn}>
          아직 등록한 글자가 없어요. <Link href="/write">따라 쓰기</Link>에서 먼저 글자를 써 주세요.
        </p>
      )}

      <textarea
        className={styles.text}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="바꿀 글을 붙여 넣으세요"
        rows={6}
      />

      <div className={styles.options}>
        <label>
          종이
          <select value={paper} onChange={(e) => setPaper(e.target.value as PaperKind)}>
            <option value="lined">줄노트</option>
            <option value="grid">모눈</option>
            <option value="blank">백지</option>
          </select>
        </label>
        <span className={styles.paperSize}>A4</span>
        <fieldset className={styles.margins}>
          <legend>여백 (mm)</legend>
          {m("top")}
          {m("bottom")}
          {m("left")}
          {m("right")}
        </fieldset>
      </div>

      {result && result.missing.length > 0 && (
        <div className={styles.missing}>
          <div>
            <strong>없는 글자 {result.missing.length}개</strong> · 직접 쓴 적이 없고{useCompose ? " 자모 조합도 안 돼서" : ""} 비워 두었어요 (미리보기의 빨간 점선)
          </div>
          <div className={styles.missingChars}>{result.missing.join(" ")}</div>
          <Link className={styles.writeNow} href={`/write?chars=${encodeURIComponent(result.missing.join(""))}`}>
            지금 쓰기
          </Link>
        </div>
      )}

      <div className={styles.actions}>
        <button onClick={() => setShuffle((s) => s + 1)}>다시 섞기</button>
        <label className={styles.check}>
          <input type="checkbox" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} /> 없는 글자 표시
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={useCompose} onChange={(e) => setUseCompose(e.target.checked)} /> 자모 조합 사용
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> 조합 글자 파랗게 (미리보기만)
        </label>
        <button className={styles.primary} onClick={doPdf} disabled={!result || !glyphCount || !!busy}>
          PDF 저장
        </button>
        <button className={styles.primary} onClick={doPng} disabled={!result || !glyphCount || !!busy}>
          PNG 저장
        </button>
      </div>
      {busy && <p className={styles.busy}>{busy}</p>}
      {result && (
        <p className={styles.stat}>
          {result.pages.length}쪽 · 글자 {glyphCount}개 (그중 조합 {composedCount}개) · 직접 쓴 글자 종류 {source.count}개 ·{" "}
          <Link href="/compare">조합 품질 비교</Link> · <Link href="/settings">스타일 조정</Link>
        </p>
      )}

      <div ref={wrapRef} className={styles.pages}>
        {result?.pages.map((p, i) => (
          <div key={i}>
            <PagePreview page={p} setup={setup} profile={profile} width={width} showMissing={showMissing} highlight={highlight} />
            <div className={styles.pageNo}>
              {i + 1} / {result.pages.length}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
