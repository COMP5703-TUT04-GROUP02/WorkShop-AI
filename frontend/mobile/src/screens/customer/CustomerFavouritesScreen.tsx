import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Heart } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getCustomerFavourites,
  removeCustomerFavourite,
} from "../../api/customer";
import { PlaceholderPanel } from "../../components/PlaceholderPanel";
import { ProviderRecommendationCard } from "../../components/ProviderRecommendationCard";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SecondaryButton } from "../../components/SecondaryButton";
import { useAuth } from "../../context/AuthContext";
import {
  appendFavouritePage,
  removeFavouriteByProviderId,
} from "../../features/favourites/favourite-state";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radius, spacing } from "../../theme/theme";
import type { PaginatedData } from "../../types/chat";
import type { FavoriteProvider } from "../../types/provider";
import { getErrorMessage } from "../../utils/errors";

type CustomerFavouritesScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "CustomerFavourites"
>;

const PAGE_SIZE = 20;

export function CustomerFavouritesScreen({
  navigation,
}: CustomerFavouritesScreenProps) {
  const { user } = useAuth();
  const isCustomer = user?.role === "customer";
  const [favourites, setFavourites] = useState<FavoriteProvider[]>([]);
  const [paging, setPaging] = useState<PaginatedData<FavoriteProvider> | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [removingProviderId, setRemovingProviderId] = useState<number | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [gridWidth, setGridWidth] = useState(0);
  const cardWidth = getFavouriteCardWidth(gridWidth);

  useEffect(() => {
    if (user && !isCustomer) {
      navigation.reset({
        index: 0,
        routes: [{ name: "Main", params: { screen: "Account" } }],
      });
    }
  }, [isCustomer, navigation, user]);

  const loadFavourites = useCallback(async () => {
    if (!isCustomer) {
      return;
    }

    setIsLoading(true);
    setMessage("");
    try {
      const result = await getCustomerFavourites(1, PAGE_SIZE);
      setFavourites(result?.items ?? []);
      setPaging(result);
      setPage(1);
    } catch (error) {
      setFavourites([]);
      setPaging(null);
      setMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [isCustomer]);

  useFocusEffect(
    useCallback(() => {
      void loadFavourites();
    }, [loadFavourites]),
  );

  async function loadMore() {
    if (isLoadingMore || !paging?.has_next) {
      return;
    }

    setIsLoadingMore(true);
    setMessage("");
    try {
      const nextPage = page + 1;
      const result = await getCustomerFavourites(nextPage, PAGE_SIZE);
      if (result) {
        setFavourites((current) =>
          appendFavouritePage(current, result.items),
        );
        setPaging(result);
        setPage(nextPage);
      }
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsLoadingMore(false);
    }
  }

  function confirmRemoveFavourite(favourite: FavoriteProvider) {
    const providerName = favourite.provider?.business_name ?? "this provider";
    const confirmationMessage = `${providerName} will be removed from your favourites.`;

    if (Platform.OS === "web") {
      if (globalThis.confirm?.(confirmationMessage)) {
        void removeFavourite(favourite);
      }
      return;
    }

    Alert.alert(
      "Remove favourite?",
      confirmationMessage,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void removeFavourite(favourite),
        },
      ],
    );
  }

  async function removeFavourite(favourite: FavoriteProvider) {
    if (removingProviderId != null) {
      return;
    }

    setRemovingProviderId(favourite.provider_profile_id);
    setMessage("");
    try {
      await removeCustomerFavourite(favourite.provider_profile_id);
      setFavourites((current) =>
        removeFavouriteByProviderId(current, favourite.provider_profile_id),
      );
      setPaging((current) =>
        current
          ? {
              ...current,
              total: Math.max(0, current.total - 1),
            }
          : current,
      );
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setRemovingProviderId(null);
    }
  }

  if (!isCustomer) {
    return null;
  }

  return (
    <ScreenContainer>
      <View style={styles.intro}>
        <Heart color={colors.primary} size={24} />
        <View style={styles.introText}>
          <Text style={styles.title}>Saved providers</Text>
          <Text style={styles.subtitle}>
            Open a provider profile or remove it from your favourites.
          </Text>
        </View>
      </View>

      {message ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{message}</Text>
          {!isLoading && favourites.length === 0 ? (
            <SecondaryButton
              label="Retry"
              onPress={() => void loadFavourites()}
            />
          ) : null}
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.subtitle}>Loading favourites...</Text>
        </View>
      ) : favourites.length === 0 && !message ? (
        <PlaceholderPanel
          title="No favourites yet"
          description="Saving a provider keeps them one tap away and puts them first in search when they cover your area."
        />
      ) : (
        <View
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
          style={styles.grid}
        >
          {favourites.map((favourite) => (
            <FavouriteProviderCard
              cardWidth={cardWidth}
              favourite={favourite}
              isRemoving={
                removingProviderId === favourite.provider_profile_id
              }
              key={favourite.id}
              onOpen={() =>
                navigation.navigate("CustomerProviderDetail", {
                  providerId: favourite.provider_profile_id,
                })
              }
              onRemove={() => confirmRemoveFavourite(favourite)}
            />
          ))}
        </View>
      )}

      {paging?.has_next ? (
        <SecondaryButton
          disabled={isLoadingMore || removingProviderId != null}
          label={isLoadingMore ? "Loading..." : "Load more"}
          onPress={() => void loadMore()}
        />
      ) : null}
    </ScreenContainer>
  );
}

function FavouriteProviderCard({
  cardWidth,
  favourite,
  isRemoving,
  onOpen,
  onRemove,
}: {
  cardWidth: number;
  favourite: FavoriteProvider;
  isRemoving: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const provider = favourite.provider;

  const removeButton = (
    <Pressable
      accessibilityLabel={`Remove ${provider?.business_name ?? "provider"} from favourites`}
      accessibilityRole="button"
      disabled={isRemoving}
      onPress={onRemove}
      style={({ pressed }) => [
        styles.removeButton,
        pressed && !isRemoving ? styles.removeButtonPressed : null,
        isRemoving ? styles.buttonDisabled : null,
      ]}
    >
      {isRemoving ? (
        <ActivityIndicator color={colors.danger} size="small" />
      ) : (
        <Text style={styles.removeButtonText}>Remove</Text>
      )}
    </Pressable>
  );

  if (provider) {
    return (
      <ProviderRecommendationCard
        cardWidth={cardWidth}
        disabled={isRemoving}
        footer={removeButton}
        onPress={onOpen}
        provider={provider}
        showStatus={false}
      />
    );
  }

  return (
    <View style={[styles.unavailableCard, { width: cardWidth }]}>
      <Text style={styles.unavailableTitle}>Provider unavailable</Text>
      <Text style={styles.subtitle}>This provider profile is no longer available.</Text>
      {removeButton}
    </View>
  );
}

function getFavouriteCardWidth(windowWidth: number) {
  const columns = windowWidth >= 1100 ? 5 : windowWidth >= 720 ? 4 : 2;
  const gapTotal = spacing.md * (columns - 1);
  const fallbackWidth = columns === 4 ? 180 : 150;

  return windowWidth > 0
    ? Math.floor((windowWidth - gapTotal) / columns)
    : fallbackWidth;
}

const styles = StyleSheet.create({
  intro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  introText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  errorRow: {
    gap: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: spacing.md,
  },
  unavailableCard: {
    minWidth: 0,
    justifyContent: "space-between",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  unavailableTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  removeButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  removeButtonPressed: {
    backgroundColor: colors.surface,
  },
  removeButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
});
