"use client";
// 2단계: 따라 쓰기
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TraceCell from "@/components/TraceCell";
import SampleThumb from "@/components/SampleThumb";
import NavBar from "@/components/NavBar";
import Icon from "@/components/Icon";
import { compositionSet, frequentSet, latinSet } from "@/lib/hangul/charsets";
import { isSyllable } from "@/lib/hangul";
import { loadMasks, loadRefFont, labelsOf, isApproxLabels } from "@/lib/regions/client";
import type { JamoMasksFile } from "@/lib/regions/types";
import { buildJamoFields, type JamoFields } from "@/lib/strokes/fields";
import { assignStrokes } from "@/lib/strokes/assign";
import { validate, describeFailure, DEFAULT_VALIDATE, mergeValidate, LABEL_NAMES, type ValidationResult, type ValidateConfig } from "@/lib/strokes/validate";
import type { Sample, Stroke } from "@/lib/strokes/types";
import {
  saveSample, samplesOf, sampleCounts, retryList, addRetry, removeRetry, deleteSample, newId, getSetting, setSetting,
  type RetryEntry,
} from "@/lib/store/db";
import styles from "./page.module.css";

type SetKey = "composition" | "latin" | "frequent" | "retry" | "custom";
const SET_LABELS: Record<Exclude<SetKey, "custom">, string> = {
  composition: "조합용 · 필수",
  latin: "영문·숫자·기호",
  frequent: "자주 쓰는 한글",
  retry: "다시 쓰기",
};

const fieldCache = new Map<string, JamoFields>();
function fieldsFor(masks: JamoMasksFile, ch: string): JamoFields | null {
  const hit = fieldCache.get(ch);
  if (hit) return hit;
  const lab = labelsOf(masks, ch);
  if (!lab) return null;
  const f = buildJamoFields(lab, masks.frame.size);
  fieldCache.set(ch, f);
  return f;
}

function useCellSize() {
  const [size, setSize] = useState(320);
  useEffect(() => {
    const f = () => setSize(Math.max(220, Math.min(window.innerWidth - 32, window.innerHeight - 390, 560)));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return size;
}

export default function WritePage() {
  const [masks, setMasks] = useState<JamoMasksFile | null>(null);
  const [setKey, setSetKey] = useState<SetKey>("composition");
  const [customList, setCustomList] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [retry, setRetry] = useState<RetryEntry[]>([]);
  const [saved, setSaved] = useState<Sample[]>([]);
  const [showList, setShowList] = useState(false);
  const [toast, setToast] = useState("");
  const [cfg, setCfg] = useState<ValidateConfig>(DEFAULT_VALIDATE);
  const [trackpad, setTrackpad] = useState(false);
  /** 터치가 없는 기기(맥북·PC): 아이패드·폰을 추천하는 안내를 띄운다 */
  const [noTouch, setNoTouch] = useState(false);
  const [penDown, setPenDown] = useState(false);
  const size = useCellSize();

  // 주소의 ?chars=... 로 들어오면 그 글자들만 쓴다 (변환 화면의 "지금 쓰기"용)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("chars");
    if (q) {
      setCustomList(Array.from(new Set(Array.from(q))).filter((c) => c.trim()));
      setSetKey("custom");
    }
    (async () => {
      const m = await loadMasks();
      await loadRefFont(m.frame);
      setCfg(mergeValidate(await getSetting<unknown>("validateConfig", null)));
      // 터치가 없는 기기에서는 아이패드·폰을 추천한다. 트랙패드 모드는 직접 켰을 때만 쓴다.
      setNoTouch(navigator.maxTouchPoints === 0 && !window.matchMedia("(pointer: coarse)").matches);
      setTrackpad((await getSetting<boolean | null>("trackpadMode", null)) ?? false);
      setMasks(m);
    })();
  }, []);

  const refresh = useCallback(async () => {
    setCounts(await sampleCounts());
    setRetry(await retryList());
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const list = useMemo(() => {
    switch (setKey) {
      case "composition":
        return compositionSet();
      case "latin":
        return latinSet();
      case "frequent":
        return frequentSet();
      case "retry":
        return retry.map((r) => r.char);
      case "custom":
        return customList;
    }
  }, [setKey, retry, customList]);

  const char = list[Math.min(index, list.length - 1)] ?? "";
  const fields = masks && char ? fieldsFor(masks, char) : null;
  const hangul = isSyllable(char);

  useEffect(() => {
    setStrokes([]);
    setResult(null);
    if (char) samplesOf(char).then(setSaved);
    else setSaved([]);
  }, [char]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1400);
  };

  const go = (i: number) => setIndex(Math.max(0, Math.min(list.length - 1, i)));

  const nextIndex = () => {
    // 없는 글자 쓰기: 아직 안 쓴 다음 글자로
    if (setKey === "custom") {
      for (let k = 1; k <= list.length; k++) {
        const j = (index + k) % list.length;
        if (!(counts.get(list[j]) ?? 0) && list[j] !== char) return j;
      }
      return index;
    }
    // 다시 쓰기 목록은 저장하면 목록에서 빠지므로 같은 자리
    if (setKey === "retry") return Math.min(index, Math.max(0, list.length - 2));
    return Math.min(index + 1, list.length - 1);
  };

  const check = async () => {
    if (!fields || !strokes.length) return;
    const jamo = assignStrokes(fields, strokes);
    const r = validate(fields, jamo, cfg);
    if (r.pass) {
      const s: Sample = {
        id: newId(),
        char,
        strokes,
        jamo,
        createdAt: Date.now(),
        hasPressure: strokes.some((st) => st.pointer === "pen"),
      };
      await saveSample(s);
      await refresh();
      flash(`'${char}' 저장했어요`);
      const ni = nextIndex();
      if (ni === index && setKey !== "retry") {
        setStrokes([]);
        setResult(null);
        setSaved(await samplesOf(char));
      } else go(ni);
    } else {
      setResult(r);
    }
  };

  const later = async () => {
    if (!result) return;
    await addRetry({ char, reasons: describeFailure(result, hangul), at: Date.now() });
    await refresh();
    if (setKey !== "retry") go(index + 1);
    else {
      setStrokes([]);
      setResult(null);
    }
  };

  const failed = result ? result.jamo.filter((j) => j.status !== "pass").map((j) => j.label) : [];
  const done = list.filter((c) => (counts.get(c) ?? 0) > 0).length;
  const retrySet = new Set(retry.map((r) => r.char));
  const customLeft = customList.filter((c) => !(counts.get(c) ?? 0));

  const pct = list.length ? Math.round((done / list.length) * 100) : 0;

  return (
    <>
      <NavBar
        title="따라 쓰기"
        trail={
          masks && fields && char ? (
            <button className="btn plain small tnum" onClick={() => setShowList((v) => !v)} aria-expanded={showList}>
              <Icon name={showList ? "list" : "grid"} />
              {index + 1}/{list.length}
            </button>
          ) : null
        }
      />
      <main className={`page ${styles.main}`}>
        <div className={styles.sets}>
          <div className="segmented" role="group" aria-label="글자 묶음">
            {(Object.keys(SET_LABELS) as Exclude<SetKey, "custom">[]).map((k) => (
              <button
                key={k}
                aria-pressed={k === setKey}
                onClick={() => {
                  setSetKey(k);
                  setIndex(0);
                }}
              >
                {SET_LABELS[k]}
                {k === "retry" && <span className="count tnum">{retry.length}</span>}
              </button>
            ))}
            {customList.length > 0 && (
              <button aria-pressed={setKey === "custom"} onClick={() => { setSetKey("custom"); setIndex(0); }}>
                없는 글자<span className="count tnum">{customList.length}</span>
              </button>
            )}
          </div>
        </div>

        {masks && list.length > 0 && (
          <div className={styles.progress}>
            <div className={styles.progressText}>
              <span>
                완료 <b className="tnum">{done}</b>
                <span className="tnum"> / {list.length}</span>
              </span>
              {char && <span className="tnum">&lsquo;{char}&rsquo; 저장 {counts.get(char) ?? 0}벌</span>}
            </div>
            <div className={styles.bar} role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={list.length}>
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {customList.length > 0 && customLeft.length > 0 && (
          <div className="notice info" style={{ marginTop: 12 }}>
            변환할 글에 없던 글자 {customList.length}자 중 <b>{customLeft.length}자</b> 남았어요: {customLeft.join(" ")}{" "}
            <Link href="/convert">변환으로 돌아가기</Link>
          </div>
        )}
        {customList.length > 0 && customLeft.length === 0 && (
          <div className="notice ok" style={{ marginTop: 12 }}>
            <div className="notice-title">
              <Icon name="ok" />
              없던 글자를 모두 썼어요
            </div>
            <Link href="/convert">변환 화면으로 돌아가기</Link>
          </div>
        )}

        {!masks && <p className={styles.empty}>기준 글꼴을 불러오는 중…</p>}
        {masks && !list.length && <p className={styles.empty}>{setKey === "retry" ? "다시 쓸 글자가 없어요. 탈락한 글자를 '나중에'로 넘기면 여기에 모여요." : "글자가 없어요."}</p>}

        {masks && char && !fields && (
          <div className="notice warn" style={{ marginTop: 12 }}>
            &lsquo;{char}&rsquo;은(는) 기준 글꼴에 없는 글자라 따라 쓰기 칸을 만들 수 없어요.{" "}
            <button className="btn plain small" onClick={() => go(index + 1)}>
              건너뛰기
            </button>
          </div>
        )}
        {masks && fields && char && (
          <>
            {showList && (
              <div className={styles.charList}>
                {list.map((c, i) => (
                  <button
                    key={c + i}
                    className={[
                      styles.chip,
                      (counts.get(c) ?? 0) > 0 ? styles.chipDone : "",
                      retrySet.has(c) ? styles.chipRetry : "",
                      i === index ? styles.chipNow : "",
                    ].join(" ")}
                    onClick={() => {
                      go(i);
                      setShowList(false);
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {noTouch && (
              <div className="notice info" style={{ marginTop: 12 }}>
                <div className="notice-title">
                  <Icon name="device" />
                  글씨 등록은 아이패드나 휴대폰을 추천해요
                </div>
                애플 펜슬이나 손가락으로 써야 실제 손글씨와 가장 비슷하게 나와요. 휴대폰·아이패드 사파리에서 이 주소를 여세요:{" "}
                <span className="mono" style={{ wordBreak: "break-all" }}>{typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}</span>
                <br />
                맥북에서는 <Link href="/upload">사진에서 가져오기</Link>와 <Link href="/convert">변환</Link>이 편해요. 등록한 글씨는 설정의 내보내기·가져오기로 옮길 수 있어요.
              </div>
            )}

            {noTouch && (
              <div className="group" style={{ marginTop: 12 }}>
                <label className="cell">
                  <span className="cell-main">
                    트랙패드로 쓰기
                    <span className="cell-sub">맥북용 · 어색할 수 있어요</span>
                  </span>
                  {trackpad && <span className={penDown ? styles.penOn : styles.penOff}>{penDown ? "쓰는 중" : "펜 올림"}</span>}
                  <input
                    type="checkbox"
                    className="switch"
                    checked={trackpad}
                    onChange={(e) => {
                      setTrackpad(e.target.checked);
                      setSetting("trackpadMode", e.target.checked);
                    }}
                  />
                </label>
              </div>
            )}
            {trackpad && (
              <p className="section-footer">
                칸 위에서 <b>스페이스 바를 누른 채</b> 손가락을 움직이면 써지고, 떼면 획이 끝나요. 또는 <b>톡</b> 한 번에 쓰기 시작, 다시 <b>톡</b>에 멈춤. 누른 채 끌기(세 손가락 드래그 포함)도 돼요.
              </p>
            )}

            {/* 칸 위: 글자 이동 */}
            <div className={styles.navRow}>
              <button className="btn plain" onClick={() => go(index - 1)} disabled={index === 0}>
                <Icon name="back" />
                이전
              </button>
              <span className={styles.navChar}>{char}</span>
              <button className="btn plain" onClick={() => go(index + 1)} disabled={index >= list.length - 1}>
                건너뛰기
                <Icon name="forward" />
              </button>
            </div>
            <div className={styles.cellWrap}>
              <div className={styles.paper}>
                <TraceCell
                  char={char}
                  masks={masks}
                  fields={fields}
                  strokes={strokes}
                  onStroke={(s) => {
                    setResult(null);
                    setStrokes((prev) => [...prev, s]);
                  }}
                  failed={failed}
                  bandWidth={cfg.bandWidth}
                  size={size}
                  trackpad={trackpad}
                  onPenChange={setPenDown}
                />
              </div>
              {toast && (
                <div className={styles.toast} role="status">
                  <Icon name="check" />
                  {toast}
                </div>
              )}
            </div>
            {hangul && (
              <p className={styles.legend}>
                <span className={styles.l1}>초성</span>
                <span className={styles.l2}>모음</span>
                {fields.labels.includes(3) && <span className={styles.l3}>받침</span>}
              </p>
            )}
            {/* 칸 아래: 획 고치기와 저장 */}
            {!result && (
              <div className={styles.actions}>
                <button className="btn gray" onClick={() => setStrokes((p) => p.slice(0, -1))} disabled={!strokes.length}>
                  <Icon name="undo" />
                  되돌리기
                </button>
                <button className="btn gray" onClick={() => setStrokes([])} disabled={!strokes.length}>
                  <Icon name="clear" />
                  지우기
                </button>
                <button className="btn primary" onClick={check} disabled={!strokes.length}>
                  <Icon name="check" />
                  확인 · 저장
                </button>
              </div>
            )}

            {result && (
              <div className="notice error" style={{ marginTop: 12 }}>
                <div className="notice-title">
                  <Icon name="warn" />
                  다시 써 주세요
                </div>
                <ul className={styles.reasons}>
                  {describeFailure(result, hangul).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <p className="footnote tnum">
                  {result.jamo
                    .map((j) => `${hangul ? LABEL_NAMES[j.label] : "글자"} 띠 안 ${Math.round(j.inBand * 100)}% · 덮임 ${Math.round(j.coverage * 100)}%`)
                    .join(" / ")}
                </p>
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn primary" onClick={() => { setStrokes([]); setResult(null); }}>
                    다시 쓰기
                  </button>
                  <button className="btn gray" onClick={later}>
                    나중에
                  </button>
                </div>
                <p className="footnote" style={{ marginTop: 6 }}>나중에를 누르면 &lsquo;다시 쓰기&rsquo; 목록에 넣고 다음 글자로 넘어가요.</p>
              </div>
            )}

            {isApproxLabels(masks, char) && (
              <p className="section-footer" style={{ textAlign: "center" }}>이 글자의 자모 영역은 지금 이 기기에서 계산했어요 (미리 확인하지 않은 글자).</p>
            )}

            {saved.length > 0 && (
              <section className="section">
                <h2 className="section-header">
                  저장된 &lsquo;{char}&rsquo; {saved.length}벌 · 색은 자모 배정 결과
                </h2>
                <div className={`group-pad ${styles.thumbs}`}>
                  {saved.map((s) => (
                    <div key={s.id} className={styles.thumb}>
                      <SampleThumb sample={s} jamoColors={hangul} />
                      <button
                        className="btn plain small destructive"
                        onClick={async () => {
                          if (!confirm(`이 '${char}' 한 벌을 지울까요?`)) return;
                          await deleteSample(s.id);
                          setSaved(await samplesOf(char));
                          await refresh();
                        }}
                      >
                        지우기
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {setKey === "retry" && retry.find((r) => r.char === char) && (
              <p className="section-footer">
                지난번 탈락 이유: {retry.find((r) => r.char === char)!.reasons.join(", ")}{" "}
                <button className="btn plain small" onClick={async () => { await removeRetry(char); await refresh(); }}>
                  목록에서 빼기
                </button>
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
