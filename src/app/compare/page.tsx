"use client";
// 4단계: 조합 품질 비교. 직접 쓴 글자 옆에, 그 글자를 빼고 나머지 글자의 자모로 조합한 결과를 나란히 보여준다.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SampleThumb from "@/components/SampleThumb";
import { allSamples } from "@/lib/store/db";
import type { Sample } from "@/lib/strokes/types";
import { loadBoxes, loadMasks, loadRefFont } from "@/lib/regions/client";
import type { GlyphFrame } from "@/lib/regions/types";
import { makeBoxFn } from "@/lib/compose/client";
import { buildInventory, composeChar, ROLE_NAME, type BoxFn, type Composed } from "@/lib/compose/compose";
import { compositionSet, frequentSet } from "@/lib/hangul/charsets";
import { isSyllable } from "@/lib/hangul";
import styles from "./page.module.css";

type Filter = "all" | "frequent" | "composition";
const FILTERS: Record<Filter, string> = {
  all: "직접 쓴 한글 전부",
  frequent: "자주 쓰는 한글",
  composition: "조합용 202자",
};

function Uses({ c }: { c: Composed }) {
  return (
    <ul className={styles.uses}>
      {c.uses.map((u) => (
        <li key={u.role} className={!u.exact ? styles.inexact : ""}>
          {ROLE_NAME[u.role]} {u.jamo} ← {u.sourceChar}
          {!u.exact && " (다른 벌로 대신)"}
          {u.aspectClamped && " (비율 제한)"}
        </li>
      ))}
    </ul>
  );
}

export default function ComparePage() {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [boxFn, setBoxFn] = useState<BoxFn | null>(null);
  const [frame, setFrame] = useState<GlyphFrame | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showRef, setShowRef] = useState(true);
  const [size, setSize] = useState(96);
  const [tryText, setTryText] = useState("뷁쀍꽃읊희괜듣");

  useEffect(() => {
    (async () => {
      const m = await loadMasks();
      await loadRefFont(m.frame);
      const b = await loadBoxes();
      setBoxFn(() => makeBoxFn(b.bytes, m.frame.size));
      setFrame(m.frame);
      setSamples(await allSamples());
    })();
  }, []);

  // 글자별 첫 벌
  const firstByChar = useMemo(() => {
    const m = new Map<string, Sample>();
    for (const s of [...(samples ?? [])].sort((a, b) => a.createdAt - b.createdAt)) if (!m.has(s.char)) m.set(s.char, s);
    return m;
  }, [samples]);

  const pairs = useMemo(() => {
    if (!samples || !boxFn) return [];
    const allow =
      filter === "frequent" ? new Set(frequentSet()) : filter === "composition" ? new Set(compositionSet()) : null;
    const chars = [...firstByChar.keys()].filter((c) => isSyllable(c) && (!allow || allow.has(c)));
    return chars.map((c) => {
      // 자기 자신의 벌은 빼고 조합 (그래야 비교가 의미 있다)
      const inv = buildInventory(samples, boxFn, new Set([c]));
      return { char: c, direct: firstByChar.get(c)!, composed: composeChar(c, inv, boxFn) };
    });
  }, [samples, boxFn, filter, firstByChar]);

  const tryResults = useMemo(() => {
    if (!samples || !boxFn) return [];
    const inv = buildInventory(samples, boxFn);
    return Array.from(new Set(Array.from(tryText)))
      .filter(isSyllable)
      .map((c) => ({ char: c, direct: firstByChar.get(c) ?? null, composed: composeChar(c, buildInventory(samples, boxFn, new Set([c])), boxFn) ?? composeChar(c, inv, boxFn) }));
  }, [samples, boxFn, tryText, firstByChar]);

  const composable = pairs.filter((p) => p.composed).length;
  const refFrame = showRef && frame ? frame : undefined;

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.home}>
        ‹ 처음
      </Link>
      <h1>조합 품질 비교</h1>
      <p className={styles.note}>
        왼쪽은 직접 쓴 글자, 오른쪽은 <strong>그 글자를 빼고</strong> 다른 글자에서 가져온 자모로 조합한 글자예요. 조합 글자는 직접 쓴 글자가 없을
        때만 변환에 쓰입니다.
      </p>

      <div className={styles.controls}>
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <button key={f} className={f === filter ? styles.active : ""} onClick={() => setFilter(f)}>
            {FILTERS[f]}
          </button>
        ))}
        <label>
          <input type="checkbox" checked={showRef} onChange={(e) => setShowRef(e.target.checked)} /> 기준 글자 깔기
        </label>
        <label>
          크기
          <input type="range" min={64} max={160} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
      </div>

      {!samples && <p>불러오는 중…</p>}
      {samples && pairs.length === 0 && (
        <p className={styles.note}>
          비교할 글자가 없어요. <Link href="/write">따라 쓰기</Link>에서 한글을 먼저 써 주세요.
        </p>
      )}
      {pairs.length > 0 && (
        <p className={styles.note}>
          {pairs.length}자 중 {composable}자를 조합할 수 있었어요. 조합이 안 된 글자는 필요한 자모를 가진 다른 글자가 아직 없는 경우예요.
        </p>
      )}

      <div className={styles.grid}>
        {pairs.map((p) => (
          <div key={p.char} className={styles.card}>
            <div className={styles.char}>{p.char}</div>
            <div className={styles.pair}>
              <figure>
                <SampleThumb sample={p.direct} size={size} refFrame={refFrame} />
                <figcaption>직접</figcaption>
              </figure>
              <figure>
                {p.composed ? (
                  <SampleThumb sample={p.composed.sample} size={size} refFrame={refFrame} />
                ) : (
                  <div className={styles.none} style={{ width: size, height: size }}>
                    조합 불가
                  </div>
                )}
                <figcaption>조합</figcaption>
              </figure>
            </div>
            {p.composed && <Uses c={p.composed} />}
          </div>
        ))}
      </div>

      <h2>아무 글자나 조합해 보기</h2>
      <input className={styles.input} value={tryText} onChange={(e) => setTryText(e.target.value)} />
      <div className={styles.grid}>
        {tryResults.map((r) => (
          <div key={r.char} className={styles.card}>
            <div className={styles.char}>{r.char}</div>
            <div className={styles.pair}>
              {r.direct && (
                <figure>
                  <SampleThumb sample={r.direct} size={size} refFrame={refFrame} />
                  <figcaption>직접</figcaption>
                </figure>
              )}
              <figure>
                {r.composed ? (
                  <SampleThumb sample={r.composed.sample} size={size} refFrame={refFrame} />
                ) : (
                  <div className={styles.none} style={{ width: size, height: size }}>
                    조합 불가
                  </div>
                )}
                <figcaption>조합</figcaption>
              </figure>
            </div>
            {r.composed && <Uses c={r.composed} />}
          </div>
        ))}
      </div>
    </main>
  );
}
