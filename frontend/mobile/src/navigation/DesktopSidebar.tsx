import { useNavigation, useNavigationState } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandMark } from "../components/BrandMark";
import { useAuth } from "../context/AuthContext";
import { useProviderProfileGate } from "../context/ProviderProfileGateContext";
import { useRealtime } from "../context/RealtimeContext";
import { getCustomerBookings } from "../api/customer";
import { pickCurrentJob, type CurrentJob } from "../features/current-job/current-job";
import { formatMoney } from "../utils/money";
import { colors, layout, radius, spacing } from "../theme/theme";
import { AdminMenu, type AdminArea } from "./AdminMenu";
import { tabIcons } from "./tabIcons";
import type { MainTabParamList, RootStackParamList } from "./types";

type SidebarItem = {
  tab: keyof MainTabParamList;
  label: string;
  icon: ComponentType<{ color: string; size: number }>;
  badge?: number;
  route?: keyof RootStackParamList;
  stackRoutes?: Array<keyof RootStackParamList>;
};

export function DesktopSidebar() {
  const { user } = useAuth();
  const { isProviderProfileRequired, showProviderProfileRequiredMessage } =
    useProviderProfileGate();
  const { chatUnreadCount, notificationUnreadCount } = useRealtime();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const defaultTab =
    user?.role === "admin"
      ? "AdminDashboard"
      : user?.role === "provider"
        ? "ProviderHome"
        : "CustomerHome";
  const active = useActiveDesktopRoute(defaultTab);
  const items = getSidebarItems(
    user?.role,
    chatUnreadCount,
    notificationUnreadCount,
  );

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <BrandMark size={26} />
        <Text style={styles.brandName}>
          Workshop <Text style={styles.brandSuffix}>AI</Text>
        </Text>
      </View>
      <View style={styles.rule} />
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>
            {(user?.name ?? user?.email ?? "?").trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.identityCopy}>
          <Text numberOfLines={1} style={styles.identityName}>
            {user?.name ?? user?.email ?? ""}
          </Text>
          <Text numberOfLines={1} style={styles.identityRole}>
            {user?.role === "provider"
              ? "Provider"
              : user?.role === "admin"
                ? "Platform"
                : "Customer"}
          </Text>
        </View>
      </View>
      <View style={styles.rule} />
      <SidebarNavigation isAdmin={user?.role === "admin"}>
        {user?.role === "admin" ? <AdminMenu active={active.tab === "AdminDashboard" ? active.area ?? "ai" : undefined} onSelect={(area) => navigation.navigate("Main", { screen: "AdminDashboard", params: { area } })} /> : null}
        {items.map((item) => {
          const isActive = item.route
            ? active.stack === item.route
            : active.tab === item.tab ||
              (active.stack !== "Main" &&
                item.stackRoutes?.includes(
                  active.stack as keyof RootStackParamList,
                ));

          return (
            <Pressable
              accessibilityRole="button"
              key={item.route ?? item.tab}
              onPress={() => {
                if (
                  user?.role === "provider" &&
                  isProviderProfileRequired &&
                  item.tab !== "ProviderHome" &&
                  item.tab !== "Account"
                ) {
                  showProviderProfileRequiredMessage();
                  return;
                }

                if (item.route) {
                  navigation.navigate(item.route as never);
                } else {
                  navigation.navigate("Main", { screen: item.tab });
                }
              }}
              style={[styles.item, isActive ? styles.itemActive : null]}
            >
              <item.icon
                color={isActive ? colors.primary : colors.mutedText}
                size={20}
              />
              <Text
                style={[
                  styles.itemLabel,
                  isActive ? styles.itemLabelActive : null,
                ]}
              >
                {item.label}
              </Text>
              {item.badge ? (
                <Text style={styles.badgeText}>
                  {item.badge > 99 ? "99+" : item.badge}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </SidebarNavigation>
      {user?.role === "customer" ? (
        <CurrentJobCard
          onPress={() => navigation.navigate("Main", { screen: "CustomerBookings" })}
        />
      ) : null}
    </View>
  );
}

/**
 * A read-only pin for whatever booking is waiting on the customer. It never
 * blocks the sidebar: while it is loading, or if the request fails, the
 * sidebar renders exactly as it did before.
 */
function CurrentJobCard({ onPress }: { onPress: () => void }) {
  const [job, setJob] = useState<CurrentJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomerBookings(undefined, 1, 20)
      .then((data) => {
        if (!cancelled) setJob(pickCurrentJob(data?.items ?? []));
      })
      .catch(() => {
        if (!cancelled) setJob(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!job) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.currentJob}
    >
      <Text style={styles.currentJobEyebrow}>Current job</Text>
      <Text numberOfLines={1} style={styles.currentJobTitle}>
        {job.title}
      </Text>
      <Text numberOfLines={1} style={styles.currentJobStatus}>
        <Text style={job.needsCustomer ? styles.currentJobDue : undefined}>
          {job.statusLabel}
        </Text>
        {job.amountDue != null ? (
          <Text style={styles.currentJobDue}> · {formatMoney(job.amountDue)}</Text>
        ) : null}
      </Text>
    </Pressable>
  );
}

function SidebarNavigation({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  // Keep the original container for customer/provider navigation.
  return isAdmin
    ? <ScrollView contentContainerStyle={styles.nav}>{children}</ScrollView>
    : <View style={styles.nav}>{children}</View>;
}

function useActiveDesktopRoute(defaultTab: keyof MainTabParamList) {
  return useNavigationState((state) => {
    const route = state.routes[state.index];
    if (route.name === "Main") {
      const tabState = route.state;
      const tabIndex =
        tabState && "index" in tabState ? (tabState.index ?? 0) : 0;
      const tabRoute = tabState?.routes?.[tabIndex];
      return {
        stack: "Main",
        tab: (tabRoute?.name ?? defaultTab) as keyof MainTabParamList,
        area: (tabRoute?.params as { area?: AdminArea } | undefined)?.area,
      };
    }

    return {
      stack: route.name,
      area: undefined as AdminArea | undefined,
      tab: undefined as keyof MainTabParamList | undefined,
    };
  });
}

function getSidebarItems(
  role: string | undefined,
  chatUnreadCount: number,
  notificationUnreadCount: number,
): SidebarItem[] {
  const accountItem: SidebarItem = {
    tab: "Account",
    label: "Account",
    icon: tabIcons.account,
    badge: notificationUnreadCount,
    stackRoutes: [
      "AccountEdit",
      "ProviderVerification",
      "ProviderPayoutAccount",
      "ProviderOperatingSettings",
      "AccountSecurity",
      "Help",
      "Legal",
      "BookingHistory",
      "Notifications",
      "NotificationSettings",
      "Payments",
      "CustomerFavourites",
    ],
  };

  if (role === "provider") {
    return [
      {
        tab: "ProviderHome",
        label: "Home",
        icon: tabIcons.home,
        stackRoutes: [
          "ProviderPortfolioList",
          "ProviderPortfolioCreate",
          "ProviderPortfolioDetail",
        ],
      },
      { tab: "ProviderSchedule", label: "Schedule", icon: tabIcons.schedule },
      { tab: "ProviderBookings", label: "Bookings", icon: tabIcons.bookings },
      {
        tab: "ProviderChats",
        label: "Chats",
        icon: tabIcons.chats,
        badge: chatUnreadCount,
        stackRoutes: ["ChatRoom"],
      },
      accountItem,
    ];
  }

  if (role === "admin") return [accountItem];

  return [
    {
      tab: "CustomerHome",
      label: "Home",
      icon: tabIcons.home,
      stackRoutes: [
        "CustomerProviderDetail",
        "CustomerProviderSearchResults",
        "CustomerProviderPortfolioDetail",
      ],
    },
    {
      tab: "CustomerChats",
      label: "Chats",
      icon: tabIcons.chats,
      badge: chatUnreadCount,
      stackRoutes: ["ChatRoom"],
    },
    { tab: "CustomerAIChat", label: "AI Chat", icon: tabIcons.aiChat },
    { tab: "CustomerBookings", label: "Bookings", icon: tabIcons.bookings },
    accountItem,
  ];
}

const styles = StyleSheet.create({
  sidebar: {
    width: layout.webSidebarWidth,
    flexDirection: "column",
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  brandName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  brandSuffix: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  rule: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
    marginHorizontal: spacing.sm,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  avatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  avatarLetter: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: "700",
  },
  identityRole: {
    color: colors.mutedText,
    fontSize: 11.5,
  },
  nav: {
    gap: spacing.xs,
  },
  item: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
  },
  itemActive: {
    backgroundColor: colors.primaryTint,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm - 3,
  },
  itemLabel: {
    flex: 1,
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: "600",
  },
  itemLabelActive: {
    color: colors.primary,
  },
  currentJob: {
    marginTop: "auto",
    marginBottom: spacing.md,
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm + 2,
  },
  currentJobEyebrow: {
    color: colors.mutedText,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  currentJobTitle: {
    color: colors.text,
    fontSize: 12.5,
    fontWeight: "700",
  },
  currentJobStatus: {
    color: colors.mutedText,
    fontSize: 11.5,
  },
  currentJobDue: {
    color: colors.warningText,
    fontWeight: "700",
  },
  badgeText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
