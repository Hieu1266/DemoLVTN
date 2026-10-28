'use server';

import { api, getAuthApiUrl } from "@/src/lib/api";
import { type SessionUser } from "@/src/lib/session";
import { cookies } from "next/headers";

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface TokenResponse {
  access_token: string;
  user: SessionUser;
}

async function setAuthCookies(data: TokenResponse) {
  const cookieStore = await cookies();
  const cookieConfig = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 365, // 1 năm
    path: "/",
    httpOnly: false, // Để Client JS có thể đọc đồng bộ
  };

  if (data.access_token) {
    cookieStore.set("token", data.access_token, cookieConfig);
  }

  if (data.user) {
    cookieStore.set("user_info", JSON.stringify(data.user), cookieConfig);
    const roleToStore = data.user.role ? data.user.role.toLowerCase().trim() : "";
    cookieStore.set("user_role", roleToStore, cookieConfig);
  }
}

export async function register(data: RegisterData) {
  return api<SessionUser>(getAuthApiUrl(), "/users/register", {
    method: "POST",
    body: JSON.stringify(data),
    isPublic: true,
  });
}

// 🔴 SỬA LỖI: Bọc try...catch để trả về Object kết quả mượt mà, không bao giờ bị throw 500
export async function login(email: string, password: string) {
  try {
    const authUrl = getAuthApiUrl();
    const res = await api<TokenResponse>(authUrl, "/users/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      isPublic: true,
    });

    await setAuthCookies(res);
    return { success: true, data: res };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Nhập sai mật khẩu hoặc email!";
    return { success: false, error: msg };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("token");
  cookieStore.delete("user_info");
  cookieStore.delete("user_role");
}