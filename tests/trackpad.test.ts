import { describe, it, expect } from "vitest";
import { TrackpadPen, type PadPoint } from "@/lib/strokes/trackpad";

function setup() {
  const log: string[] = [];
  const strokes: PadPoint[][] = [];
  let cur: PadPoint[] | null = null;
  const pen = new TrackpadPen({
    start: (p) => {
      log.push("start");
      cur = [p];
    },
    add: (p) => cur!.push(p),
    end: () => {
      log.push("end");
      strokes.push(cur!);
      cur = null;
    },
  });
  return { pen, log, strokes, live: () => cur };
}
const P = (x: number, y: number, t: number) => ({ x, y, t });

describe("트랙패드 펜", () => {
  it("누른 채 끌기는 지금처럼 한 획", () => {
    const { pen, log, strokes } = setup();
    pen.move(P(0.1, 0.1, 0)); // 떠 있는 동안 움직임은 그리지 않음
    pen.pointerDown(P(0.1, 0.1, 10));
    pen.move(P(0.3, 0.1, 50));
    pen.move(P(0.5, 0.1, 90));
    pen.pointerUp(P(0.5, 0.1, 100));
    pen.move(P(0.7, 0.7, 150));
    expect(log).toEqual(["start", "end"]);
    expect(strokes[0].map((p) => p.x)).toEqual([0.1, 0.3, 0.5]);
    expect(pen.down).toBe(false);
  });

  it("톡 → 펜 내림, 버튼 없이 움직여도 그려지고, 다시 톡 → 펜 올림", () => {
    const { pen, log, strokes } = setup();
    pen.pointerDown(P(0.2, 0.2, 0));
    pen.pointerUp(P(0.2, 0.2, 80));
    expect(pen.source).toBe("tap");
    pen.move(P(0.4, 0.2, 120));
    pen.move(P(0.6, 0.3, 160));
    pen.pointerDown(P(0.6, 0.3, 200));
    pen.pointerUp(P(0.6, 0.3, 260));
    expect(log).toEqual(["start", "end"]);
    expect(strokes[0].length).toBe(3);
    expect(pen.down).toBe(false);
  });

  it("길게 누른 클릭이나 움직인 클릭은 톡이 아니다", () => {
    const { pen, log } = setup();
    pen.pointerDown(P(0.2, 0.2, 0));
    pen.pointerUp(P(0.2, 0.2, 900)); // 오래 누름 → 그냥 점 하나 찍고 끝
    expect(log).toEqual(["start", "end"]);
    expect(pen.down).toBe(false);
  });

  it("펜 내린(톡) 상태에서 누른 채 끌어도 획은 이어지고, 톡이 아니면 펜은 그대로", () => {
    const { pen, log } = setup();
    pen.pointerDown(P(0.2, 0.2, 0));
    pen.pointerUp(P(0.2, 0.2, 50));
    pen.pointerDown(P(0.2, 0.2, 100));
    pen.move(P(0.5, 0.5, 150));
    pen.pointerUp(P(0.5, 0.5, 200));
    expect(log).toEqual(["start"]);
    expect(pen.source).toBe("tap");
  });

  it("스페이스를 누른 동안 = 펜 내림 (마지막 커서 위치에서 시작)", () => {
    const { pen, log, strokes } = setup();
    pen.spaceDown(); // 아직 커서 위치를 모름 → 무시
    expect(log).toEqual([]);
    pen.move(P(0.3, 0.3, 0));
    pen.spaceDown();
    pen.move(P(0.35, 0.4, 30));
    pen.spaceDown(); // 키 반복은 무시
    pen.move(P(0.4, 0.5, 60));
    pen.spaceUp();
    pen.move(P(0.9, 0.9, 90));
    expect(log).toEqual(["start", "end"]);
    expect(strokes[0].map((p) => p.y)).toEqual([0.3, 0.4, 0.5]);
  });

  it("스페이스로 쓰는 중 클릭은 획을 끊지 않는다", () => {
    const { pen, log } = setup();
    pen.move(P(0.3, 0.3, 0));
    pen.spaceDown();
    pen.pointerDown(P(0.3, 0.3, 10));
    pen.pointerUp(P(0.3, 0.3, 40));
    pen.move(P(0.5, 0.3, 60));
    expect(log).toEqual(["start"]);
    pen.spaceUp();
    expect(log).toEqual(["start", "end"]);
  });

  it("칸 밖으로 나가거나 Esc면 펜을 올린다", () => {
    const { pen, log } = setup();
    pen.pointerDown(P(0.2, 0.2, 0));
    pen.pointerUp(P(0.2, 0.2, 40));
    pen.cancel();
    expect(log).toEqual(["start", "end"]);
    pen.cancel(); // 이미 올림 → 아무 일 없음
    expect(log).toEqual(["start", "end"]);
  });
});
