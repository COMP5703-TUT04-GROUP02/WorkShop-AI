import { T } from "../i18n/T";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CircleHelp } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import type { RootStackParamList } from "../navigation/types";
import { colors, spacing } from "../theme/theme";

type HelpLinkProps = {
  faqId: string;
  label: string;
  // A Modal covers the navigator, so a caller inside one closes it first.
  onBeforeNavigate?: () => void;
};

export function HelpLink({ faqId, label, onBeforeNavigate }: HelpLinkProps) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        onBeforeNavigate?.();
        navigation.navigate("Help", { faqId });
      }}
      style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
    >
      <CircleHelp color={colors.primary} size={16} />
      <T style={styles.label}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
});
