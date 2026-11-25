// 기울이기(skew)·비등방 확대가 섞인 2D 변환을 Android에서도 똑같이 그리기 위한 분해.
// Android View는 이동·회전·확대만 표현한다. RN이 행렬을 그 셋으로 나눌 때 기울이기 성분을 버려
// 홈 큐브 뚜껑·옆면이 회전한 사각형으로 깨졌다(2026-11-25 실기기 P8). 어떤 2×2 변환이든
// 회전(φ) · 축 확대(sx, sy) · 회전(θ)로 나뉘므로(특이값 분해), 같은 크기 View 세 겹에 하나씩 건다.

/** CSS matrix(a, b, c, d)와 같은 순서: x축 단위 → (a, b), y축 단위 → (c, d). 화면 좌표(y 아래). */
export type Mat2 = readonly [number, number, number, number];

const RAD = Math.PI / 180;

export function rotateMat(deg: number): Mat2 {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [c, s, -s, c];
}
export const scaleMat = (sx: number, sy: number): Mat2 => [sx, 0, 0, sy];
export const skewXMat = (deg: number): Mat2 => [1, 0, Math.tan(deg * RAD), 1];
export const skewYMat = (deg: number): Mat2 => [1, Math.tan(deg * RAD), 0, 1];

/** p·q — CSS `transform: P Q`(q를 먼저 적용)와 같은 곱 */
export function mulMat(p: Mat2, q: Mat2): Mat2 {
  const [a, b, c, d] = p;
  const [e, f, g, h] = q;
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h];
}

/** CSS 변환 목록(왼쪽부터)을 하나의 행렬로 */
export const composeMat = (...ms: Mat2[]): Mat2 => ms.reduce(mulMat, [1, 0, 0, 1]);

export type Svd2 = { phi: number; sx: number; sy: number; theta: number };

/** m = rotate(phi) · scale(sx, sy) · rotate(theta), 각도는 도 */
export function svd2([a, b, c, d]: Mat2): Svd2 {
  const e = (a + d) / 2;
  const f = (a - d) / 2;
  const g = (b + c) / 2;
  const h = (b - c) / 2;
  const q = Math.hypot(e, h);
  const r = Math.hypot(f, g);
  const a1 = Math.atan2(g, f);
  const a2 = Math.atan2(h, e);
  return { phi: (a2 + a1) / 2 / RAD, sx: q + r, sy: q - r, theta: (a2 - a1) / 2 / RAD };
}

type Transform = Array<{ translateX: number } | { translateY: number } | { rotate: string } | { scaleX: number } | { scaleY: number }>;

/**
 * w×h 상자를 (ox, oy)(상자 왼쪽 위 기준)를 고정점으로 m만큼 바꾸는 세 겹 변환.
 * 세 겹은 크기·위치가 같아 가운데가 같으므로(RN 기본 transformOrigin = 가운데) 차이만큼 바깥에서 옮긴다.
 * 바깥 → 가운데 → 안쪽 순서로 감싼다(안쪽 변환이 먼저 적용).
 */
export function affineLayers(m: Mat2, w: number, h: number, ox = w / 2, oy = h / 2) {
  const { phi, sx, sy, theta } = svd2(m);
  const px = ox - w / 2;
  const py = oy - h / 2;
  // 고정점 P(가운데 기준)를 지키려면 (I - M)·P만큼 옮긴다
  const dx = px - (m[0] * px + m[2] * py);
  const dy = py - (m[1] * px + m[3] * py);
  const outer: Transform = [{ translateX: dx }, { translateY: dy }, { rotate: `${phi}deg` }];
  const middle: Transform = [{ scaleX: sx }, { scaleY: sy }];
  const inner: Transform = [{ rotate: `${theta}deg` }];
  return { outer, middle, inner };
}
