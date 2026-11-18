import { asset } from "@/lib/basePath";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import SWRegister from "@/components/SWRegister";

export const metadata: Metadata = {
  title: "내 손글씨",
  description: "내 손글씨를 등록하고 타이핑한 글을 내 글씨로 바꿔 주는 앱",
  appleWebApp: { capable: true, title: "내 손글씨", statusBarStyle: "default" },
  icons: { icon: asset("/icons/icon-192.png"), apple: asset("/icons/apple-touch-icon.png") },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
