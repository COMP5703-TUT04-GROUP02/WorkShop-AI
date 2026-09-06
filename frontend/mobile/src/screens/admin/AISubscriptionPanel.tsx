import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import {
  cancelLLMOauth,
  getLLMOauthStatus,
  logoutLLMOauth,
  setLLMOauthAuth,
  startLLMOauth,
  type LLMOauthStatus,
} from "../../api/admin";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { colors, radius, spacing } from "../../theme/theme";
import { getErrorMessage } from "../../utils/errors";

export function AISubscriptionPanel() {
  const [status, setStatus] = useState<LLMOauthStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [acting, setActing] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getLLMOauthStatus());
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const pending = Boolean(status?.chatgpt.pending);

  useEffect(() => {
    if (!pending) {
      return;
    }
    const timer = setInterval(() => {
      void loadStatus();
    }, 2000);
    return () => clearInterval(timer);
  }, [loadStatus, pending]);

  async function run(label: string, action: () => Promise<LLMOauthStatus | null>) {
    setActing(label);
    setErrorMessage("");
    try {
      const next = await action();
      if (next) {
        setStatus(next);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActing("");
    }
  }

  const activeLabel =
    status?.auth === "chatgpt" ? "ChatGPT Plus / Pro" : "API key";

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Customer AI subscription</Text>
      <Text style={styles.active}>Active: {activeLabel}</Text>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <ProviderCard
        acting={acting}
        busy={Boolean(acting)}
        onCancel={() => void run("chatgpt-cancel", () => cancelLLMOauth("chatgpt"))}
        onLogout={() => void run("chatgpt-logout", () => logoutLLMOauth("chatgpt"))}
        onStart={() => void run("chatgpt-start", () => startLLMOauth("chatgpt"))}
        onUse={() => void run("chatgpt-use", () => setLLMOauthAuth("chatgpt"))}
        provider={status?.chatgpt}
        title="ChatGPT Plus / Pro"
      />
      {status?.auth !== "key" ? (
        <SecondaryButton
          disabled={Boolean(acting)}
          label="Use API key instead"
          onPress={() => void run("key", () => setLLMOauthAuth("key"))}
        />
      ) : null}
    </View>
  );
}

function ProviderCard({
  acting,
  busy,
  onCancel,
  onLogout,
  onStart,
  onUse,
  provider,
  title,
}: {
  acting: string;
  busy: boolean;
  onCancel: () => void;
  onLogout: () => void;
  onStart: () => void;
  onUse: () => void;
  provider?: LLMOauthStatus["chatgpt"];
  title: string;
}) {
  const pending = Boolean(provider?.pending);
  const connected = Boolean(provider?.connected);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>
        {connected ? "Signed in" : pending ? "Waiting for approval" : "Not signed in"}
      </Text>
      {provider?.user_code ? (
        <Text style={styles.code}>{provider.user_code}</Text>
      ) : null}
      {provider?.url ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(provider.url || "")}
        >
          <Text style={styles.link}>{provider.url}</Text>
        </Pressable>
      ) : null}
      {provider?.error ? <Text style={styles.errorText}>{provider.error}</Text> : null}
      <View style={styles.actions}>
        {pending ? (
          <SecondaryButton disabled={busy} label="Cancel" onPress={onCancel} />
        ) : connected ? (
          <>
            <PrimaryButton
              disabled={busy}
              isLoading={acting.endsWith("-use")}
              label="Use this subscription"
              onPress={onUse}
            />
            <SecondaryButton disabled={busy} label="Sign out" onPress={onLogout} />
          </>
        ) : (
          <PrimaryButton
            disabled={busy}
            isLoading={acting.endsWith("-start")}
            label="Sign in"
            onPress={onStart}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  active: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  cardBody: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  code: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 2,
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
