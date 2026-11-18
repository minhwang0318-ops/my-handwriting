// 아이콘: 한 가지 선 굵기(1.8)로 직접 그린 SVG. 글자 기호(‹ › ↺ ●) 대신 쓴다.
import type { SVGProps } from "react";

const PATHS = {
  back: <path d="M15 4.5 7.5 12l7.5 7.5" />,
  forward: <path d="M9 4.5 16.5 12 9 19.5" />,
  chevron: <path d="M1.5 1.5 6.5 7l-5 5.5" />,
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  clear: (
    <>
      <path d="M5 7h14" />
      <path d="M10 4h4" />
      <path d="M7 7l.8 12.2a1.8 1.8 0 0 0 1.8 1.8h4.8a1.8 1.8 0 0 0 1.8-1.8L17 7" />
    </>
  ),
  check: <path d="M5 12.5 10 17.5 19 7" />,
  rotateL: (
    <>
      <path d="M4 4v5h5" />
      <path d="M4.6 9A8 8 0 1 1 6 17.6" />
    </>
  ),
  rotateR: (
    <>
      <path d="M20 4v5h-5" />
      <path d="M19.4 9A8 8 0 1 0 18 17.6" />
    </>
  ),
  pen: (
    <>
      <path d="M15.5 4.5 19.5 8.5 8.5 19.5H4.5v-4z" />
      <path d="M13 7l4 4" />
    </>
  ),
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M3.5 17 9 12.5l3.5 3 3-2.5 5 4" />
    </>
  ),
  doc: (
    <>
      <path d="M6.5 3h7.5l4.5 4.5V19a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M13.5 3v5h5" />
      <path d="M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  compare: (
    <>
      <rect x="3" y="5" width="7.5" height="14" rx="1.8" />
      <rect x="13.5" y="5" width="7.5" height="14" rx="1.8" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M12 3.5v17M3.5 12h17" />
    </>
  ),
  list: <path d="M4 6h16M4 12h16M4 18h16" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.2" strokeWidth={2.6} />
    </>
  ),
  warn: (
    <>
      <path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5" />
      <path d="M12 17.1v.2" strokeWidth={2.6} />
    </>
  ),
  ok: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3 10.8 15 16 9.5" />
    </>
  ),
  device: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  shuffle: (
    <>
      <path d="M3.5 7h3.2c2 0 3.2 1 4.3 2.6l2 3c1.1 1.6 2.3 2.4 4.3 2.4h3.2" />
      <path d="M3.5 15h3.2c1 0 1.8-.3 2.5-.8M13.5 8c.8-.6 1.7-1 3-1h3.5" />
      <path d="M18 4.5 20.5 7 18 9.5M18 12.5l2.5 2.5-2.5 2.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const vb = name === "chevron" ? "0 0 8 14" : "0 0 24 24";
  return (
    <svg
      viewBox={vb}
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "chevron" ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
