"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

const iconCls = "h-[18px] w-[18px]";
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const MailIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" {...base}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
export const UserIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" {...base}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
export const LockIcon = () => (
  <svg className={iconCls} viewBox="0 0 24 24" {...base}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

const fieldCls =
  "w-full rounded-xl border border-gray-300/80 bg-white/70 py-3 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/20 dark:border-white/15 dark:bg-white/5 dark:focus:bg-white/10";

/** Ô nhập có icon bên trái và nút phụ bên phải (vd Hiện/Ẩn mật khẩu) */
export function AuthField({
  label,
  icon,
  suffix,
  ...props
}: { label: string; icon?: ReactNode; suffix?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="group relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center opacity-50 transition group-focus-within:text-indigo-500 group-focus-within:opacity-100">
            {icon}
          </span>
        )}
        <input {...props} className={`${fieldCls} ${icon ? "pl-11" : "pl-3.5"} ${suffix ? "pr-16" : "pr-3.5"}`} />
        {suffix && <span className="absolute inset-y-0 right-3 flex items-center">{suffix}</span>}
      </div>
    </div>
  );
}

/** Nút gradient có vệt sáng quét qua khi hover */
export function AuthButton({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button
      disabled={loading}
      className="group relative w-full overflow-hidden rounded-xl bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:shadow-xl hover:shadow-indigo-600/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative flex items-center justify-center gap-2">
        {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {children}
        {!loading && <span className="transition-transform group-hover:translate-x-1">→</span>}
      </span>
    </button>
  );
}

/** Hiệu ứng trồi lên lần lượt (i = thứ tự). Chỉ chạy bên trong AuthShell. */
export function Rise({ i, children, className = "" }: { i: number; children: ReactNode; className?: string }) {
  return (
    <div className={`lm-rise ${className}`} style={{ "--i": i } as React.CSSProperties}>
      {children}
    </div>
  );
}