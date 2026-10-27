import { getCurrentLanguage } from "../../i18n/language";
import { translateText } from "../../i18n/translations";
import { useLanguage } from "../../i18n/LanguageContext";
import { LocalizedPressable } from "../../i18n/LocalizedPressable";
import { T } from "../../i18n/T";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getAdminBooking, getAdminBookings } from "../../api/admin";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { colors, radius, spacing } from "../../theme/theme";
import { adminTypography as type } from "../../theme/adminTypography";
import type { AdminBookingDetail, AdminBookingFilters, AdminBookingStatusGroup } from "../../types/adminBooking";
import type { BookingDetail } from "../../types/booking";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney } from "../../utils/money";
import { createLatestRequestGuard } from "../../utils/latestRequest";
import { parseAdminId } from "./adminState";
import { AdminBookingDetailModal } from "./AdminBookingDetailModal";
import { BOOKING_STATUS_OPTIONS, bookingFiltersForStatus, bookingGroupLabel, bookingStatusStyle, formatBookingDateTime } from "./bookingPresentation";

const FIELDS = [
  ["bookingId", "Booking ID"],
  ["customerId", "Customer user ID"],
  ["providerProfileId", "Provider profile ID"],
] as const;
type IdKey = typeof FIELDS[number][0];
const EMPTY = { bookingId: "", customerId: "", providerProfileId: "" };

export function AdminBookingsScreen() {
  useLanguage();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<IdKey, string>>>({});
  const [filters, setFilters] = useState<AdminBookingFilters>({});
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<BookingDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminBookingDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const listGuard = useRef(createLatestRequestGuard());
  const detailGuard = useRef(createLatestRequestGuard());

  const load = useCallback(async () => {
    const ticket = listGuard.current.begin();
    setLoading(true); setError(""); setItems([]); setTotal(0);
    try {
      const data = await getAdminBookings(page, 20, filters);
      if (!listGuard.current.isLatest(ticket)) return;
      if (!data) throw new Error("Booking results are unavailable. Try again.");
      setItems(data.items); setTotal(data.total); setPages(Math.max(1, data.total_pages));
      if (page > Math.max(1, data.total_pages)) setPage(Math.max(1, data.total_pages));
    } catch (cause) {
      if (listGuard.current.isLatest(ticket)) setError(getErrorMessage(cause));
    } finally {
      if (listGuard.current.isLatest(ticket)) setLoading(false);
    }
  }, [filters, page]);

  const closeDetail = useCallback(() => {
    detailGuard.current.invalidate(); setSelectedId(null); setDetail(null);
    setDetailError(""); setDetailLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { listGuard.current.invalidate(); closeDetail(); };
  }, [load, closeDetail]));

  function edit(key: IdKey, value: string) {
    setValues(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
    setDirty(true);
  }

  function search(clear = false) {
    const next: AdminBookingFilters = clear ? {} : { statusGroup: filters.statusGroup };
    const invalid: Partial<Record<IdKey, string>> = {};
    if (!clear) FIELDS.forEach(([key]) => {
      try { next[key] = parseAdminId(values[key]); }
      catch { invalid[key] = "Enter a positive whole ID."; }
    });
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    listGuard.current.invalidate(); closeDetail();
    if (clear) setValues(EMPTY);
    setDirty(false); setPage(1); setFilters(next);
  }

  function selectStatus(statusGroup?: AdminBookingStatusGroup) {
    listGuard.current.invalidate(); closeDetail();
    setPage(1); setFilters(bookingFiltersForStatus(filters, statusGroup));
  }

  async function openDetail(id: number) {
    const ticket = detailGuard.current.begin();
    setSelectedId(id); setDetail(null); setDetailError(""); setDetailLoading(true);
    try {
      const data = await getAdminBooking(id);
      if (!detailGuard.current.isLatest(ticket)) return;
      if (!data || data.id !== id) throw new Error("Booking details are unavailable. Try again.");
      setDetail(data);
    } catch (cause) {
      if (detailGuard.current.isLatest(ticket)) setDetailError(getErrorMessage(cause));
    } finally {
      if (detailGuard.current.isLatest(ticket)) setDetailLoading(false);
    }
  }

  return <View style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      <T style={styles.title}>Booking lookup</T>
      <View style={styles.search}>
        <T style={styles.filterLabel}>Booking status</T>
        <View style={styles.row}>
          {[{ value: undefined, label: "All" }, ...BOOKING_STATUS_OPTIONS].map(option => <LocalizedPressable
            key={option.value ?? "all"} accessibilityRole="button" accessibilityState={{ selected: filters.statusGroup === option.value }}
            accessibilityLabel={`Filter bookings: ${option.label}`} onPress={() => selectStatus(option.value)}
            style={[styles.statusOption, filters.statusGroup === option.value && styles.statusSelected]}>
            <T style={[styles.optionLabel, filters.statusGroup === option.value && styles.optionSelected]}>{option.label}</T>
          </LocalizedPressable>)}
        </View>
        <View style={styles.row}>{FIELDS.map(([key, label]) => <View key={key} style={styles.field}>
          <TextField label={label} value={values[key]} keyboardType="number-pad" error={errors[key]}
            onChangeText={value => edit(key, value)} onSubmitEditing={() => search()} />
        </View>)}</View>
        <View style={styles.row}>
          <PrimaryButton label="Search" onPress={() => search()} />
          <SecondaryButton label="Clear search" onPress={() => search(true)} />
        </View>
      </View>
      {dirty ? <T style={styles.meta}>ID changes not applied. Search to update.</T> : null}
      {loading ? <ActivityIndicator accessibilityLabel={translateText(getCurrentLanguage(), "Loading bookings")} color={colors.primary} />
        : error ? <View style={styles.search}><T accessibilityRole="alert" style={styles.error}>{error}</T><SecondaryButton label="Retry search" onPress={() => void load()} /></View>
        : <>
          <Text style={styles.meta}>
            {getCurrentLanguage() === "tr" ? "Yukarıdaki filtrelerle eşleşen sonuçlar" : "Results matching the filters above"} · {total} {total === 1 ? translateText(getCurrentLanguage(), "booking") : translateText(getCurrentLanguage(), "bookings")}
          </Text>
          {!items.length ? <View style={styles.search}><T style={styles.heading}>No matching bookings</T><T style={styles.meta}>Check the IDs or clear the search.</T></View> : null}
          {items.map(booking => <LocalizedPressable key={booking.id} accessibilityRole="button"
            accessibilityLabel={`View booking #${booking.id} details`} onPress={() => void openDetail(booking.id)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
            <View style={styles.row}><Text style={styles.heading}>Booking #{booking.id}</Text><Text style={[styles.badge, bookingStatusStyle(booking.status)]}>{bookingGroupLabel(booking.status)}</Text></View>
            <Text style={styles.heading}>{booking.title}</Text>
            <Text style={styles.meta}>Customer #{booking.customer_id} · {booking.customer?.name || "—"}</Text>
            <Text style={styles.meta}>Provider #{booking.provider_profile_id} · {booking.provider?.business_name || "—"}</Text>
            <Text style={styles.meta}>Scheduled {formatBookingDateTime(booking.scheduled_start_time)}</Text>
            <Text style={styles.body}>Booking total: {formatMoney(booking.total_amount)}</Text>
            <T style={styles.link}>View details</T>
          </LocalizedPressable>)}
          {items.length ? <View style={styles.pagination}>
            <SecondaryButton label="Previous" disabled={page <= 1} onPress={() => setPage(page - 1)} />
            <Text style={styles.meta}>Page {page} of {pages}</Text>
            <SecondaryButton label="Next" disabled={page >= pages} onPress={() => setPage(page + 1)} />
          </View> : null}
        </>}
    </ScrollView>
    {selectedId !== null ? <AdminBookingDetailModal bookingId={selectedId} booking={detail} error={detailError}
      loading={detailLoading} onClose={closeDetail} onRetry={() => void openDetail(selectedId)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.pageTitle, color: colors.text },
  search: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  field: { flexBasis: 200, flexGrow: 1, maxWidth: 320 },
  card: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  heading: { ...type.cardTitle, color: colors.text },
  body: { ...type.body, color: colors.text },
  meta: { ...type.caption, color: colors.mutedText },
  badge: { ...type.badge, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, overflow: "hidden" },
  filterLabel: { ...type.label, color: colors.text },
  statusOption: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.background },
  statusSelected: { backgroundColor: "#E9F7F3", borderColor: colors.primary },
  optionLabel: { ...type.label, color: colors.mutedText },
  optionSelected: { color: colors.primary },
  link: { ...type.label, color: colors.primary },
  error: { ...type.body, color: colors.danger },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
});
