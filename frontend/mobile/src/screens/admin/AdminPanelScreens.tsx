import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../../theme/theme";
import { AISubscriptionPanel } from "./AISubscriptionPanel";
import { ProviderVerificationAdminPanel } from "./ProviderVerificationAdminPanel";
import { ReviewEmbeddingAdminPanel } from "./ReviewEmbeddingAdminPanel";
import {
  HiddenReviewRestorePanel,
  LowValueReviewPanel,
} from "./ReviewSweepPanels";

export function AdminIdentityVerificationScreen() {
  return (
    <AdminPage
      title="Identity verification"
      subtitle="Review provider identity applications and protected documents."
    >
      <ProviderVerificationAdminPanel mode="identity" />
    </AdminPage>
  );
}

export function AdminQualificationVerificationScreen() {
  return (
    <AdminPage
      title="Qualification verification"
      subtitle="Review provider service qualifications and supporting files."
    >
      <ProviderVerificationAdminPanel mode="qualification" />
    </AdminPage>
  );
}

export function AdminReviewManagementScreen() {
  return (
    <AdminPage
      title="Review management"
      subtitle="Hide reviews tied to low-value bookings and restore valid hidden reviews."
    >
      <View style={styles.section}>
        <LowValueReviewPanel />
      </View>
      <View style={styles.section}>
        <HiddenReviewRestorePanel />
      </View>
    </AdminPage>
  );
}

export function AdminCustomerAIConfigScreen() {
  return (
    <AdminPage
      title="Customer AI config"
      subtitle="Manage the model connection used by the customer AI assistant."
    >
      <AISubscriptionPanel />
    </AdminPage>
  );
}

export function AdminReviewEmbeddingScreen() {
  return (
    <AdminPage
      title="Review embedding / search"
      subtitle="Monitor review vector indexing and search infrastructure."
    >
      <ReviewEmbeddingAdminPanel />
    </AdminPage>
  );
}

function AdminPage({
  children,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.lg, padding: spacing.lg },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  section: { gap: spacing.md },
});
