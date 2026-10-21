"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listMyResults } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";
import { fmtDate } from "@/src/lib/ui";

export default function ResultsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listMyResults().then(setRows).catch((e) => setError(errMsg(e)));
  }, []);

  // Tính toán thống kê nhanh
  const totalExams = rows?.length || 0;
  const completedExams = rows?.filter((r) => (r.total_score ?? r.score) !== null)?.length || 0;
  
  const avgScore = rows && completedExams > 0
    ? (
        rows.reduce((sum, r) => sum + (r.total_score ?? r.score ?? 0), 0) / completedExams
      ).toFixed(1)
    : "0.0";

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8 px-4">
      {/* HEADER TỔNG QUAN */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Kết quả các bài đã thi</h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Theo dõi điểm số và lịch sử bài làm chi tiết của bạn
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-600 shadow-2xs">
          {error}
        </div>
      )}

      {/* THỐNG KÊ NHANH (CARDS) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shrink-0">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 2 0 01-2-2V5a2 2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tổng số bài thi</span>
            <p className="text-2xl font-black text-slate-900">{totalExams} <span className="text-xs font-semibold text-slate-400">bài</span></p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shrink-0">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Điểm trung bình</span>
            <p className="text-2xl font-black text-slate-900">{avgScore} <span className="text-xs font-semibold text-slate-400">/ 10</span></p>
          </div>
        </div>
      </div>

      {/* TẢI DỮ LIỆU */}
      {!rows && !error && (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-12 text-center shadow-2xs">
          <p className="text-xs font-bold text-slate-400 animate-pulse">Đang tải lịch sử thi...</p>
        </div>
      )}

      {/* CHƯA CÓ BÀI THI */}
      {rows?.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <p className="text-sm font-bold text-slate-700">Bạn chưa thực hiện bài thi nào</p>
          <p className="text-xs font-semibold text-slate-400 mt-1">Hãy nhập mã PIN bài thi ở mục "Vào thi" để bắt đầu.</p>
        </div>
      )}

      {/* BẢNG KẾT QUẢ HIỆN ĐẠI */}
      {rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-4 px-6">Tên đề thi</th>
                  <th className="py-4 px-6">Thời gian nộp</th>
                  <th className="py-4 px-6">Trạng thái</th>
                  <th className="py-4 px-6">Điểm số</th>
                  <th className="py-4 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const score = r.total_score ?? r.score;
                  const maxScore = r.max_score ?? r.total_points ?? 10;
                  const submittedAt = r.submitted_at || r.completed_at;
                  const canReview = r.review_allowed ?? r.allow_review_answers ?? true;
                  const isPending = r.status === "NEEDS_GRADING" || score === null;

                  return (
                    <tr key={r.attempt_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900 text-xs">
                          {r.exam_name || "Bài thi trực tuyến"}
                        </div>
                        <div className="text-[10px] font-mono font-medium text-slate-400 mt-0.5">
                          ID: {r.attempt_id.substring(0, 8)}...
                        </div>
                      </td>

                      <td className="py-4 px-6 font-semibold text-slate-600">
                        {fmtDate(submittedAt)}
                      </td>

                      <td className="py-4 px-6">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 border border-amber-200/60">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                            Đang chờ chấm
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-200/60">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Đã hoàn thành
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        {isPending ? (
                          <span className="font-bold text-slate-400">-- / {maxScore}</span>
                        ) : (
                          <span className="font-mono text-sm font-black text-indigo-600">
                            {score} <span className="text-xs font-medium text-slate-400">/ {maxScore}</span>
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right">
                        <Link
                          href={`/dashboard_student/results/${r.attempt_id}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-600 active:scale-95 transition"
                        >
                          {canReview ? "Xem chi tiết" : "Xem điểm"}
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}