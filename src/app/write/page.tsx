"use client";
// 2단계: 따라 쓰기
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TraceCell from "@/components/TraceCell";
import SampleThumb from "@/components/SampleThumb";
import { compositionSet, frequentSet, latinSet } from "@/lib/hangul/charsets";
import { isSyllable } from "@/lib/hangul";
import { loadMasks, loadRefFont, labelsOf, isApproxLabels } from "@/lib/regions/client";
import type { JamoMasksFile } from "@/lib/regions/types";
import { buildJamoFields, type JamoFields } from "@/lib/strokes/fields";
import { assignStrokes } from "@/lib/strokes/assign";
import { validate, describeFailure, DEFAULT_VALIDATE, mergeValidate, LABEL_NAMES, type ValidationResult, type ValidateConfig } from "@/lib/strokes/validate";
import type { Sample, Stroke } from "@/lib/strokes/types";
import {
  saveSample, samplesOf, sampleCounts, retryList, addRetry, removeRetry, deleteSample, newId, getSetting,
  type RetryEntry,
} from "@/lib/store/db";
import styles from "./page.module.css";

type SetKey = "composition" | "latin" | "frequent" | "retry" | "custom";
const SET_LABELS: Record<Exclude<SetKey, "custom">, string> = {
  composition: "조합용 (필수)",
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
    const f = () => setSize(Math.max(220, Math.min(window.innerWidth - 32, window.innerHeight - 330, 560)));
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

  return (
    <main className={styles.main}>
      <header className={styles.top}>
        <Link href="/" className={styles.home}>
          ‹ 처음
        </Link>
        <div className={styles.tabs}>
          {(Object.keys(SET_LABELS) as Exclude<SetKey, "custom">[]).map((k) => (
            <button
              key={k}
              className={k === setKey ? styles.active : ""}
              onClick={() => {
                setSetKey(k);
                setIndex(0);
              }}
            >
              {SET_LABELS[k]}
              {k === "retry" ? ` ${retry.length}` : ""}
            </button>
          ))}
          {customList.length > 0 && (
            <button className={setKey === "custom" ? styles.active : ""} onClick={() => { setSetKey("custom"); setIndex(0); }}>
              없는 글자 {customList.length}
            </button>
          )}
        </div>
      </header>

      <p className={styles.guide}>위치와 크기만 맞추고, 획 모양과 기울기는 평소 글씨대로.</p>
      {customList.length > 0 && customLeft.length > 0 && (
        <p className={styles.detail}>
          변환할 글에 없던 글자 {customList.length}자 중 {customLeft.length}자 남았어요 ({customLeft.join(" ")}).{" "}
          <Link href="/convert">변환 화면으로 돌아가기</Link>
        </p>
      )}
      {customList.length > 0 && customLeft.length === 0 && (
        <div className={styles.doneBanner}>
          없던 글자를 모두 썼어요. <Link href="/convert">변환 화면으로 돌아가기 ›</Link>
        </div>
      )}

      {!masks && <p>기준 글꼴을 불러오는 중…</p>}
      {masks && !list.length && <p className={styles.empty}>{setKey === "retry" ? "다시 쓸 글자가 없어요." : "글자가 없어요."}</p>}

      {masks && char && !fields && (
        <div className={styles.fail}>
          &lsquo;{char}&rsquo;은(는) 기준 글꼴에 없는 글자라 따라 쓰기 칸을 만들 수 없어요.{" "}
          <button className={styles.link} onClick={() => go(index + 1)}>
            건너뛰기
          </button>
        </div>
      )}
      {masks && fields && char && (
        <>
          <div className={styles.status}>
            <button className={styles.listBtn} onClick={() => setShowList((v) => !v)}>
              {index + 1} / {list.length} {showList ? "▲" : "▼"}
            </button>
            <span>
              완료 {done}/{list.length}
            </span>
            <span className={styles.count}>이 글자 저장 {counts.get(char) ?? 0}벌</span>
          </div>

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

          <div className={styles.cellWrap}>
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
            />
            {toast && <div className={styles.toast}>{toast}</div>}
          </div>

          {isApproxLabels(masks, char) && (
            <p className={styles.detail}>이 글자의 자모 영역은 지금 이 기기에서 계산했어요 (미리 확인하지 않은 글자).</p>
          )}
          {hangul && (
            <p className={styles.legend}>
              <span className={styles.l1}>초성</span>
              <span className={styles.l2}>모음(중성)</span>
              {fields.labels.includes(3) && <span className={styles.l3}>받침(종성)</span>}
            </p>
          )}

          {result && (
            <div className={styles.fail}>
              <strong>다시 써 주세요</strong>
              <ul>
                {describeFailure(result, hangul).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className={styles.detail}>
                {result.jamo
                  .map((j) => `${hangul ? LABEL_NAMES[j.label] : "글자"} 띠 안 ${Math.round(j.inBand * 100)}% · 덮임 ${Math.round(j.coverage * 100)}%`)
                  .join(" / ")}
              </p>
              <div className={styles.row}>
                <button className={styles.primary} onClick={() => { setStrokes([]); setResult(null); }}>
                  다시 쓰기
                </button>
                <button onClick={later}>나중에 (다시 쓰기 목록으로)</button>
              </div>
            </div>
          )}

          {!result && (
            <div className={styles.row}>
              <button onClick={() => setStrokes((p) => p.slice(0, -1))} disabled={!strokes.length}>
                되돌리기
              </button>
              <button onClick={() => setStrokes([])} disabled={!strokes.length}>
                지우기
              </button>
              <button onClick={() => go(index - 1)} disabled={index === 0}>
                이전
              </button>
              <button onClick={() => go(index + 1)} disabled={index >= list.length - 1}>
                건너뛰기
              </button>
              <button className={styles.primary} onClick={check} disabled={!strokes.length}>
                확인·저장
              </button>
            </div>
          )}

          {saved.length > 0 && (
            <section className={styles.saved}>
              <h2>저장된 &lsquo;{char}&rsquo; ({saved.length}벌) · 색은 자모 배정 결과</h2>
              <div className={styles.thumbs}>
                {saved.map((s) => (
                  <div key={s.id} className={styles.thumb}>
                    <SampleThumb sample={s} jamoColors={hangul} />
                    <button
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
            <p className={styles.detail}>
              지난번 탈락 이유: {retry.find((r) => r.char === char)!.reasons.join(", ")}{" "}
              <button className={styles.link} onClick={async () => { await removeRetry(char); await refresh(); }}>
                목록에서 빼기
              </button>
            </p>
          )}
        </>
      )}
    </main>
  );
}
