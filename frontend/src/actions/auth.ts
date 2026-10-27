import { api, AUTH_URL } from "@/src/lib/api";
import { clearSession, saveSession, type SessionUser } from "@/src/lib/session";
import { cookies } from 'next/headers'
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


async function setAuthCookies(data: any) {
  const cookieStore = await cookies()
  const cookieConfig = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24,
    path: '/',
  };

  if (data.access_token) {
    cookieStore.set('token', data.access_token, { ...cookieConfig, httpOnly: true })
  }

  if (data.user) {
    cookieStore.set('user_info', JSON.stringify(data.user), { ...cookieConfig, httpOnly: false })

    const roleToStore = data.user.role ? data.user.role.toLowerCase().trim() : '';
    cookieStore.set('user_role', roleToStore, { ...cookieConfig, httpOnly: false })
  }
}


export const register = (data: RegisterData) =>
  api<SessionUser>(AUTH_URL, "/users/register", { method: "POST", body: JSON.stringify(data) });

export async function login(email: string, password: string) {
  const res = await api<TokenResponse>(AUTH_URL, "/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAuthCookies(res);
  saveSession(res.access_token, res.user);
  return res.user;
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('token');
  cookieStore.delete('user_info');
  cookieStore.delete('user_role');
  clearSession();
}
