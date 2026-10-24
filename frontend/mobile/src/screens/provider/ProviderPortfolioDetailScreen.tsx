import { RouteProp, useRoute } from "@react-navigation/native";
import { formatDate } from "../../utils/datetime";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getProviderPortfolioItem } from "../../api/provider";
import { PortfolioMediaCarousel } from "../../components/PortfolioMediaCarousel";
import { useIsWebDesktop } from "../../layout/useIsWebDesktop";
import { ScreenContainer } from "../../components/ScreenContainer";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radius, spacing } from "../../theme/theme";
import type { ProviderPortfolio } from "../../types/provider";

type DetailRoute = RouteProp<RootStackParamList, "ProviderPortfolioDetail">;

export function ProviderPortfolioDetailScreen() {
  const isWebDesktop = useIsWebDesktop();
  const route = useRoute<DetailRoute>();
  const [portfolio, setPortfolio] = useState<ProviderPortfolio | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadPortfolio() {
      try {
        const data = await getProviderPortfolioItem(route.params.portfolioId);

        if (isActive) {
          setPortfolio(data);
        }
      } catch {
        if (isActive) {
          setMessage("Couldn't load this portfolio.");
        }
      }
    }

    void loadPortfolio();

    return () => {
      isActive = false;
    };
  }, [route.params.portfolioId]);

  return (
    <ScreenContainer contentStyle={[styles.content, isWebDesktop ? styles.readingColumn : null]}>
      {portfolio ? (
        <View style={styles.workCard}>
          <PortfolioMediaCarousel portfolio={portfolio} />

          <View style={styles.infoCard}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{portfolio.title}</Text>
              <Text style={[styles.statusBadge, statusTone(portfolio.verification_status)]}>
                {getPortfolioStatusLabel(portfolio.verification_status)}
              </Text>
            </View>
            {portfolio.description ? (
              <Text style={styles.description}>{portfolio.description}</Text>
            ) : (
              <Text style={styles.mutedText}>No description</Text>
            )}
            <Text style={styles.mutedText}>{formatDate(portfolio.created_at)}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.mutedText}>{message || "Loading..."}</Text>
      )}
    </ScreenContainer>
  );
}


/** Whether this piece is live on the profile yet. */
function getPortfolioStatusLabel(status: string) {
  if (status === "approved") return "Live";
  if (status === "rejected") return "Not accepted";
  return "In review";
}

function statusTone(status: string) {
  if (status === "approved") return styles.statusApproved;
  if (status === "rejected") return styles.statusRejected;
  return styles.statusPending;
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.surface,
    paddingTop: spacing.lg,
  },
  // One piece of work, so the column is the width of a photograph and its
  // caption rather than the width of the window.
  readingColumn: {
    maxWidth: 640,
    alignSelf: "center",
  },
  workCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  infoCard: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  statusBadge: {
    overflow: "hidden",
    borderRadius: radius.sm,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusApproved: {
    backgroundColor: colors.successTint,
    color: colors.success,
  },
  statusPending: {
    backgroundColor: colors.warningTint,
    color: colors.warningText,
  },
  statusRejected: {
    backgroundColor: colors.dangerTint,
    color: colors.danger,
  },
  description: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
  },
  mutedText: {
    color: colors.mutedText,
    fontSize: 14,
  },
});
