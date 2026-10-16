import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  getHiddenHighValueReviews,
  getLowValueReviews,
  setAdminReviewVisibility,
} from "../../api/admin";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { colors, radius, spacing } from "../../theme/theme";
import { adminTypography as type } from "../../theme/adminTypography";
import type { LowValueReview } from "../../types/review";
import { formatDateTime } from "../../utils/datetime";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney } from "../../utils/money";
import { applySelectedReviews, retainSelectedIds } from "./adminState";
import { useRef } from "react";

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
  visible: boolean;
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
  visible: false,
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
  visible: true,
};

function ReviewSweepPanel({ copy, revision = 0, onChanged = () => {} }: { copy: SweepCopy; revision?: number; onChanged?: () => void }) {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [reviews, setReviews] = useState<LowValueReview[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [total, setTotal] = useState(0);
  const [checkedAmount, setCheckedAmount] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const request = useRef(0);
  const lastRevision = useRef(revision);
  const check = useCallback(async (amount: number) => {
    const ticket = ++request.current;
    setIsChecking(true);
    try {
      const result = await copy.fetchPage(amount);
      if (ticket !== request.current) return;
      const items = result?.items ?? [];
      setReviews(items); setTotal(result?.total ?? 0); setCheckedAmount(amount);
      setSelected((current) => retainSelectedIds(current, items.map((item) => item.id)));
    } catch (err) {
      if (ticket === request.current) { setError(getErrorMessage(err)); setCheckedAmount(null); }
    } finally { if (ticket === request.current) setIsChecking(false); }
  }, [copy]);
  useEffect(() => { void check(Number(DEFAULT_THRESHOLD)); return () => { request.current++; }; }, [check]);
  useEffect(() => {
    if (lastRevision.current === revision) return;
    lastRevision.current = revision;
    if (checkedAmount !== null) void check(checkedAmount);
  }, [revision, check, checkedAmount]);
  const busy = isChecking || isApplying;
  async function apply() {
    if (checkedAmount === null || selected.length === 0 || busy) return;
    const targets = retainSelectedIds(selected, reviews.map((item) => item.id));
    setIsApplying(true); setError(""); setMessage("");
    try {
      const result = await applySelectedReviews(targets, (id) => setAdminReviewVisibility(id, copy.visible));
      setSelected(result.failed.map((item) => item.id));
      await check(checkedAmount);
      setMessage(result.succeeded.length ? copy.resultText(result.succeeded.length) : "");
      if (result.failed.length) setError(`${result.failed.length} not confirmed: ${result.failed.map((item) => "#" + item.id + ": " + item.message).join("; ")}. Check the latest results before retrying.`);
      onChanged();
    } finally { setIsApplying(false); }
  }
  return <View style={styles.panel}>
    <Text style={styles.title}>{copy.title}</Text><Text style={styles.subtitle}>{copy.subtitle}</Text>
    <View style={styles.controls}><View style={styles.thresholdField}><TextField label={copy.thresholdLabel} value={threshold} editable={!busy} keyboardType="numeric" onChangeText={(value) => { request.current++; setIsChecking(false); setThreshold(value); setSelected([]); setReviews([]); setCheckedAmount(null); setMessage(""); setError(""); }} /></View>
    <SecondaryButton label="Check" disabled={busy} onPress={() => { const amount = Number(threshold); if (!Number.isFinite(amount) || amount <= 0) { setError("Enter an amount greater than 0."); return; } setMessage(""); setError(""); void check(amount); }} /></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    {isChecking ? <ActivityIndicator /> : null}
    {checkedAmount === null ? <Text style={styles.meta}>Click Check before selecting reviews.</Text> : <>
      <Text style={styles.countText}>{total} matched · {selected.length} selected{reviews.length < total ? ` · showing first ${reviews.length}` : ""}</Text>
      <View style={styles.controls}><SecondaryButton label="Select all shown" disabled={busy || !reviews.length} onPress={() => setSelected(reviews.map((item) => item.id))} /><SecondaryButton label="Clear selection" disabled={busy || !selected.length} onPress={() => setSelected([])} /></View>
      {total === 0 ? <Text style={styles.emptyText}>{copy.emptyText}</Text> : null}
      {reviews.map((review) => <Pressable key={review.id} accessibilityRole="checkbox" accessibilityLabel={`Select review #${review.id}`} accessibilityState={{ checked: selected.includes(review.id), disabled: busy }} disabled={busy} onPress={() => setSelected((current) => current.includes(review.id) ? current.filter((id) => id !== review.id) : [...current, review.id])} style={styles.row}>
        <View style={styles.rowTop}><Text style={styles.amount}>{selected.includes(review.id) ? "☑" : "☐"} {review.booking_total_amount === null ? "No amount" : formatMoney(review.booking_total_amount)}</Text><Text style={styles.meta}>{review.rating} stars{review.created_at ? " · " + formatDateTime(review.created_at) : ""}</Text></View>
        <Text style={styles.provider}>{review.provider_business_name || `Provider #${review.provider_profile_id}`}</Text><Text style={styles.comment}>{review.comment || "No comment provided."}</Text>
      </Pressable>)}
      <PrimaryButton label={copy.actionLabel(selected.length)} disabled={busy || selected.length === 0} isLoading={isApplying} onPress={() => void apply()} />
      <Text style={styles.footnote}>{copy.footnote}</Text>
    </>}
  </View>;
}

export function ReviewManagementPanel() {
  const [revision, setRevision] = useState(0);
  const changed = () => setRevision((value) => value + 1);
  return <View style={{ gap: spacing.xl }}><ReviewSweepPanel copy={HIDE_CHEAP} revision={revision} onChanged={changed} /><ReviewSweepPanel copy={RESTORE_EXPENSIVE} revision={revision} onChanged={changed} /></View>;
}
export function LowValueReviewPanel() { return <ReviewSweepPanel copy={HIDE_CHEAP} />; }
export function HiddenReviewRestorePanel() { return <ReviewSweepPanel copy={RESTORE_EXPENSIVE} />; }

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  title: { ...type.sectionTitle, color: colors.text },
  subtitle: { ...type.body, color: colors.mutedText },
  controls: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  thresholdField: { flex: 1, maxWidth: 260 },
  checkButton: { minWidth: 120 },
  error: { ...type.body, color: colors.danger },
  message: { ...type.body, color: colors.text },
  countText: { ...type.label, color: colors.text },
  emptyText: { ...type.body, color: colors.mutedText },
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
  amount: { ...type.cardTitle, color: colors.text },
  amountWarning: { color: colors.danger },
  meta: { ...type.caption, color: colors.mutedText },
  provider: { ...type.label, color: colors.text },
  comment: { ...type.body, color: colors.mutedText },
  footnote: { ...type.caption, color: colors.mutedText },
});
