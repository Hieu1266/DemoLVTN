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
              const qData = a.data || a.question?.data || {};
              const qMode = String(a.mode || qData.mode || "").toLowerCase();
              const studentAns =
                a.student_answer ?? a.user_answer ?? a.answer ?? a.answer_data;
              const maxPts = a.max_points ?? a.points ?? 1;
              const awardedPts =
                a.earned_points ?? a.points_earned ?? a.score ?? 0;
              const isCorrect = a.is_correct ?? a.correct;

              // Đồng bộ 100% với Backend: Tự luận HOẶC Điền khuyết nhập tay (hoặc is_correct === null) -> Giảng viên chấm
              const isEssay = qType === "essay";
              const isTextBlank =
                qType === "fill_blank_text" ||
                (qType.includes("fill") && qMode === "text");
              const needsManual =
                isEssay ||
                isTextBlank ||
                isCorrect === null ||
                isCorrect === undefined;

              const typeBadgeLabel = isEssay
                ? "Tự luận"
                : isTextBlank || (qType.includes("fill") && needsManual)
                ? "Điền khuyết (Nhập chữ)"
                : qType.includes("fill")
                ? "Điền khuyết (Trắc nghiệm)"
                : qType === "true_false"
                ? "Đúng / Sai"
                : qType === "single_choice"
                ? "Trắc nghiệm 1 đáp án"
                : qType === "multiple_select"
                ? "Trắc nghiệm nhiều đáp án"
                : qType || "Câu hỏi";

              const blanksList = a.blanks || qData.blanks || [];

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
                          {typeBadgeLabel}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">
                          · Thang điểm: {maxPts} điểm
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 pt-1">
                        {a.content || a.title || a.question_title || a.question?.content}
                      </p>
                    </div>

                    {needsManual ? (
                      <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-700 shrink-0">
                        Chờ chấm điểm
                      </span>
                    ) : (
                      <span
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase shrink-0 ${
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
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-800 font-medium leading-relaxed">
                      {renderFormattedAnswer(studentAns, qType, a)}
                    </div>
                  </div>

                  {/* GỢI Ý ĐÁP ÁN / ĐÁP ÁN MẪU */}
                  {(a.sample_answer || a.explanation || qData.sample_answer || (isTextBlank && blanksList.length > 0)) && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase text-indigo-600">
                        Gợi ý đáp án / Thang hướng dẫn chấm:
                      </p>
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-950 font-medium leading-relaxed">
                        {a.sample_answer ||
                          a.explanation ||
                          qData.sample_answer ||
                          blanksList
                            .map(
                              (b: any, idx: number) =>
                                `Ô #${idx + 1}: ${(b.correctAnswers || []).join(" / ")}`
                            )
                            .join(" | ")}
                      </div>
                    </div>
                  )}

                  {/* CHẤM ĐIỂM */}
                  {needsManual ? (
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100">
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
                      Điểm đạt được:{" "}
                      <b className="text-indigo-600">
                        {awardedPts} / {maxPts}
                      </b>{" "}
                      (Hệ thống chấm tự động)
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

function tryParseJson(val: any) {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return val;
    }
  }
  return val;
}

function renderFormattedAnswer(rawAns: any, qType: string, item: any) {
  if (rawAns === null || rawAns === undefined || rawAns === "") {
    return <span className="italic text-slate-400">(Không trả lời)</span>;
  }

  const parsed = tryParseJson(rawAns);
  const qData = item.data || item.question?.data || {};
  const opts = item.options || qData.options || [];
  const stmts = item.statements || qData.statements || [];
  const blanks = item.blanks || qData.blanks || [];

  // 1. Đúng / Sai nhiều mệnh đề
  if (qType === "true_false" && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (stmts.length > 0) {
      return (
        <div className="space-y-2">
          {stmts.map((s: any, idx: number) => {
            const val = parsed[s.id];
            const expected = Boolean(s.isCorrect);
            const isRight = val !== undefined && Boolean(val) === expected;
            return (
              <div
                key={s.id || idx}
                className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 border border-slate-200/80"
              >
                <span className="text-slate-800">
                  <b className="text-indigo-600 mr-1.5">{String.fromCharCode(97 + idx)})</b>
                  {s.text}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                      val === true
                        ? "bg-indigo-100 text-indigo-700"
                        : val === false
                        ? "bg-slate-200 text-slate-700"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    SV chọn: {val === true ? "ĐÚNG" : val === false ? "SAI" : "Trống"}
                  </span>
                  <span
                    className={`text-[11px] font-bold ${
                      isRight ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {isRight ? "✓" : "✕"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Fallback nếu API chưa trả mảng statements
    return (
      <div className="space-y-1">
        {Object.entries(parsed).map(([k, v], idx) => (
          <div key={k}>
            Mệnh đề #{idx + 1}: <b>{v === true ? "ĐÚNG" : v === false ? "SAI" : String(v)}</b>
          </div>
        ))}
      </div>
    );
  }

  // 2. Trắc nghiệm 1 đáp án
  if ((qType === "single_choice" || qType.includes("single")) && Array.isArray(opts) && opts.length > 0) {
    const foundIdx = opts.findIndex(
      (o: any, idx: number) =>
        String(o?.id) === String(parsed) ||
        String(idx) === String(parsed) ||
        (typeof o === "string" && o === parsed) ||
        (o?.text && o.text === parsed)
    );
    if (foundIdx >= 0) {
      const foundOpt = opts[foundIdx];
      const text = typeof foundOpt === "string" ? foundOpt : foundOpt.text || foundOpt.id;
      return `${String.fromCharCode(65 + foundIdx)}. ${text}`;
    }
  }

  // 3. Trắc nghiệm nhiều đáp án
  if ((qType === "multiple_select" || qType.includes("multiple")) && Array.isArray(parsed)) {
    if (Array.isArray(opts) && opts.length > 0) {
      return parsed
        .map((ansId: any) => {
          const idx = opts.findIndex(
            (o: any, i: number) => String(o?.id) === String(ansId) || String(i) === String(ansId)
          );
          if (idx >= 0) {
            const text = typeof opts[idx] === "string" ? opts[idx] : opts[idx].text;
            return `${String.fromCharCode(65 + idx)}. ${text}`;
          }
          return String(ansId);
        })
        .join(", ");
    }
    return parsed.join(", ");
  }

  // 4. Điền khuyết nhiều ô trống (dạng object { blank_1: "..." })
  if (qType.includes("fill") && typeof parsed === "object" && !Array.isArray(parsed)) {
    return Object.entries(parsed)
      .map(([bId, val], idx) => {
        const bIdx = blanks.findIndex((b: any) => String(b.id) === String(bId));
        const label = bIdx >= 0 ? `Ô #${bIdx + 1}` : `Ô #${idx + 1}`;
        return `${label}: ${val || "(Trống)"}`;
      })
      .join(" | ");
  }

  if (typeof parsed === "object") {
    return JSON.stringify(parsed, null, 2);
  }
  return String(parsed).trim();
}