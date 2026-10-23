import { RouteProp, useRoute } from "@react-navigation/native";
import { formatDate } from "../../utils/datetime";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getPublicProviderPortfolioItem } from "../../api/customer";
import { PortfolioMediaCarousel } from "../../components/PortfolioMediaCarousel";
import { ScreenContainer } from "../../components/ScreenContainer";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radius, spacing } from "../../theme/theme";
import type { ProviderPortfolio } from "../../types/provider";

type DetailRoute = RouteProp<RootStackParamList, "CustomerProviderPortfolioDetail">;

export function CustomerProviderPortfolioDetailScreen() {
  const route = useRoute<DetailRoute>();
  const [portfolio, setPortfolio] = useState<ProviderPortfolio | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadPortfolio() {
      try {
        const data = await getPublicProviderPortfolioItem(
          route.params.providerId,
          route.params.portfolioId,
        );

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
  }, [route.params.portfolioId, route.params.providerId]);

  return (
    <ScreenContainer contentStyle={styles.content}>
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
    fontSize: 14,
    lineHeight: 23,
  },
  mutedText: {
    color: colors.mutedText,
    fontSize: 14,
  },
});
