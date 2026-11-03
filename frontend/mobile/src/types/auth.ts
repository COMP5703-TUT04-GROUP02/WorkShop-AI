export type UserRole = "customer" | "provider" | "admin";

export type User = {
  id: number;
  /** The joined display name chat and bookings read. */
  name: string;
  /** WS-91. Absent until that backend merges. */
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  is_banned: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  last_login_at: string | null;
  created_at: string | null;
  identity_verification_status?: string | null;
  qualification_verification_status?: string | null;
  /** Only GET /me sends this: "email_password", "google" and/or "apple". */
  sign_in_methods?: string[] | null;
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
  /** The code mailed by sendRegisterEmailCode; the account starts verified. */
  email_code: string;
  /**
   * WS-92. The joined display name, which chat and bookings still read.
   * WS-91 builds it on the server and ignores this field; until that lands,
   * today's /register still requires it. Both backends accept the payload.
   */
  name: string;
};

export type SocialProvider = "google" | "apple";

export type SocialLoginRequest = {
  provider: SocialProvider;
  id_token: string;
  /** The raw nonce; the backend checks it against the one inside the token. */
  nonce?: string;
  /** Role and Terms are only read when this sign-in creates the account. */
  role?: Exclude<UserRole, "admin">;
  tos_accepted?: boolean;
  /** Apple gives the name to the app once, on first consent, never in the token. */
  first_name?: string;
  last_name?: string;
};

export type SocialLoginResponse = TokenResponse & {
  provider: SocialProvider;
  is_new_user: boolean;
  linked_social_account: boolean;
};

export type UserProfilePatchPayload = {
  name?: string;
  first_name?: string;
  last_name?: string;
};
