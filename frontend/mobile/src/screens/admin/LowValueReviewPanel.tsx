import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { getLowValueReviews, hideLowValueReviews } from "../../api/admin";
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

export function LowValueReviewPanel() {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [reviews, setReviews] = useState<LowValueReview[]>([]);
  const [total, setTotal] = useState(0);
  const [hasChecked, setHasChecked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  function parseThreshold() {
    const value = Number(threshold);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }

  const check = useCallback(async (amount: number) => {
    setIsChecking(true);
    setError("");
    setMessage("");
    try {
      const result = await getLowValueReviews(amount, 1, PAGE_SIZE);
      setReviews(result?.items ?? []);
      setTotal(result?.total ?? 0);
      setHasChecked(true);
    } catch (checkError) {
      setError(getErrorMessage(checkError));
    } finally {
      setIsChecking(false);
    }
  }, []);

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

  async function handleHide() {
    const amount = parseThreshold();
    if (amount === null) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setIsHiding(true);
    setError("");
    setMessage("");
    try {
      const result = await hideLowValueReviews(amount);
      const hidden = result?.hidden ?? 0;
      await check(amount);
      setMessage(
        hidden === 0
          ? "Nothing to hide — no visible review is attached to a booking under this amount."
          : `${hidden} ${hidden === 1 ? "review is" : "reviews are"} now hidden and no longer count towards any provider's rating.`,
      );
    } catch (hideError) {
      setError(getErrorMessage(hideError));
    } finally {
      setIsHiding(false);
    }
  }

  const isBusy = isChecking || isHiding;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Reviews bought with cheap bookings</Text>
      <Text style={styles.subtitle}>
        Checks every visible review and finds the ones whose booking was too cheap to
        be a real job — the way a provider farms their own rating. Hiding a review
        removes it from the provider&apos;s profile and from their average rating.
      </Text>

      <View style={styles.controls}>
        <View style={styles.thresholdField}>
          <TextField
            label="Booking total under (TRY)"
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="numeric"
            placeholder="100"
          />
        </View>
        <View style={styles.checkButton}>
          <SecondaryButton
            label="Check"
            onPress={handleCheck}
            disabled={isBusy}
          />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {isChecking && reviews.length === 0 ? (
        <ActivityIndicator />
      ) : !hasChecked ? null : total === 0 ? (
        <Text style={styles.emptyText}>
          No visible review is attached to a booking under this amount.
        </Text>
      ) : (
        <>
          <Text style={styles.countText}>
            {total} visible {total === 1 ? "review" : "reviews"} would be hidden
            {reviews.length < total ? ` (showing the ${reviews.length} cheapest)` : ""}
          </Text>

          {reviews.map((review) => (
            <View key={review.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.amount}>
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
            label={`Hide these ${total} ${total === 1 ? "review" : "reviews"}`}
            onPress={() => void handleHide()}
            isLoading={isHiding}
            disabled={isBusy}
          />
          <Text style={styles.undoHint}>
            A review hidden by mistake can be made visible again from the review list.
          </Text>
        </>
      )}
    </View>
  );
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
  amount: { fontSize: 16, fontWeight: "700", color: colors.danger },
  meta: { fontSize: 13, color: colors.mutedText },
  provider: { fontSize: 15, fontWeight: "600", color: colors.text },
  comment: { fontSize: 14, color: colors.mutedText, lineHeight: 20 },
  undoHint: { fontSize: 13, color: colors.mutedText },
});
