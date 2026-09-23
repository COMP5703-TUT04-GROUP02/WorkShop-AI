import { Alert, Platform } from "react-native";

/**
 * react-native-web's Alert.alert is an empty function, so a message shown that
 * way after the screen has already navigated is invisible on web. This picks
 * the dialog the platform actually has.
 */
export function notifyUser(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}
