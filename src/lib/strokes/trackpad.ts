// 맥북 트랙패드로 쓰기: 버튼을 누르지 않고 커서를 움직여도 획이 그려지게 하는 "펜 내리기/올리기" 규칙.
//
// 브라우저는 트랙패드의 손가락 위치(절대 좌표)를 알 수 없고 커서 움직임만 받는다.
// 그래서 "펜이 종이에 닿은 상태"를 따로 정해 준다:
//  1) 스페이스 바를 누르고 있는 동안 = 펜 내림 (한 손은 스페이스, 한 손가락은 트랙패드)
//  2) 톡(클릭) 한 번 = 펜 내림, 다시 톡 = 펜 올림 (움직이지 않고 짧게 누른 것만 '톡'으로 봄)
//  3) 지금처럼 누른 채 끌기(클릭 드래그, 세 손가락 드래그)도 그대로 된다
// 펜이 내려간 채 커서가 칸 밖으로 나가거나 Esc를 누르면 펜을 올린다.

export interface PadPoint {
  x: number;
  y: number;
  t: number; // ms
}

export interface PadCallbacks {
  start(p: PadPoint): void;
  add(p: PadPoint): void;
  end(): void;
}

export type PenSource = "drag" | "tap" | "space";

/** 톡으로 볼 최대 이동 거리(칸 너비 대비)와 시간(ms) */
export const TAP_DIST = 0.012;
export const TAP_TIME = 350;

export class TrackpadPen {
  /** 지금 펜을 내린 방법 (null = 올림) */
  source: PenSource | null = null;
  private last: PadPoint | null = null;
  private press: { p: PadPoint; moved: boolean } | null = null;

  constructor(private cb: PadCallbacks) {}

  get down() {
    return this.source !== null;
  }

  private isTap(p: PadPoint) {
    const pr = this.press;
    return !!pr && !pr.moved && p.t - pr.p.t <= TAP_TIME;
  }

  pointerDown(p: PadPoint) {
    this.last = p;
    this.press = { p, moved: false };
    if (this.source === null) {
      this.source = "drag";
      this.cb.start(p);
    }
  }

  /** buttons와 상관없이 칸 위에서 움직일 때마다 */
  move(p: PadPoint) {
    this.last = p;
    if (this.press && Math.hypot(p.x - this.press.p.x, p.y - this.press.p.y) > TAP_DIST) this.press.moved = true;
    if (this.source !== null) this.cb.add(p);
  }

  pointerUp(p: PadPoint) {
    this.last = p;
    const tap = this.isTap(p);
    this.press = null;
    if (this.source === "drag") {
      if (tap) this.source = "tap"; // 움직이지 않은 짧은 클릭 → 펜을 내린 채로 둔다
      else this.end();
    } else if (this.source === "tap" && tap) {
      this.end(); // 다시 톡 → 펜 올림
    }
  }

  spaceDown() {
    if (this.source !== null || !this.last) return;
    this.source = "space";
    this.cb.start(this.last);
  }

  spaceUp() {
    if (this.source === "space") this.end();
  }

  /** 칸 밖으로 나감 / Esc / 글자 바뀜 */
  cancel() {
    this.press = null;
    if (this.source !== null) this.end();
  }

  private end() {
    this.source = null;
    this.cb.end();
  }
}
