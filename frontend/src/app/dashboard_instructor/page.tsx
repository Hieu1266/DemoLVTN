"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteExam, getMyExams as listMyExams } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";
import { fmtDate } from "@/src/lib/ui";
import type { Exam } from "@/src/actions/exam";

export default function InstructorDashboard() {
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listMyExams()
      .then((data) => setExams(data || []))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  async function remove(id: string) {
    if (!confirm("Bạn có chắc chắn muốn xóa đề thi này?")) return;
    try {
      await deleteExam(id);
      setExams((list) => list?.filter((x) => x.exam_id !== id) ?? null);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function handleCopyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  // Lọc danh sách đề thi
  const filteredExams = exams?.filter((x) => {
    const matchesSearch =
      x.exam_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      x.access_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || x.status_id === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Tính toán thống kê
  const totalCount = exams?.length ?? 0;
  const publishedCount = exams?.filter((x) => x.status_id === "PUBLISHED").length ?? 0;
  const draftCount = exams?.filter((x) => x.status_id === "DRAFT").length ?? 0;
  const closedCount = exams?.filter((x) => x.status_id === "CLOSED").length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6 px-4">
      {/* HEADER PAGE */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Quản Lý Đề Thi
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Khởi tạo đề thi, biên soạn câu hỏi và theo dõi chấm bài cho sinh viên
          </p>
        </div>

        <Link
          href="/dashboard_instructor/exams/new"
          className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 active:scale-95 transition"
        >
          <span>+ Tạo đề mới</span>
        </Link>
      </div>

      {/* STATS CARDS */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Tổng số đề
          </p>
          <p className="text-2xl font-black text-slate-900">{totalCount}</p>
        </div>

        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/40 p-5 shadow-2xs space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Đang mở thi
          </p>
          <p className="text-2xl font-black text-emerald-800">{publishedCount}</p>
        </div>

        <div className="rounded-3xl border border-amber-100 bg-amber-50/40 p-5 shadow-2xs space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Bản nháp
          </p>
          <p className="text-2xl font-black text-amber-800">{draftCount}</p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-5 shadow-2xs space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Đã đóng
          </p>
          <p className="text-2xl font-black text-slate-700">{closedCount}</p>
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-5">
        
        {/* TOOLBAR: SEARCH & STATUS TABS */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1 rounded-2xl bg-slate-100/80 p-1">
            {[
              { key: "ALL", label: "Tất cả" },
              { key: "PUBLISHED", label: "Đang mở" },
              { key: "DRAFT", label: "Bản nháp" },
              { key: "CLOSED", label: "Đã đóng" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  statusFilter === tab.key
                    ? "bg-white text-indigo-950 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên đề, mã PIN..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="py-16 text-center text-xs font-bold text-slate-400">
            Đang tải danh sách đề thi...
          </div>
        )}

        {/* EMPTY STATE */}
        {!loading && exams?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center space-y-2">
            <p className="text-xs font-bold text-slate-600">Chưa có đề thi nào</p>
            <p className="text-[11px] text-slate-400">
              Bắt đầu tạo đề thi đầu tiên để biên soạn câu hỏi
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard_instructor/exams/new"
                className="inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition"
              >
                + Tạo đề mới ngay
              </Link>
            </div>
          </div>
        )}

        {/* NO SEARCH RESULTS */}
        {!loading && exams && exams.length > 0 && filteredExams?.length === 0 && (
          <div className="py-12 text-center text-xs text-slate-400">
            Không tìm thấy đề thi nào phù hợp với bộ lọc.
          </div>
        )}

        {/* TABLE LIST */}
        {!loading && filteredExams && filteredExams.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-3">Tên đề thi</th>
                  <th className="py-3 px-3">Mã PIN phòng</th>
                  <th className="py-3 px-3">Thời gian</th>
                  <th className="py-3 px-3">Trạng thái</th>
                  <th className="py-3 px-3">Ngày tạo</th>
                  <th className="py-3 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredExams.map((x) => (
                  <tr
                    key={x.exam_id}
                    className="group hover:bg-slate-50/70 transition"
                  >
                    {/* Tên đề thi */}
                    <td className="py-3.5 px-3 font-bold text-slate-800 max-w-xs">
                      <Link
                        href={`/dashboard_instructor/exams/${x.exam_id}`}
                        className="hover:text-indigo-600 transition line-clamp-1"
                      >
                        {x.exam_name}
                      </Link>
                    </td>

                    {/* Mã PIN + Nút sao chép */}
                    <td className="py-3.5 px-3">
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50/80 px-2 py-0.5 border border-indigo-100">
                        <span className="font-mono font-black text-indigo-700 tracking-wider">
                          {x.access_code}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(x.access_code)}
                          title="Sao chép mã PIN"
                          className="text-[10px] text-indigo-500 hover:text-indigo-800 font-bold"
                        >
                          {copiedCode === x.access_code ? "✓" : "📋"}
                        </button>
                      </div>
                    </td>

                    {/* Thời gian */}
                    <td className="py-3.5 px-3 font-medium text-slate-600">
                      {x.duration_minutes} phút
                    </td>

                    {/* Trạng thái */}
                    <td className="py-3.5 px-3">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                          x.status_id === "PUBLISHED"
                            ? "bg-emerald-100 text-emerald-700"
                            : x.status_id === "CLOSED"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {x.status_id === "PUBLISHED"
                          ? "Đang mở"
                          : x.status_id === "CLOSED"
                          ? "Đã đóng"
                          : "Bản nháp"}
                      </span>
                    </td>

                    {/* Ngày tạo */}
                    <td className="py-3.5 px-3 text-slate-400 font-medium">
                      {fmtDate(x.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-3 text-right whitespace-nowrap space-x-1">
                      <Link
                        href={`/dashboard_instructor/exams/${x.exam_id}`}
                        className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                      >
                        📝 Chi tiết
                      </Link>
                      <Link
                        href={`/dashboard_instructor/exams/${x.exam_id}/grading`}
                        className="inline-flex rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs"
                      >
                        📊 Chấm bài
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(x.exam_id)}
                        className="inline-flex rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 transition"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}