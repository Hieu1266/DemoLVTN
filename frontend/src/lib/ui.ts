export const input =
  "w-full rounded-lg border border-gray-300 bg-white/60 px-3.5 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-white/15 dark:bg-white/5";
export const label = "mb-1.5 block text-sm font-medium";
export const btn =
  "inline-flex items-center justify-center rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-500/10 dark:border-white/15";
export const btnDanger =
  "inline-flex items-center justify-center rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-500/10 dark:border-red-500/40 dark:text-red-400";
export const card =
  "rounded-2xl border border-gray-200 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-white/5";
export const errorBox =
  "rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400";
export const badge = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium";

export const statusLabel: Record<string, string> = {
  DRAFT: "Nháp",
  PUBLISHED: "Đang mở",
  CLOSED: "Đã đóng",
};

export const statusBadge: Record<string, string> = {
  DRAFT: "bg-gray-500/15 text-gray-600 dark:text-gray-300",
  PUBLISHED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  CLOSED: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

export const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("vi-VN") : "—");
