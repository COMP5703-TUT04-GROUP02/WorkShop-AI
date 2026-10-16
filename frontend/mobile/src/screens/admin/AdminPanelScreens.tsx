import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../../theme/theme";
import { adminTypography as type } from "../../theme/adminTypography";
import { AISubscriptionPanel } from "./AISubscriptionPanel";
import { ProviderVerificationAdminPanel } from "./ProviderVerificationAdminPanel";
import { ReviewEmbeddingAdminPanel } from "./ReviewEmbeddingAdminPanel";
import {
  ReviewManagementPanel,
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

export function AdminVerificationScreen() {
  return <AdminPage><ProviderVerificationAdminPanel /></AdminPage>;
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
      title="Review visibility management"
    >
      <ReviewManagementPanel />
    </AdminPage>
  );
}

export function AdminCustomerAIConfigScreen() {
  return (
    <AdminPage>
      <AISubscriptionPanel />
    </AdminPage>
  );
}

export function AdminReviewEmbeddingScreen() {
  return (
    <AdminPage>
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
  subtitle?: string;
  title?: string;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      {title ? <View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View> : null}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.lg, padding: spacing.lg },
  title: { ...type.pageTitle, color: colors.text },
  subtitle: {
    color: colors.mutedText,
    ...type.body,
    marginTop: spacing.xs,
  },
  section: { gap: spacing.md },
});
