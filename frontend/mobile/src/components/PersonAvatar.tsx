import { Image, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "../theme/theme";
import { resolveMediaUrl } from "../utils/media";

type PersonAvatarProps = {
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
};

/**
 * Someone's face where there is one, and the first letter of their name where
 * there is not. The fallback is not a placeholder graphic: an initial in the
 * brand tint reads as a person, a grey silhouette reads as a missing image.
 */
export function PersonAvatar({ name, avatarUrl, size = 36 }: PersonAvatarProps) {
  const uri = resolveMediaUrl(avatarUrl ?? null);
  const letter = (name ?? "").trim().charAt(0).toUpperCase() || "?";
  const box = {
    width: size,
    height: size,
    borderRadius: size <= 28 ? radius.sm : radius.md,
  };

  if (uri) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel={name ?? undefined}
        source={{ uri }}
        style={[styles.image, box]}
      />
    );
  }

  return (
    <View style={[styles.fallback, box]}>
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.4) }]}>
        {letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surface,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryTint,
  },
  letter: {
    color: colors.primaryText,
    fontWeight: "800",
  },
});
