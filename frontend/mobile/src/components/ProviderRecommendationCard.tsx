import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme/theme";
import type { ProviderRecommendation } from "../types/provider";
import { resolveMediaUrl } from "../utils/media";

type ProviderRecommendationCardProps = {
  provider: ProviderRecommendation;
  onPress: (provider: ProviderRecommendation) => void;
  cardWidth?: number;
};

export function ProviderRecommendationCard({
  provider,
  onPress,
  cardWidth,
}: ProviderRecommendationCardProps) {
  const imageUrl = resolveMediaUrl(provider.first_portfolio_image_url);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(provider)}
      style={[styles.card, cardWidth ? { width: cardWidth } : null]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>No image</Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              provider.is_online ? styles.statusDotOnline : styles.statusDotOffline,
            ]}
          />
          <Text style={styles.statusText}>
            {provider.is_online ? "Online" : "Offline"}
          </Text>
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {provider.business_name}
        </Text>
        <Text style={styles.tags} numberOfLines={1}>
          {provider.tags.join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    flexGrow: 0,
    flexShrink: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  image: {
    width: "100%",
    aspectRatio: 1.08,
    backgroundColor: colors.surface,
  },
  imagePlaceholder: {
    width: "100%",
    aspectRatio: 1.08,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  imagePlaceholderText: {
    color: colors.mutedText,
    fontSize: 13,
  },
  body: {
    gap: spacing.xs,
    padding: spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOnline: {
    backgroundColor: colors.primary,
  },
  statusDotOffline: {
    backgroundColor: "#A0A4AE",
  },
  statusText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  name: {
    minHeight: 40,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  tags: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
});
