import Svg, { Path, Polygon } from "react-native-svg";

import { colors } from "../theme/theme";

type BrandMarkProps = {
  size?: number;
  /** Solid fill of the hex. Defaults to the primary blue. */
  color?: string;
  /** Colour of the W cut into it. Defaults to white. */
  letterColor?: string;
};

/**
 * The hex nut a wrench turns, with a W inside it.
 *
 * Flat and single-colour on purpose: no gradient, no highlight, no metal
 * facets. The same file is used at every size, the stroke only gets heavier
 * below 24px so the W does not close up.
 */
export function BrandMark({
  size = 26,
  color = colors.primary,
  letterColor = "#FFFFFF",
}: BrandMarkProps) {
  return (
    <Svg height={size} viewBox="0 0 32 32" width={size}>
      <Polygon
        fill={color}
        points="16,1.6 28.6,8.8 28.6,23.2 16,30.4 3.4,23.2 3.4,8.8"
      />
      <Path
        d="M9.2 12.2 12.5 21 16 15.4 19.5 21 22.8 12.2"
        fill="none"
        stroke={letterColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={size < 24 ? 3.4 : 2.6}
      />
    </Svg>
  );
}
