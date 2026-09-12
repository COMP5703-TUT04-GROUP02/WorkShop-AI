import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AccountEditScreen } from "../screens/AccountEditScreen";
import { AccountSecurityScreen } from "../screens/AccountSecurityScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { BookingHistoryScreen } from "../screens/BookingHistoryScreen";
import { ChatRoomScreen } from "../screens/ChatRoomScreen";
import { HelpScreen } from "../screens/HelpScreen";
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
import { RealtimeProvider } from "../context/RealtimeContext";
import { useIsWebDesktop } from "../layout/useIsWebDesktop";
import { colors } from "../theme/theme";
import { DesktopSidebar } from "./DesktopSidebar";
import { RoleTabs } from "./RoleTabs";
import type { RootStackParamList } from "./types";

export type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

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
          <AuthenticatedStack />
        </RealtimeProvider>
      ) : (
        <Stack.Navigator>
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ headerShown: false }}
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
        component={ChatRoomScreen}
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
        options={{ title: "Sign-in" }}
      />
      <Stack.Screen
        name="Help"
        component={HelpScreen}
        options={{ title: "Help and Support" }}
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
        component={ProviderPortfolioListScreen}
        options={{ title: "Portfolios" }}
      />
      <Stack.Screen
        name="ProviderPortfolioCreate"
        component={ProviderPortfolioCreateScreen}
        options={{ title: "Add portfolio" }}
      />
      <Stack.Screen
        name="ProviderPortfolioDetail"
        component={ProviderPortfolioDetailScreen}
        options={{ title: "Portfolio" }}
      />
    </Stack.Navigator>
  );
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
