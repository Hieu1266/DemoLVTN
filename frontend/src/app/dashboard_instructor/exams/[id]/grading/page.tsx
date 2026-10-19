"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSubmission, gradeAnswer, listSubmissions } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";
import { fmtDate } from "@/src/lib/ui";
import type { SubmissionDetail, SubmissionRow } from "@/src/types/exam";

export default function GradingPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingQId, setSavingQId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 1. Load danh sách các bài làm sinh viên đã nộp
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

  // 2. Xem bài làm chi tiết của 1 sinh viên (xử lý bọc dữ liệu linh hoạt)
  async function openSubmission(attemptId: string) {
    setError("");
    try {
      const res = await getSubmission(attemptId);
      const d = res?.data || res; // Bóc tách dữ liệu nếu API bọc trong object { data: ... }
      setDetail(d);

      // Lấy danh sách câu hỏi an toàn từ tất cả alias có thể có
      const ansList = Array.isArray(d?.answers)
        ? d.answers
        : Array.isArray(d?.questions)
        ? d.questions
        : Array.isArray(d?.details)
        ? d.details
        : [];

      // Map điểm hiện tại của các câu hỏi vào state
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

      // Cập nhật lại chi tiết bài làm & bảng danh sách
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

  // Bóc tách danh sách câu hỏi / đáp án của lượt thi hiện tại
  const answersList: any[] = detail
    ? Array.isArray(detail.answers)
      ? detail.answers
      : Array.isArray(detail.questions)
      ? detail.questions
      : Array.isArray(detail.details)
      ? detail.details
      : []
    : [];

  // Bóc tách tên sinh viên & tổng điểm an toàn
  const detailStudentName = detail
    ? detail.student_name ||
      detail.full_name ||
      detail.name ||
      detail.student?.full_name ||
      (detail.user_id ? `Sinh viên #${String(detail.user_id).slice(0, 8)}` : "Sinh viên")
    : "";

  const detailScore = detail
    ? detail.score ??
      detail.earned_score ??
      detail.total_score ??
      detail.final_score ??
      0
    : 0;

  const detailMaxScore = detail
    ? detail.max_score ?? detail.total_points ?? detail.max_points ?? 10
    : 10;

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6 px-4">
      {/* HEADER PAGE */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard_instructor/exams/${id}`}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              ← Chi tiết đề thi
            </Link>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Chấm Bài Sinh Viên
          </h1>
          <p className="text-xs font-medium text-slate-500">
            Xem lịch sử nộp bài và chấm điểm các câu hỏi tự luận
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      {/* BLOCK 1: DANH SÁCH BÀI NỘP */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-4">
        <h2 className="text-xs font-black uppercase tracking-wider text-indigo-900 border-b border-slate-100 pb-3">
          Danh sách bài nộp ({rows?.length ?? 0})
        </h2>

        {loading ? (
          <div className="py-12 text-center text-xs font-bold text-slate-400">
            Đang tải danh sách bài nộp...
          </div>
        ) : rows?.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Chưa có sinh viên nào nộp bài thi này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-3">Sinh viên</th>
                  <th className="py-3 px-3">Nộp lúc</th>
                  <th className="py-3 px-3">Điểm số</th>
                  <th className="py-3 px-3">Trạng thái</th>
                  <th className="py-3 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {rows?.map((r: any) => {
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
                      : "Chưa chấm xong";

                  const isNeedsGrading =
                    r.status === "NEEDS_GRADING" ||
                    r.needs_grading ||
                    r.status === "SUBMITTED";

                  const currentAttemptId = r.attempt_id || r.id;
                  const isSelected =
                    (detail?.attempt_id || detail?.id) === currentAttemptId;

                  return (
                    <tr
                      key={currentAttemptId}
                      className={`hover:bg-slate-50/70 transition ${
                        isSelected ? "bg-indigo-50/50" : ""
                      }`}
                    >
                      <td className="py-3.5 px-3 font-bold text-slate-800">
                        {studentName}
                      </td>
                      <td className="py-3.5 px-3 text-slate-500">
                        {fmtDate(r.submitted_at || r.completed_at)}
                      </td>
                      <td className="py-3.5 px-3 font-bold text-indigo-600">
                        {scoreDisplay}
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                            isNeedsGrading
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {isNeedsGrading ? "Cần chấm" : "Đã hoàn thành"}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => openSubmission(currentAttemptId)}
                          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                            isSelected
                              ? "bg-indigo-600 text-white"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {isSelected ? "Đang xem" : "Xem & Chấm bài"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BLOCK 2: CHI TIẾT BÀI LÀM ĐANG CHẤM */}
      {detail && (
        <div className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-lg space-y-6 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                Chi tiết bài thi
              </span>
              <h2 className="text-lg font-black text-slate-900">
                Thí sinh: {detailStudentName}
              </h2>
            </div>
            <div className="rounded-2xl bg-indigo-50 px-4 py-2 text-right border border-indigo-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                Tổng điểm đạt được
              </p>
              <p className="text-xl font-black text-indigo-600">
                {detailScore} / {detailMaxScore} điểm
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {answersList.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Không tìm thấy danh sách câu hỏi trong bài làm này.
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
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3"
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
                            · Thang điểm: {maxPts} điểm
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          {a.content || a.title || a.question_title || a.question?.content}
                        </p>
                      </div>

                      {!isEssay && isCorrect !== NoneValue(isCorrect) && (
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
                        Bài làm của sinh viên:
                      </p>
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 whitespace-pre-wrap font-medium">
                        {formatStudentAnswer(studentAns)}
                      </div>
                    </div>

                    {/* Đáp án gợi ý nếu có */}
                    {(a.sample_answer || a.explanation) && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-indigo-600">
                          Đáp án gợi ý / Thang hướng dẫn chấm:
                        </p>
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-950 font-medium">
                          {a.sample_answer || a.explanation}
                        </div>
                      </div>
                    )}

                    {/* Chấm điểm câu tự luận hoặc hiển thị điểm trắc nghiệm */}
                    {isEssay ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">
                            Chấm điểm:
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
                            className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-indigo-600 outline-none focus:border-indigo-500"
                          />
                          <span className="text-xs font-semibold text-slate-500">
                            / {maxPts} điểm
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={savingQId === qId}
                          onClick={() => saveGrade(qId)}
                          className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                          {savingQId === qId ? "Đang lưu..." : "Lưu điểm câu này"}
                        </button>
                      </div>
                    ) : (
                      <div className="text-right pt-1 text-xs font-bold text-slate-500">
                        Điểm đạt được:{" "}
                        <b className="text-indigo-600">
                          {awardedPts} / {maxPts}
                        </b>{" "}
                        (Tự động chấm)
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