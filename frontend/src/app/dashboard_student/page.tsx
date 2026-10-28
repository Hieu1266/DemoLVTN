"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { joinExam } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";
import { input } from "@/src/lib/ui";

// Mockup dữ liệu lịch sử bài thi gần đây (có thể thay bằng API thật)
const mockRecentAttempts = [
  {
    id: "1",
    title: "Lập trình Web nâng cao - Bài thi Giữa kỳ",
    code: "WEB2026",
    score: "8.5 / 10",
    date: "Hôm qua · 14:30",
    status: "Đạt",
  },
  {
    id: "2",
    title: "Cơ sở dữ liệu - Quiz 02: Thiết kế CSDL",
    code: "DATABASE",
    score: "9.0 / 10",
    date: "12/10/2026 · 09:15",
    status: "Đạt",
  },
  {
    id: "3",
    title: "Mạng máy tính - Kiểm tra Chuyên đề 1",
    code: "NET101",
    score: "6.5 / 10",
    date: "05/10/2026 · 16:00",
    status: "Đạt",
  },
];

export default function StudentDashboard() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError("");
    setLoading(true);
    try {
      const attempt = await joinExam(code.trim());
      router.push(`/dashboard_student/exam/${attempt.attempt_id}`);
    } catch (err) {
      setError(errMsg(err));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7 py-4 sm:py-6">
      
      {/* --- 1. LỜI CHÀO SINH VIÊN --- */}
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3.5 py-1 text-xs font-bold text-indigo-700">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>PHÒNG THI TRỰC TUYẾN</span>
        </div>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Chào mừng bạn quay lại! 👋
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Nhập mã PIN do giảng viên cung cấp bên dưới để bắt đầu làm bài thi.
        </p>
      </div>

      {/* --- 2. HERO: KHUNG NHẬP MÃ PIN (TƯƠI SÁNG & HIỆN ĐẠI) --- */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-500/10 sm:p-8 text-center">
        {/* Glow trang trí background */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-indigo-50/70 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-60 w-60 rounded-full bg-fuchsia-50/70 blur-3xl" />

        <div className="relative mx-auto max-w-md space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
              Vào phòng thi ngay
            </h2>
            <p className="text-xs text-slate-500">
              Mã đề gồm các chữ cái và số do giảng viên cấp.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="relative">
              <input
                className={`${input} h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50/80 px-4 text-center font-mono text-2xl font-black uppercase tracking-[0.35em] text-indigo-950 shadow-inner placeholder:font-sans placeholder:text-sm placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/15 transition-all`}
                required
                maxLength={20}
                placeholder="NHẬP MÃ ĐỀ THI"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              {code && (
                <button
                  type="button"
                  onClick={() => setCode("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  Xóa
                </button>
              )}
            </div>

            {/* Báo lỗi nếu có */}
            {error && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-600 animate-shake">
                <AlertIcon className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 px-6 font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-indigo-500/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center gap-2 text-sm">
                  <SpinnerIcon className="h-5 w-5 animate-spin text-white" />
                  <span>Đang kết nối phòng thi...</span>
                </div>
              ) : (
                <>
                  <span className="text-sm tracking-wide">BẮT ĐẦU VÀO THI</span>
                  <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* --- 3. LỊCH SỬ BÀI THI GẦN ĐÂY (TỐI ƯU TOÀN DIỆN) --- */}
      {/* <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <HistoryIcon className="h-4 w-4 text-indigo-600" />
            Lịch sử thi gần đây
          </h3>
          <Link
            href="/dashboard_student/results"
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
          >
            Xem tất cả kết quả →
          </Link>
        </div>

        <div className="space-y-2.5">
          {mockRecentAttempts.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-indigo-200 hover:shadow-xs"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <DocumentIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                      {item.code}
                    </span>
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {item.title}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{item.date}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-xs font-black text-emerald-600 sm:text-sm">
                    {item.score}
                  </p>
                  <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    {item.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div> */}

      {/* --- 4. KHỐI LƯU Ý KHI LÀM BÀI --- */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Lưu ý dành cho sinh viên
        </h3>
        <div className="grid gap-3 sm:grid-cols-3 text-xs text-slate-600">
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600 text-[10px]">1</span>
            <p>Đảm bảo kết nối mạng ổn định trước khi mở bài thi.</p>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600 text-[10px]">2</span>
            <p>Hệ thống tự nộp bài khi hết giờ làm bài đếm ngược.</p>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600 text-[10px]">3</span>
            <p>Không thoát hoặc chuyển tab trình duyệt khi làm bài.</p>
          </div>
        </div>
      </div>

    </div>
  );
}

// ----------------------------------------------------------------------
// HELPER SVG ICONS
// ----------------------------------------------------------------------
function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function HistoryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function DocumentIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}