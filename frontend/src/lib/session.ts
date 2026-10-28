"use client";

import { useState, useEffect } from "react";

export interface SessionUser {
  id?: string | number;
  username?: string;
  email?: string;
  role?: string;
  first_name?: string;
  last_name?: string;
  [key: string]: any;
}

// 1. Hook useSession (Dùng cho Client Components)
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    setReady(true);
  }, []);

  return { user, ready };
}

// 2. Điều hướng trang theo Role
export function homeByRole(role?: string): string {
  if (!role) return "/login";
  
  const normalizedRole = role.toLowerCase().trim();
  switch (normalizedRole) {
    case "admin":
      return "/dashboard_admin";
    case "instructor":
    case "teacher":
      return "/dashboard_instructor/question-bank";
    case "student":
      return "/dashboard_student";
    default:
      return "/login";
  }
}

// 3. Lấy Token
export function getToken(): string | null {
  if (typeof window === "undefined") return null;

  const localToken = localStorage.getItem("token");
  if (localToken) return localToken;

  const match = document.cookie.match(new RegExp("(^| )token=([^;]+)"));
  return match ? match[2] : null;
}

// 4. Lấy thông tin User
export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const userStr = localStorage.getItem("user_info");
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// 5. Lưu Session phía Client
export function saveSession(token: string, user: SessionUser) {
  if (typeof window === "undefined") return;

  clearSession();

  localStorage.setItem("token", token);
  localStorage.setItem("user_info", JSON.stringify(user));
  if (user.role) {
    localStorage.setItem("user_role", user.role.toLowerCase().trim());
  }
}

// 6. Xóa sạch Session phía Client
export function clearSession() {
  if (typeof window === "undefined") return;

  localStorage.removeItem("token");
  localStorage.removeItem("user_info");
  localStorage.removeItem("user_role");

  document.cookie = "token=; path=/; max-age=0;";
  document.cookie = "user_info=; path=/; max-age=0;";
  document.cookie = "user_role=; path=/; max-age=0;";
}