import { useLanguage } from "../../i18n/LanguageContext";
import { getProviderChatRooms } from "../../api/chat";
import { ChatRoomList } from "../../components/ChatRoomList";
import { ScreenContainer } from "../../components/ScreenContainer";

export function ProviderChatsScreen() {
  useLanguage();
  return (
    <ScreenContainer>
      <ChatRoomList loadRooms={getProviderChatRooms} viewerRole="provider" />
    </ScreenContainer>
  );
}
