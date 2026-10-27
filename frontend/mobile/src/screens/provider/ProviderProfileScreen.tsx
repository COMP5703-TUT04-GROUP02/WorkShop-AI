import { useLanguage } from "../../i18n/LanguageContext";
import { PlaceholderPanel } from "../../components/PlaceholderPanel";
import { ScreenContainer } from "../../components/ScreenContainer";

export function ProviderProfileScreen() {
  useLanguage();
  return (
    <ScreenContainer>
      <PlaceholderPanel
        title="Provider"
        description="Provider profile details will appear here."
      />
    </ScreenContainer>
  );
}
