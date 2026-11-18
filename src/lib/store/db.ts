"use client";
// IndexedDB 저장소. 모든 데이터는 이 기기 안에만 있다.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Sample } from "@/lib/strokes/types";

export interface RetryEntry {
  char: string;
  reasons: string[];
  at: number;
}

interface HwDB extends DBSchema {
  samples: { key: string; value: Sample; indexes: { byChar: string } };
  retry: { key: string; value: RetryEntry };
  settings: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<HwDB>> | null = null;
export function db() {
  if (!dbp) {
    dbp = openDB<HwDB>("handwriting", 1, {
      upgrade(d) {
        const s = d.createObjectStore("samples", { keyPath: "id" });
        s.createIndex("byChar", "char");
        d.createObjectStore("retry", { keyPath: "char" });
        d.createObjectStore("settings");
      },
    });
    // 저장 공간을 지우지 않도록 요청 (지원하는 브라우저만)
    navigator.storage?.persist?.().catch(() => {});
  }
  return dbp;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveSample(s: Sample) {
  const d = await db();
  const tx = d.transaction(["samples", "retry"], "readwrite");
  await tx.objectStore("samples").put(s);
  await tx.objectStore("retry").delete(s.char);
  await tx.done;
}

export async function deleteSample(id: string) {
  await (await db()).delete("samples", id);
}

export async function samplesOf(char: string): Promise<Sample[]> {
  return (await db()).getAllFromIndex("samples", "byChar", char);
}

export async function allSamples(): Promise<Sample[]> {
  return (await db()).getAll("samples");
}

/** 글자별 저장된 벌 수 */
export async function sampleCounts(): Promise<Map<string, number>> {
  const d = await db();
  const out = new Map<string, number>();
  let cursor = await d.transaction("samples").store.index("byChar").openKeyCursor();
  while (cursor) {
    out.set(cursor.key, (out.get(cursor.key) ?? 0) + 1);
    cursor = await cursor.continue();
  }
  return out;
}

export async function addRetry(e: RetryEntry) {
  await (await db()).put("retry", e);
}

export async function removeRetry(char: string) {
  await (await db()).delete("retry", char);
}

export async function retryList(): Promise<RetryEntry[]> {
  return (await db()).getAll("retry");
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const v = await (await db()).get("settings", key);
  return (v as T | undefined) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await (await db()).put("settings", value, key);
}

export const SETTING_KEYS = ["styleProfile", "validateConfig", "pageSetup", "useCompose", "lastText"] as const;

export async function allSettings(): Promise<Record<string, unknown>> {
  const d = await db();
  const out: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) {
    const v = await d.get("settings", k);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** 여러 벌·다시 쓰기 목록·설정을 한 번에 쓴다. removeAll이면 먼저 전부 지운다 */
export async function writeBulk(opts: { samples: Sample[]; retry?: RetryEntry[]; settings?: Record<string, unknown> | null; removeAll?: boolean }) {
  const d = await db();
  const tx = d.transaction(["samples", "retry", "settings"], "readwrite");
  if (opts.removeAll) {
    await tx.objectStore("samples").clear();
    await tx.objectStore("retry").clear();
    await tx.objectStore("settings").clear();
  }
  for (const s of opts.samples) await tx.objectStore("samples").put(s);
  for (const r of opts.retry ?? []) await tx.objectStore("retry").put(r);
  if (opts.settings) {
    for (const k of SETTING_KEYS) if (k in opts.settings) await tx.objectStore("settings").put(opts.settings[k], k);
  }
  await tx.done;
}

export async function clearAll() {
  await writeBulk({ samples: [], removeAll: true });
}
