import { StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "../components/ScreenContainer";
import { colors, radius, spacing } from "../theme/theme";

// WS-109. Copy here is placeholder English on purpose — product text is a
// later ticket, and this is not meant to wait on it.
const FAQ = [
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

const CONTACT = [
  {
    title: "Email us",
    body: "support@workshop.ai — demo only, replies are not monitored.",
  },
  {
    title: "Live chat",
    body: "Chat with the support team from inside the app. Coming soon.",
  },
];

export function HelpScreen() {
  return (
    <ScreenContainer>
      <Text style={styles.title}>Help and Support</Text>

      <Section title="FAQ" items={FAQ} />
      <Section title="Contact us" items={CONTACT} />
    </ScreenContainer>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: { title: string; body: string }[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item) => (
        <View key={item.title} style={styles.card}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardBody}>{item.body}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  card: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  cardBody: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
});
