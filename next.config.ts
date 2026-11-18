import type { NextConfig } from "next";

// NEXT_EXPORT=1 이면 정적 파일(out/)로 내보낸다 (GitHub Pages 등 정적 호스팅용).
// NEXT_PUBLIC_BASE_PATH 는 하위 경로에서 돌 때의 접두사 (예: /my-handwriting).
const base = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: process.env.NEXT_EXPORT ? "export" : undefined,
  basePath: base,
  // 정적 호스팅에서 /write/ → write/index.html 로 확실히 열리게
  trailingSlash: true,
};

export default nextConfig;
