import Link from "next/link";
import DevTools from "@/components/DevTools";

export default function Home() {
  return (
    <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem" }}>내 손글씨</h1>
      <p>개발 중입니다.</p>
      <ul style={{ lineHeight: 2 }}>
        <li>
          <Link href="/write">내 글씨 등록하기 (따라 쓰기)</Link>
        </li>
        <li>
          <Link href="/upload">사진에서 내 글씨 가져오기 (예전 편지·레포트)</Link>
        </li>
        <li>
          <Link href="/convert">내 글씨로 바꾸기</Link>
        </li>
        <li>
          <Link href="/compare">조합 품질 비교</Link>
        </li>
        <li>
          <Link href="/settings">설정 (스타일·검증 기준·데이터 내보내기/가져오기)</Link>
        </li>
        <li>
          <Link href="/check/regions">1단계 확인: 기준 글자 자모 영역</Link>
        </li>
      </ul>
      <DevTools />
    </main>
  );
}
