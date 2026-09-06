export type UserRole = "customer" | "provider" | "admin";

export type User = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  is_banned: boolean;
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
