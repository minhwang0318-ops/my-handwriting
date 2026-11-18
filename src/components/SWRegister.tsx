"use client";
// 배포판에서만 서비스 워커를 등록한다 (개발 서버에서는 화면 갱신을 방해하므로 쓰지 않음)
// 새 버전이 배포되면: 앱을 다시 볼 때마다 확인하고, 새 서비스 워커가 자리를 잡으면 화면을 한 번 새로 고친다.
import { asset, BASE } from "@/lib/basePath";
import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const hadController = !!sw.controller; // 처음 설치할 때는 새로 고칠 필요 없음
    let reloaded = false;
    const onChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    sw.addEventListener("controllerchange", onChange);
    let reg: ServiceWorkerRegistration | undefined;
    sw.register(asset("/sw.js"), { scope: `${BASE}/`, updateViaCache: "none" })
      .then((r) => {
        reg = r;
        r.update().catch(() => {});
      })
      .catch(() => {});
    // 홈 화면 앱을 다시 열거나 탭으로 돌아올 때 새 버전 확인
    const onVis = () => document.visibilityState === "visible" && reg?.update().catch(() => {});
    document.addEventListener("visibilitychange", onVis);
    return () => {
      sw.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}
