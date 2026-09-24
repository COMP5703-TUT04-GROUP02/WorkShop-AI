import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { getProviderVerificationStatus } from "../api/provider";
import { useAuth } from "./AuthContext";

/**
 * WS-105. The gate used to open as soon as the big profile form was filled in.
 * Admin approval of the qualification step is what unlocks the app now, so a
 * complete but unreviewed profile stays locked.
 */
const PROVIDER_PROFILE_REQUIRED_MESSAGE =
  "An admin needs to approve your service verification first. Continue from Home or Account → Verification.";

type ProviderProfileGateContextValue = {
  hasProviderProfile: boolean | null;
  isProviderProfileRequired: boolean;
  markProviderProfileCreated: () => void;
  refreshProviderProfileStatus: () => Promise<void>;
  showProviderProfileRequiredMessage: () => void;
};

const ProviderProfileGateContext =
  createContext<ProviderProfileGateContextValue | null>(null);

export function ProviderProfileGateProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [hasProviderProfile, setHasProviderProfile] = useState<boolean | null>(
    user?.role === "provider" ? null : true,
  );
  const [isRequiredMessageVisible, setIsRequiredMessageVisible] =
    useState(false);

  const refreshProviderProfileStatus = useCallback(async () => {
    if (user?.role !== "provider") {
      setHasProviderProfile(true);
      return;
    }

    try {
      const status = await getProviderVerificationStatus();
      setHasProviderProfile(status?.qualification_status === "approved");
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;

      // No profile yet means nothing is approved. Any other failure (offline,
      // a 500) says nothing about approval, and this flag now locks the
      // provider's working tabs — so keep whatever was last known instead of
      // unlocking on an error.
      if (status === 404) {
        setHasProviderProfile(false);
      }
    }
  }, [user?.role]);

  useEffect(() => {
    void refreshProviderProfileStatus();
  }, [refreshProviderProfileStatus]);

  const markProviderProfileCreated = useCallback(() => {
    setHasProviderProfile(true);
  }, []);

  const showProviderProfileRequiredMessage = useCallback(() => {
    setIsRequiredMessageVisible(true);
  }, []);

  const value = useMemo(
    () => ({
      hasProviderProfile,
      isProviderProfileRequired:
        user?.role === "provider" && hasProviderProfile !== true,
      markProviderProfileCreated,
      refreshProviderProfileStatus,
      showProviderProfileRequiredMessage,
    }),
    [
      hasProviderProfile,
      markProviderProfileCreated,
      refreshProviderProfileStatus,
      showProviderProfileRequiredMessage,
      user?.role,
    ],
  );

  return (
    <ProviderProfileGateContext.Provider value={value}>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => setIsRequiredMessageVisible(false)}
        transparent
        visible={isRequiredMessageVisible}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Verification required</Text>
            <Text style={styles.dialogMessage}>
              {PROVIDER_PROFILE_REQUIRED_MESSAGE}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsRequiredMessageVisible(false)}
              style={({ pressed }) => [
                styles.dialogButton,
                pressed ? styles.dialogButtonPressed : null,
              ]}
            >
              <Text style={styles.dialogButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ProviderProfileGateContext.Provider>
  );
}

export function useProviderProfileGate() {
  const value = useContext(ProviderProfileGateContext);

  if (!value) {
    throw new Error(
      "useProviderProfileGate must be used inside ProviderProfileGateProvider",
    );
  }

  return value;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 24,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  dialogTitle: {
    color: "#202123",
    fontSize: 18,
    fontWeight: "700",
  },
  dialogMessage: {
    color: "#6E6E80",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  dialogButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: 20,
    borderRadius: 8,
    backgroundColor: "#10A37F",
  },
  dialogButtonPressed: {
    backgroundColor: "#0E8F70",
  },
  dialogButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
