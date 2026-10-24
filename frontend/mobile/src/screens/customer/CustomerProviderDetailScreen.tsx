import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getProviderTagLabel } from "../../constants/providerTags";
import { formatDate } from "../../utils/datetime";
import { Heart, MessageCircle, Send } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  addCustomerFavourite,
  createCustomerBooking,
  getCustomerProviderDetail,
  getPublicProviderPortfolios,
  getPublicProviderReviews,
  openChatWithProvider,
  removeCustomerFavourite,
} from "../../api/customer";
import {
  BookingRequestModal,
  buildBookingRequestPayload,
  createDefaultBookingRequestForm,
  type BookingRequestFormState,
} from "../../components/BookingRequestModal";
import { PersonAvatar } from "../../components/PersonAvatar";
import { ReviewCard } from "../../components/ReviewCard";
import { StarRating } from "../../components/StarRating";
import { resolveMediaUrl } from "../../utils/media";
import { formatMoney } from "../../utils/money";
import { PortfolioCard } from "../../components/PortfolioCard";
import { useIsWebDesktop } from "../../layout/useIsWebDesktop";
import { useRealtime } from "../../context/RealtimeContext";
import { setProviderFavouriteState } from "../../features/favourites/favourite-state";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radius, spacing } from "../../theme/theme";
import type { PaginatedData } from "../../types/chat";
import type {
  CustomerProviderDetail,
  ProviderPortfolio,
  ProviderProfile,
  ProviderServiceArea,
} from "../../types/provider";
import type { Review } from "../../types/review";
import { getErrorMessage } from "../../utils/errors";

type CustomerProviderDetailScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "CustomerProviderDetail"
>;

const REVIEW_PAGE_SIZE = 10;

export function CustomerProviderDetailScreen({
  navigation,
  route,
}: CustomerProviderDetailScreenProps) {
  const { subscribe } = useRealtime();
  const isWebDesktop = useIsWebDesktop();
  const [detail, setDetail] = useState<CustomerProviderDetail | null>(null);
  const [portfolios, setPortfolios] = useState<ProviderPortfolio[]>([]);
  // The work sells the provider, so the first piece of it opens the page.
  const coverImageUrl = resolveMediaUrl(
    portfolios[0]?.media_items?.[0]?.file_url ?? portfolios[0]?.image_url ?? null,
  );
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPaging, setReviewPaging] = useState<PaginatedData<Review> | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const [isUpdatingFavourite, setIsUpdatingFavourite] = useState(false);
  const [favouriteMessage, setFavouriteMessage] = useState("");
  const [isBookingModalVisible, setIsBookingModalVisible] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [message, setMessage] = useState("");
  const [bookingForm, setBookingForm] = useState<BookingRequestFormState>(
    createDefaultBookingRequestForm(),
  );

  useEffect(() => {
    let isActive = true;

    async function loadProvider() {
      setIsLoading(true);
      setMessage("");
      setFavouriteMessage("");

      try {
        const [nextDetail, portfolioPage, reviewPageData] = await Promise.all([
          getCustomerProviderDetail(route.params.providerId),
          getPublicProviderPortfolios(route.params.providerId, 1, 4),
          getPublicProviderReviews(route.params.providerId, 1, REVIEW_PAGE_SIZE),
        ]);

        if (isActive) {
          setDetail(nextDetail);
          setPortfolios(portfolioPage?.items ?? []);
          setReviews(reviewPageData?.items ?? []);
          setReviewPaging(reviewPageData);
          setReviewPage(1);
        }
      } catch {
        if (isActive) {
          setMessage("Couldn't load this profile.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProvider();

    return () => {
      isActive = false;
    };
  }, [route.params.providerId]);

  useEffect(() => {
    const unsubscribe = subscribe((data) => {
      if (
        (data.type === "user_online" || data.type === "user_offline") &&
        typeof data.user_id === "number"
      ) {
        setDetail((currentDetail) => {
          if (!currentDetail || currentDetail.provider.user_id !== data.user_id) {
            return currentDetail;
          }

          return {
            ...currentDetail,
            provider: {
              ...currentDetail.provider,
              is_online: data.type === "user_online",
            },
          };
        });
      }
    });

    return unsubscribe;
  }, [subscribe]);

  async function loadMoreReviews() {
    if (isLoadingMore || !reviewPaging?.has_next) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const nextPage = reviewPage + 1;
      const nextData = await getPublicProviderReviews(
        route.params.providerId,
        nextPage,
        REVIEW_PAGE_SIZE,
      );

      if (nextData) {
        setReviews((current) => [...current, ...nextData.items]);
        setReviewPaging(nextData);
        setReviewPage(nextPage);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleOpenChat() {
    const provider = detail?.provider;

    if (!provider || isOpeningChat) {
      return;
    }

    setIsOpeningChat(true);
    try {
      const result = await openChatWithProvider(provider.id);

      if (result?.chat_room) {
        navigation.navigate("ChatRoom", {
          chatRoomId: result.chat_room.id,
          title: provider.business_name,
          opponentOnline: provider.is_online,
          providerProfileId: provider.id,
        });
      }
    } catch {
      Alert.alert("Couldn't start chat", "Try again.");
    } finally {
      setIsOpeningChat(false);
    }
  }

  async function handleToggleFavourite() {
    const provider = detail?.provider;

    if (!detail || !provider || isUpdatingFavourite) {
      return;
    }

    setIsUpdatingFavourite(true);
    setFavouriteMessage("");
    try {
      if (provider.is_favorited) {
        await removeCustomerFavourite(provider.id);
      } else {
        await addCustomerFavourite(provider.id);
      }

      setDetail((currentDetail) =>
        currentDetail
          ? setProviderFavouriteState(
              currentDetail,
              !currentDetail.provider.is_favorited,
            )
          : currentDetail,
      );
    } catch (error) {
      setFavouriteMessage(getErrorMessage(error));
    } finally {
      setIsUpdatingFavourite(false);
    }
  }

  function openBookingModal() {
    setBookingForm(createDefaultBookingRequestForm(detail?.provider));
    setBookingError("");
    setIsBookingModalVisible(true);
  }

  async function handleCreateBooking() {
    const provider = detail?.provider;
    const payload = provider
      ? buildBookingRequestPayload({
          provider,
          providerProfileId: provider.id,
          form: bookingForm,
        })
      : null;

    if (!provider || !payload) {
      setBookingError("Select a service and enter a title (maximum 30 words), description, location, and schedule.");
      return;
    }

    setIsSubmittingBooking(true);
    setBookingError("");
    try {
      const result = await createCustomerBooking(payload);

      if (result?.chat_room) {
        setIsBookingModalVisible(false);
        navigation.navigate("ChatRoom", {
          chatRoomId: result.chat_room.id,
          title: provider.business_name,
          opponentOnline: provider.is_online,
          providerProfileId: provider.id,
        });
      }
    } catch (error) {
      setBookingError(getErrorMessage(error));
    } finally {
      setIsSubmittingBooking(false);
    }
  }

  const provider = detail?.provider;

  return (
    <>
      <FlatList
        ListEmptyComponent={
          isLoading ? null : (
            <Text style={styles.emptyText}>{message || "No reviews yet"}</Text>
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator color={colors.primary} style={styles.footerLoader} />
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.headerContent}>
            {isLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.emptyText}>Loading provider profile...</Text>
              </View>
            ) : provider ? (
              <>
                {coverImageUrl ? (
                  <Image
                    accessibilityIgnoresInvertColors
                    accessibilityLabel={`Work by ${provider.business_name}`}
                    source={{ uri: coverImageUrl }}
                    style={styles.cover}
                  />
                ) : null}
                <View
                  style={[
                    styles.profileCard,
                    isWebDesktop ? styles.profileCardDesktop : null,
                  ]}
                >
                  <View style={styles.profileTextBox}>
                    <View style={styles.businessTitleRow}>
                      <Text numberOfLines={1} style={styles.businessName}>
                        {provider.business_name}
                      </Text>
                    </View>
                    {/* What decides a booking, in the order it decides it:
                        who they are, whether they are any good, what they
                        charge. Trading hours, area and the rest follow. */}
                    <View style={styles.ratingRow}>
                      {provider.average_rating != null && provider.review_count ? (
                        <>
                          <StarRating rating={provider.average_rating} size={16} />
                          <Text style={styles.ratingValue}>
                            {provider.average_rating.toFixed(1)}
                          </Text>
                          <Text style={styles.metaText}>
                            {provider.review_count}{" "}
                            {provider.review_count === 1 ? "review" : "reviews"}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.metaText}>No rating yet</Text>
                      )}
                    </View>
                    <Text style={styles.rateText}>
                      from {formatMoney(provider.hourly_rate)} / hr
                    </Text>
                    <View style={styles.statusRow}>
                      <TradingStatusBadge isOpen={provider.is_open} />
                      <ChatPresenceBadge isOnline={provider.is_online} />
                    </View>
                    {favouriteMessage ? (
                      <Text style={styles.favouriteErrorText}>
                        {favouriteMessage}
                      </Text>
                    ) : null}
                    <Text style={styles.bioText}>{provider.bio}</Text>
                    <Text style={styles.metaText}>
                      Business address: {provider.address || "Not set"}
                    </Text>
                    <Text style={styles.metaText}>
                      Service areas: {formatServiceAreas(provider.service_areas)}
                    </Text>
                    <View style={styles.tagWrap}>
                      {provider.tags.map((tag) => (
                        <View key={tag} style={styles.tagPill}>
                          <Text style={styles.tagText}>{getProviderTagLabel(tag)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View
                    style={
                      isWebDesktop ? styles.actionColumn : styles.actionRow
                    }
                  >
                    <Pressable
                      accessibilityLabel={
                        provider.is_favorited
                          ? "Remove provider from favourites"
                          : "Add provider to favourites"
                      }
                      accessibilityRole="button"
                      accessibilityState={{
                        busy: isUpdatingFavourite,
                        selected: provider.is_favorited,
                      }}
                      disabled={isUpdatingFavourite}
                      onPress={() => void handleToggleFavourite()}
                      style={({ pressed }) => [
                        styles.actionButton,
                        isWebDesktop ? null : styles.actionButtonWide,
                        styles.favouriteActionButton,
                        pressed && !isUpdatingFavourite
                          ? styles.favouriteActionButtonPressed
                          : null,
                        isUpdatingFavourite ? styles.actionButtonDisabled : null,
                      ]}
                    >
                      <Heart
                        color={colors.primary}
                        fill={provider.is_favorited ? colors.primary : "transparent"}
                        size={20}
                      />
                      <Text style={styles.favouriteActionText}>
                        {provider.is_favorited ? "Saved" : "Save"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isOpeningChat}
                      onPress={() => void handleOpenChat()}
                      style={[
                        styles.actionButton,
                        isWebDesktop ? null : styles.actionButtonWide,
                        styles.secondaryActionButton,
                      ]}
                    >
                      <MessageCircle color={colors.primaryText} size={20} />
                      <Text style={styles.secondaryActionText}>Chat</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={openBookingModal}
                      style={[
                        styles.actionButton,
                        isWebDesktop ? null : styles.actionButtonWide,
                        styles.primaryActionButton,
                      ]}
                    >
                      <Send color="#FFFFFF" size={20} />
                      <Text style={styles.primaryActionText}>Book</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Portfolios</Text>
                {portfolios.length > 0 ? (
                  <FlatList
                    ItemSeparatorComponent={() => <View style={styles.portfolioGap} />}
                    data={portfolios}
                    horizontal
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => (
                      <PortfolioCard
                        compact
                        onPress={() =>
                          navigation.navigate("CustomerProviderPortfolioDetail", {
                            providerId: provider.id,
                            portfolioId: item.id,
                          })
                        }
                        portfolio={item}
                      />
                    )}
                    showsHorizontalScrollIndicator={false}
                  />
                ) : (
                  <Text style={styles.emptyText}>No portfolios to preview</Text>
                )}

                <Text style={styles.sectionTitle}>Reviews</Text>
              </>
            ) : (
              <Text style={styles.emptyText}>{message || "Provider not found"}</Text>
            )}
          </View>
        }
        contentContainerStyle={styles.content}
        data={reviews}
        keyExtractor={(item) => String(item.id)}
        onEndReached={() => void loadMoreReviews()}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => <ReviewCard review={item} />}
        style={styles.container}
      />

      <BookingRequestModal
        bookingForm={bookingForm}
        errorMessage={bookingError}
        isLoading={isSubmittingBooking}
        onClose={() => setIsBookingModalVisible(false)}
        onSubmit={() => void handleCreateBooking()}
        serviceCategories={detail?.provider.tags ?? []}
        setBookingForm={setBookingForm}
        visible={isBookingModalVisible}
      />
    </>
  );
}

function formatRating(provider: ProviderProfile) {
  if (provider.average_rating == null || !provider.review_count) {
    return "No rating yet";
  }

  return `${provider.average_rating.toFixed(1)} stars · ${provider.review_count} reviews`;
}

function formatServiceAreas(areas: ProviderServiceArea[] | undefined) {
  return areas?.length
    ? areas.map((area) => area.label || area.name).join(", ")
    : "Not set";
}

/** Whether the business is inside its working hours. */
function TradingStatusBadge({ isOpen }: { isOpen: boolean }) {
  return (
    <View style={styles.onlineBadge}>
      <View
        style={[
          styles.onlineDot,
          isOpen ? styles.onlineDotActive : styles.onlineDotInactive,
        ]}
      />
      <Text style={styles.onlineText}>{isOpen ? "Open" : "Closed"}</Text>
    </View>
  );
}

/**
 * Whether they have the app open right now, which is what decides how fast a
 * message gets read. It carries a chat glyph rather than a second dot: two
 * identical dots reading "Open" and "Offline" look like a contradiction, when
 * they are answers to different questions.
 */
function ChatPresenceBadge({ isOnline }: { isOnline: boolean }) {
  return (
    <View style={styles.onlineBadge}>
      <MessageCircle
        color={isOnline ? colors.success : colors.placeholder}
        size={13}
      />
      <Text style={isOnline ? styles.onlineText : styles.onlineHint}>
        {isOnline ? "Online now" : "Offline"}
      </Text>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  headerContent: {
    gap: spacing.lg,
  },
  centerBox: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  cover: {
    width: "100%",
    height: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  ratingValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  rateText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  profileCardDesktop: {
    flexDirection: "row",
  },
  profileCard: {
    flexDirection: "column",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  profileTextBox: {
    flex: 1,
    gap: spacing.sm,
  },
  businessName: {
    flex: 1,
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  businessTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  onlineBadge: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineDotActive: {
    // Open for business is a state, not an action.
    backgroundColor: colors.success,
  },
  onlineDotInactive: {
    backgroundColor: colors.placeholder,
  },
  onlineText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  onlineHint: {
    color: colors.mutedText,
    fontSize: 12,
  },
  bioText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  metaText: {
    color: colors.mutedText,
    fontSize: 14,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tagPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  tagText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  actionColumn: {
    width: 84,
    gap: spacing.sm,
  },
  // Across the foot of the card on a phone, so the description keeps the full
  // width of the card and the three actions keep their own.
  actionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  actionButton: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
  },
  actionButtonWide: {
    flex: 1,
  },
  // Book is what the page is for, Chat is the question before it, Save is a
  // note to self: solid, tinted, and quiet, in that order.
  primaryActionButton: {
    backgroundColor: colors.primary,
  },
  secondaryActionButton: {
    borderWidth: 1,
    borderColor: colors.primaryTintBorder,
    backgroundColor: colors.primaryTint,
  },
  favouriteActionButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  favouriteActionButtonPressed: {
    backgroundColor: colors.surface,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryActionText: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "700",
  },
  favouriteActionText: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "700",
  },
  favouriteErrorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  portfolioGap: {
    width: spacing.md,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
  },
  reviewAvatarLetter: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 16,
    lineHeight: 21,
  },
  footerLoader: {
    paddingVertical: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  modalCard: {
    maxHeight: "92%",
    gap: spacing.md,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
});
