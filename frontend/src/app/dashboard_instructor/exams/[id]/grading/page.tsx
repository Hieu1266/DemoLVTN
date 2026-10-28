"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { listSubmissions } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";
import { fmtDate } from "@/src/lib/ui";
import type { SubmissionRow } from "@/src/types/exam";

const PAGE_SIZE = 15;

export default function GradingListPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // State Phân trang, Bộ lọc & Tìm kiếm
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "NEEDS_GRADING" | "DONE">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const loadSubmissions = useCallback(async () => {
    if (!id) return;
    try {
      const res = await listSubmissions(id);
      const data = Array.isArray(res) ? res : res?.data || [];
      setRows(data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Lọc kết quả kết hợp Tìm kiếm + Trạng thái
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    
    return rows.filter((r: any) => {
      // 1. Kiểm tra trạng thái bài nộp
      const isNeedsGrading =
        r.status === "NEEDS_GRADING" || r.needs_grading || r.status === "SUBMITTED";
      
      const matchStatus = 
        statusFilter === "ALL" ? true :
        statusFilter === "NEEDS_GRADING" ? isNeedsGrading : !isNeedsGrading;

      if (!matchStatus) return false;

      // 2. Tìm kiếm theo Username, Tên, Email hoặc ID sinh viên
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase().trim();

      const nameCandidate = (
        r.username ||
        r.student_name ||
        r.full_name ||
        r.name ||
        r.user?.username ||
        r.user?.full_name ||
        r.user?.name ||
        r.student?.username ||
        r.student?.full_name ||
        r.student?.name ||
        r.student_email ||
        r.email ||
        r.user?.email ||
        r.student_id ||
        r.user_id ||
        ""
      ).toString().toLowerCase();

      return nameCandidate.includes(query);
    });
  }, [rows, statusFilter, searchQuery]);

  // Phân trang
  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-6 px-4">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <Link
            href={`/dashboard_instructor/exams/${id}`}
            className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
          >
            ← Chi tiết đề thi
          </Link>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Danh Sách Bài Nộp Sinh Viên
          </h1>
        </div>

        {/* CỤM TÌM KIẾM & BỘ LỌC */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Ô TÌM KIẾM SINH VIÊN */}
          <div className="relative">
            <input
              type="text"
              placeholder="🔍 Tìm tên, email, ID sinh viên..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1); // Reset về trang 1 khi tìm kiếm
              }}
              className="w-64 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* NÚT LỌC TRẠNG THÁI */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => { setStatusFilter("ALL"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                statusFilter === "ALL"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tất cả ({rows?.length ?? 0})
            </button>
            <button
              onClick={() => { setStatusFilter("NEEDS_GRADING"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                statusFilter === "NEEDS_GRADING"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Cần chấm
            </button>
            <button
              onClick={() => { setStatusFilter("DONE"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                statusFilter === "DONE"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Đã hoàn thành
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      {/* BẢNG DANH SÁCH */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">
            Đang tải danh sách bài nộp...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            {searchQuery ? `Không tìm thấy sinh viên khớp với "${searchQuery}"` : "Không tìm thấy bài nộp nào phù hợp."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4">Sinh viên</th>
                    <th className="py-3.5 px-4">Thời gian nộp</th>
                    <th className="py-3.5 px-4">Điểm số</th>
                    <th className="py-3.5 px-4">Trạng thái</th>
                    <th className="py-3.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedRows.map((r: any) => {
                    // Tự động quét đầy đủ ưu tiên username -> full_name -> ID
                    const studentName =
                      r.username ||
                      r.student_name ||
                      r.full_name ||
                      r.name ||
                      r.user?.username ||
                      r.user?.full_name ||
                      r.user?.name ||
                      r.student?.username ||
                      r.student?.full_name ||
                      r.student?.name ||
                      r.student_email ||
                      r.email ||
                      r.user?.email ||
                      (r.student_id ? `Sinh viên #${String(r.student_id).slice(0, 8)}` : 
                       r.user_id ? `Sinh viên #${String(r.user_id).slice(0, 8)}` : "Sinh viên");

                    const displayId = r.student_id || r.user_id;

                    const scoreVal = r.score ?? r.earned_score ?? r.total_score;
                    const maxVal = r.max_score ?? r.total_points ?? 10;
                    const scoreDisplay =
                      scoreVal !== undefined && scoreVal !== null
                        ? `${scoreVal} / ${maxVal}`
                        : "Chưa chấm";

                    const isNeedsGrading =
                      r.status === "NEEDS_GRADING" ||
                      r.needs_grading ||
                      r.status === "SUBMITTED";

                    const attemptId = r.attempt_id || r.id;

                    return (
                      <tr key={attemptId} className="hover:bg-indigo-50/30 transition">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900 block">{studentName}</span>
                          {displayId && (
                            <span className="text-[10px] text-slate-400 font-medium block">
                              ID: {displayId}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {fmtDate(r.submitted_at || r.completed_at)}
                        </td>
                        <td className="py-3.5 px-4 font-black text-indigo-600">
                          {scoreDisplay}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block rounded-md px-2.5 py-1 text-[10px] font-black uppercase ${
                              isNeedsGrading
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {isNeedsGrading ? "Cần chấm" : "Đã hoàn thành"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Link
                            href={`/dashboard_instructor/exams/${id}/grading/${attemptId}`}
                            className="inline-block rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition"
                          >
                            Chấm bài →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* BAR PHÂN TRANG */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <span className="text-xs font-medium text-slate-500">
                Hiển thị {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredRows.length)} -{" "}
                {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} / {filteredRows.length} bài nộp
              </span>

              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  ← Trang trước
                </button>
                <span className="text-xs font-black text-indigo-600 px-2">
                  Trang {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  Trang sau →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}