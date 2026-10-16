import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { X } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  approveAdminRefundAppeal,
  getAdminProviderProfile,
  getAdminProviderPortfolioItem,
  getAdminPayments,
  getAdminSubmerchants,
  getPendingRefundAppeals,
  getPendingProviderProfiles,
  getPendingProviderPortfolios,
  rejectAdminRefundAppeal,
  retryAdminSettlement,
  updateAdminProviderProfileVerification,
  updateAdminProviderPortfolioVerification,
} from "../../api/admin";
import type { AdminRecordFilters } from "../../api/admin";
import { AdminRecordSearch } from "./AdminRecordSearch";
import { parseAdminId } from "./adminState";
import { AdminMenu, type AdminArea } from "../../navigation/AdminMenu";
import { useIsWebDesktop } from "../../layout/useIsWebDesktop";
import { AdminCustomerAIConfigScreen, AdminReviewEmbeddingScreen, AdminReviewManagementScreen, AdminVerificationScreen } from "./AdminPanelScreens";
import { PortfolioMediaCarousel } from "../../components/PortfolioMediaCarousel";
import { MarketplaceBreakdownCard } from "../../components/MarketplaceBreakdownCard";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { TextField } from "../../components/TextField";
import { colors, radius, spacing } from "../../theme/theme";
import type { PaymentHistoryEntry, RefundRequestSummary } from "../../types/booking";
import type { AdminSubmerchant } from "../../types/marketplace";
import type { ProviderPortfolio, ProviderProfile } from "../../types/provider";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/datetime";
import { formatMoney } from "../../utils/money";
import { getPaymentStatusLabel } from "../../constants/labels";
import type { RootStackParamList } from "../../navigation/types";

const PAGE_SIZE = 20;

type AdminPaymentFilters = {
  status?: string;
  settlementStatus?: string;
  providerProfileId?: number;
  bookingId?: number;
};

type OperationsSection = "portfolio" | "refunds" | "payments" | "payouts";

export function AdminDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const area = (route.params as { area?: AdminArea } | undefined)?.area ?? "ai";
  const desktop = useIsWebDesktop();
  const content = area === "verification" ? <AdminVerificationScreen />
    : area === "portfolio" ? <AdminPortfolioReviewScreen />
    : area === "refunds" ? <AdminRefundDisputesScreen />
    : area === "payments" ? <AdminPaymentsSettlementsScreen />
    : area === "payouts" ? <AdminPayoutAccountsScreen />
    : area === "reviews" ? <AdminReviewManagementScreen />
    : area === "embedding" ? <AdminReviewEmbeddingScreen /> : <AdminCustomerAIConfigScreen />;
  return <View style={{ flex: 1 }}>
    {!desktop ? <ScrollView style={{ maxHeight: 240, flexGrow: 0 }}><AdminMenu active={area} onSelect={(next) => navigation.navigate("Main", { screen: "AdminDashboard", params: { area: next } })} /></ScrollView> : null}
    <View key={area} style={{ flex: 1 }}>{content}</View>
  </View>;
}

export function AdminPortfolioReviewScreen() {
  return <AdminOperationsScreen section="portfolio" />;
}

export function AdminRefundDisputesScreen() {
  return <AdminOperationsScreen section="refunds" />;
}

export function AdminPaymentsSettlementsScreen() {
  return <AdminOperationsScreen section="payments" />;
}

export function AdminPayoutAccountsScreen() {
  return <AdminOperationsScreen section="payouts" />;
}

function AdminOperationsScreen({ section }: { section: OperationsSection }) {
  const [pendingPortfolios, setPendingPortfolios] = useState<ProviderPortfolio[]>([]);
  const [pendingAppeals, setPendingAppeals] = useState<RefundRequestSummary[]>([]);
  const [submerchants, setSubmerchants] = useState<AdminSubmerchant[]>([]);
  const [marketplacePayments, setMarketplacePayments] = useState<PaymentHistoryEntry[]>([]);
  const [recordFilters, setRecordFilters] = useState<AdminRecordFilters>({});
  const [recordPage, setRecordPage] = useState(1);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordTotalPages, setRecordTotalPages] = useState(1);
  const [recordQueryDirty, setRecordQueryDirty] = useState(false);
  const [paymentFilters, setPaymentFilters] = useState<AdminPaymentFilters>({});
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentTotalPages, setPaymentTotalPages] = useState(1);
  const [retryQueuedPaymentIds, setRetryQueuedPaymentIds] = useState<
    Record<number, boolean>
  >({});
  const [selectedPortfolio, setSelectedPortfolio] =
    useState<ProviderPortfolio | null>(null);
  const [selectedAppeal, setSelectedAppeal] =
    useState<RefundRequestSummary | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [appealAdminNote, setAppealAdminNote] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  const loadPendingReviews = useCallback(async (
    requestedPaymentPage = paymentPage,
    requestedPaymentFilters = paymentFilters,
  ) => {
    const ticket = ++listRequest.current;
    setIsLoading(true);
    setMessage("");
    setPendingPortfolios([]); setPendingAppeals([]); setSubmerchants([]); setMarketplacePayments([]);
    setRecordTotal(0);
    try {
      if (section === "portfolio") {
        const result = await getPendingProviderPortfolios(recordPage, PAGE_SIZE, recordFilters);
        if (ticket !== listRequest.current) return;
        setPendingPortfolios(result?.items ?? []);
        setRecordTotal(result?.total ?? 0);
        setRecordTotalPages(Math.max(1, result?.total_pages ?? 1));
        if (recordPage > (result?.total_pages ?? 1)) setRecordPage(Math.max(1, result?.total_pages ?? 1));
      } else if (section === "refunds") {
        const result = await getPendingRefundAppeals(recordPage, PAGE_SIZE, recordFilters);
        if (ticket !== listRequest.current) return;
        setPendingAppeals(result?.items ?? []);
        setRecordTotal(result?.total ?? 0);
        setRecordTotalPages(Math.max(1, result?.total_pages ?? 1));
        if (recordPage > (result?.total_pages ?? 1)) setRecordPage(Math.max(1, result?.total_pages ?? 1));
      } else if (section === "payouts") {
        const result = await getAdminSubmerchants(recordPage, PAGE_SIZE, recordFilters);
        if (ticket !== listRequest.current) return;
        setSubmerchants(result?.items ?? []);
        setRecordTotal(result?.total ?? 0);
        setRecordTotalPages(Math.max(1, result?.total_pages ?? 1));
      } else {
        const result = await getAdminPayments(
          requestedPaymentPage,
          PAGE_SIZE,
          requestedPaymentFilters,
        );
        if (ticket !== listRequest.current) return;
        setMarketplacePayments(result?.items ?? []);
        setPaymentPage(result?.page ?? requestedPaymentPage);
        setPaymentTotalPages(Math.max(1, result?.total_pages ?? 1));
      }
    } catch (error) {
      if (ticket === listRequest.current) setMessage(getErrorMessage(error));
    } finally {
      if (ticket === listRequest.current) setIsLoading(false);
    }
  }, [paymentFilters, paymentPage, section, recordPage, recordFilters]);

  function handlePaymentFiltersChange(nextFilters: AdminPaymentFilters) {
    setPaymentFilters(nextFilters);
    setPaymentPage(1);
  }

  function handlePaymentPageChange(nextPage: number) {
    if (nextPage < 1 || nextPage > paymentTotalPages || nextPage === paymentPage) {
      return;
    }
    setPaymentPage(nextPage);
  }

  async function handleRetrySettlement(paymentId: number) {
    setIsActing(true);
    setActionError("");
    setRetryQueuedPaymentIds((current) => ({ ...current, [paymentId]: true }));
    try {
      await retryAdminSettlement(paymentId);
      await loadPendingReviews();
      setMessage(`Payment #${paymentId}: retry queued, not yet settled. Refresh to check the worker result.`);
    } catch (error) {
      setRetryQueuedPaymentIds((current) => {
        const next = { ...current };
        delete next[paymentId];
        return next;
      });
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void loadPendingReviews();
      return () => { listRequest.current += 1; };
    }, [loadPendingReviews]),
  );

  async function openPortfolio(portfolioId: number) {
    const ticket = ++detailRequest.current;
    setActionError("");
    setRejectReason("");
    try {
      const result = await getAdminProviderPortfolioItem(portfolioId);
      if (ticket !== detailRequest.current) return;
      setSelectedPortfolio(result);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }

  function closePortfolio() {
    detailRequest.current++;
    setSelectedPortfolio(null);
    setRejectReason("");
    setActionError("");
  }

  async function approvePortfolio() {
    if (!selectedPortfolio) {
      return;
    }

    setIsActing(true);
    setActionError("");
    try {
      await updateAdminProviderPortfolioVerification(
        selectedPortfolio.id,
        "approved",
        "Portfolio approved",
      );
      await loadPendingReviews();
      Alert.alert("Approved", "Portfolio approved.");
      closePortfolio();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  async function rejectPortfolio() {
    if (!selectedPortfolio) {
      return;
    }

    const cleanReason = rejectReason.trim();
    if (!cleanReason) {
      setActionError("Enter a rejection reason.");
      return;
    }

    setIsActing(true);
    setActionError("");
    try {
      await updateAdminProviderPortfolioVerification(
        selectedPortfolio.id,
        "rejected",
        cleanReason,
      );
      await loadPendingReviews();
      Alert.alert("Declined", "The provider has been notified.");
      closePortfolio();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  function openAppeal(refundRequestId: number) {
    setActionError("");
    setAppealAdminNote("");
    const appeal = pendingAppeals.find((item) => item.id === refundRequestId);
    if (appeal) {
      setSelectedAppeal(appeal);
    }
  }

  function closeAppeal() {
    setSelectedAppeal(null);
    setAppealAdminNote("");
    setActionError("");
  }

  async function approveAppeal() {
    if (!selectedAppeal) {
      return;
    }

    const cleanNote = appealAdminNote.trim();
    if (!cleanNote) {
      setActionError("Enter a support note.");
      return;
    }

    setIsActing(true);
    setActionError("");
    try {
      const result = await approveAdminRefundAppeal(selectedAppeal.id, cleanNote);
      await loadPendingReviews();
      closeAppeal();
      setMessage(`Refund #${selectedAppeal.id}: ${result?.refund_request.status ?? "approved"} · ${formatMoney(result?.refund_request.refund_amount ?? selectedAppeal.refund_amount)}.`);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  async function rejectAppeal() {
    if (!selectedAppeal) {
      return;
    }

    const cleanNote = appealAdminNote.trim();
    if (!cleanNote) {
      setActionError("Enter a support note.");
      return;
    }

    setIsActing(true);
    setActionError("");
    try {
      await rejectAdminRefundAppeal(selectedAppeal.id, cleanNote);
      await loadPendingReviews();
      closeAppeal();
      setMessage(`Refund #${selectedAppeal.id} declined. The previous booking status has been restored.`);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            {section === "portfolio"
              ? "Portfolios pending review"
              : section === "refunds"
                ? "Refund appeals pending review"
                : section === "payments"
                  ? "Payments & settlements"
                  : "Provider payout accounts"}
          </Text>
        </View>
        <SecondaryButton
          disabled={isLoading || isActing}
          label="Refresh"
          onPress={() => { setRetryQueuedPaymentIds({}); void loadPendingReviews(); }}
        />
      </View>

      {section !== "payments" ? <>
        <AdminRecordSearch section={section} appliedFilters={recordFilters} disabled={isLoading || isActing} onDirty={() => { setRecordQueryDirty(true); closePortfolio(); closeAppeal(); }} onSearch={(filters) => { closePortfolio(); closeAppeal(); setRecordPage(1); setRecordQueryDirty(false); setRecordFilters(filters); }} />
        <Text style={styles.cardMeta}>{recordQueryDirty ? "Conditions changed. Search to update results." : `${recordTotal} results matching the filters above`}</Text>
      </> : null}

      {message ? <Text accessibilityLiveRegion="polite" style={styles.cardMeta}>{message}</Text> : null}

      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      {(section === "payments" || section === "payouts") && !recordQueryDirty && isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (section === "payments" || section === "payouts") && !recordQueryDirty ? (
        <MarketplaceSection
          isActing={isActing}
          onRetrySettlement={(paymentId) => void handleRetrySettlement(paymentId)}
          filters={paymentFilters}
          onFiltersChange={handlePaymentFiltersChange}
          page={paymentPage}
          totalPages={paymentTotalPages}
          onPageChange={handlePaymentPageChange}
          retryQueuedPaymentIds={retryQueuedPaymentIds}
          payments={marketplacePayments}
          submerchants={submerchants}
          view={section}
        />
      ) : null}

      {section === "portfolio" && !recordQueryDirty && !isLoading ? <View style={styles.section}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : pendingPortfolios.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No matching portfolios pending review</Text>
            <Text style={styles.emptyText}>
              Newly uploaded portfolios enter pending status first.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {pendingPortfolios.map((portfolio) => (
              <PortfolioReviewCard
                key={portfolio.id}
                onPress={() => void openPortfolio(portfolio.id)}
                portfolio={portfolio}
              />
            ))}
          </View>
        )}
      </View> : null}

      {section === "refunds" && !recordQueryDirty && !isLoading ? <View style={styles.section}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : pendingAppeals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No matching refund appeals</Text>
            <Text style={styles.emptyText}>
              Customer appeals against provider refund rejections appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {pendingAppeals.map((appeal) => (
              <RefundAppealCard
                key={appeal.id}
                appeal={appeal}
                onPress={() => openAppeal(appeal.id)}
              />
            ))}
          </View>
        )}
      </View> : null}

      {section !== "payments" && !recordQueryDirty && !isLoading ? <View style={styles.paginationRow}><SecondaryButton label="Previous" disabled={isActing || recordPage <= 1} onPress={() => setRecordPage(recordPage - 1)} /><Text style={styles.cardMeta}>Page {recordPage} of {recordTotalPages} · 20 per page</Text><SecondaryButton label="Next" disabled={isActing || recordPage >= recordTotalPages} onPress={() => setRecordPage(recordPage + 1)} /></View> : null}

      {section === "portfolio" ? <PortfolioReviewModal
        actionError={actionError}
        isActing={isActing}
        onApprove={() => void approvePortfolio()}
        onClose={closePortfolio}
        onReject={() => void rejectPortfolio()}
        portfolio={selectedPortfolio}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
      /> : null}

      {section === "refunds" ? <RefundAppealModal
        actionError={actionError}
        adminNote={appealAdminNote}
        appeal={selectedAppeal}
        isActing={isActing}
        onApprove={() => void approveAppeal()}
        onClose={closeAppeal}
        onReject={() => void rejectAppeal()}
        setAdminNote={setAppealAdminNote}
      /> : null}
    </ScrollView>
  );
}

function MarketplaceSection({
  filters,
  isActing,
  onFiltersChange,
  onPageChange,
  onRetrySettlement,
  page,
  payments,
  retryQueuedPaymentIds,
  submerchants,
  totalPages,
  view,
}: {
  filters: AdminPaymentFilters;
  isActing: boolean;
  onFiltersChange: (filters: AdminPaymentFilters) => void;
  onPageChange: (page: number) => void;
  onRetrySettlement: (paymentId: number) => void;
  page: number;
  payments: PaymentHistoryEntry[];
  retryQueuedPaymentIds: Record<number, boolean>;
  submerchants: AdminSubmerchant[];
  totalPages: number;
  view: "payments" | "payouts";
}) {
  const [providerFilter, setProviderFilter] = useState(
    filters.providerProfileId == null ? "" : String(filters.providerProfileId),
  );
  const [bookingFilter, setBookingFilter] = useState(
    filters.bookingId == null ? "" : String(filters.bookingId),
  );
  const [filterError, setFilterError] = useState("");

  function applyIdFilters() {
    try {
      const providerProfileId = parseAdminId(providerFilter);
      const bookingId = parseAdminId(bookingFilter);
      setFilterError("");
      onFiltersChange({ ...filters, providerProfileId, bookingId });
    } catch { setFilterError("Enter a positive whole ID, or leave it blank."); }
  }

  return (
    <View style={styles.section}>
      {view === "payouts" && submerchants.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No matching payout accounts</Text>
          <Text style={styles.emptyText}>Provider payout account status will appear here.</Text>
        </View>
      ) : view === "payouts" ? (
        <View style={styles.list}>
          {submerchants.map((submerchant) => (
            <View key={submerchant.id} style={styles.reviewCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Provider #{submerchant.provider_profile_id}</Text>
                <Text style={styles.pendingBadge}>{submerchant.status}</Text>
              </View>
              <Text style={styles.cardMeta}>
                {submerchant.submerchant_type} · IBAN {maskSecret(submerchant.iban)}
              </Text>
              <Text style={styles.cardMeta}>
                ID {maskSecret(submerchant.identity_number)} · Tax {maskSecret(submerchant.tax_number)}
              </Text>
              {submerchant.iyzico_error_code || submerchant.iyzico_error_message ? (
                <Text style={styles.errorText}>
                  {submerchant.iyzico_error_code || "iyzico"}: {submerchant.iyzico_error_message || "Unknown error"}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {view === "payments" ? <View style={styles.filterCard}>
        <Text style={styles.filterTitle}>Payment filters</Text>
        <Text style={styles.filterLabel}>Payment status</Text>
        <View style={styles.filterRow}>
          {[
            ["All", undefined],
            ["Authorized", "authorized"],
            ["Paid", "paid"],
            ["Failed", "failed"],
            ["Refunded", "refunded"],
            ["Partially refunded", "partially_refunded"],
          ].map(([label, value]) => (
            <FilterChip
              active={filters.status === value}
              key={String(label)}
              label={String(label)}
              onPress={() =>
                onFiltersChange({ ...filters, status: value as string | undefined })
              }
            />
          ))}
        </View>
        <Text style={styles.filterLabel}>Settlement status</Text>
        <View style={styles.filterRow}>
          {[
            ["All", undefined],
            ["Pending", "pending"],
            ["Approved", "approved"],
            ["Failed", "approval_failed"],
          ].map(([label, value]) => (
            <FilterChip
              active={filters.settlementStatus === value}
              key={String(label)}
              label={String(label)}
              onPress={() =>
                onFiltersChange({
                  ...filters,
                  settlementStatus: value as string | undefined,
                })
              }
            />
          ))}
        </View>
        <TextField
          keyboardType="number-pad"
          label="Provider profile ID"
          onChangeText={setProviderFilter}
          onSubmitEditing={applyIdFilters}
          placeholder="Optional"
          value={providerFilter}
        />
        <TextField
          keyboardType="number-pad"
          label="Booking ID"
          onChangeText={setBookingFilter}
          onSubmitEditing={applyIdFilters}
          placeholder="Optional"
          value={bookingFilter}
        />
        <SecondaryButton label="Apply ID filters" onPress={applyIdFilters} />
        {filterError ? <Text accessibilityRole="alert" style={styles.errorText}>{filterError}</Text> : null}
      </View> : null}

      {view === "payments" ? <Text style={styles.cardMeta}>Results matching the filters above</Text> : null}
      {view === "payments" && payments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No matching marketplace payments</Text>
          <Text style={styles.emptyText}>Payment splits and settlement status will appear here.</Text>
        </View>
      ) : view === "payments" ? (
        <View style={styles.list}>
          {payments.map((payment) => {
            const settlement = payment.settlement;
            return (
              <View key={payment.id} style={styles.paymentCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Payment #{payment.id}</Text>
                  <Text style={styles.pendingBadge}>{getPaymentStatusLabel(payment.status)}</Text>
                </View>
                <Text style={styles.paymentTotal}>
                  Payment total: {formatMoney(payment.amount)} · Booking #{payment.booking_id}
                </Text>
                <Text style={styles.cardMeta}>
                  Customer {payment.booking?.customer?.name || `#${payment.customer_id}`} · Provider {payment.booking?.provider?.business_name || `#${payment.provider_profile_id}`}
                </Text>
                <Text style={styles.cardMeta}>
                  Transaction {payment.payment_transaction_id || "Not available"}
                </Text>
                <Text style={styles.cardMeta}>
                  Created {formatDateTime(payment.created_at)}
                  {payment.authorized_at
                    ? ` · Authorized ${formatDateTime(payment.authorized_at)}`
                    : ""}
                  {payment.paid_at ? ` · Paid ${formatDateTime(payment.paid_at)}` : ""}
                </Text>
                {settlement ? (
                  <>
                    <MarketplaceBreakdownCard adminLayout payment={payment} title="Settlement breakdown" />
                    {settlement.merchant_payout_amount != null ? (
                      <Text style={styles.cardMeta}>
                        Platform payout after known deductions {formatMoney(settlement.merchant_payout_amount)}
                      </Text>
                    ) : null}
                    {settlement.status === "approval_failed" ? (
                      retryQueuedPaymentIds[payment.id] ? (
                        <Text style={styles.retryQueuedText}>
                          Settlement retry queued; waiting for the worker result.
                        </Text>
                      ) : (
                        <SecondaryButton
                          disabled={isActing}
                          label="Retry settlement"
                          onPress={() => onRetrySettlement(payment.id)}
                        />
                      )
                    ) : null}
                  </>
                ) : (
                  <>
                    <MarketplaceBreakdownCard adminLayout payment={payment} title="Payment estimate" />
                    <Text style={styles.cardMeta}>No settlement record yet</Text>
                  </>
                )}
                {payment.failure_code || payment.failure_message ? (
                  <Text style={styles.errorText}>
                    {payment.failure_code || "payment_error"}: {payment.failure_message || "Unknown payment error"}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {view === "payments" && payments.length > 0 ? (
        <View style={styles.paginationRow}>
          <SecondaryButton
            disabled={isActing || page <= 1}
            label="Previous"
            onPress={() => onPageChange(page - 1)}
          />
          <Text style={styles.paginationText}>Page {page} of {totalPages}</Text>
          <SecondaryButton
            disabled={isActing || page >= totalPages}
            label="Next"
            onPress={() => onPageChange(page + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.filterChip, active ? styles.filterChipActive : null]}
    >
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function maskSecret(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  if (value.length <= 4) {
    return `••••${value}`;
  }
  return `••••${value.slice(-4)}`;
}

function ProfileReviewCard({
  profile,
  onPress,
}: {
  profile: ProviderProfile;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.reviewCard, pressed ? styles.cardPressed : null]}
    >
      <View style={styles.cardHeader}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {profile.business_name}
        </Text>
        <Text style={styles.pendingBadge}>Pending</Text>
      </View>
      <Text numberOfLines={2} style={styles.cardDescription}>
        {profile.bio || "No bio"}
      </Text>
      <Text style={styles.cardMeta}>
        Provider #{profile.id} · {profile.service_province} · {profile.tags.join(", ")}
      </Text>
    </Pressable>
  );
}

function RefundAppealCard({
  appeal,
  onPress,
}: {
  appeal: RefundRequestSummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.reviewCard, pressed ? styles.cardPressed : null]}
    >
      <View style={styles.cardHeader}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          Refund appeal #{appeal.id}
        </Text>
        <Text style={styles.pendingBadge}>Appealed</Text>
      </View>
      <Text numberOfLines={2} style={styles.cardDescription}>
        {appeal.appeal_reason || "No reason provided"}
      </Text>
      <Text style={styles.cardMeta}>
        Refund request #{appeal.id} · Customer #{appeal.customer_id} · Provider #{appeal.provider_profile_id}
      </Text>
      {appeal.booking?.service_description ? (
        <Text numberOfLines={1} style={styles.cardMeta}>
          Service: {appeal.booking.service_description}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ProfileReviewModal({
  actionError,
  isActing,
  onApprove,
  onClose,
  onReject,
  profile,
  rejectReason,
  setRejectReason,
}: {
  actionError: string;
  isActing: boolean;
  onApprove: () => void;
  onClose: () => void;
  onReject: () => void;
  profile: ProviderProfile | null;
  rejectReason: string;
  setRejectReason: (value: string) => void;
}) {
  if (!profile) {
    return null;
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleGroup}>
              <Text style={styles.modalTitle}>{profile.business_name}</Text>
              <Text style={styles.modalSubtitle}>Profile #{profile.id}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              disabled={isActing}
              onPress={onClose}
              style={styles.closeButton}
            >
              <X color={colors.text} size={22} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Provider profile</Text>
              <ProfileDetailRow label="Business name" value={profile.business_name} />
              <ProfileDetailRow label="Service province" value={profile.service_province} />
              <ProfileDetailRow label="Service tags" value={profile.tags.join(", ")} />
              <ProfileDetailRow label="Hourly rate" value={String(profile.hourly_rate)} />
              <ProfileDetailRow label="Phone number" value={profile.phone_number} />
              <ProfileDetailRow label="Address" value={profile.address} />
              <ProfileDetailRow
                label="Location"
                value={`${profile.latitude ?? "-"}, ${profile.longitude ?? "-"}`}
              />
              <Text style={styles.detailMeta}>Bio</Text>
              <Text style={styles.detailText}>{profile.bio}</Text>
              {profile.notes ? (
                <>
                  <Text style={styles.detailMeta}>Notes</Text>
                  <Text style={styles.detailText}>{profile.notes}</Text>
                </>
              ) : null}
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Certificates</Text>
              <ProfileDetailRow label="Name" value={profile.certificate_name} />
              <ProfileDetailRow label="URL" value={profile.certificate_url} />
              {profile.certificate_files?.map((certificate, index) => (
                <ProfileDetailRow
                  key={`${certificate.id}-${index}`}
                  label={`File ${index + 1}`}
                  value={`${certificate.original_file_name} · ${certificate.file_url}`}
                />
              ))}
              <ProfileDetailRow label="Current status" value={profile.verification_status} />
            </View>

            <TextField
              label="Rejection reason"
              multiline
              numberOfLines={4}
              onChangeText={setRejectReason}
              placeholder="Shown to the provider"
              value={rejectReason}
            />
            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <SecondaryButton disabled={isActing} label="Cancel" onPress={onClose} />
            <SecondaryButton disabled={isActing} label="Reject" onPress={onReject} />
            <PrimaryButton
              disabled={isActing}
              isLoading={isActing}
              label="Approve"
              onPress={onApprove}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ProfileDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "-"}</Text>
    </View>
  );
}

function RefundAppealModal({
  actionError,
  adminNote,
  appeal,
  isActing,
  onApprove,
  onClose,
  onReject,
  setAdminNote,
}: {
  actionError: string;
  adminNote: string;
  appeal: RefundRequestSummary | null;
  isActing: boolean;
  onApprove: () => void;
  onClose: () => void;
  onReject: () => void;
  setAdminNote: (value: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!appeal) {
    return null;
  }

  const booking = appeal.booking;
  const payment = appeal.payment;

  return (
    <Modal animationType="slide" onRequestClose={() => { if (!isActing) { setConfirming(false); onClose(); } }} transparent visible>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleGroup}>
              <Text style={styles.modalTitle}>Refund appeal #{appeal.id}</Text>
              <Text style={styles.modalSubtitle}>Booking #{appeal.booking_id}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              disabled={isActing}
              onPress={() => { setConfirming(false); onClose(); }}
              style={styles.closeButton}
            >
              <X color={colors.text} size={22} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Booking and refund details</Text>
              <ProfileDetailRow
                label="Refund status"
                value={getRefundStatusLabel(appeal.status)}
              />
              <ProfileDetailRow label="Customer" value={`#${appeal.customer_id}`} />
              <ProfileDetailRow
                label="Provider"
                value={`#${appeal.provider_profile_id}`}
              />
              <ProfileDetailRow
                label="Refund amount"
                value={appeal.refund_amount != null && payment ? `${formatMoney(appeal.refund_amount)}` : "Unavailable"}
              />
              <ProfileDetailRow
                label="Booking status"
                value={booking?.status || appeal.previous_booking_status || "-"}
              />
              {booking ? (
                <>
                  <ProfileDetailRow
                    label="Service description"
                    value={booking.service_description}
                  />
                  <ProfileDetailRow label="Service address" value={booking.service_address} />
                  <ProfileDetailRow
                    label="Start time"
                    value={booking.scheduled_start_time ? formatDate(booking.scheduled_start_time) : "-"}
                  />
                  <ProfileDetailRow
                    label="End time"
                    value={booking.scheduled_end_time ? formatDate(booking.scheduled_end_time) : "-"}
                  />
                </>
              ) : null}
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Appeal details</Text>
              <ProfileDetailRow label="Refund reason" value={appeal.reason} />
              <ProfileDetailRow
                label="Provider response"
                value={appeal.provider_note || "-"}
              />
              <ProfileDetailRow
                label="Appeal reason"
                value={appeal.appeal_reason || "-"}
              />
            </View>

            <TextField
              label="Support note"
              multiline
              numberOfLines={4}
              editable={!isActing}
              onChangeText={(value) => { setConfirming(false); setAdminNote(value); }}
              placeholder="Shown to the customer and provider"
              value={adminNote}
            />
            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <SecondaryButton disabled={isActing} label={confirming ? "Back" : "Cancel"} onPress={() => { if (confirming) setConfirming(false); else onClose(); }} />
            {!confirming ? <SecondaryButton disabled={isActing} label="Reject refund" onPress={onReject} /> : null}
            <PrimaryButton
              disabled={isActing || !adminNote.trim() || appeal.refund_amount == null}
              isLoading={isActing}
              label={confirming ? `Confirm refund #${appeal.id} · ${formatMoney(appeal.refund_amount)}` : "Approve refund"}
              onPress={() => { if (confirming) { setConfirming(false); onApprove(); } else setConfirming(true); }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PortfolioReviewCard({
  portfolio,
  onPress,
}: {
  portfolio: ProviderPortfolio;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.reviewCard, pressed ? styles.cardPressed : null]}
    >
      <View style={styles.cardHeader}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {portfolio.title}
        </Text>
        <Text style={styles.pendingBadge}>Pending</Text>
      </View>
      <Text numberOfLines={2} style={styles.cardDescription}>
        {portfolio.description || "No description"}
      </Text>
      <Text style={styles.cardMeta}>
        Provider #{portfolio.provider_profile_id} · {portfolio.media_items.length || 1} media items
      </Text>
    </Pressable>
  );
}

function PortfolioReviewModal({
  actionError,
  isActing,
  onApprove,
  onClose,
  onReject,
  portfolio,
  rejectReason,
  setRejectReason,
}: {
  actionError: string;
  isActing: boolean;
  onApprove: () => void;
  onClose: () => void;
  onReject: () => void;
  portfolio: ProviderPortfolio | null;
  rejectReason: string;
  setRejectReason: (value: string) => void;
}) {
  if (!portfolio) {
    return null;
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleGroup}>
              <Text style={styles.modalTitle}>Portfolio #{portfolio.id}</Text>
              <Text style={styles.modalSubtitle}>Provider #{portfolio.provider_profile_id}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              disabled={isActing}
              onPress={onClose}
              style={styles.closeButton}
            >
              <X color={colors.text} size={22} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <PortfolioMediaCarousel portfolio={portfolio} />

            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>{portfolio.title}</Text>
              <Text style={styles.detailText}>
                {portfolio.description || "No description"}
              </Text>
              <Text style={styles.detailMeta}>
                Uploaded: {formatDate(portfolio.created_at)}
              </Text>
              <Text style={styles.detailMeta}>
                Status: {portfolio.verification_status}
              </Text>
            </View>

            <TextField
              label="Rejection reason"
              multiline
              numberOfLines={4}
              onChangeText={setRejectReason}
              placeholder="Shown to the provider"
              value={rejectReason}
            />
            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <SecondaryButton disabled={isActing} label="Cancel" onPress={onClose} />
            <SecondaryButton disabled={isActing} label="Reject" onPress={onReject} />
            <PrimaryButton
              disabled={isActing}
              isLoading={isActing}
              label="Approve"
              onPress={onApprove}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toLocaleString();
}

function getRefundStatusLabel(status: string) {
  switch (status) {
    case "appealed":
      return "Under review";
    case "approved":
      return "Approved";
    case "admin_rejected":
      return "Appeal declined";
    case "rejected":
      return "Declined";
    default:
      return status || "Unknown";
  }
}

const styles = StyleSheet.create({
  paymentTotal: { color: colors.text, fontWeight: "800", fontSize: 16 },
  paymentCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: "#F0F2F5", padding: spacing.lg, gap: spacing.sm },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  hubGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  hubCard: {
    minWidth: 260,
    flexBasis: 280,
    flexGrow: 1,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  hubCardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  hubCardDescription: {
    flex: 1,
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  hubCardLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  loader: {
    paddingVertical: spacing.xl,
  },
  emptyCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: spacing.md,
  },
  filterCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  filterTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  filterLabel: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: "#E7F6F0",
  },
  filterChipText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: colors.primary,
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  paginationText: {
    color: colors.mutedText,
    fontSize: 13,
  },
  reviewCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  cardPressed: {
    backgroundColor: colors.surface,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  pendingBadge: {
    overflow: "hidden",
    borderRadius: radius.sm,
    backgroundColor: "#FFF7ED",
    color: "#C2410C",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 12,
    fontWeight: "800",
  },
  cardDescription: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  cardMeta: {
    color: colors.mutedText,
    fontSize: 13,
  },
  retryQueuedText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  modalCard: {
    maxHeight: "92%",
    gap: spacing.md,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  modalTitleGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  modalSubtitle: {
    color: colors.mutedText,
    fontSize: 13,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  modalContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  detailCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  detailTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  detailText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  detailMeta: {
    color: colors.mutedText,
    fontSize: 13,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  detailLabel: {
    minWidth: 86,
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  detailValue: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "right",
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
});
