import * as ImagePicker from "expo-image-picker";
import {
  BellRing,
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Heart,
  History,
  LogOut,
  Pencil,
  Plus,
  LockKeyhole,
  Shield,
  SlidersHorizontal,
  UserRound,
} from "lucide-react-native";
import { Children, ReactNode, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ScreenContainer } from "../components/ScreenContainer";
import { useAuth } from "../context/AuthContext";
import { useProviderProfileGate } from "../context/ProviderProfileGateContext";
import { useIsWebDesktop } from "../layout/useIsWebDesktop";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { colors, radius, spacing } from "../theme/theme";
import { resolveMediaUrl } from "../utils/media";

type MenuItemProps = {
  badgeCount?: number;
  icon: ReactNode;
  label: string;
  onPress?: () => void;
  isDanger?: boolean;
};

export function AccountScreen() {
  const { user, signOut, uploadAvatar } = useAuth();
  const {
    hasProviderProfile,
    showProviderProfileRequiredMessage,
  } = useProviderProfileGate();
  const isCustomer = user?.role === "customer";
  const isProvider = user?.role === "provider";
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isWebDesktop = useIsWebDesktop();
  const [message, setMessage] = useState("");
  const avatarUri = resolveMediaUrl(user?.avatar_url ?? null);


  async function handlePickAvatar() {
    setMessage("");

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Allow access to photos to update your avatar.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    try {
      const asset = result.assets[0];
      await uploadAvatar({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      });
      setMessage("Avatar updated");
    } catch {
      setMessage("Couldn't update avatar. Try again.");
    }
  }

  return (
    <ScreenContainer contentStyle={styles.content}>
      <View style={isWebDesktop ? styles.desktopRow : undefined}>
        <View
          style={[
            styles.profileHeader,
            isWebDesktop ? styles.profileHeaderDesktop : null,
          ]}
        >
          <Pressable
            accessibilityLabel="Upload avatar"
            accessibilityRole="button"
            onPress={() => {
              void handlePickAvatar();
            }}
            style={styles.avatarButton}
          >
            {avatarUri ? (
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="Your profile photo"
                resizeMode="cover"
                source={{ uri: avatarUri }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <UserRound color={colors.mutedText} size={40} />
              </View>
            )}

            {!avatarUri ? (
              <View style={styles.avatarAddBadge}>
                <Plus color="#FFFFFF" size={18} />
              </View>
            ) : null}
          </Pressable>

          <View style={isWebDesktop ? styles.identityText : styles.identityTextStacked}>
            <View style={styles.nameRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name ?? "Workshop AI"}
              </Text>
              <Text style={styles.rolePill}>
                {user?.role === "provider"
                  ? "Provider"
                  : user?.role === "admin"
                    ? "Platform"
                    : "Customer"}
              </Text>
            </View>
            <Text style={styles.userMeta} numberOfLines={1}>
              {user?.email}
            </Text>
            {message ? <Text style={styles.messageText}>{message}</Text> : null}
          </View>
        </View>

        <View style={isWebDesktop ? styles.menuGrid : styles.menuColumn}>
          <View style={isWebDesktop ? styles.menuGridColumn : styles.menuColumn}>
            <MenuGroup label="Profile">
              <MenuItem
                icon={<Pencil color={colors.text} size={22} />}
                label="Edit profile"
                onPress={() =>
                  navigation.navigate("AccountEdit")
                }
              />
              {isProvider ? (
                <MenuItem
                  icon={<BadgeCheck color={colors.text} size={22} />}
                  label="Verification"
                  onPress={() => navigation.navigate("ProviderVerification")}
                />
              ) : null}
              {isProvider ? (
                <MenuItem
                  icon={
                    hasProviderProfile === true ? (
                      <SlidersHorizontal color={colors.text} size={22} />
                    ) : (
                      <LockKeyhole color={colors.mutedText} size={22} />
                    )
                  }
                  label="Operating settings"
                  onPress={() => {
                    if (hasProviderProfile === true) {
                      navigation.navigate("ProviderOperatingSettings");
                    } else {
                      showProviderProfileRequiredMessage();
                    }
                  }}
                />
              ) : null}
            </MenuGroup>

            <MenuGroup label="Account">
              <MenuItem
                icon={<Shield color={colors.text} size={22} />}
                label="Account and Security"
                onPress={() =>
                  navigation.navigate("AccountSecurity")
                }
              />
              <MenuItem
                icon={<CreditCard color={colors.text} size={22} />}
                label="Payments"
                onPress={() =>
                  navigation.navigate("Payments")
                }
              />
              <MenuItem
                icon={<BellRing color={colors.text} size={22} />}
                label="Notification settings"
                onPress={() =>
                  navigation.navigate("NotificationSettings")
                }
              />
            </MenuGroup>
          </View>

          <View style={isWebDesktop ? styles.menuGridColumn : styles.menuColumn}>
            <MenuGroup label="Your bookings">
              <MenuItem
                icon={<History color={colors.text} size={22} />}
                label="Booking history"
                onPress={() =>
                  navigation.navigate("BookingHistory")
                }
              />
              {isCustomer ? (
                <MenuItem
                  icon={<Heart color={colors.text} size={22} />}
                  label="Favourites"
                  onPress={() =>
                    navigation.navigate("CustomerFavourites")
                  }
                />
              ) : null}
            </MenuGroup>
            <MenuGroup label="Support">
              <MenuItem
                icon={<CircleHelp color={colors.text} size={22} />}
                label="Help and Support"
                onPress={() =>
                  navigation.navigate("Help")
                }
              />
            </MenuGroup>

            <MenuGroup>
              <MenuItem
                icon={<LogOut color={colors.danger} size={22} />}
                isDanger
                label="Sign out"
                onPress={() => void signOut()}
              />
            </MenuGroup>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

function MenuGroup({ children, label }: { children: ReactNode; label?: string }) {
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.menuGroup}>
      {label ? <Text style={styles.menuGroupLabel}>{label}</Text> : null}
      <View style={styles.menuCard}>
        {rows.map((row, index) => (
          <View
            key={index}
            style={index === rows.length - 1 ? styles.menuRowLast : undefined}
          >
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

function MenuItem({
  badgeCount = 0,
  icon,
  label,
  onPress,
  isDanger = false,
}: MenuItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && onPress ? styles.menuItemPressed : null,
      ]}
    >
      <View style={styles.menuIcon}>{icon}</View>
      <Text style={[styles.menuLabel, isDanger ? styles.dangerText : null]}>
        {label}
      </Text>
      {badgeCount > 0 ? (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>
            {badgeCount > 99 ? "99+" : badgeCount}
          </Text>
        </View>
      ) : null}
      <ChevronRight color={colors.mutedText} size={22} />
    </Pressable>
  );
}

const AVATAR_SIZE = 88;

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.surface,
    paddingTop: spacing.xl,
  },
  desktopRow: {
    flexDirection: "column",
    gap: spacing.xl,
  },
  profileHeader: {
    alignItems: "center",
    gap: 12,
    paddingBottom: spacing.md,
  },
  profileHeaderDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    minHeight: 148,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
    padding: spacing.lg,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  identityTextStacked: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: 4,
  },
  menuGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xl,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rolePill: {
    overflow: "hidden",
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: colors.primaryTintBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  menuGroup: {
    gap: spacing.sm,
  },
  menuGroupLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    paddingLeft: spacing.xs,
  },
  menuRowLast: {
    marginBottom: -1,
  },
  menuColumn: {
    gap: spacing.lg,
  },
  menuGridColumn: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xl,
  },
  avatarButton: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surface,
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primaryTint,
  },
  avatarAddBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  userName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  userMeta: {
    color: colors.mutedText,
    fontSize: 14,
  },
  messageText: {
    color: colors.danger,
    fontSize: 16,
  },
  menuCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
  },
  menuItem: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  menuItemPressed: {
    backgroundColor: colors.surface,
  },
  menuIcon: {
    width: 28,
    alignItems: "center",
  },
  menuLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  menuBadge: {
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xs,
  },
  menuBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  dangerText: {
    color: colors.danger,
  },
});
