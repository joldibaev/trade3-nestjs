export interface JwtRefreshPayload {
  id: string;
  email: string;
  role: string;
  refreshToken: string;
}
