// src/lib/api.ts
import { getToken } from "./session";

// 1. Hàm lấy Base URL Auth API (Tự động chuyển giữa Server-side và Client-side)
export function getAuthApiUrl(): string {
  // Nếu đang chạy ở phía Server (Server Actions / Node.js inside K8s Pod)
  if (typeof window === "undefined") {
    return process.env.INTERNAL_AUTH_API_URL || "http://api-gateway:8080/api/v1"; 
  }
  // Nếu đang chạy ở phía Client (Trình duyệt máy tính)
  return process.env.NEXT_PUBLIC_AUTH_API_URL || "http://localhost:31000/api/v1";
}

// 2. Hàm lấy Base URL Exam API (Tự động chuyển giữa Server-side và Client-side)
export function getExamApiUrl(): string {
  if (typeof window === "undefined") {
    return process.env.INTERNAL_EXAM_API_URL || "http://api-gateway:8080/api/v1"; 
  }
  return process.env.NEXT_PUBLIC_EXAM_API_URL || "http://localhost:31000/api/v1";
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Có lỗi xảy ra");

export interface ApiOptions extends RequestInit {
  isPublic?: boolean;
  token?: string;
}

export async function api<T>(base: string, path: string, options: ApiOptions = {}): Promise<T> {
  const { isPublic = false, token: explicitToken, headers: initHeaders, ...restOptions } = options;
  const headers = new Headers(initHeaders);
  headers.set("Content-Type", "application/json");

  let token = explicitToken;

  if (!token && !isPublic) {
    if (typeof window === "undefined") {
      try {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        token = cookieStore.get("token")?.value;
      } catch {
        // Bỏ qua nếu gọi ngoài context request
      }
    } else {
      token = getToken() ?? undefined;
    }
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(base + path, { ...restOptions, headers });

  if (!res.ok) {
    let msg = "Có lỗi xảy ra";
    try {
      const d = await res.json();
      if (typeof d.detail === "string") msg = d.detail;
      else if (Array.isArray(d.detail)) msg = d.detail.map((x: { msg: string }) => x.msg).join(", ");
    } catch {}
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}