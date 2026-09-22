import type { NavigatorScreenParams } from "@react-navigation/native";

/** WS-90. The static legal pages; WS-92's register checkbox links to them. */
export type LegalDocument = "privacy" | "terms";

export type MainTabParamList = {
  CustomerHome: undefined;
  CustomerChats: undefined;
  CustomerAIChat: undefined;
  CustomerBookings: undefined;
  ProviderHome: undefined;
  ProviderSchedule: undefined;
  ProviderBookings: undefined;
  ProviderChats: undefined;
  AdminDashboard: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Legal: {
    document: LegalDocument;
  };
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  CustomerProviderDetail: {
    providerId: number;
    providerTag?: string;
  };
  CustomerProviderSearchResults: {
    keyword: string;
    serviceProvince: string;
    serviceLocationId?: number;
    serviceAreaLabel?: string;
    category?: string;
  };
  CustomerProviderPortfolioDetail: {
    providerId: number;
    portfolioId: number;
  };
  ChatRoom: {
    chatRoomId: number;
    title: string;
    opponentOnline?: boolean;
    providerProfileId?: number;
  };
  AccountEdit: undefined;
  AccountSecurity: undefined;
  Help: undefined;
  BookingHistory: undefined;
  Notifications: undefined;
  NotificationSettings: undefined;
  Payments: undefined;
  CustomerFavourites: undefined;
  ProviderPortfolioList: undefined;
  ProviderPortfolioCreate: undefined;
  ProviderPortfolioDetail: {
    portfolioId: number;
  };
};
