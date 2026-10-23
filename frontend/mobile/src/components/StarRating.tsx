import { Star } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { colors } from "../theme/theme";

type StarRatingProps = {
  /** 0 to 5. Rounded to the nearest whole star. */
  rating: number;
  size?: number;
};

/**
 * Five stars, filled to the rating. A row of glyphs is read at a glance in a
 * way that "4.0 stars" is not, which matters in a list where the only thing
 * separating one review from the next is the score.
 */
export function StarRating({ rating, size = 14 }: StarRatingProps) {
  const filled = Math.round(Math.max(0, Math.min(5, rating)));

  return (
    <View accessibilityLabel={`${rating.toFixed(1)} out of 5`} style={styles.row}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Star
          color={index < filled ? colors.warning : colors.border}
          fill={index < filled ? colors.warning : "transparent"}
          key={index}
          size={size}
          strokeWidth={2}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
});
