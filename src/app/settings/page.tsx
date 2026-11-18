"use client";
// 5단계: 스타일 프로필 슬라이더(미리보기), 검증 기준, 데이터 내보내기/가져오기
import { useEffect, useMemo, useRef, useState } from "react";
import {
  allSamples, allSettings, clearAll, getSetting, retryList, setSetting, writeBulk,
} from "@/lib/store/db";
import type { Sample } from "@/lib/strokes/types";
import {
  DEFAULT_PROFILE, PROFILE_FIELDS, PROFILE_GROUPS, mergeProfile, type StyleProfile,
} from "@/lib/style/profile";
import { DEFAULT_VALIDATE, VALIDATE_FIELDS, mergeValidate, type ValidateConfig } from "@/lib/strokes/validate";
import { buildExport, parseImport, planImport, summarize, type ImportMode } from "@/lib/store/io";
import { loadBoxes, loadMasks } from "@/lib/regions/client";
import { makeBoxFn } from "@/lib/compose/client";
import type { BoxFn } from "@/lib/compose/compose";
import { buildGlyphSource } from "@/lib/render/source";
import { layoutText, type PageSetup } from "@/lib/render/layout";
import { buildPageOps, drawPageToCanvas } from "@/lib/render/draw";
import { hashSeed } from "@/lib/style/random";
import NavBar from "@/components/NavBar";
import Icon from "@/components/Icon";
import styles from "./page.module.css";

const PREVIEW_TEXT = "오늘은 하늘이 맑고 바람이 시원합니다.\n내 손글씨로 쓴 편지예요. 잘 지내죠?";

const hex = (c: number[]) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const unhex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

function Preview({ samples, profile, boxFn, text, seed }: { samples: Sample[]; profile: StyleProfile; boxFn: BoxFn | null; text: string; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(340);
  const source = useMemo(() => buildGlyphSource(samples, profile, boxFn, true), [samples, profile, boxFn]);
  const lines = Math.max(2, text.split("\n").length + 1);
  const pitch = profile["1_일정함"].line_pitch_mm;
  const setup: PageSetup = useMemo(
    () => ({ widthMm: 210, heightMm: 10 + pitch * (lines + 0.6), margin: { top: 4, right: 14, bottom: 2, left: 14 }, paper: "lined" }),
    [pitch, lines],
  );
  const result = useMemo(() => layoutText(text, source, profile, setup, hashSeed(text, seed)), [text, source, profile, setup, seed]);
  useEffect(() => {
    const f = () => {
      const p = ref.current?.parentElement;
      if (!p) return;
      const cs = getComputedStyle(p);
      setWidth(Math.min(640, p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    };
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !result.pages[0]) return;
    const dpr = window.devicePixelRatio || 1;
    const k = (width / setup.widthMm) * dpr;
    cv.width = Math.round(setup.widthMm * k);
    cv.height = Math.round(setup.heightMm * k);
    drawPageToCanvas(cv.getContext("2d")!, result.pages[0], buildPageOps(result.pages[0], setup, profile), setup, profile, { pxPerMm: k, showMissing: true });
  }, [result, setup, profile, width]);
  return (
    <>
      <canvas ref={ref} className={styles.preview} style={{ width, height: (width * setup.heightMm) / setup.widthMm }} />
      {result.missing.length > 0 && <p className="footnote" style={{ marginTop: 6 }}>미리보기에 없는 글자: {result.missing.join(" ")}</p>}
    </>
  );
}

function Slider({ label, hint, min, max, step, value, onChange }: { label: string; hint: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return (
    <label className={`cell ${styles.slider}`}>
      <span className={styles.sliderTop}>
        <span>{label}</span>
        <span className="cell-value tnum">{value.toFixed(digits)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="cell-sub">{hint}</span>}
    </label>
  );
}

export default function SettingsPage() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [vcfg, setVcfg] = useState<ValidateConfig | null>(null);
  const [boxFn, setBoxFn] = useState<BoxFn | null>(null);
  const [previewText, setPreviewText] = useState(PREVIEW_TEXT);
  const [seed, setSeed] = useState(0);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => setSamples(await allSamples());

  useEffect(() => {
    (async () => {
      setProfile(mergeProfile(await getSetting<unknown>("styleProfile", null)));
      setVcfg(mergeValidate(await getSetting<unknown>("validateConfig", null)));
      const [b, m] = await Promise.all([loadBoxes(), loadMasks()]);
      setBoxFn(() => makeBoxFn(b.bytes, m.frame.size));
      await reload();
    })();
  }, []);

  // 바꾸면 바로 저장 (조금 모아서)
  useEffect(() => {
    if (!profile) return;
    const t = setTimeout(() => setSetting("styleProfile", profile), 250);
    return () => clearTimeout(t);
  }, [profile]);
  useEffect(() => {
    if (!vcfg) return;
    const t = setTimeout(() => setSetting("validateConfig", vcfg), 250);
    return () => clearTimeout(t);
  }, [vcfg]);

  const setField = (group: keyof StyleProfile, key: string, v: unknown) =>
    setProfile((p) => (p ? { ...p, [group]: { ...p[group], [key]: v } } : p));

  const doExport = async () => {
    const file = buildExport(await allSamples(), await retryList(), await allSettings());
    const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `내손글씨-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    const s = summarize(file.samples);
    setMsg(`${s.chars}자 ${s.samples}벌을 내보냈어요.`);
  };

  const doImport = async (f: File) => {
    try {
      const { file, skipped } = parseImport(await f.text());
      const existing = await allSamples();
      if (mode === "replace" && existing.length && !confirm(`지금 있는 ${existing.length}벌과 설정을 모두 지우고 파일 내용으로 바꿀까요? 되돌릴 수 없어요.`)) return;
      const plan = planImport(existing, file, mode);
      await writeBulk({ samples: plan.put, retry: mode === "replace" ? file.retry : [], settings: plan.settings, removeAll: plan.removeAll });
      await reload();
      if (plan.settings) {
        setProfile(mergeProfile(plan.settings.styleProfile));
        setVcfg(mergeValidate(plan.settings.validateConfig));
      }
      setMsg(`${plan.added}벌을 가져왔어요.${skipped ? ` 모양이 잘못된 ${skipped}벌은 뺐어요.` : ""}${mode === "merge" && file.samples.length > plan.added ? ` 이미 있는 ${file.samples.length - plan.added}벌은 건너뛰었어요.` : ""}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const stats = summarize(samples);

  return (
    <>
      <NavBar />
      <main className="page">
        <h1 className="large-title">설정</h1>

        <section className="section" style={{ marginTop: 16 }}>
          <h2 className="section-header">스타일 미리보기</h2>
          <div className={`group-pad ${styles.previewBox}`}>
            {profile && <Preview samples={samples} profile={profile} boxFn={boxFn} text={previewText} seed={seed} />}
            <div className={styles.previewRow}>
              <input
                className="field inset"
                aria-label="미리보기 글"
                value={previewText.replace(/\n/g, " / ")}
                onChange={(e) => setPreviewText(e.target.value.replace(/ \/ /g, "\n"))}
              />
              <button className="btn gray small" onClick={() => setSeed((s) => s + 1)}>
                <Icon name="shuffle" />
                다시 섞기
              </button>
            </div>
            {!samples.length && <p className="footnote">등록한 글자가 없어서 미리보기가 비어 있어요.</p>}
          </div>
          <p className="section-footer">변환할 때 항상 적용돼요. 바꾸면 바로 저장되고 위 미리보기에 보여요.</p>
        </section>

        {profile &&
          PROFILE_GROUPS.map((g) => (
            <section key={g.group} className="section">
              <details className={`group ${styles.disclosure}`} open={g.group === "1_일정함"}>
                <summary className="cell">
                  <span className="cell-main">
                    {g.title}
                    <span className="cell-sub">{g.desc}</span>
                  </span>
                  <Icon name="chevron" className={`cell-chevron ${styles.disclosureChevron}`} />
                </summary>
                {PROFILE_FIELDS.filter((f) => f.group === g.group).map((f) => (
                  <Slider
                    key={f.key}
                    label={f.label}
                    hint={f.hint}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={(profile[f.group] as unknown as Record<string, number>)[f.key]}
                    onChange={(v) => setField(f.group, f.key, v)}
                  />
                ))}
                {g.group === "1_일정함" && (
                  <label className="cell">
                    <span className="cell-main">잉크 색</span>
                    <span className="cell-value mono">{hex(profile["1_일정함"].ink)}</span>
                    <input className={styles.color} type="color" value={hex(profile["1_일정함"].ink)} onChange={(e) => setField("1_일정함", "ink", unhex(e.target.value))} />
                  </label>
                )}
              </details>
            </section>
          ))}
        <div className={styles.resetRow}>
          <button className="btn plain" onClick={() => confirm("스타일 프로필을 기본값으로 되돌릴까요?") && setProfile(mergeProfile(DEFAULT_PROFILE))}>
            스타일 기본값으로 되돌리기
          </button>
        </div>

        <section className="section">
          <h2 className="section-header">따라 쓰기 검증 기준</h2>
          {vcfg && (
            <div className="group">
              {VALIDATE_FIELDS.map((f) => (
                <Slider key={f.key} label={f.label} hint={f.hint} min={f.min} max={f.max} step={f.step} value={vcfg[f.key]} onChange={(v) => setVcfg({ ...vcfg, [f.key]: v })} />
              ))}
            </div>
          )}
          <p className="section-footer">자모 획이 띠 안에 충분히 있고 기준 자모를 충분히 덮으면 통과예요. 획 모양·기울기·굵기는 보지 않아요.</p>
          <div className={styles.resetRow}>
            <button className="btn plain" onClick={() => setVcfg({ ...DEFAULT_VALIDATE })}>
              검증 기준 기본값으로 되돌리기
            </button>
          </div>
        </section>

        <section className="section">
          <h2 className="section-header">내 글씨 데이터</h2>
          <div className="group">
            <div className="cell">
              <span className="cell-main">이 기기에 저장된 글씨</span>
              <span className="cell-value tnum">
                {stats.chars}자 · {stats.samples}벌
              </span>
            </div>
            <button className={`cell ${styles.cellButton}`} onClick={doExport} disabled={!stats.samples}>
              <Icon name="download" className="cell-icon" />
              <span className="cell-main">내보내기 (JSON 파일)</span>
            </button>
          </div>
          <p className="section-footer">데이터는 이 기기 안에만 있어요. 기기를 바꾸거나 앱을 지우기 전에 내보내 두세요.</p>
        </section>

        <section className="section">
          <h2 className="section-header">가져오기</h2>
          <div className="group">
            <div className="cell">
              <span className="cell-main">방식</span>
              <div className="segmented" role="group" aria-label="가져오기 방식">
                <button aria-pressed={mode === "merge"} onClick={() => setMode("merge")}>
                  합치기
                </button>
                <button aria-pressed={mode === "replace"} onClick={() => setMode("replace")}>
                  바꾸기
                </button>
              </div>
            </div>
            <div className="cell">
              <input ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
            </div>
          </div>
          <p className="section-footer">
            {mode === "merge" ? "합치기: 있는 건 두고 파일에만 있는 벌을 더해요." : "바꾸기: 지금 데이터와 설정을 모두 지우고 파일 내용으로 바꿔요."}
          </p>
        </section>

        {msg && (
          <div className="notice info" role="status" style={{ marginTop: 16 }}>
            {msg}
          </div>
        )}

        <section className="section">
          <div className="group">
            <button
              className={`cell ${styles.cellButton} ${styles.destructive}`}
              onClick={async () => {
                if (!confirm(`저장된 ${stats.samples}벌과 설정을 모두 지울까요? 되돌릴 수 없어요. 먼저 내보내기를 권해요.`)) return;
                await clearAll();
                await reload();
                setProfile(mergeProfile(null));
                setVcfg({ ...DEFAULT_VALIDATE });
                setMsg("모두 지웠어요.");
              }}
              disabled={!stats.samples}
            >
              <span className="cell-main">모든 글씨와 설정 지우기</span>
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
