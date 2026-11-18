// 획 데이터. 좌표는 칸(= 기준 글꼴의 em 상자) 기준 0..1 로 정규화한다.

export interface Point {
  x: number;
  y: number;
  /** 필압 0..1. 필압이 없는 입력(마우스·손가락)은 0.5 고정 */
  p: number;
  /** 획 시작부터의 시간(ms) */
  t: number;
}

export type PointerKind = "pen" | "touch" | "mouse";

export interface Stroke {
  points: Point[];
  pointer: PointerKind;
  /** 같은 글자 안에서 첫 획 시작으로부터 이 획이 시작한 시간(ms) */
  start: number;
}

/** 자모 하나에 배정된 획 조각. label: 1=초성 2=중성 3=종성 (한글 아닌 글자는 1=전체) */
export interface JamoStroke {
  label: number;
  /** 원래 획 번호 */
  stroke: number;
  points: Point[];
}

export interface Sample {
  id: string;
  char: string;
  strokes: Stroke[];
  jamo: JamoStroke[];
  createdAt: number;
  /** 필압이 있는 입력(펜)으로 썼는지 */
  hasPressure: boolean;
}

export const hasRealPressure = (s: Stroke) => s.pointer === "pen";
