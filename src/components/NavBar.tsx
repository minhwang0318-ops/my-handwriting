// 화면 위 막대: 왼쪽에 '처음'으로 돌아가는 버튼, 가운데 화면 이름.
import Link from "next/link";
import Icon from "./Icon";

export default function NavBar({ title, back = { href: "/", label: "처음" }, trail }: { title?: string; back?: { href: string; label: string } | null; trail?: React.ReactNode }) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        {back ? (
          <Link href={back.href} className="navbar-back">
            <Icon name="back" width={22} height={22} strokeWidth={2.2} />
            {back.label}
          </Link>
        ) : (
          <span />
        )}
        <span className="navbar-title">{title}</span>
        <span className="navbar-trail">{trail}</span>
      </div>
    </header>
  );
}
