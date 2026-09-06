import { StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "../components/ScreenContainer";
import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing } from "../theme/theme";

export function AccountSecurityScreen() {
  const { user } = useAuth();

  return (
    <ScreenContainer>
      <Text style={styles.title}>Sign-in</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email ?? "—"}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Method</Text>
        <Text style={styles.value}>Email and password</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>To do</Text>
        <Text style={styles.value}>Google sign-in</Text>
        <Text style={styles.value}>Apple sign-in</Text>
        <Text style={styles.hint}>
          These buttons are on the sign-in screen as a reminder. OAuth is not connected yet.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  label: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
});
