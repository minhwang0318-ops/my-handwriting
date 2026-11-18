// 스타일 프로필 (자연스러움 5가지 기준). 변환할 때 항상 적용한다.
// 단위: mm는 종이 위 밀리미터, "px"는 em(칸)의 1/100 (프로토타입 수치를 그대로 쓰기 위한 약속).

export interface StyleProfile {
  "1_일정함": { size_mm: number; line_pitch_mm: number; slant: number; ink: [number, number, number] };
  "2_글자별차이": { keep_size_diff: number; elastic_px: number; rot_deg: number; scale_sd: number };
  "3_이어지는변화": {
    baseline_sd_mm: number;
    baseline_corr: number;
    size_sd: number;
    size_corr: number;
    line_slope_mm: number;
  };
  "4_간격": {
    char_gap: number;
    char_gap_var: number;
    word_space: number;
    word_space_var: number;
    left_margin_sd_mm: number;
  };
  "5_획질감": { pressure: number; pressure_scale_px: number; smooth_sigma: number; pen_mm: number };
}

export const DEFAULT_PROFILE: StyleProfile = {
  "1_일정함": { size_mm: 10.5, line_pitch_mm: 9.2, slant: 0.0, ink: [28, 32, 60] },
  "2_글자별차이": { keep_size_diff: 0.45, elastic_px: 2.4, rot_deg: 1.2, scale_sd: 0.025 },
  "3_이어지는변화": { baseline_sd_mm: 0.16, baseline_corr: 0.9, size_sd: 0.035, size_corr: 0.93, line_slope_mm: 0.7 },
  "4_간격": { char_gap: 0.045, char_gap_var: 0.6, word_space: 0.3, word_space_var: 0.25, left_margin_sd_mm: 0.9 },
  // pen_mm: 요청서 기본값에는 없던 항목. 필압 1배일 때 선 굵기.
  "5_획질감": { pressure: 0.6, pressure_scale_px: 34, smooth_sigma: 1.4, pen_mm: 0.42 },
};

/** "px" → em */
export const PX = 0.01;

/** 저장된(예전 버전일 수 있는) 프로필을 기본값과 합친다. 없는 항목은 기본값, 숫자가 아닌 값은 버린다. */
export function mergeProfile(saved: unknown): StyleProfile {
  const out = JSON.parse(JSON.stringify(DEFAULT_PROFILE)) as StyleProfile;
  if (!saved || typeof saved !== "object") return out;
  for (const group of Object.keys(out) as (keyof StyleProfile)[]) {
    const src = (saved as Record<string, unknown>)[group];
    if (!src || typeof src !== "object") continue;
    const dst = out[group] as Record<string, unknown>;
    for (const key of Object.keys(dst)) {
      const v = (src as Record<string, unknown>)[key];
      if (key === "ink") {
        if (Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === "number" && c >= 0 && c <= 255)) dst[key] = v;
      } else if (typeof v === "number" && Number.isFinite(v)) dst[key] = v;
    }
  }
  return out;
}

/** 슬라이더 범위와 설명 */
export interface ProfileField {
  group: keyof StyleProfile;
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

export const PROFILE_GROUPS: { group: keyof StyleProfile; title: string; desc: string }[] = [
  { group: "1_일정함", title: "1. 일정함", desc: "글 전체에서 유지되는 크기·줄 간격·기울기·잉크 색" },
  { group: "2_글자별차이", title: "2. 글자별 차이", desc: "같은 글자도 찍을 때마다 조금씩 다르게" },
  { group: "3_이어지는변화", title: "3. 이어지는 변화", desc: "줄 안에서 높이·크기가 앞 글자를 이어받으며 서서히 변함" },
  { group: "4_간격", title: "4. 간격", desc: "글자 간격, 띄어쓰기, 줄 첫머리" },
  { group: "5_획질감", title: "5. 획 질감", desc: "필압과 선 굵기, 매끄럽게" },
];

export const PROFILE_FIELDS: ProfileField[] = [
  { group: "1_일정함", key: "size_mm", label: "글자 칸 크기 (mm)", min: 6, max: 16, step: 0.1, hint: "칸(기준 글자 상자) 한 변. 잉크는 이보다 작음" },
  { group: "1_일정함", key: "line_pitch_mm", label: "줄 간격 (mm)", min: 6, max: 16, step: 0.1, hint: "줄노트 선 간격과 같음" },
  { group: "1_일정함", key: "slant", label: "기울기", min: -0.3, max: 0.3, step: 0.01, hint: "+면 오른쪽으로 기움" },
  { group: "2_글자별차이", key: "keep_size_diff", label: "글자 크기 차이 남기기", min: 0, max: 1, step: 0.05, hint: "1이면 쓴 그대로, 0이면 한글 높이를 모두 맞춤(딱딱해짐)" },
  { group: "2_글자별차이", key: "elastic_px", label: "휨 (px = 칸의 1/100)", min: 0, max: 6, step: 0.1, hint: "찍을 때마다 획이 부드럽게 휘는 정도" },
  { group: "2_글자별차이", key: "rot_deg", label: "회전 (도)", min: 0, max: 4, step: 0.1, hint: "글자마다 돌아가는 정도 (표준편차)" },
  { group: "2_글자별차이", key: "scale_sd", label: "크기 흔들림", min: 0, max: 0.1, step: 0.005, hint: "글자마다 크기가 달라지는 정도 (표준편차)" },
  { group: "3_이어지는변화", key: "baseline_sd_mm", label: "높이 오르내림 (mm)", min: 0, max: 0.6, step: 0.01, hint: "줄 안에서 글자 높이가 오르내리는 폭" },
  { group: "3_이어지는변화", key: "baseline_corr", label: "높이 이어받기", min: 0, max: 0.99, step: 0.01, hint: "1에 가까울수록 앞 글자 높이를 이어받아 서서히 변함" },
  { group: "3_이어지는변화", key: "size_sd", label: "크기 오르내림", min: 0, max: 0.1, step: 0.005, hint: "줄 안에서 글자 크기가 변하는 폭" },
  { group: "3_이어지는변화", key: "size_corr", label: "크기 이어받기", min: 0, max: 0.99, step: 0.01, hint: "1에 가까울수록 서서히 변함" },
  { group: "3_이어지는변화", key: "line_slope_mm", label: "줄 기울어짐 (mm)", min: 0, max: 3, step: 0.1, hint: "한 줄을 지나는 동안 오르내리는 양" },
  { group: "4_간격", key: "char_gap", label: "글자 간격 (칸 대비)", min: -0.05, max: 0.3, step: 0.005, hint: "잉크 끝에서 다음 잉크 시작까지" },
  { group: "4_간격", key: "char_gap_var", label: "글자 간격 불규칙", min: 0, max: 1.5, step: 0.05, hint: "변동계수" },
  { group: "4_간격", key: "word_space", label: "띄어쓰기 폭 (칸 대비)", min: 0.1, max: 0.8, step: 0.01, hint: "" },
  { group: "4_간격", key: "word_space_var", label: "띄어쓰기 불규칙", min: 0, max: 1, step: 0.05, hint: "변동계수" },
  { group: "4_간격", key: "left_margin_sd_mm", label: "줄 첫머리 흔들림 (mm)", min: 0, max: 3, step: 0.1, hint: "" },
  { group: "5_획질감", key: "pressure", label: "필압 반영", min: 0, max: 1, step: 0.05, hint: "0이면 굵기 일정" },
  { group: "5_획질감", key: "pressure_scale_px", label: "굵기 변화 파장 (px)", min: 5, max: 100, step: 1, hint: "필압 없는 입력에서 굵기가 바뀌는 간격" },
  { group: "5_획질감", key: "smooth_sigma", label: "매끄럽게", min: 0, max: 4, step: 0.1, hint: "손떨림을 다듬는 정도" },
  { group: "5_획질감", key: "pen_mm", label: "펜 굵기 (mm)", min: 0.2, max: 1.0, step: 0.01, hint: "" },
];
