export type UserRole = "customer" | "provider" | "admin";

export type User = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  is_banned: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  last_login_at: string | null;
  created_at: string | null;
};

export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T | null;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: User;
};

export type RegisterRequest = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_password: string;
  tos_accepted: boolean;
  role: Exclude<UserRole, "admin">;
  /**
   * WS-92. The joined display name, which chat and bookings still read.
   * WS-91 builds it on the server and ignores this field; until that lands,
   * today's /register still requires it. Both backends accept the payload.
   */
  name: string;
};

export type UserProfilePatchPayload = {
  name?: string;
};
