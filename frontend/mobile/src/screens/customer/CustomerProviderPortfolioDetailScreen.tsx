import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { formatDate } from "../../utils/datetime";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  getPublicProviderPortfolioItem,
  getPublicProviderReviews,
} from "../../api/customer";
import { PortfolioMediaCarousel } from "../../components/PortfolioMediaCarousel";
import { ReviewCard } from "../../components/ReviewCard";
import { useIsWebDesktop } from "../../layout/useIsWebDesktop";
import { ScreenContainer } from "../../components/ScreenContainer";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radius, spacing, type } from "../../theme/theme";
import type { ProviderPortfolio } from "../../types/provider";
import type { Review } from "../../types/review";

type DetailRoute = RouteProp<RootStackParamList, "CustomerProviderPortfolioDetail">;

/** Enough to show the provider is trusted without turning this into the profile. */
const REVIEWS_SHOWN = 4;

export function CustomerProviderPortfolioDetailScreen() {
  const isWebDesktop = useIsWebDesktop();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  const [portfolio, setPortfolio] = useState<ProviderPortfolio | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
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

  // The work and the reviews load apart: whoever wrote the reviews is not the
  // reason this page exists, so a failure there leaves the work on screen.
  useEffect(() => {
    let isActive = true;

    getPublicProviderReviews(route.params.providerId, 1, REVIEWS_SHOWN)
      .then((data) => {
        if (!isActive) return;
        setReviews(data?.items ?? []);
        setReviewTotal(data?.total ?? 0);
      })
      .catch(() => {
        if (isActive) {
          setReviews([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [route.params.providerId]);

  if (!portfolio) {
    return (
      <ScreenContainer contentStyle={styles.content}>
        <Text style={styles.mutedText}>{message || "Loading..."}</Text>
      </ScreenContainer>
    );
  }

  const work = (
    <View style={styles.workCard}>
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
    </View>
  );

  // Reviews of the business, not of this piece: say so, because beside one
  // photograph they would otherwise read as reviews of that photograph.
  const reviewsPanel = reviews.length ? (
    <View style={styles.reviews}>
      <Text style={styles.sectionTitle}>What customers say</Text>
      <Text style={styles.mutedText}>
        {reviewTotal === 1
          ? "One review of this provider, across all their work."
          : `${reviewTotal} reviews of this provider, across all their work.`}
      </Text>
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
      {reviewTotal > reviews.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate("CustomerProviderDetail", {
              providerId: route.params.providerId,
            })
          }
        >
          <Text style={styles.moreLink}>See the provider's profile</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  return (
    <ScreenContainer
      contentStyle={[
        styles.content,
        isWebDesktop && !reviewsPanel ? styles.readingColumn : null,
      ]}
    >
      <View style={isWebDesktop && reviewsPanel ? styles.twoColumn : undefined}>
        <View style={isWebDesktop && reviewsPanel ? styles.workColumn : undefined}>
          {work}
        </View>
        {reviewsPanel ? (
          <View style={isWebDesktop ? styles.reviewColumn : styles.reviewsStacked}>
            {reviewsPanel}
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.surface,
    paddingTop: spacing.lg,
  },
  // Without reviews there is one piece of work, so the column is the width of
  // a photograph and its caption rather than the width of the window.
  readingColumn: {
    maxWidth: 640,
    alignSelf: "center",
  },
  twoColumn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xl,
  },
  workColumn: {
    flex: 1.6,
    minWidth: 0,
  },
  reviewColumn: {
    flex: 1,
    minWidth: 0,
  },
  reviewsStacked: {
    marginTop: spacing.lg,
  },
  reviews: {
    gap: spacing.snug,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: type.section,
    fontWeight: "800",
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
    fontSize: type.title,
    fontWeight: "800",
  },
  description: {
    color: colors.text,
    fontSize: type.body,
    lineHeight: 23,
  },
  mutedText: {
    color: colors.mutedText,
    fontSize: type.secondary,
  },
  moreLink: {
    color: colors.primary,
    fontSize: type.body,
    fontWeight: "700",
  },
});
