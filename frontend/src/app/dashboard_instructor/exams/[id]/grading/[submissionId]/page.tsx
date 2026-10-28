"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSubmission, gradeAnswer } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";

export default function StudentSubmissionGradingPage() {
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();
  const [detail, setDetail] = useState<any | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingQId, setSavingQId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    if (!submissionId) return;
    try {
      const res = await getSubmission(submissionId);
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
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function saveGrade(questionId: string) {
    if (!submissionId) return;
    setSavingQId(questionId);
    try {
      const score = scores[questionId] ?? 0;
      await gradeAnswer(submissionId, questionId, score);
      await loadDetail();
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
    <div className="mx-auto max-w-4xl space-y-6 py-6 px-4">
      {/* HEADER TOP BAR */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <Link
            href={`/dashboard_instructor/exams/${id}/grading`}
            className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
          >
            ← Quay lại danh sách bài nộp
          </Link>
          <h1 className="text-xl font-black text-slate-900 tracking-tight mt-1">
            Chấm Bài: {loading ? "Đang tải..." : detailStudentName}
          </h1>
        </div>

        {detail && (
          <div className="rounded-2xl bg-indigo-50 border border-indigo-100 px-5 py-2 text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">
              Tổng điểm hiện tại
            </span>
            <span className="text-xl font-black text-indigo-600">
              {detailScore} / {detailMaxScore}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-xs font-bold text-slate-400 bg-white rounded-3xl border border-slate-200">
          Đang nạp chi tiết bài thi của sinh viên...
        </div>
      ) : (
        <div className="space-y-4">
          {answersList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 bg-white rounded-3xl border border-slate-200">
              Không tìm thấy danh sách câu hỏi trong bài thi này.
            </div>
          ) : (
            answersList.map((a: any, i: number) => {
              const qId = a.question_id || a.id || a.answer_id;
              const qType = String(a.question_type || a.type || "").toLowerCase();
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
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                          #{i + 1}
                        </span>
                        <span className="rounded-md bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">
                          {isEssay ? "Tự luận" : qType || "Câu hỏi"}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">
                          · Thang điểm: {maxPts} điểm
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 pt-1">
                        {a.content || a.title || a.question_title || a.question?.content}
                      </p>
                    </div>

                    {!isEssay && isCorrect !== undefined && isCorrect !== null && (
                      <span
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase ${
                          isCorrect
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {isCorrect ? "Đúng" : "Sai"}
                      </span>
                    )}
                  </div>

                  {/* BÀI LÀM */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Bài làm của sinh viên:
                    </p>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-800 whitespace-pre-wrap font-medium leading-relaxed">
                      {formatStudentAnswer(studentAns)}
                    </div>
                  </div>

                  {/* GỢI Ý ĐÁP ÁN */}
                  {(a.sample_answer || a.explanation) && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase text-indigo-600">
                        Gợi ý đáp án / Thang hướng dẫn chấm:
                      </p>
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-950 font-medium leading-relaxed">
                        {a.sample_answer || a.explanation}
                      </div>
                    </div>
                  )}

                  {/* CHẤM ĐIỂM */}
                  {isEssay ? (
                    <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">
                          Chấm điểm câu này:
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
                          className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-indigo-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                        <span className="text-xs font-semibold text-slate-500">
                          / {maxPts} điểm
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={savingQId === qId}
                        onClick={() => saveGrade(qId)}
                        className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs"
                      >
                        {savingQId === qId ? "Đang lưu..." : "Lưu điểm câu này"}
                      </button>
                    </div>
                  ) : (
                    <div className="text-right pt-2 text-xs font-bold text-slate-500">
                      Điểm đạt được: <b className="text-indigo-600">{awardedPts} / {maxPts}</b> (Hệ thống chấm tự động)
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
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