// 오프라인용 서비스 워커. 배포판(npm run build)에서만 등록된다.
// - 앱 화면과 기준 글꼴·자모 데이터를 처음 설치할 때 받아 둔다
// - /_next/static (빌드마다 이름이 바뀌는 파일): 캐시 우선
// - 화면(HTML): 네트워크 우선, 안 되면 캐시
// - 글꼴·자모 데이터·아이콘: 캐시를 바로 쓰고 뒤에서 새로 받아 둔다
const VERSION = "v5";
// 하위 경로(예: GitHub Pages의 /my-handwriting)에서도 돌도록 등록 범위에서 접두사를 얻는다
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const CACHE = `hw-${VERSION}`;
const PAGES = ["/", "/write/", "/upload/", "/convert/", "/compare/", "/settings/"].map((p) => BASE + p);
const CORE = [
  ...PAGES,
  ...[
  "/manifest.webmanifest",
  "/fonts/NotoSansKR-Regular.ttf",
  "/data/jamo-masks.json",
  "/data/jamo-boxes.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  ].map((p) => BASE + p),
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      await c.addAll(CORE);
      // 각 화면 HTML이 불러오는 /_next/static 파일(JS·CSS)도 미리 받아 둔다.
      // 그래야 한 번도 열어 보지 않은 화면도 오프라인에서 열린다.
      const assets = new Set();
      for (const page of PAGES) {
        const res = await c.match(page);
        if (!res) continue;
        const html = await res.text();
        // HTML 안의 경로는 접두사(BASE)가 붙은 채로 나오므로, 접두사 뒤 부분만 찾아 BASE를 다시 붙인다
        for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(BASE + m[0]);
      }
      await Promise.all([...assets].map((a) => c.add(a).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hw-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    const hit = (await caches.match(req, { ignoreSearch: true })) || (await caches.match(BASE + "/"));
    if (hit) return hit;
    throw new Error("offline");
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await fresh) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE + "/")) return;
  const path = url.pathname.slice(BASE.length); // 접두사를 뗀 경로
  if (path.startsWith("/dev/")) return; // 개발용 시험 데이터는 캐시하지 않음
  if (path.startsWith("/_next/static/")) return e.respondWith(cacheFirst(req));
  if (req.mode === "navigate") return e.respondWith(networkFirst(req));
  if (/^\/(fonts|data|icons)\//.test(path) || path === "/manifest.webmanifest") {
    return e.respondWith(staleWhileRevalidate(req));
  }
});
