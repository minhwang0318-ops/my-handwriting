"use client";
// 브라우저에서 쓰는 자모 상자 함수
import { boxesOf } from "@/lib/regions/client";
import type { BoxFn, NBox } from "./compose";

export function makeBoxFn(bytes: Uint8Array, n: number): BoxFn {
  return (ch) => {
    const b = boxesOf(bytes, ch);
    if (!b) return null;
    return b.map((x) => (x ? (x.map((v) => v / n) as NBox) : null));
  };
}
