import { StyleSheet, Text, View } from "react-native";

import { PersonAvatar } from "./PersonAvatar";
import { StarRating } from "./StarRating";
import { colors, radius, spacing, type } from "../theme/theme";
import type { Review } from "../types/review";
import { formatDate } from "../utils/datetime";

/**
 * One review, wherever reviews are shown. It lived inside the provider profile
 * screen until a second screen needed it; the line about the booking is part
 * of the card because it is the reason the rating can be trusted.
 */
export function ReviewCard({ review }: { review: Review }) {
  const name = review.customer?.name?.trim() || "Verified customer";

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <PersonAvatar
          avatarUrl={review.customer?.avatar_url}
          name={name}
          size={36}
        />
        <View style={styles.who}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <View style={styles.meta}>
            <StarRating rating={review.rating} size={13} />
            <Text style={styles.date}>{formatDate(review.created_at)}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.comment}>{review.comment || "No written review"}</Text>
      <Text style={styles.verified}>From a completed, paid booking</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  who: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    color: colors.text,
    fontSize: type.secondary,
    fontWeight: "700",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  date: {
    color: colors.mutedText,
    fontSize: type.secondary,
  },
  comment: {
    color: colors.text,
    fontSize: type.body,
    lineHeight: 22,
  },
  verified: {
    color: colors.mutedText,
    fontSize: type.caption,
  },
});
