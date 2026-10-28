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
    // KHÓA CỨNG CHIỀU CAO TOÀN TRANG BẰNG ĐÚNG MÀN HÌNH (100vh)
    <div className="flex flex-col h-[calc(100vh-80px)] w-full max-w-[1700px] mx-auto p-4 space-y-3 overflow-hidden">
      
      {/* HEADER TOP BAR */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard_instructor/exams/${id}`}
            className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
          >
            ← Chi tiết đề thi
          </Link>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">
            Chấm Bài Sinh Viên
          </h1>
        </div>
        {rows && (
          <div className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            Tổng bài nộp: <span className="text-indigo-600 font-black">{rows.length}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex-shrink-0 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      {/* KHUNG MASTER-DETAIL (ÉP CỨNG FLEX-ROW NGANG, KHÔNG DÙNG GRID) */}
      <div className="flex-1 flex flex-row gap-4 min-h-0 overflow-hidden">
        
        {/* CỘT TRÁI: DANH SÁCH BÀI NỘP (CỐ ĐỊNH RỘNG 380px, CUỘN ĐỘC LẬP) */}
        <div className="w-[380px] flex-shrink-0 flex flex-col min-h-0 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex-shrink-0 bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
              Danh sách bài nộp ({rows?.length ?? 0})
            </h2>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              Chọn để chấm
            </span>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100">
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
                    ? `${scoreVal}/${maxVal}`
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
                      isSelected
                        ? "bg-indigo-50/90 border-l-4 border-indigo-600 font-semibold"
                        : ""
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className={`text-xs truncate ${isSelected ? "text-indigo-950 font-bold" : "text-slate-800 font-medium"}`}>
                        {studentName}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {fmtDate(r.submitted_at || r.completed_at)}
                      </p>
                    </div>

                    <div className="text-right space-y-1 flex-shrink-0">
                      <span className="text-xs font-black text-indigo-600 block">
                        {scoreDisplay}
                      </span>
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
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

        {/* CỘT PHẢI: CHI TIẾT BÀI THI (TỰ ĐỘNG PHÌNH RỘNG & CUỘN ĐỘC LẬP) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {loadingDetail ? (
            <div className="flex-1 flex items-center justify-center p-12 text-xs font-bold text-slate-400">
              Đang tải chi tiết bài làm...
            </div>
          ) : !detail ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3 bg-slate-50/50">
              <div className="h-12 w-12 text-slate-400 flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-xl shadow-xs">
                👈
              </div>
              <p className="text-xs font-bold text-slate-600">
                Chọn một sinh viên ở danh sách bên trái để chấm bài trực tiếp tại đây.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header cố định ở cột phải */}
              <div className="flex-shrink-0 bg-slate-50 px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">
                    Đang xem bài làm
                  </span>
                  <h2 className="text-base font-black text-slate-900">
                    {detailStudentName}
                  </h2>
                </div>
                <div className="bg-white px-4 py-1.5 rounded-xl border border-indigo-100 text-right shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Điểm số
                  </span>
                  <span className="text-lg font-black text-indigo-600">
                    {detailScore} / {detailMaxScore}
                  </span>
                </div>
              </div>

              {/* Nội dung các câu hỏi cuộn độc lập */}
              <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
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
                        className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 space-y-3"
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
                                · Thang điểm: {maxPts}
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

                        {/* Bài làm sinh viên */}
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
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

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