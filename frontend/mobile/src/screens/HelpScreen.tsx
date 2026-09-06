import { StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "../components/ScreenContainer";
import { colors, radius, spacing } from "../theme/theme";

const TOPICS = [
  {
    title: "Find a provider",
    body: "Search by service and area, open a profile, then start a chat or send a booking request.",
  },
  {
    title: "Quotes and payment",
    body: "The provider sends a quote. If you accept it, tap Pay to confirm. This demo completes payment automatically.",
  },
  {
    title: "Refunds",
    body: "Request a refund from the booking. If the provider declines, you can submit an appeal for admin review.",
  },
];

export function HelpScreen() {
  return (
    <ScreenContainer>
      <Text style={styles.title}>Help</Text>
      {TOPICS.map((topic) => (
        <View key={topic.title} style={styles.card}>
          <Text style={styles.cardTitle}>{topic.title}</Text>
          <Text style={styles.cardBody}>{topic.body}</Text>
        </View>
      ))}
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
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  cardBody: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
});
