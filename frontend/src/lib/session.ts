"use client";

import { useMemo, useSyncExternalStore } from "react";

export type Role = "INSTRUCTOR" | "STUDENT" | "ADMIN";

export interface SessionUser {
  user_id: string;
  username: string;
  email: string;
  role: Role;
}

const TOKEN_KEY = "token";
const USER_KEY = "user";

export const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("session-change"));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("session-change"));
}


export const homeByRole = (role: Role) => {
  if (role === "STUDENT") return "/dashboard_student";
  if (role === "INSTRUCTOR") return "/dashboard_instructor";
  return "/admin/dashboard";
};

function subscribe(cb: () => void) {
  window.addEventListener("session-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("session-change", cb);
    window.removeEventListener("storage", cb);
  };
}

const noopSubscribe = () => () => {};

/** user = người đăng nhập hiện tại, ready = đã đọc xong localStorage (tránh redirect nhầm lúc hydrate) */
export function useSession() {
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(USER_KEY), () => null);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const user = useMemo<SessionUser | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionUser;
    } catch {
      return null;
    }
  }, [raw]);
  return { user, ready };
}
