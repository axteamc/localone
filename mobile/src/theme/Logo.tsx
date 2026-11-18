// 동네한권 브랜드 로고(I4 — 책 세 권 쌓기, 개발산출물/시안/로고_시안.html).
// 색은 테마 토큰(fill1~3·paper·seamHairline)으로 칠해 룩 전환을 그대로 따라간다.
import React from "react";
import { View } from "react-native";
import Svg, { Line, Polygon } from "react-native-svg";
import { mix, theme, type ThemeColors } from "./index";

export type LogoProps = {
  size?: number;
  colors?: ThemeColors;
  showEdges?: boolean;
};

const SPINE_WEIGHT = 0.84;

type BookGeometry = {
  tone: "fill3" | "fill2" | "fill1";
  left: string;
  right: string;
  top: string;
  line: readonly [number, number, number, number];
};

const BOOKS: readonly BookGeometry[] = [
  {
    tone: "fill3",
    left: "-7.79,4.5 3.46,11 3.46,8.8 -7.79,2.3",
    right: "11.26,6.5 3.46,11 3.46,8.8 11.26,4.3",
    top: "0,-2.2 11.26,4.3 3.46,8.8 -7.79,2.3",
    line: [10.95, 5.58, 3.78, 9.72],
  },
  {
    tone: "fill2",
    left: "-6.58,2.5 3.81,8.5 3.81,6.3 -6.58,0.3",
    right: "11.6,4 3.81,8.5 3.81,6.3 11.6,1.8",
    top: "1.21,-4.2 11.6,1.8 3.81,6.3 -6.58,0.3",
    line: [11.29, 3.08, 4.12, 7.22],
  },
  {
    tone: "fill1",
    left: "-7.53,0.15 3.2,6.35 3.2,4.15 -7.53,-2.05",
    right: "10.48,2.15 3.2,6.35 3.2,4.15 10.48,-0.05",
    top: "-0.26,-6.25 10.48,-0.05 3.2,4.15 -7.53,-2.05",
    line: [10.19, 1.22, 3.5, 5.08],
  },
];

export function Logo({ size = 64, colors = theme.colors, showEdges = true }: LogoProps): React.JSX.Element {
  const edgeColor = showEdges ? colors.seamHairline : "none";
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="동네한권 로고"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="-8.96 -8.49 21.73 21.73">
        {BOOKS.map((book) => {
          const topFill = colors[book.tone];
          const spineFill = mix(topFill, colors.inkMuted, SPINE_WEIGHT);
          const [x1, y1, x2, y2] = book.line;
          return (
            <React.Fragment key={book.tone}>
              <Polygon
                points={book.left}
                fill={spineFill}
                stroke={edgeColor}
                strokeWidth={showEdges ? 0.12 : 0}
                strokeLinejoin="round"
              />
              <Polygon
                points={book.right}
                fill={colors.paper}
                stroke={edgeColor}
                strokeWidth={showEdges ? 0.12 : 0}
                strokeLinejoin="round"
              />
              <Polygon
                points={book.top}
                fill={topFill}
                stroke={edgeColor}
                strokeWidth={showEdges ? 0.12 : 0}
                strokeLinejoin="round"
              />
              <Line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={colors.seamHairline}
                strokeWidth={0.1}
              />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
