"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSubmission, gradeAnswer, listSubmissions } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";
import { fmtDate } from "@/src/lib/ui";
import type { SubmissionRow } from "@/src/types/exam";

export default function GradingPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingQId, setSavingQId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 1. Load danh sách bài nộp
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

  // 2. Xem bài làm chi tiết
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

  // 3. Lưu điểm câu hỏi tự luận
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

  // Bóc tách danh sách câu hỏi
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
    <div className="mx-auto max-w-[1600px] space-y-4 py-4 px-4">
      {/* HEADER PAGE */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <Link
            href={`/dashboard_instructor/exams/${id}`}
            className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
          >
            ← Chi tiết đề thi
          </Link>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            Chấm Bài Sinh Viên
          </h1>
        </div>
        {rows && (
          <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
            Tổng số bài nộp: <span className="text-indigo-600 font-black">{rows.length}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      {/* MASTER-DETAIL GRID LAYOUT (2 CỘT TÁCH BIỆT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* CỘT TRÁI: DANH SÁCH BÀI NỘP (CỐ ĐỊNH CHIỀU CAO + TỰ CUỘN) */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col h-[calc(100vh-170px)] sticky top-4">
          <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-xs font-black uppercase tracking-wider text-indigo-900">
              Danh sách bài nộp
            </h2>
            <span className="text-[10px] text-slate-400 font-medium">Click chọn để chấm</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400">
                Đang tải danh sách...
              </div>
            ) : rows?.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Chưa có bài nộp nào.
              </div>
            ) : (
              rows?.map((r: any) => {
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
                const isSelected =
                  (detail?.attempt_id || detail?.id) === currentAttemptId;

                return (
                  <div
                    key={currentAttemptId}
                    onClick={() => openSubmission(currentAttemptId)}
                    className={`p-3.5 cursor-pointer transition flex items-center justify-between gap-3 hover:bg-slate-50 ${
                      isSelected ? "bg-indigo-50/80 border-l-4 border-indigo-600" : ""
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {studentName}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {fmtDate(r.submitted_at || r.completed_at)}
                      </p>
                    </div>

                    <div className="text-right space-y-1">
                      <span className="text-xs font-black text-indigo-600 block">
                        {scoreDisplay}
                      </span>
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[9px] font-black uppercase ${
                          isNeedsGrading
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isNeedsGrading ? "Cần chấm" : "Đã xong"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* CỘT PHẢI: CHI TIẾT BÀI THI & KHUNG CHẤM ĐIỂM */}
        <div className="lg:col-span-7 h-[calc(100vh-170px)] overflow-y-auto pr-1">
          {loadingDetail ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-xs font-bold text-slate-400">
              Đang tải chi tiết bài làm...
            </div>
          ) : !detail ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center space-y-3">
              <div className="mx-auto h-12 w-12 text-slate-300 flex items-center justify-center rounded-full bg-slate-50 font-bold text-xl">
                📝
              </div>
              <p className="text-xs font-bold text-slate-500">
                Vui lòng chọn một sinh viên ở danh sách bên trái để bắt đầu chấm bài.
              </p>
            </div>
          ) : (
            <div className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm space-y-6">
              {/* CỤM TỔNG QUAN SINH VIÊN */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                    Chi tiết bài thi
                  </span>
                  <h2 className="text-lg font-black text-slate-900">
                    {detailStudentName}
                  </h2>
                </div>
                <div className="rounded-2xl bg-indigo-50 px-4 py-2 text-right border border-indigo-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Tổng điểm hiện tại
                  </p>
                  <p className="text-xl font-black text-indigo-600">
                    {detailScore} / {detailMaxScore} điểm
                  </p>
                </div>
              </div>

              {/* DANH SÁCH CÂU HỎI */}
              <div className="space-y-4">
                {answersList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Không tìm thấy dữ liệu câu hỏi trong bài thi này.
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

                          {!isEssay && !NoneValue(isCorrect) && (
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

                        {/* Bài làm của sinh viên */}
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            Bài làm sinh viên:
                          </p>
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 whitespace-pre-wrap font-medium">
                            {formatStudentAnswer(studentAns)}
                          </div>
                        </div>

                        {/* Đáp án gợi ý */}
                        {(a.sample_answer || a.explanation) && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase text-indigo-600">
                              Gợi ý / Thang điểm:
                            </p>
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-950 font-medium">
                              {a.sample_answer || a.explanation}
                            </div>
                          </div>
                        )}

                        {/* Ô nhập điểm */}
                        {isEssay ? (
                          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-700">
                                Điểm:
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
                                className="w-20 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-black text-indigo-600 outline-none focus:border-indigo-500"
                              />
                              <span className="text-xs font-semibold text-slate-500">
                                / {maxPts}
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={savingQId === qId}
                              onClick={() => saveGrade(qId)}
                              className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                            >
                              {savingQId === qId ? "Lưu..." : "Lưu điểm"}
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
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// HELPER FUNCTIONS
function strLower(val: any): string {
  return String(val || "").toLowerCase();
}

function NoneValue(val: any) {
  return val === null || val === undefined;
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