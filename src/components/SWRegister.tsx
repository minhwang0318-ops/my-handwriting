"use client";
// 배포판에서만 서비스 워커를 등록한다 (개발 서버에서는 화면 갱신을 방해하므로 쓰지 않음)
import { asset, BASE } from "@/lib/basePath";
import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(asset("/sw.js"), { scope: `${BASE}/` }).catch(() => {});
  }, []);
  return null;
}
