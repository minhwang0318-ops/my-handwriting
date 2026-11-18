import Link from "next/link";
import DevTools from "@/components/DevTools";
import Icon, { type IconName } from "@/components/Icon";

function Row({ href, icon, title, sub }: { href: string; icon: IconName; title: string; sub?: string }) {
  return (
    <Link href={href} className="cell has-icon">
      <Icon name={icon} className="cell-icon" />
      <span className="cell-main">
        {title}
        {sub && <span className="cell-sub">{sub}</span>}
      </span>
      <Icon name="chevron" className="cell-chevron" />
    </Link>
  );
}

export default function Home() {
  return (
    <main className="page">
      <h1 className="large-title" style={{ marginTop: 32 }}>
        내 손글씨
      </h1>
      <p className="lede">내 글씨를 한 번 등록해 두면, 타이핑한 글을 내가 손으로 쓴 것 같은 페이지(PDF·PNG)로 바꿔 줘요.</p>

      <section className="section">
        <h2 className="section-header">글씨 등록</h2>
        <div className="group">
          <Row href="/write" icon="pen" title="따라 쓰기" sub="흐린 기준 글자 위에 한 자씩 써요" />
          <Row href="/upload" icon="photo" title="사진에서 가져오기" sub="예전에 쓴 편지·레포트 사진으로 등록해요" />
        </div>
        <p className="section-footer">따라 쓰기는 아이패드(애플 펜슬)나 휴대폰(손가락)을 추천해요. 사파리에서 공유 → &lsquo;홈 화면에 추가&rsquo;를 누르면 앱처럼 설치돼요.</p>
      </section>

      <section className="section">
        <h2 className="section-header">쓰기</h2>
        <div className="group">
          <Row href="/convert" icon="doc" title="내 글씨로 바꾸기" sub="글을 붙여 넣고 PDF·PNG로 저장해요" />
        </div>
      </section>

      <section className="section">
        <h2 className="section-header">확인 · 설정</h2>
        <div className="group">
          <Row href="/compare" icon="compare" title="조합 품질 비교" />
          <Row href="/settings" icon="gear" title="설정" sub="스타일 · 검증 기준 · 데이터 내보내기/가져오기" />
          <Row href="/check/regions" icon="grid" title="기준 글자 자모 영역" />
        </div>
      </section>
      <DevTools />
    </main>
  );
}
