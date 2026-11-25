// Android에서 깨지던 큐브 면(skew) — 세 겹(회전·축 확대·회전)이 원래 CSS 변환과 같은 점으로 보내는지
import { describe, expect, test } from "@jest/globals";
import { affineLayers, composeMat, mulMat, rotateMat, scaleMat, skewXMat, skewYMat, svd2, type Mat2 } from "../affine";

const close = (p: Mat2, q: Mat2) => p.forEach((v, i) => expect(v).toBeCloseTo(q[i]!, 9));

/** RN이 한 View의 변환을 가운데 기준으로 적용하는 방식 그대로 세 겹을 점에 적용 */
function applyLayers(layers: ReturnType<typeof affineLayers>, w: number, h: number, x: number, y: number): [number, number] {
  let px = x - w / 2;
  let py = y - h / 2;
  const apply = (t: Record<string, number | string>) => {
    if ("rotate" in t) {
      const [a, b, c, d] = rotateMat(parseFloat(String(t.rotate)));
      [px, py] = [a * px + c * py, b * px + d * py];
    } else if ("scaleX" in t) px *= Number(t.scaleX);
    else if ("scaleY" in t) py *= Number(t.scaleY);
    else if ("translateX" in t) px += Number(t.translateX);
    else if ("translateY" in t) py += Number(t.translateY);
  };
  // 안쪽 겹부터. 한 겹 안에서는 목록 오른쪽 항목이 먼저(CSS와 같음)
  for (const layer of [layers.inner, layers.middle, layers.outer]) [...layer].reverse().forEach(apply);
  return [px + w / 2, py + h / 2];
}

describe("affine", () => {
  const cases: Array<[string, Mat2]> = [
    ["뚜껑 scaleY·rotate45", composeMat(scaleMat(1, 110.8 / 192), rotateMat(45))],
    ["이름 상자", composeMat(rotateMat(-30), skewXMat(30), scaleMat(1, 0.866))],
    ["왼쪽 면", skewYMat(30)],
    ["오른쪽 면", skewYMat(-30)],
  ];

  test.each(cases)("%s: 회전·축 확대·회전으로 되돌리면 원래 행렬", (_n, m) => {
    const { phi, sx, sy, theta } = svd2(m);
    expect(sy).toBeGreaterThan(0); // 뒤집힘 없음
    close(composeMat(rotateMat(phi), scaleMat(sx, sy), rotateMat(theta)), m);
  });

  test("왼쪽 위 고정 skewY(30°): 네 모서리가 CSS와 같은 자리", () => {
    const m = skewYMat(30);
    const layers = affineLayers(m, 96, 78, 0, 0);
    for (const [x, y] of [[0, 0], [96, 0], [0, 78], [96, 78]] as const) {
      const [ex, ey] = [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
      const [gx, gy] = applyLayers(layers, 96, 78, x, y);
      expect(gx).toBeCloseTo(ex, 9);
      expect(gy).toBeCloseTo(ey, 9);
    }
    // 오른쪽 위 모서리가 96·tan30 = 55.4만큼 내려간다 → 평행사변형(회전한 사각형이 아님)
    expect(applyLayers(layers, 96, 78, 96, 0)[1]).toBeCloseTo(55.43, 1);
  });

  test("가운데 고정 뚜껑: 정사각형이 192×110.8 마름모가 된다", () => {
    const s = 192 / Math.SQRT2;
    const layers = affineLayers(composeMat(scaleMat(1, 110.8 / 192), rotateMat(45)), s, s);
    const pts = ([[0, 0], [s, 0], [s, s], [0, s]] as const).map(([x, y]) => applyLayers(layers, s, s, x, y));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(192, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(110.8, 6);
  });

  test("mulMat은 CSS 순서(오른쪽 먼저)", () => {
    close(mulMat(scaleMat(2, 1), rotateMat(90)), [0, 1, -2, 0]);
  });
});
