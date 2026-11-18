import { asset, BASE } from "@/lib/basePath";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "내 손글씨",
    short_name: "내 손글씨",
    description: "내 손글씨를 등록하고 타이핑한 글을 내 글씨로 바꿔 주는 앱",
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "ko",
    icons: [
      { src: asset("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: asset("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
  };
}
