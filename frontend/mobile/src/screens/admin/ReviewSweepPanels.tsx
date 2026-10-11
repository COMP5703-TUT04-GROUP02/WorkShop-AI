import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  getHiddenHighValueReviews,
  getLowValueReviews,
  hideLowValueReviews,
  showHiddenHighValueReviews,
} from "../../api/admin";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { colors, radius, spacing } from "../../theme/theme";
import type { LowValueReview } from "../../types/review";
import { formatDateTime } from "../../utils/datetime";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney } from "../../utils/money";

const DEFAULT_THRESHOLD = "100";
const PAGE_SIZE = 50;

type SweepPage = {
  items: LowValueReview[];
  total: number;
};

type SweepCopy = {
  title: string;
  subtitle: string;
  thresholdLabel: string;
  emptyText: string;
  actionLabel: (total: number) => string;
  resultText: (changed: number) => string;
  footnote: string;
  amountIsWarning: boolean;
  fetchPage: (threshold: number) => Promise<SweepPage | null | undefined>;
  apply: (threshold: number) => Promise<number>;
};

/** Hides reviews that sit on a booking too cheap to have been a real job. */
const HIDE_CHEAP: SweepCopy = {
  title: "Reviews bought with cheap bookings",
  subtitle:
    "Checks every visible review and finds the ones whose booking was too cheap to be a real job — the way a provider farms their own rating. Hiding a review removes it from the provider's profile and from their average rating.",
  thresholdLabel: "Booking total under (TRY)",
  emptyText: "No visible review is attached to a booking under this amount.",
  actionLabel: (total) => `Hide these ${total} ${total === 1 ? "review" : "reviews"}`,
  resultText: (changed) =>
    changed === 0
      ? "Nothing to hide — no visible review is attached to a booking under this amount."
      : `${changed} ${changed === 1 ? "review is" : "reviews are"} now hidden and no longer count towards any provider's rating.`,
  footnote:
    "Hidden too much? Use the restore sweep below to bring back the ones on properly priced jobs.",
  amountIsWarning: true,
  fetchPage: (threshold) => getLowValueReviews(threshold, 1, PAGE_SIZE),
  apply: async (threshold) => (await hideLowValueReviews(threshold))?.hidden ?? 0,
};

/** The mirror: puts back hidden reviews that sit on a properly priced job. */
const RESTORE_EXPENSIVE: SweepCopy = {
  title: "Restore hidden reviews on real bookings",
  subtitle:
    "The mirror of the sweep above. Finds every hidden review whose booking was expensive enough to have been a real job, and makes them visible again — the way back from a sweep run at too high an amount.",
  thresholdLabel: "Booking total at or above (TRY)",
  emptyText: "No hidden review is attached to a booking at or above this amount.",
  actionLabel: (total) =>
    `Make these ${total} ${total === 1 ? "review" : "reviews"} visible`,
  resultText: (changed) =>
    changed === 0
      ? "Nothing to restore — no hidden review is attached to a booking at or above this amount."
      : `${changed} ${changed === 1 ? "review is" : "reviews are"} visible again and count towards the provider's rating.`,
  footnote:
    "This only brings back reviews that were hidden. Anything already visible is left alone.",
  amountIsWarning: false,
  fetchPage: (threshold) => getHiddenHighValueReviews(threshold, 1, PAGE_SIZE),
  apply: async (threshold) =>
    (await showHiddenHighValueReviews(threshold))?.restored ?? 0,
};

function ReviewSweepPanel({ copy }: { copy: SweepCopy }) {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [reviews, setReviews] = useState<LowValueReview[]>([]);
  const [total, setTotal] = useState(0);
  const [hasChecked, setHasChecked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  function parseThreshold() {
    const value = Number(threshold);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }

  const check = useCallback(
    async (amount: number) => {
      setIsChecking(true);
      setError("");
      setMessage("");
      try {
        const result = await copy.fetchPage(amount);
        setReviews(result?.items ?? []);
        setTotal(result?.total ?? 0);
        setHasChecked(true);
      } catch (checkError) {
        setError(getErrorMessage(checkError));
      } finally {
        setIsChecking(false);
      }
    },
    [copy],
  );

  useEffect(() => {
    void check(Number(DEFAULT_THRESHOLD));
  }, [check]);

  function handleCheck() {
    const amount = parseThreshold();
    if (amount === null) {
      setError("Enter an amount greater than 0.");
      return;
    }
    void check(amount);
  }

  async function handleApply() {
    const amount = parseThreshold();
    if (amount === null) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setIsApplying(true);
    setError("");
    setMessage("");
    try {
      const changed = await copy.apply(amount);
      await check(amount);
      setMessage(copy.resultText(changed));
    } catch (applyError) {
      setError(getErrorMessage(applyError));
    } finally {
      setIsApplying(false);
    }
  }

  const isBusy = isChecking || isApplying;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.subtitle}</Text>

      <View style={styles.controls}>
        <View style={styles.thresholdField}>
          <TextField
            label={copy.thresholdLabel}
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="numeric"
            placeholder={DEFAULT_THRESHOLD}
          />
        </View>
        <View style={styles.checkButton}>
          <SecondaryButton label="Check" onPress={handleCheck} disabled={isBusy} />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {isChecking && reviews.length === 0 ? (
        <ActivityIndicator />
      ) : !hasChecked ? null : total === 0 ? (
        <Text style={styles.emptyText}>{copy.emptyText}</Text>
      ) : (
        <>
          <Text style={styles.countText}>
            {total} {total === 1 ? "review" : "reviews"} matched
            {reviews.length < total ? ` (showing the first ${reviews.length})` : ""}
          </Text>

          {reviews.map((review) => (
            <View key={review.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text
                  style={[
                    styles.amount,
                    copy.amountIsWarning ? styles.amountWarning : null,
                  ]}
                >
                  {review.booking_total_amount === null
                    ? "No amount"
                    : formatMoney(review.booking_total_amount)}
                </Text>
                <Text style={styles.meta}>
                  {review.rating} stars
                  {review.created_at ? ` · ${formatDateTime(review.created_at)}` : ""}
                </Text>
              </View>
              <Text style={styles.provider}>
                {review.provider_business_name ||
                  `Provider #${review.provider_profile_id}`}
              </Text>
              <Text style={styles.comment}>
                {review.comment || "No comment provided."}
              </Text>
            </View>
          ))}

          <PrimaryButton
            label={copy.actionLabel(total)}
            onPress={() => void handleApply()}
            isLoading={isApplying}
            disabled={isBusy}
          />
          <Text style={styles.footnote}>{copy.footnote}</Text>
        </>
      )}
    </View>
  );
}

export function LowValueReviewPanel() {
  return <ReviewSweepPanel copy={HIDE_CHEAP} />;
}

export function HiddenReviewRestorePanel() {
  return <ReviewSweepPanel copy={RESTORE_EXPENSIVE} />;
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 14, color: colors.mutedText, lineHeight: 20 },
  controls: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  thresholdField: { flex: 1, maxWidth: 260 },
  checkButton: { minWidth: 120 },
  error: { fontSize: 14, color: colors.danger },
  message: { fontSize: 14, color: colors.text },
  countText: { fontSize: 14, fontWeight: "600", color: colors.text },
  emptyText: { fontSize: 14, color: colors.mutedText },
  row: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  amount: { fontSize: 16, fontWeight: "700", color: colors.text },
  amountWarning: { color: colors.danger },
  meta: { fontSize: 13, color: colors.mutedText },
  provider: { fontSize: 15, fontWeight: "600", color: colors.text },
  comment: { fontSize: 14, color: colors.mutedText, lineHeight: 20 },
  footnote: { fontSize: 13, color: colors.mutedText },
});
