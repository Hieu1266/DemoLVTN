"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSubmission, gradeAnswer, listSubmissions } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";
import { fmtDate } from "@/src/lib/ui";
import type { SubmissionRow } from "@/src/types/exam";

const PAGE_SIZE = 10; // Số lượng bài nộp trên 1 trang

export default function GradingPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingQId, setSavingQId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // State hỗ trợ Phân trang & Lọc
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "NEEDS_GRADING" | "DONE">("ALL");

  // 1. Load danh sách tất cả bài nộp
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

  // 2. Mở Modal chấm bài chi tiết của 1 sinh viên
  async function openSubmission(attemptId: string) {
    setError("");
    setLoadingDetail(true);
    try {
      const res = await getSubmission(attemptId);
      const d = res?.data || res;
      setDetail(d);

      const ansList = Array.isArray(d?.answers)
        ? d.answers
        : Array.isArray(d?.questions)
        ? d.questions
        : Array.isArray(d?.details)
        ? d.details
        : [];

      const initialScores: Record<string, number> = {};
      ansList.forEach((a: any) => {
        const qKey = a.question_id || a.id || a.answer_id;
        const pts =
          a.earned_points ??
          a.points_awarded ??
          a.points_earned ??
          a.score ??
          0;
        initialScores[qKey] = Number(pts);
      });
      setScores(initialScores);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingDetail(false);
    }
  }

  // 3. Lưu điểm tự luận
  async function saveGrade(questionId: string) {
    if (!detail) return;
    const targetAttemptId = detail.attempt_id || detail.id;
    setSavingQId(questionId);
    try {
      const score = scores[questionId] ?? 0;
      await gradeAnswer(targetAttemptId, questionId, score);

      const res = await getSubmission(targetAttemptId);
      const updatedDetail = res?.data || res;
      setDetail(updatedDetail);
      await loadSubmissions();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSavingQId(null);
    }
  }

  // Lọc danh sách theo trạng thái
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r: any) => {
      const isNeedsGrading =
        r.status === "NEEDS_GRADING" || r.needs_grading || r.status === "SUBMITTED";
      if (statusFilter === "NEEDS_GRADING") return isNeedsGrading;
      if (statusFilter === "DONE") return !isNeedsGrading;
      return true;
    });
  }, [rows, statusFilter]);

  // Lấy dữ liệu cho trang hiện tại
  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  // Chuyển sinh viên kế tiếp trực tiếp trong Modal
  const currentDetailIndex = filteredRows.findIndex(
    (r: any) => (r.attempt_id || r.id) === (detail?.attempt_id || detail?.id)
  );

  function nextStudent() {
    if (currentDetailIndex >= 0 && currentDetailIndex < filteredRows.length - 1) {
      const nextAttempt = filteredRows[currentDetailIndex + 1];
      openSubmission(nextAttempt.attempt_id || nextAttempt.id);
    }
  }

  function prevStudent() {
    if (currentDetailIndex > 0) {
      const prevAttempt = filteredRows[currentDetailIndex - 1];
      openSubmission(prevAttempt.attempt_id || prevAttempt.id);
    }
  }

  const answersList: any[] = detail
    ? Array.isArray(detail.answers)
      ? detail.answers
      : Array.isArray(detail.questions)
      ? detail.questions
      : Array.isArray(detail.details)
      ? detail.details
      : []
    : [];

  const detailStudentName = detail
    ? detail.student_name ||
      detail.full_name ||
      detail.name ||
      detail.student?.full_name ||
      (detail.user_id ? `Sinh viên #${String(detail.user_id).slice(0, 8)}` : "Sinh viên")
    : "";

  const detailScore = detail
    ? detail.score ?? detail.earned_score ?? detail.total_score ?? detail.final_score ?? 0
    : 0;

  const detailMaxScore = detail
    ? detail.max_score ?? detail.total_points ?? detail.max_points ?? 10
    : 10;

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-6 px-4">
      {/* HEADER PAGE */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <Link
            href={`/dashboard_instructor/exams/${id}`}
            className="text-xs font-bold text-indigo-600 hover:underline"
          >
            ← Chi tiết đề thi
          </Link>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Chấm Bài Sinh Viên
          </h1>
        </div>

        {/* BỘ LỌC BÀI NỘP */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setStatusFilter("ALL"); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === "ALL"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Tất cả ({rows?.length ?? 0})
          </button>
          <button
            onClick={() => { setStatusFilter("NEEDS_GRADING"); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === "NEEDS_GRADING"
                ? "bg-amber-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Cần chấm
          </button>
          <button
            onClick={() => { setStatusFilter("DONE"); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === "DONE"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Đã chấm xong
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      {/* DANH SÁCH BÀI NỘP DẠNG BẢNG GỌN GÀNG */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">
            Đang tải danh sách bài nộp...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            Không tìm thấy bài nộp phù hợp.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4">Sinh viên</th>
                    <th className="py-3.5 px-4">Thời gian nộp</th>
                    <th className="py-3.5 px-4">Điểm số</th>
                    <th className="py-3.5 px-4">Trạng thái</th>
                    <th className="py-3.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedRows.map((r: any) => {
                    const studentName =
                      r.student_name ||
                      r.full_name ||
                      r.name ||
                      (r.user_id ? `Sinh viên #${String(r.user_id).slice(0, 8)}` : "Sinh viên");

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

                    const currentAttemptId = r.attempt_id || r.id;

                    return (
                      <tr key={currentAttemptId} className="hover:bg-indigo-50/30 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {studentName}
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
                          <button
                            type="button"
                            onClick={() => openSubmission(currentAttemptId)}
                            className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition"
                          >
                            Xem & Chấm bài
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* THANH PHÂN TRANG (PAGINATION BAR) */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <span className="text-xs font-medium text-slate-500">
                Hiển thị {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredRows.length)} -{" "}
                {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} / {filteredRows.length} bài nộp
              </span>

              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  ← Trang trước
                </button>
                <span className="text-xs font-black text-indigo-600 px-2">
                  Trang {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  Trang sau →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODAL / SLIDE-OVER DRAWER CHẤM BÀI CHI TIẾT (FIX NỔI TRÊN MỌI LAYOUT) */}
      {(detail || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 animate-fadeIn">
          <div className="relative flex flex-col h-full w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">
                  Khung chấm điểm bài thi
                </span>
                <h2 className="text-base font-black text-slate-900">
                  {loadingDetail ? "Đang tải dữ liệu..." : detailStudentName}
                </h2>
              </div>

              <div className="flex items-center gap-3">
                {/* NÚT CHUYỂN SINH VIÊN */}
                {detail && (
                  <div className="flex items-center gap-1 border-r border-slate-200 pr-3">
                    <button
                      disabled={currentDetailIndex <= 0}
                      onClick={prevStudent}
                      className="rounded-lg p-1.5 hover:bg-slate-200 disabled:opacity-30 text-xs font-bold text-slate-600"
                      title="Bài trước"
                    >
                      ▲ Bài trước
                    </button>
                    <button
                      disabled={currentDetailIndex >= filteredRows.length - 1}
                      onClick={nextStudent}
                      className="rounded-lg p-1.5 hover:bg-slate-200 disabled:opacity-30 text-xs font-bold text-slate-600"
                      title="Bài kế tiếp"
                    >
                      ▼ Bài kế
                    </button>
                  </div>
                )}

                {/* NÚT ĐÓNG MODAL */}
                <button
                  onClick={() => setDetail(null)}
                  className="rounded-full bg-slate-200/80 p-2 text-slate-600 hover:bg-slate-300 transition font-black text-sm w-8 h-8 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* MODAL BODY (CUỘN NỘI DUNG ĐỘC LẬP) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingDetail ? (
                <div className="py-20 text-center text-xs font-bold text-slate-400">
                  Đang tải chi tiết bài làm của sinh viên...
                </div>
              ) : (
                <>
                  {/* TỔNG ĐIỂM */}
                  <div className="flex items-center justify-between rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        Trạng thái chấm điểm
                      </p>
                      <p className="text-xs font-bold text-indigo-950">
                        {answersList.some((a) => strLower(a.question_type || a.type) === "essay")
                          ? "Bài thi có câu tự luận cần xem xét"
                          : "Đã chấm tự động hoàn tất"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        Tổng điểm đạt được
                      </p>
                      <p className="text-2xl font-black text-indigo-600">
                        {detailScore} / {detailMaxScore}
                      </p>
                    </div>
                  </div>

                  {/* DANH SÁCH CÂU HỎI */}
                  <div className="space-y-4">
                    {answersList.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        Không tìm thấy thông tin câu hỏi trong bài thi này.
                      </div>
                    ) : (
                      answersList.map((a: any, i: number) => {
                        const qId = a.question_id || a.id || a.answer_id;
                        const qType = strLower(a.question_type || a.type);
                        const studentAns =
                          a.student_answer ?? a.user_answer ?? a.answer ?? a.answer_data;
                        const maxPts = a.max_points ?? a.points ?? 1;
                        const awardedPts =
                          a.earned_points ?? a.points_earned ?? a.score ?? 0;
                        const isEssay = qType === "essay";
                        const isCorrect = a.is_correct ?? a.correct;

                        return (
                          <div
                            key={qId}
                            className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white">
                                    #{i + 1}
                                  </span>
                                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">
                                    {isEssay ? "Tự luận" : qType || "Câu hỏi"}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-400">
                                    · Tối đa: {maxPts} điểm
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-slate-800">
                                  {a.content || a.title || a.question_title || a.question?.content}
                                </p>
                              </div>

                              {!isEssay && isCorrect !== undefined && isCorrect !== null && (
                                <span
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                                    isCorrect
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-rose-100 text-rose-700"
                                  }`}
                                >
                                  {isCorrect ? "Đúng" : "Sai"}
                                </span>
                              )}
                            </div>

                            {/* BÀI LÀM SINH VIÊN */}
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase text-slate-400">
                                Bài làm sinh viên:
                              </p>
                              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 whitespace-pre-wrap font-medium">
                                {formatStudentAnswer(studentAns)}
                              </div>
                            </div>

                            {/* GỢI Ý ĐÁP ÁN */}
                            {(a.sample_answer || a.explanation) && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase text-indigo-600">
                                  Gợi ý đáp án / Hướng dẫn chấm:
                                </p>
                                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-950 font-medium">
                                  {a.sample_answer || a.explanation}
                                </div>
                              </div>
                            )}

                            {/* KHUNG BẬT Ô NHẬP ĐIỂM TỰ LUẬN */}
                            {isEssay ? (
                              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-700">
                                    Nhập điểm:
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={maxPts}
                                    step={0.25}
                                    value={scores[qId] ?? awardedPts}
                                    onChange={(e) =>
                                      setScores({
                                        ...scores,
                                        [qId]: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    className="w-20 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-indigo-600 outline-none focus:border-indigo-500"
                                  />
                                  <span className="text-xs font-semibold text-slate-500">
                                    / {maxPts}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  disabled={savingQId === qId}
                                  onClick={() => saveGrade(qId)}
                                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                                >
                                  {savingQId === qId ? "Lưu..." : "Lưu điểm câu này"}
                                </button>
                              </div>
                            ) : (
                              <div className="text-right pt-1 text-xs font-bold text-slate-500">
                                Điểm: <b className="text-indigo-600">{awardedPts} / {maxPts}</b> (Tự động)
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-right">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// HELPER FUNCTIONS
function strLower(val: any): string {
  return String(val || "").toLowerCase();
}

function formatStudentAnswer(ans: any): string {
  if (ans === null || ans === undefined || ans === "") {
    return "(Không trả lời)";
  }
  if (typeof ans === "object") {
    try {
      return JSON.stringify(ans, null, 2);
    } catch {
      return String(ans);
    }
  }
  return String(ans).trim();
}