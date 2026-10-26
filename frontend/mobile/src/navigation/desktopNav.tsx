import { useNavigation, useNavigationState } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { getCustomerBookings } from "../api/customer";
import { useAuth } from "../context/AuthContext";
import { useProviderProfileGate } from "../context/ProviderProfileGateContext";
import { useRealtime } from "../context/RealtimeContext";
import { findCurrentJob, type CurrentJob } from "../features/current-job/current-job";
import type { AdminArea } from "./AdminMenu";
import { tabIcons } from "./tabIcons";
import type { MainTabParamList, RootStackParamList } from "./types";

export type DesktopNavItem = {
  tab: keyof MainTabParamList;
  label: string;
  icon: ComponentType<{ color: string; size: number }>;
  badge?: number;
  route?: keyof RootStackParamList;
  stackRoutes?: Array<keyof RootStackParamList>;
};

/**
 * What the desktop shells navigate between, and how. The sidebar and the top
 * bar show the same destinations in different shapes, so the destinations, the
 * active one, and what a press does live here rather than in either shell.
 */
export function useDesktopNav() {
  const { user } = useAuth();
  const { isProviderProfileRequired, showProviderProfileRequiredMessage } =
    useProviderProfileGate();
  const { bookingUpdateCount, chatUnreadCount, notificationUnreadCount } =
    useRealtime();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const defaultTab =
    user?.role === "admin"
      ? "AdminDashboard"
      : user?.role === "provider"
        ? "ProviderHome"
        : "CustomerHome";
  const active = useActiveDesktopRoute(defaultTab);
  const items = getDesktopNavItems(
    user?.role,
    chatUnreadCount,
    notificationUnreadCount,
    bookingUpdateCount,
  );

  function isActive(item: DesktopNavItem) {
    return item.route
      ? active.stack === item.route
      : active.tab === item.tab ||
          (active.stack !== "Main" &&
            item.stackRoutes?.includes(active.stack as keyof RootStackParamList));
  }

  function open(item: DesktopNavItem) {
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
  }

  return {
    active,
    isActive,
    items,
    navigation,
    notificationUnreadCount,
    open,
    user,
  };
}

/**
 * Whatever booking is waiting on the customer, for the shells to pin. It never
 * blocks them: while it is loading, or if the request fails, it is null and the
 * shell renders exactly as it did before.
 */
export function useCurrentJob() {
  const [job, setJob] = useState<CurrentJob | null>(null);
  const active = useActiveDesktopRoute("CustomerHome");

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    function refresh() {
      const currentRequest = ++requestId;
      void findCurrentJob((page, pageSize) =>
        getCustomerBookings(undefined, page, pageSize),
      )
        .then((currentJob) => {
          if (!cancelled && currentRequest === requestId) setJob(currentJob);
        })
        .catch(() => {
          if (!cancelled && currentRequest === requestId) setJob(null);
        });
    }

    refresh();
    const timer = setInterval(refresh, 60000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      appState.remove();
    };
  }, [active.stack, active.tab]);

  return job;
}

export function useActiveDesktopRoute(defaultTab: keyof MainTabParamList) {
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

export function getDesktopNavItems(
  role: string | undefined,
  chatUnreadCount: number,
  notificationUnreadCount: number,
  bookingUpdateCount = 0,
): DesktopNavItem[] {
  const accountItem: DesktopNavItem = {
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
      {
        tab: "ProviderBookings",
        label: "Bookings",
        icon: tabIcons.bookings,
        badge: bookingUpdateCount,
      },
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
    {
      tab: "CustomerBookings",
      label: "Bookings",
      icon: tabIcons.bookings,
      badge: bookingUpdateCount,
    },
    accountItem,
  ];
}
