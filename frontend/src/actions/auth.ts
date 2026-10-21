import { api, AUTH_URL } from "@/src/lib/api";
import { clearSession, saveSession, type SessionUser } from "@/src/lib/session";

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

interface TokenResponse {
  access_token: string;
  user: SessionUser;
}

export const register = (data: RegisterData) =>
  api<SessionUser>(AUTH_URL, "/users/register", { method: "POST", body: JSON.stringify(data) });

export async function login(email: string, password: string) {
  const res = await api<TokenResponse>(AUTH_URL, "/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveSession(res.access_token, res.user);
  return res.user;
}

export const logout = () => clearSession();
