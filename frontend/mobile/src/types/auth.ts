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
  name: string;
  email: string;
  password: string;
  role: Exclude<UserRole, "admin">;
};

export type UserProfilePatchPayload = {
  name?: string;
  first_name?: string;
  last_name?: string;
};
