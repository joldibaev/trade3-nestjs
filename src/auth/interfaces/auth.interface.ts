import { Role } from '../../generated/prisma/enums';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  refreshToken?: string;
}

export interface AuthLoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface AuthRefreshResponse {
  accessToken: string;
}

export interface AuthLogoutResponse {
  message: string;
}

export interface LoginPayload {
  id: string;
  email: string;
  role: string;
}
