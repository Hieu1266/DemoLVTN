import { getToken } from "./session";

export const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "http://localhost:8000/api/v1";
export const EXAM_URL = process.env.NEXT_PUBLIC_EXAM_API_URL ?? "http://localhost:8001/api/v1";

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Có lỗi xảy ra");

export async function api<T>(base: string, path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(base + path, { ...options, headers });

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
