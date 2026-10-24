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
        <>
          <PortfolioMediaCarousel portfolio={portfolio} />

          <View style={styles.infoCard}>
            <Text style={styles.title}>{portfolio.title}</Text>
            {portfolio.description ? (
              <Text style={styles.description}>{portfolio.description}</Text>
            ) : (
              <Text style={styles.mutedText}>No description</Text>
            )}
            <Text style={styles.mutedText}>{formatDate(portfolio.created_at)}</Text>
          </View>
        </>
      ) : (
        <Text style={styles.mutedText}>{message || "Loading..."}</Text>
      )}
    </ScreenContainer>
  );
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
  infoCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
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
