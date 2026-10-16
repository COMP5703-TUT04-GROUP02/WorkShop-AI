import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getAdminBooking, getAdminBookings } from "../../api/admin";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { getBookingStatusLabel } from "../../constants/labels";
import { colors, radius, spacing } from "../../theme/theme";
import type { AdminBookingDetail, AdminBookingFilters } from "../../types/adminBooking";
import type { BookingDetail } from "../../types/booking";
import { formatDateTime } from "../../utils/datetime";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney } from "../../utils/money";
import { createLatestRequestGuard } from "../../utils/latestRequest";
import { parseAdminId } from "./adminState";
import { AdminBookingDetailModal } from "./AdminBookingDetailModal";

const FIELDS = [
  ["bookingId", "Booking ID"],
  ["customerId", "Customer user ID"],
  ["providerProfileId", "Provider profile ID"],
] as const;
type IdKey = typeof FIELDS[number][0];
const EMPTY = { bookingId: "", customerId: "", providerProfileId: "" };

export function AdminBookingsScreen() {
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
    setDirty(true); setItems([]); setTotal(0); setError(""); setLoading(false);
    listGuard.current.invalidate(); closeDetail();
  }

  function search(clear = false) {
    const next: AdminBookingFilters = {};
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
      <Text style={styles.title}>Booking lookup</Text>
      <View style={styles.search}>
        <View style={styles.row}>{FIELDS.map(([key, label]) => <View key={key} style={styles.field}>
          <TextField label={label} value={values[key]} keyboardType="number-pad" error={errors[key]}
            onChangeText={value => edit(key, value)} onSubmitEditing={() => search()} />
        </View>)}</View>
        <Text style={styles.meta}>All booking statuses. All filled fields must match.</Text>
        <View style={styles.row}>
          <PrimaryButton label="Search" onPress={() => search()} />
          <SecondaryButton label="Clear search" onPress={() => search(true)} />
        </View>
      </View>
      {dirty ? <Text style={styles.meta}>Search to apply the changed IDs.</Text>
        : loading ? <ActivityIndicator accessibilityLabel="Loading bookings" color={colors.primary} />
        : error ? <View style={styles.search}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><SecondaryButton label="Retry search" onPress={() => void load()} /></View>
        : <>
          <Text style={styles.meta}>Results matching the filters above · {total} {total === 1 ? "booking" : "bookings"}</Text>
          {!items.length ? <View style={styles.search}><Text style={styles.heading}>No matching bookings</Text><Text style={styles.meta}>Check the IDs or clear the search.</Text></View> : null}
          {items.map(booking => <Pressable key={booking.id} accessibilityRole="button"
            accessibilityLabel={`View booking #${booking.id} details`} onPress={() => void openDetail(booking.id)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
            <View style={styles.row}><Text style={styles.heading}>Booking #{booking.id}</Text><Text style={styles.badge}>{getBookingStatusLabel(booking.status)}</Text></View>
            <Text style={styles.heading}>{booking.title}</Text>
            <Text style={styles.meta}>Customer #{booking.customer_id} · {booking.customer?.name || "—"}</Text>
            <Text style={styles.meta}>Provider #{booking.provider_profile_id} · {booking.provider?.business_name || "—"}</Text>
            <Text style={styles.meta}>Scheduled {formatDateTime(booking.scheduled_start_time)}</Text>
            <Text>Booking total: {formatMoney(booking.total_amount)}</Text>
            <Text style={styles.link}>View details</Text>
          </Pressable>)}
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
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  search: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  field: { flexBasis: 200, flexGrow: 1, maxWidth: 320 },
  card: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700" },
  meta: { color: colors.mutedText, fontSize: 13, lineHeight: 19 },
  badge: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  link: { color: colors.primary, fontWeight: "600" },
  error: { color: colors.danger },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
});
