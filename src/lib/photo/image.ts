// 사진 처리 기본 도구. 마스크는 W×H Uint8Array (1 = 잉크).

export interface Gray {
  w: number;
  h: number;
  /** 0(검정)..255(흰색) */
  data: Uint8Array;
}

export interface BinMask {
  w: number;
  h: number;
  data: Uint8Array;
}

/** RGBA → 회색 (파란 괘선이 잘 지워지도록 빨강·초록 채널 위주) */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Gray {
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    // 파란 펜/괘선: 파랑이 높고 빨강이 낮다. 사람 글씨(검정·남색)도 빨강·초록이 낮으므로
    // 빨강·초록 평균을 주로 쓰고 파랑은 조금만 섞는다.
    data[i] = Math.round(0.45 * r + 0.45 * g + 0.1 * b);
  }
  return { w, h, data };
}

/**
 * 적응형 이진화: 주변(창 크기 win) 평균보다 offset 이상 어두우면 잉크.
 * 조명이 고르지 않은 사진에서도 동작한다. 적분 영상으로 빠르게 계산.
 */
export function adaptiveThreshold(g: Gray, win: number, offset: number): BinMask {
  const { w, h, data } = g;
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(1, Math.floor(win / 2));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = integ[y1 * (w + 1) + x1] - integ[y0 * (w + 1) + x1] - integ[y1 * (w + 1) + x0] + integ[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = data[y * w + x] < mean - offset ? 1 : 0;
    }
  }
  return { w, h, data: out };
}

/**
 * 공책 괘선·밑줄 지우기.
 * 1) 가로로 minLen 이상 이어진 잉크
 * 2) 행 전체 너비의 rowFrac 이상이 잉크인 행 (괘선이 글자와 닿아 짧게 끊겨도 잡기 위해)
 * 위 두 경우에서, 위아래 두께가 maxThick 이하인 부분만 지운다 (글자 획은 보통 더 두껍거나 세로로 이어짐).
 */
export function removeLongLines(m: BinMask, minLen: number, maxThick = 4, rowFrac = 0.35): BinMask {
  const { w, h } = m;
  const out = m.data.slice();
  const thinAt = (k: number, y: number): [number, number] | null => {
    let up = y;
    while (up > 0 && m.data[(up - 1) * w + k]) up--;
    let dn = y;
    while (dn < h - 1 && m.data[(dn + 1) * w + k]) dn++;
    return dn - up + 1 <= maxThick ? [up, dn] : null;
  };
  const erase = (k: number, y: number) => {
    const r = thinAt(k, y);
    if (r) for (let yy = r[0]; yy <= r[1]; yy++) out[yy * w + k] = 0;
  };
  for (let y = 0; y < h; y++) {
    let rowInk = 0;
    for (let x = 0; x < w; x++) rowInk += m.data[y * w + x];
    if (rowInk >= w * rowFrac) {
      for (let x = 0; x < w; x++) if (m.data[y * w + x]) erase(x, y);
      continue;
    }
    let x = 0;
    while (x < w) {
      if (!m.data[y * w + x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < w && m.data[y * w + e]) e++;
      if (e - x >= minLen) for (let k = x; k < e; k++) erase(k, y);
      x = e;
    }
  }
  return { w, h, data: out };
}

export interface Component {
  id: number;
  x0: number;
  y0: number;
  x1: number; // 포함 안 함
  y1: number;
  area: number;
}

/** 8방향 연결 덩어리. labels[i] = 덩어리 번호(1부터), 0 = 배경 */
export function connectedComponents(m: BinMask): { labels: Int32Array; comps: Component[] } {
  const { w, h, data } = m;
  const labels = new Int32Array(w * h);
  const comps: Component[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!data[i] || labels[i]) continue;
    const id = comps.length + 1;
    const c: Component = { id, x0: w, y0: h, x1: 0, y1: 0, area: 0 };
    labels[i] = id;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p / w) | 0;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (y < c.y0) c.y0 = y;
      if (x + 1 > c.x1) c.x1 = x + 1;
      if (y + 1 > c.y1) c.y1 = y + 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (data[q] && !labels[q]) {
            labels[q] = id;
            stack.push(q);
          }
        }
      }
    }
    comps.push(c);
  }
  return { labels, comps };
}

/** Zhang–Suen 세선화 (W×H) */
export function thin(src: Uint8Array, w: number, h: number): Uint8Array {
  const m = src.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const del: number[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!m[y * w + x]) continue;
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const b = p.reduce((a, v) => a + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) a++;
          if (a !== 1) continue;
          if (step === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          del.push(y * w + x);
        }
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

/** 뼈대 픽셀 → 폴리라인들 (끝점부터 이웃을 따라감). 좌표는 픽셀 가운데 (x+0.5, y+0.5) */
export function trace(sk: Uint8Array, w: number, h: number, minLen = 1): [number, number][][] {
  const seen = new Uint8Array(w * h);
  const nb = (i: number) => {
    const x = i % w;
    const y = (i / w) | 0;
    const out: number[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && sk[yy * w + xx]) out.push(yy * w + xx);
    }
    return out;
  };
  const lines: [number, number][][] = [];
  const order = [...Array(w * h).keys()].filter((i) => sk[i]).sort((a, b) => nb(a).length - nb(b).length);
  for (const s of order) {
    if (seen[s]) continue;
    const line: [number, number][] = [];
    let cur = s;
    while (cur >= 0) {
      seen[cur] = 1;
      line.push([(cur % w) + 0.5, ((cur / w) | 0) + 0.5]);
      cur = nb(cur).find((j) => !seen[j]) ?? -1;
    }
    if (line.length >= minLen) lines.push(line);
  }
  return lines;
}
