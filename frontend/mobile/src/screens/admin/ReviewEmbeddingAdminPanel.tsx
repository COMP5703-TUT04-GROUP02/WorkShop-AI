import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getEmbeddingHealth,
  getMilvusHealth,
  getReviewEmbeddingSyncStatus,
  getReviewEmbeddingTask,
  retryPendingReviewEmbeddings,
  syncAllReviewEmbeddings,
  type EmbeddingHealth,
  type MilvusHealth,
  type ReviewEmbeddingSyncStatus,
  type ReviewEmbeddingTask,
} from "../../api/admin";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { colors, radius, spacing } from "../../theme/theme";
import { getErrorMessage } from "../../utils/errors";

const POLL_INTERVAL_MS = 2000;

export function ReviewEmbeddingAdminPanel() {
  const [syncStatus, setSyncStatus] = useState<ReviewEmbeddingSyncStatus | null>(null);
  const [embeddingHealth, setEmbeddingHealth] = useState<EmbeddingHealth | null>(null);
  const [milvusHealth, setMilvusHealth] = useState<MilvusHealth | null>(null);
  const [activeTask, setActiveTask] = useState<ReviewEmbeddingTask | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingServices, setIsCheckingServices] = useState(false);
  const [isStartingSync, setIsStartingSync] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRetryPolling, setIsRetryPolling] = useState(false);
  const [showFullSyncConfirmation, setShowFullSyncConfirmation] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    const result = await getReviewEmbeddingSyncStatus();
    setSyncStatus(result ?? null);
    return result;
  }, []);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      await loadStatus();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [loadStatus]);

  const checkServices = useCallback(async () => {
    setIsCheckingServices(true);
    setError("");
    try {
      const [embedding, milvus] = await Promise.all([
        getEmbeddingHealth(),
        getMilvusHealth(),
      ]);
      setEmbeddingHealth(embedding ?? null);
      setMilvusHealth(milvus ?? null);
      setMessage("Local TEI and Milvus are ready.");
    } catch (requestError) {
      setEmbeddingHealth(null);
      setMilvusHealth(null);
      setError(getErrorMessage(requestError));
    } finally {
      setIsCheckingServices(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
    }, [refreshStatus]),
  );

  useEffect(() => {
    if (!activeTaskId) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const [task] = await Promise.all([
          getReviewEmbeddingTask(activeTaskId),
          loadStatus(),
        ]);
        if (cancelled || !task) {
          return;
        }
        setActiveTask(task);
        if (["success", "failed", "revoked"].includes(task.status)) {
          setActiveTaskId(null);
          if (task.status === "success") {
            setMessage("Full review embedding sync completed.");
          } else {
            setError(task.error_message || `Embedding task ${task.status}.`);
          }
        }
      } catch (requestError) {
        if (!cancelled) {
          setActiveTaskId(null);
          setError(getErrorMessage(requestError));
        }
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeTaskId, loadStatus]);

  useEffect(() => {
    if (!isRetryPolling) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const status = await loadStatus();
        if (cancelled || !status) {
          return;
        }
        if (status.pending === 0) {
          setIsRetryPolling(false);
          if (status.failed === 0) {
            setMessage("Pending and failed review embeddings have been processed.");
          } else {
            setError(`${status.failed} review embeddings still failed.`);
          }
        }
      } catch (requestError) {
        if (!cancelled) {
          setIsRetryPolling(false);
          setError(getErrorMessage(requestError));
        }
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isRetryPolling, loadStatus]);

  async function startFullSync() {
    setShowFullSyncConfirmation(false);
    setIsStartingSync(true);
    setError("");
    setMessage("");
    setActiveTask(null);
    try {
      const result = await syncAllReviewEmbeddings();
      if (!result?.task_id) {
        throw new Error("The embedding task could not be queued.");
      }
      setActiveTaskId(result.task_id);
      setMessage("Full review embedding sync queued.");
      await loadStatus();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsStartingSync(false);
    }
  }

  async function retryPending() {
    setIsRetrying(true);
    setError("");
    setMessage("");
    try {
      const result = await retryPendingReviewEmbeddings();
      setMessage(`${result?.review_count ?? 0} pending or failed reviews queued.`);
      setIsRetryPolling((result?.review_count ?? 0) > 0);
      await loadStatus();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsRetrying(false);
    }
  }

  const isBusy =
    isStartingSync || isRetrying || isRetryPolling || Boolean(activeTaskId);
  const pendingOrFailed = (syncStatus?.pending ?? 0) + (syncStatus?.failed ?? 0);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Review embeddings</Text>
          <Text style={styles.subtitle}>
            Generate review vectors with the local TEI service and store them in Milvus.
          </Text>
        </View>
        <SecondaryButton
          disabled={isLoading || isBusy}
          label="Refresh status"
          onPress={() => void refreshStatus()}
        />
      </View>

      <View style={styles.statusGrid}>
        <StatusCard label="Total" value={syncStatus?.total} />
        <StatusCard label="Synced" tone="success" value={syncStatus?.synced} />
        <StatusCard label="Pending" tone="pending" value={syncStatus?.pending} />
        <StatusCard label="Failed" tone="danger" value={syncStatus?.failed} />
        <StatusCard label="Deleted" value={syncStatus?.deleted} />
      </View>

      <View style={styles.serviceCard}>
        <View style={styles.serviceRow}>
          <Text style={styles.serviceLabel}>Embedding service</Text>
          <Text style={embeddingHealth ? styles.readyText : styles.mutedText}>
            {embeddingHealth
              ? `Ready · ${embeddingHealth.dimension} dimensions`
              : "Not checked"}
          </Text>
        </View>
        <View style={styles.serviceRow}>
          <Text style={styles.serviceLabel}>Milvus</Text>
          <Text style={milvusHealth ? styles.readyText : styles.mutedText}>
            {milvusHealth
              ? `Ready · v${milvusHealth.server_version}`
              : "Not checked"}
          </Text>
        </View>
        <SecondaryButton
          disabled={isCheckingServices || isBusy}
          label={isCheckingServices ? "Checking services…" : "Check local services"}
          onPress={() => void checkServices()}
        />
      </View>

      {activeTaskId || activeTask ? (
        <View style={styles.taskCard}>
          {activeTaskId ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : null}
          <View style={styles.taskCopy}>
            <Text style={styles.taskTitle}>Full sync task</Text>
            <Text numberOfLines={1} style={styles.taskText}>
              {activeTask?.status ?? "queued"} · {activeTaskId ?? activeTask?.task_id}
            </Text>
          </View>
        </View>
      ) : null}

      {message ? <Text style={styles.successMessage}>{message}</Text> : null}
      {error ? <Text style={styles.errorMessage}>{error}</Text> : null}

      {showFullSyncConfirmation ? (
        <View style={styles.confirmationCard}>
          <Text style={styles.confirmationTitle}>Rebuild all review embeddings?</Text>
          <Text style={styles.confirmationText}>
            This replaces the Milvus review collection with vectors generated from the current
            visible reviews.
          </Text>
          <View style={styles.actions}>
            <SecondaryButton
              label="Cancel"
              onPress={() => setShowFullSyncConfirmation(false)}
            />
            <PrimaryButton
              label="Confirm rebuild"
              onPress={() => void startFullSync()}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          disabled={isBusy}
          isLoading={isStartingSync || Boolean(activeTaskId)}
          label="Rebuild all review embeddings"
          onPress={() => setShowFullSyncConfirmation(true)}
        />
        <SecondaryButton
          disabled={isBusy || pendingOrFailed === 0}
          label={
            isRetrying || isRetryPolling
              ? "Processing retries…"
              : `Retry pending / failed (${pendingOrFailed})`
          }
          onPress={() => void retryPending()}
          style={styles.actionButton}
        />
      </View>
      <Text style={styles.note}>
        New and edited reviews sync automatically. Use the full rebuild after importing reviews
        directly through a migration or SQL.
      </Text>
    </View>
  );
}

function StatusCard({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "success" | "pending" | "danger";
  value?: number;
}) {
  return (
    <View style={styles.statusCard}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text
        style={[
          styles.statusValue,
          tone === "success" ? styles.successValue : null,
          tone === "pending" ? styles.pendingValue : null,
          tone === "danger" ? styles.dangerValue : null,
        ]}
      >
        {value ?? "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  headerCopy: { flex: 1, minWidth: 240 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.mutedText, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statusCard: {
    minWidth: 112,
    flexGrow: 1,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  statusLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  statusValue: { color: colors.text, fontSize: 24, fontWeight: "800" },
  successValue: { color: colors.primary },
  pendingValue: { color: "#C2410C" },
  dangerValue: { color: colors.danger },
  serviceCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  serviceLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  readyText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  mutedText: { color: colors.mutedText, fontSize: 13 },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "#E7F6F0",
    padding: spacing.md,
  },
  taskCopy: { flex: 1 },
  taskTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  taskText: { color: colors.mutedText, fontSize: 12, marginTop: spacing.xs },
  successMessage: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  errorMessage: { color: colors.danger, fontSize: 14 },
  confirmationCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "#FDBA74",
    borderRadius: radius.md,
    backgroundColor: "#FFF7ED",
    padding: spacing.md,
  },
  confirmationTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  confirmationText: { color: colors.mutedText, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionButton: { flexGrow: 1 },
  note: { color: colors.mutedText, fontSize: 13, lineHeight: 19 },
});
