import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowLeft } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getCustomerProviderDetail,
  searchCustomerProviders,
} from "../../api/customer";
import { PlaceholderPanel } from "../../components/PlaceholderPanel";
import { ProviderRecommendationCard } from "../../components/ProviderRecommendationCard";
import { useRealtime } from "../../context/RealtimeContext";
import { ScreenContainer } from "../../components/ScreenContainer";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radius, spacing } from "../../theme/theme";
import type { ProviderRecommendation } from "../../types/provider";

type CustomerProviderSearchResultsScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "CustomerProviderSearchResults"
>;

export function CustomerProviderSearchResultsScreen({
  navigation,
  route,
}: CustomerProviderSearchResultsScreenProps) {
  const {
    keyword,
    serviceProvince,
    serviceLocationId,
    serviceAreaLabel = serviceProvince,
  } = route.params;
  const { subscribe } = useRealtime();
  const [results, setResults] = useState<ProviderRecommendation[]>([]);
  const [tokens, setTokens] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [gridWidth, setGridWidth] = useState(0);
  const recommendationLayout = getRecommendationLayout(gridWidth);

  useEffect(() => {
    let isMounted = true;

    async function loadResults() {
      setIsLoading(true);
      setMessage("");

      try {
        const data = await searchCustomerProviders(
          keyword,
          serviceProvince,
          { service_location_id: serviceLocationId },
        );

        if (!isMounted) {
          return;
        }

        setResults(data?.items ?? []);
        setTokens(data?.tokens ?? []);
      } catch {
        if (isMounted) {
          setResults([]);
          setMessage("Search failed. Try again.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadResults();

    return () => {
      isMounted = false;
    };
  }, [keyword, serviceLocationId, serviceProvince]);

  useEffect(() => {
    const unsubscribe = subscribe((data) => {
      if (
        (data.type === "user_online" || data.type === "user_offline") &&
        typeof data.user_id === "number"
      ) {
        const userId = data.user_id;

        setResults((currentResults) =>
          updateProviderOnline(
            currentResults,
            userId,
            data.type === "user_online",
          ),
        );
      }
    });

    return unsubscribe;
  }, [subscribe]);

  async function handleOpenProvider(provider: ProviderRecommendation) {
    try {
      const detail = await getCustomerProviderDetail(provider.id);
      navigation.navigate("CustomerProviderDetail", {
        providerId: provider.id,
        providerTag: detail?.history.last_provider_tag ?? provider.tags[0],
      });
    } catch {
      setMessage("Couldn't open this profile.");
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to home"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft color={colors.text} size={21} />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.title}>Search results</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {serviceAreaLabel} · {keyword}
          </Text>
        </View>
      </View>

      {tokens.length > 0 ? (
        <Text style={styles.tokenText}>Keywords: {tokens.join(" / ")}</Text>
      ) : null}

      {message ? <Text style={styles.messageText}>{message}</Text> : null}

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Searching providers...</Text>
        </View>
      ) : results.length > 0 ? (
        <View
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
          style={styles.grid}
        >
          {results.map((provider) => (
            <ProviderRecommendationCard
              cardWidth={recommendationLayout.cardWidth}
              key={provider.id}
              onPress={(selectedProvider) => void handleOpenProvider(selectedProvider)}
              provider={provider}
            />
          ))}
        </View>
      ) : (
        <PlaceholderPanel
          title="No providers found"
          description="Try another search term, service, or area."
        />
      )}
    </ScreenContainer>
  );
}

function updateProviderOnline(
  providers: ProviderRecommendation[],
  userId: number,
  isOnline: boolean,
) {
  return providers.map((provider) =>
    provider.user_id === userId ? { ...provider, is_online: isOnline } : provider,
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 19,
  },
  tokenText: {
    color: colors.mutedText,
    fontSize: 13,
  },
  messageText: {
    color: colors.danger,
    fontSize: 13,
  },
  loadingBox: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  loadingText: {
    color: colors.mutedText,
    fontSize: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: spacing.md,
  },
});

function getRecommendationLayout(windowWidth: number) {
  const columns = windowWidth >= 768 ? 4 : 2;
  const gridGapTotal = spacing.md * (columns - 1);
  const fallbackCardWidth = columns === 4 ? 180 : 150;
  const cardWidth =
    windowWidth > 0
      ? Math.floor((windowWidth - gridGapTotal) / columns)
      : fallbackCardWidth;

  return {
    cardWidth,
  };
}
