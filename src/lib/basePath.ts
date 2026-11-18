// 앱이 도메인 맨 앞이 아닌 하위 경로(예: GitHub Pages의 /my-handwriting)에서 돌 때를 위한 접두사.
// 빌드할 때 NEXT_PUBLIC_BASE_PATH로 정한다. 개발 서버에서는 빈 문자열.
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** public 폴더 파일의 실제 주소 */
export const asset = (path: string) => `${BASE}${path}`;
