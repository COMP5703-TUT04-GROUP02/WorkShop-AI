import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Bell } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import type { RootStackParamList } from "../navigation/types";
import { CountBadge } from "./CountBadge";
import { colors } from "../theme/theme";

/**
 * WS-108 moved the notification inbox out of the Account menu, so this is its
 * only entry point: the Account tab header on a phone, the top bar on desktop.
 */
export function NotificationsButton({ unreadCount }: { unreadCount: number }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Pressable
      accessibilityLabel={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => navigation.navigate("Notifications")}
      style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
    >
      <Bell color={colors.text} size={22} />
      <View style={styles.badgeSlot}>
        <CountBadge count={unreadCount} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  badgeSlot: {
    position: "absolute",
    top: -2,
    right: -4,
  },
});
