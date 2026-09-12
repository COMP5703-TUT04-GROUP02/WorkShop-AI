import type { NavigatorScreenParams } from "@react-navigation/native";

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
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  CustomerProviderDetail: {
    providerId: number;
    providerTag?: string;
  };
  CustomerProviderSearchResults: {
    keyword: string;
    serviceProvince: string;
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
