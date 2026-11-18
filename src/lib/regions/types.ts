// public/data/*.json 형식. 빌드 스크립트와 앱이 함께 쓴다.

/** 기준 글자를 칸에 그리는 방법 (스크립트와 브라우저가 같은 규칙을 써야 영역이 맞는다) */
export interface GlyphFrame {
  /** 라벨맵 한 변 픽셀 수 */
  size: number;
  /** 글꼴 크기 = size × fontScale */
  fontScale: number;
  /** 기준선 y = size × baseline */
  baseline: number;
  /** 가로 위치: 글자 폭(advance)을 칸 가운데에 둔다 */
  fontFile: string;
}

export interface JamoMasksFile {
  frame: GlyphFrame;
  /** 글자 → 라벨맵 RLE. 한글: 1=초성 2=중성 3=종성, 그 외: 1=전체 */
  chars: Record<string, number[]>;
  /** 배치 공유 획 (키: "vertical:false" 등) RLE. 브라우저에서 새 글자를 계산할 때 쓴다 */
  shared?: Record<string, number[]>;
}

export interface JamoBoxesFile {
  frame: GlyphFrame;
  /**
   * 한글 11,172자 × 12바이트를 base64로.
   * 글자마다 [초성 x0 y0 x1 y1, 중성 x0 y0 x1 y1, 종성 x0 y0 x1 y1] (size 기준 픽셀, 없으면 0 0 0 0)
   */
  boxes: string;
}
