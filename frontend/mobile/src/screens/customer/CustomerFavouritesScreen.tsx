import { ScreenContainer } from "../../components/ScreenContainer";
import { PlaceholderPanel } from "../../components/PlaceholderPanel";

// WS-108 adds the Account entry point only. The saved-provider list itself is
// WS-75; this screen is the destination that ticket fills in.
export function CustomerFavouritesScreen() {
  return (
    <ScreenContainer>
      <PlaceholderPanel
        title="Favourites"
        description="Providers you save will be listed here. Coming soon."
      />
    </ScreenContainer>
  );
}
