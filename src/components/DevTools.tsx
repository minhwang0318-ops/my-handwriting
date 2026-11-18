"use client";
// 개발 모드에서만 보이는 시험 데이터 버튼. 시험 데이터는 좌표로 만든 단순한 획이며 진짜 손글씨가 아니다.
import { asset } from "@/lib/basePath";
import { useState } from "react";
import { fakeSamples } from "@/lib/dev/fakeSamples";
import { allSamples, db, deleteSample, setSetting } from "@/lib/store/db";

const DEMO_TEXT =
  "가나다라 마아 이고. 다라 가나 아이 고마.\n이가 마라. 가다 나라 아마 고아.\n\n" +
  Array.from({ length: 60 }, () => "가나다 라마 아이고").join(" ") +
  " 하하 우리!";

export default function DevTools() {
  const [msg, setMsg] = useState("");
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <section className="section">
      <h2 className="section-header">개발용</h2>
      <div className="group-pad footnote">
      <p style={{ marginBottom: 10 }}>
        시험 데이터 1: 가·나·다·라·마·아·이·고·. 9자 × 2벌 (좌표로 만든 단순한 획)
        <br />
        시험 데이터 2: 등록 글자 473자 (기준 글꼴 뼈대를 자모마다 조금씩 비튼 획 — 조합 위치 계산 확인용)
        <br />둘 다 진짜 손글씨가 아닙니다. 지우기는 둘 다 지웁니다.
      </p>
      <button
        className="btn small gray"
        onClick={async () => {
          const d = await db();
          for (const s of fakeSamples()) await d.put("samples", s);
          await setSetting("lastText", DEMO_TEXT);
          setMsg("시험 데이터를 넣었어요");
        }}
      >
        시험 데이터 넣기
      </button>{" "}
      <button
        className="btn small gray"
        onClick={async () => {
          setMsg("불러오는 중…");
          const res = await fetch(asset("/dev/skeleton-samples.json"));
          if (!res.ok) {
            setMsg("먼저 npx tsx scripts/dev/build-skeleton-samples.ts 를 실행하세요");
            return;
          }
          const list = await res.json();
          const d = await db();
          const tx = d.transaction("samples", "readwrite");
          for (const s of list) tx.store.put(s);
          await tx.done;
          setMsg(`글꼴 뼈대 시험 데이터 ${list.length}자를 넣었어요`);
        }}
      >
        글꼴 뼈대 시험 데이터 넣기 (473자)
      </button>{" "}
      <button
        className="btn small gray"
        onClick={async () => {
          const all = await allSamples();
          const test = all.filter((s) => s.id.startsWith("test-"));
          for (const s of test) await deleteSample(s.id);
          setMsg(`시험 데이터 ${test.length}벌을 지웠어요`);
        }}
      >
        시험 데이터 지우기
      </button>
      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    </section>
  );
}
