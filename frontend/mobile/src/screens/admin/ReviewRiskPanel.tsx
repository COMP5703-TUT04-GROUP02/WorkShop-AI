import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  decideFlaggedReview,
  getFlaggedReviews,
  rescanReviewRisk,
} from "../../api/admin";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { colors, radius, spacing } from "../../theme/theme";
import type {
  FlaggedReview,
  ReviewRiskLevel,
  ReviewRiskStatus,
} from "../../types/reviewRisk";
import { formatDateTime } from "../../utils/datetime";
import { getErrorMessage } from "../../utils/errors";

const PAGE_SIZE = 20;

type LevelFilter = ReviewRiskLevel | "all";
type StatusFilter = ReviewRiskStatus | "all";

const LEVEL_FILTERS: { value: LevelFilter; label: string }[] = [
  { value: "all", label: "High and medium" },
  { value: "high", label: "High only" },
  { value: "medium", label: "Medium only" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "pending", label: "Awaiting decision" },
  { value: "confirmed_fake", label: "Confirmed fake" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const LEVEL_LABELS: Record<ReviewRiskLevel, string> = {
  high: "High risk",
  medium: "Medium risk",
  low: "Low risk",
};

const STATUS_LABELS: Record<ReviewRiskStatus, string> = {
  pending: "Awaiting decision",
  confirmed_fake: "Confirmed fake",
  dismissed: "Dismissed",
};

export function ReviewRiskPanel() {
  const [items, setItems] = useState<FlaggedReview[]>([]);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);

  const load = useCallback(
    async (
      requestedPage = 1,
      requestedLevel: LevelFilter = level,
      requestedStatus: StatusFilter = status,
    ) => {
      setIsLoading(true);
      setMessage("");
      try {
        const result = await getFlaggedReviews(requestedPage, PAGE_SIZE, {
          level: requestedLevel === "all" ? undefined : requestedLevel,
          status: requestedStatus === "all" ? undefined : requestedStatus,
        });
        const nextItems = result?.items ?? [];
        setItems((current) =>
          requestedPage === 1 ? nextItems : [...current, ...nextItems],
        );
        setPage(result?.page ?? requestedPage);
        setHasNext(Boolean(result?.has_next));
        setTotal(result?.total ?? nextItems.length);
      } catch (error) {
        setMessage(getErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    },
    [level, status],
  );

  useEffect(() => void load(1), [load]);

  function changeLevel(nextLevel: LevelFilter) {
    setLevel(nextLevel);
    setSelectedReviewId(null);
    void load(1, nextLevel, status);
  }

  function changeStatus(nextStatus: StatusFilter) {
    setStatus(nextStatus);
    setSelectedReviewId(null);
    void load(1, level, nextStatus);
  }

  function selectReview(reviewId: number) {
    setSelectedReviewId((current) => (current === reviewId ? null : reviewId));
    setNote("");
    setMessage("");
  }

  async function decide(reviewId: number, decision: "confirmed_fake" | "dismissed") {
    setIsActing(true);
    setMessage("");
    try {
      await decideFlaggedReview(reviewId, decision, note);
      setSelectedReviewId(null);
      setNote("");
      await load(1, level, status);
      setMessage(
        decision === "confirmed_fake"
          ? "Confirmed as fake. The review is no longer shown on the provider's profile."
          : "Flag dismissed. The review stays visible.",
      );
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  async function rescan() {
    setIsActing(true);
    setMessage("");
    try {
      const result = await rescanReviewRisk();
      await load(1, level, status);
      setMessage(
        `Re-scored ${result?.scanned ?? 0} reviews: ${result?.high ?? 0} high risk, ` +
          `${result?.medium ?? 0} medium risk.`,
      );
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Fake review checks</Text>
          <Text style={styles.subtitle}>
            Reviews scored against the fake-review rules. Confirming a review as fake
            hides it from the provider's profile.
          </Text>
        </View>
        <View style={styles.rescanButton}>
          <SecondaryButton
            label="Re-scan all reviews"
            onPress={() => void rescan()}
            disabled={isActing}
          />
        </View>
      </View>

      <View style={styles.filterRow}>
        {LEVEL_FILTERS.map((filter) => (
          <FilterChip
            key={filter.value}
            label={filter.label}
            isActive={level === filter.value}
            onPress={() => changeLevel(filter.value)}
          />
        ))}
      </View>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((filter) => (
          <FilterChip
            key={filter.value}
            label={filter.label}
            isActive={status === filter.value}
            onPress={() => changeStatus(filter.value)}
          />
        ))}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {isLoading && items.length === 0 ? (
        <ActivityIndicator />
      ) : items.length === 0 ? (
        <Text style={styles.emptyText}>No reviews match this filter.</Text>
      ) : (
        <>
          <Text style={styles.countText}>{total} reviews in this view</Text>
          {items.map((item) => (
            <FlaggedReviewCard
              key={item.risk.id}
              item={item}
              isSelected={selectedReviewId === item.risk.review_id}
              isActing={isActing}
              note={note}
              onNoteChange={setNote}
              onPress={() => selectReview(item.risk.review_id)}
              onDecide={(decision) => void decide(item.risk.review_id, decision)}
            />
          ))}
          {hasNext ? (
            <SecondaryButton
              label="Load more"
              onPress={() => void load(page + 1, level, status)}
              disabled={isLoading}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function FilterChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, isActive ? styles.chipActive : null]}
    >
      <Text style={[styles.chipLabel, isActive ? styles.chipLabelActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FlaggedReviewCard({
  item,
  isSelected,
  isActing,
  note,
  onNoteChange,
  onPress,
  onDecide,
}: {
  item: FlaggedReview;
  isSelected: boolean;
  isActing: boolean;
  note: string;
  onNoteChange: (value: string) => void;
  onPress: () => void;
  onDecide: (decision: "confirmed_fake" | "dismissed") => void;
}) {
  const { risk, review } = item;
  const isHigh = risk.level === "high";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, isSelected ? styles.cardSelected : null]}
    >
      <View style={styles.cardTopRow}>
        <Text style={[styles.badge, isHigh ? styles.badgeHigh : styles.badgeMedium]}>
          {LEVEL_LABELS[risk.level]} · {risk.score}
        </Text>
        <Text style={styles.statusText}>{STATUS_LABELS[risk.status]}</Text>
      </View>

      <Text style={styles.providerName}>
        {item.provider_business_name || `Provider #${risk.provider_profile_id}`}
      </Text>
      <Text style={styles.metaText}>
        {review ? `${review.rating} stars` : "Review missing"}
        {review?.created_at ? ` · ${formatDateTime(review.created_at)}` : ""}
        {review?.customer?.name ? ` · by ${review.customer.name}` : ""}
      </Text>
      <Text style={styles.comment}>{review?.comment || "No comment provided."}</Text>

      {risk.reported_by_provider ? (
        <Text style={styles.reportText}>
          Reported by the provider: {risk.provider_report_reason || "no reason given"}
        </Text>
      ) : null}

      {isSelected ? (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>Why it was flagged</Text>
          {risk.signals.length === 0 ? (
            <Text style={styles.metaText}>No signals recorded.</Text>
          ) : (
            risk.signals.map((signal) => (
              <View key={signal.code} style={styles.signalRow}>
                <Text style={styles.signalLabel}>
                  {signal.label} (+{signal.weight})
                </Text>
                <Text style={styles.signalDetail}>{signal.detail}</Text>
              </View>
            ))
          )}

          {risk.status === "pending" ? (
            <>
              <TextField
                label="Decision note (optional)"
                value={note}
                onChangeText={onNoteChange}
                placeholder="What did you check before deciding?"
                multiline
                numberOfLines={3}
                maxLength={500}
                autoCapitalize="sentences"
              />
              <View style={styles.actionRow}>
                <View style={styles.actionButton}>
                  <PrimaryButton
                    label="Confirm as fake"
                    onPress={() => onDecide("confirmed_fake")}
                    disabled={isActing}
                  />
                </View>
                <View style={styles.actionButton}>
                  <SecondaryButton
                    label="Dismiss flag"
                    onPress={() => onDecide("dismissed")}
                    disabled={isActing}
                  />
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.metaText}>
              {STATUS_LABELS[risk.status]}
              {risk.decided_at ? ` on ${formatDateTime(risk.decided_at)}` : ""}
              {risk.decision_note ? ` · ${risk.decision_note}` : ""}
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.hintText}>
          {risk.signals.length} signals · tap to review
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerText: { flex: 1, gap: spacing.xs },
  rescanButton: { minWidth: 180 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 14, color: colors.mutedText, lineHeight: 20 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.surface },
  chipLabel: { fontSize: 13, color: colors.mutedText },
  chipLabelActive: { color: colors.primaryPressed, fontWeight: "700" },
  message: { fontSize: 14, color: colors.text },
  countText: { fontSize: 13, color: colors.mutedText },
  emptyText: { fontSize: 14, color: colors.mutedText },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  cardSelected: { borderColor: colors.primary },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  badge: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  badgeHigh: { backgroundColor: colors.danger },
  badgeMedium: { backgroundColor: colors.warning },
  statusText: { fontSize: 13, color: colors.mutedText },
  providerName: { fontSize: 16, fontWeight: "700", color: colors.text },
  metaText: { fontSize: 13, color: colors.mutedText, lineHeight: 19 },
  comment: { fontSize: 15, color: colors.text, lineHeight: 21 },
  reportText: { fontSize: 13, color: colors.warning, lineHeight: 19 },
  hintText: { fontSize: 13, color: colors.mutedText },
  detail: { gap: spacing.sm, paddingTop: spacing.sm },
  detailTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  signalRow: {
    gap: 2,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    paddingLeft: spacing.sm,
  },
  signalLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  signalDetail: { fontSize: 13, color: colors.mutedText, lineHeight: 19 },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  actionButton: { flex: 1 },
});
