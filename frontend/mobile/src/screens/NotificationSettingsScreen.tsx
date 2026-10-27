import { useLanguage } from "../i18n/LanguageContext";
import { ScreenContainer } from "../components/ScreenContainer";
import { PlaceholderPanel } from "../components/PlaceholderPanel";

// WS-108. The Account menu points here instead of at the inbox: settings belong
// under Account, the inbox does not. Controls themselves are a later ticket.
export function NotificationSettingsScreen() {
  useLanguage();
  return (
    <ScreenContainer>
      <PlaceholderPanel
        title="Notification settings"
        description="Choose which updates reach you by push and email. Coming soon — this demo sends every notification."
      />
    </ScreenContainer>
  );
}
