// 데이터 내보내기/가져오기 (JSON 파일). 순수 함수만 두고, 저장소 읽기/쓰기는 화면에서 한다.
import type { Sample } from "@/lib/strokes/types";

export const EXPORT_APP = "my-handwriting";
export const EXPORT_VERSION = 1;

export interface RetryItem {
  char: string;
  reasons: string[];
  at: number;
}

export interface ExportFile {
  app: typeof EXPORT_APP;
  version: number;
  exportedAt: string;
  samples: Sample[];
  retry: RetryItem[];
  /** styleProfile, validateConfig, pageSetup, useCompose, lastText 등 */
  settings: Record<string, unknown>;
}

export function buildExport(samples: Sample[], retry: RetryItem[], settings: Record<string, unknown>, now = new Date()): ExportFile {
  return { app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: now.toISOString(), samples, retry, settings };
}

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

function validPoint(p: unknown): boolean {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return isNum(o.x) && isNum(o.y) && isNum(o.p) && isNum(o.t);
}

/** 한 벌이 올바른 모양인지 (점 좌표까지 확인) */
export function validSample(s: unknown): s is Sample {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return false;
  if (typeof o.char !== "string" || Array.from(o.char).length !== 1) return false;
  if (!Array.isArray(o.strokes) || !Array.isArray(o.jamo)) return false;
  for (const st of o.strokes) {
    if (!st || typeof st !== "object") return false;
    const so = st as Record<string, unknown>;
    if (!["pen", "touch", "mouse"].includes(so.pointer as string)) return false;
    if (!Array.isArray(so.points) || !so.points.every(validPoint)) return false;
  }
  for (const j of o.jamo) {
    if (!j || typeof j !== "object") return false;
    const jo = j as Record<string, unknown>;
    if (![1, 2, 3].includes(jo.label as number) || !isNum(jo.stroke)) return false;
    if (!Array.isArray(jo.points) || !jo.points.every(validPoint)) return false;
  }
  return isNum(o.createdAt);
}

export interface ParsedImport {
  file: ExportFile;
  /** 모양이 잘못돼 뺀 벌 수 */
  skipped: number;
}

/** 가져올 JSON 텍스트를 읽고 확인한다. 이 앱의 파일이 아니면 에러 */
export function parseImport(text: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSON 파일이 아니에요.");
  }
  if (!raw || typeof raw !== "object" || (raw as Record<string, unknown>).app !== EXPORT_APP) {
    throw new Error("이 앱에서 내보낸 파일이 아니에요.");
  }
  const o = raw as Record<string, unknown>;
  if (!isNum(o.version) || (o.version as number) > EXPORT_VERSION) {
    throw new Error("더 새로운 버전의 앱에서 만든 파일이에요. 앱을 새로 고친 뒤 다시 시도해 주세요.");
  }
  const samplesIn = Array.isArray(o.samples) ? o.samples : [];
  const samples = samplesIn.filter(validSample);
  const retry = (Array.isArray(o.retry) ? o.retry : []).filter(
    (r): r is RetryItem => !!r && typeof r === "object" && typeof (r as RetryItem).char === "string" && Array.isArray((r as RetryItem).reasons),
  );
  const settings = o.settings && typeof o.settings === "object" ? (o.settings as Record<string, unknown>) : {};
  return {
    file: { app: EXPORT_APP, version: o.version as number, exportedAt: String(o.exportedAt ?? ""), samples, retry, settings },
    skipped: samplesIn.length - samples.length,
  };
}

export type ImportMode = "merge" | "replace";

/**
 * 가져오기 결과 계산.
 * merge: 지금 있는 벌은 그대로 두고, 같은 id가 없는 벌만 더한다. 설정은 바꾸지 않는다.
 * replace: 지금 데이터를 모두 지우고 파일 내용으로 바꾼다 (설정 포함).
 */
export function planImport(existing: Sample[], file: ExportFile, mode: ImportMode) {
  if (mode === "replace") return { put: file.samples, removeAll: true, added: file.samples.length, settings: file.settings };
  const have = new Set(existing.map((s) => s.id));
  const put = file.samples.filter((s) => !have.has(s.id));
  return { put, removeAll: false, added: put.length, settings: null };
}

export function summarize(samples: Sample[]) {
  const chars = new Set(samples.map((s) => s.char));
  return { samples: samples.length, chars: chars.size };
}
