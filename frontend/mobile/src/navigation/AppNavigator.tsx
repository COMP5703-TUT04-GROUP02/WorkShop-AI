import {
  DefaultTheme,
  NavigationContainer,
  useNavigation,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import type { ComponentType } from "react";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AccountEditScreen } from "../screens/AccountEditScreen";
import { AccountSecurityScreen } from "../screens/AccountSecurityScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { BookingHistoryScreen } from "../screens/BookingHistoryScreen";
import { ChatRoomScreen } from "../screens/ChatRoomScreen";
import { HelpScreen } from "../screens/HelpScreen";
import { LEGAL_DOCUMENTS, LegalScreen } from "../screens/LegalScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { NotificationSettingsScreen } from "../screens/NotificationSettingsScreen";
import { PaymentsScreen } from "../screens/PaymentsScreen";
import { CustomerFavouritesScreen } from "../screens/customer/CustomerFavouritesScreen";
import { CustomerProviderDetailScreen } from "../screens/customer/CustomerProviderDetailScreen";
import { CustomerProviderPortfolioDetailScreen } from "../screens/customer/CustomerProviderPortfolioDetailScreen";
import { CustomerProviderSearchResultsScreen } from "../screens/customer/CustomerProviderSearchResultsScreen";
import { ProviderPortfolioCreateScreen } from "../screens/provider/ProviderPortfolioCreateScreen";
import { ProviderPortfolioDetailScreen } from "../screens/provider/ProviderPortfolioDetailScreen";
import { ProviderPortfolioListScreen } from "../screens/provider/ProviderPortfolioListScreen";
import { useAuth } from "../context/AuthContext";
import {
  ProviderProfileGateProvider,
  useProviderProfileGate,
} from "../context/ProviderProfileGateContext";
import { RealtimeProvider } from "../context/RealtimeContext";
import { useIsWebDesktop } from "../layout/useIsWebDesktop";
import { colors } from "../theme/theme";
import { DesktopSidebar } from "./DesktopSidebar";
import { RoleTabs } from "./RoleTabs";
import type { RootStackParamList } from "./types";

export type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

// WS-105: the qualification gate covers a provider's working surfaces only —
// chats and portfolios here, schedule and bookings in RoleTabs. Account,
// security, help, payments, notifications and booking history stay open while
// a provider waits for review.
const GuardedChatRoomScreen = withRequiredProviderProfile(ChatRoomScreen);
const GuardedProviderPortfolioListScreen = withRequiredProviderProfile(
  ProviderPortfolioListScreen,
);
const GuardedProviderPortfolioCreateScreen = withRequiredProviderProfile(
  ProviderPortfolioCreateScreen,
);
const GuardedProviderPortfolioDetailScreen = withRequiredProviderProfile(
  ProviderPortfolioDetailScreen,
);

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.background,
    primary: colors.primary,
    border: colors.border,
    text: colors.text,
  },
};

export function AppNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {user ? (
        <RealtimeProvider>
          <ProviderProfileGateProvider>
            <AuthenticatedStack />
          </ProviderProfileGateProvider>
        </RealtimeProvider>
      ) : (
        <Stack.Navigator>
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Legal"
            component={LegalScreen}
            options={legalScreenOptions}
          />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

function AuthenticatedStack() {
  const isWebDesktop = useIsWebDesktop();

  return (
    <Stack.Navigator
      layout={({ children }) => (
        <View style={[styles.shell, isWebDesktop ? styles.shellDesktop : null]}>
          {isWebDesktop ? <DesktopSidebar /> : null}
          <View style={styles.shellContent}>{children}</View>
        </View>
      )}
    >
      <Stack.Screen
        name="Main"
        component={RoleTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CustomerProviderDetail"
        component={CustomerProviderDetailScreen}
        options={{ title: "Provider" }}
      />
      <Stack.Screen
        name="CustomerProviderSearchResults"
        component={CustomerProviderSearchResultsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CustomerProviderPortfolioDetail"
        component={CustomerProviderPortfolioDetailScreen}
        options={{ title: "Portfolio" }}
      />
      <Stack.Screen
        name="ChatRoom"
        component={GuardedChatRoomScreen}
        options={({ route }) => ({
          title: route.params.title,
        })}
      />
      <Stack.Screen
        name="AccountEdit"
        component={AccountEditScreen}
        options={{ title: "Edit profile" }}
      />
      <Stack.Screen
        name="AccountSecurity"
        component={AccountSecurityScreen}
        options={{ title: "Account and Security" }}
      />
      <Stack.Screen
        name="Help"
        component={HelpScreen}
        options={{ title: "Help and Support" }}
      />
      {/* Not gated: a provider with an incomplete profile must still be able
          to read the terms they are asked to accept. */}
      <Stack.Screen
        name="Legal"
        component={LegalScreen}
        options={legalScreenOptions}
      />
      <Stack.Screen
        name="BookingHistory"
        component={BookingHistoryScreen}
        options={{ title: "Booking history" }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Notifications" }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ title: "Notification settings" }}
      />
      <Stack.Screen
        name="Payments"
        component={PaymentsScreen}
        options={{ title: "Payments" }}
      />
      <Stack.Screen
        name="CustomerFavourites"
        component={CustomerFavouritesScreen}
        options={{ title: "Favourites" }}
      />
      <Stack.Screen
        name="ProviderPortfolioList"
        component={GuardedProviderPortfolioListScreen}
        options={{ title: "Portfolios" }}
      />
      <Stack.Screen
        name="ProviderPortfolioCreate"
        component={GuardedProviderPortfolioCreateScreen}
        options={{ title: "Add portfolio" }}
      />
      <Stack.Screen
        name="ProviderPortfolioDetail"
        component={GuardedProviderPortfolioDetailScreen}
        options={{ title: "Portfolio" }}
      />
    </Stack.Navigator>
  );
}

// Registered in both stacks: register happens signed out, and both roles can
// open the same pages once signed in.
function legalScreenOptions({
  route,
}: {
  route: { params: RootStackParamList["Legal"] };
}) {
  return { title: LEGAL_DOCUMENTS[route.params.document].title };
}

function withRequiredProviderProfile<P extends object>(
  ScreenComponent: ComponentType<P>,
) {
  return function RequiredProviderProfileStackScreen(props: P) {
    const { user } = useAuth();
    const { isProviderProfileRequired, showProviderProfileRequiredMessage } =
      useProviderProfileGate();
    const navigation =
      useNavigation<NativeStackNavigationProp<RootStackParamList>>();

    useEffect(() => {
      if (user?.role === "provider" && isProviderProfileRequired) {
        showProviderProfileRequiredMessage();
        navigation.reset({
          index: 0,
          routes: [
            {
              name: "Main",
              params: {
                screen: "ProviderHome",
              },
            },
          ],
        });
      }
    }, [
      isProviderProfileRequired,
      navigation,
      showProviderProfileRequiredMessage,
      user?.role,
    ]);

    if (user?.role === "provider" && isProviderProfileRequired) {
      return null;
    }

    return <ScreenComponent {...props} />;
  };
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  shell: {
    flex: 1,
  },
  shellDesktop: {
    flexDirection: "row",
  },
  shellContent: {
    flex: 1,
    minWidth: 0,
  },
});
