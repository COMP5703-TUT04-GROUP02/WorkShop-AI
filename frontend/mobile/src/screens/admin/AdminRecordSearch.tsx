import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AdminRecordFilters } from "../../api/admin";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { colors, radius, spacing } from "../../theme/theme";
import { adminTypography as type } from "../../theme/adminTypography";
import { isAdminIdPending, parseAdminId, payoutFiltersForStatus } from "./adminState";

type Key = "providerProfileId" | "customerId" | "refundRequestId";
export function AdminRecordSearch({ section, disabled, appliedFilters, onDirty, onSearch }: {
  section: "portfolio" | "refunds" | "payouts";
  disabled: boolean;
  appliedFilters: AdminRecordFilters;
  onDirty: () => void;
  onSearch: (filters: AdminRecordFilters) => void;
}) {
  const [values, setValues] = useState<Record<Key, string>>({ providerProfileId: "", customerId: "", refundRequestId: "" });
  const status = appliedFilters.status ?? "";
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const fields: Array<[Key, string]> = section === "refunds"
    ? [["refundRequestId", "Refund request ID"], ["customerId", "Customer user ID"], ["providerProfileId", "Provider profile ID"]]
    : [["providerProfileId", "Provider profile ID"]];
  function search() {
    const next: AdminRecordFilters = section === "payouts" ? { status: status || undefined } : {};
    const invalid: Partial<Record<Key, string>> = {};
    fields.forEach(([key]) => { try { next[key] = parseAdminId(values[key]); } catch { invalid[key] = "Enter a positive whole ID."; } });
    setErrors(invalid);
    if (Object.keys(invalid).length === 0) onSearch(next);
  }
  return <View style={styles.card}>
    {section === "payouts" ? <View style={styles.row}>{["", "draft", "active", "rejected", "update_failed"].map((value) => <Pressable key={value} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: value === status }} onPress={() => onSearch(payoutFiltersForStatus(appliedFilters, value))} style={[styles.chip, value === status && styles.selected]}><Text style={[styles.optionLabel, value === status && styles.active]}>{value || "All statuses"}</Text></Pressable>)}</View> : null}
    <View style={styles.row}>{fields.map(([key, label]) => <View key={key} style={styles.field}><TextField label={label} value={values[key]} editable={!disabled} keyboardType="number-pad" error={errors[key]} onSubmitEditing={() => { if (!disabled) search(); }} onChangeText={(value) => { setValues((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); if (section !== "payouts") onDirty(); }} /></View>)}</View>
    {section === "payouts" && isAdminIdPending(values.providerProfileId, appliedFilters.providerProfileId) ? <Text style={styles.muted}>Provider ID not applied. Search to update.</Text> : null}
    {section === "refunds" ? <Text style={styles.muted}>Pending appeals only. All filled fields must match.</Text> : null}
    <View style={styles.row}><PrimaryButton label="Search" disabled={disabled} onPress={search} /><SecondaryButton label="Clear search" disabled={disabled} onPress={() => { setValues({ providerProfileId: "", customerId: "", refundRequestId: "" }); setErrors({}); onSearch({}); }} /></View>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  field: { flexGrow: 1, flexBasis: 200, maxWidth: 320 },
  chip: { padding: spacing.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  selected: { borderColor: colors.primary },
  optionLabel: { ...type.label, color: colors.mutedText },
  active: { color: colors.primary },
  muted: { ...type.caption, color: colors.mutedText },
});
