"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getResult } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";
import { fmtDate } from "@/src/lib/ui";

export default function ResultDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [res, setRes] = useState<any | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!attemptId) return;
    getResult(attemptId)
      .then(setRes)
      .catch((e) => setError(errMsg(e)));
  }, [attemptId]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-xs font-bold text-rose-600 shadow-2xs">
          {error}
        </div>
      </div>
    );
  }

  if (!res) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <p className="text-xs font-bold text-slate-400 animate-pulse">Đang tải kết quả bài thi...</p>
      </div>
    );
  }

  const score = res.total_score ?? res.score ?? 0;
  const maxScore = res.max_score ?? res.total_points ?? 10;
  const submittedAt = res.submitted_at || res.completed_at;
  const isPending = res.status === "NEEDS_GRADING";
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  // Hàm hiển thị đáp án sinh viên (tra ngược ID opt_1 thành chữ A, B, C...)
  const renderUserAnswer = (a: any) => {
    const rawAns = a.user_answer ?? a.student_answer ?? a.answer;
    if (rawAns === null || rawAns === undefined || rawAns === "") {
      return <span className="italic text-slate-400">(Bỏ trống)</span>;
    }

    const qType = (a.type || a.question_type || "").toLowerCase();
    const opts = a.options || [];

    if (qType === "single_choice" || qType.includes("single")) {
      if (Array.isArray(opts) && opts.length > 0) {
        const foundOpt = opts.find(
          (o: any, idx: number) =>
            String(o?.id) === String(rawAns) ||
            String(idx) === String(rawAns) ||
            (typeof o === "string" && o === rawAns) ||
            (o?.text && o.text === rawAns)
        );

        if (foundOpt) {
          const idx = opts.indexOf(foundOpt);
          const letter = String.fromCharCode(65 + (idx >= 0 ? idx : 0));
          const text = typeof foundOpt === "string" ? foundOpt : foundOpt.text || foundOpt.id;
          return `${letter}. ${text}`;
        }
      }

      const idx = Number(rawAns);
      if (!isNaN(idx) && idx >= 0) {
        return `${String.fromCharCode(65 + idx)}`;
      }
    }

    if (Array.isArray(rawAns)) return rawAns.join(", ");
    return String(rawAns);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-8 px-4">
      <div>
        <Link
          href="/dashboard_student/results"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
        >
          ← Danh sách kết quả
        </Link>
      </div>

      {/* BANNER ĐIỂM TỔNG TỰ ĐỘNG QUY ĐỔI THANG 10 */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold backdrop-blur-md">
              Nộp lúc: {fmtDate(submittedAt)}
            </span>
            <h1 className="text-2xl font-black">{res.exam_name}</h1>
            <p className="text-xs font-medium text-indigo-200">
              {isPending
                ? "Bài thi có câu tự luận/điền khuyết đang chờ chấm (Điểm hiển thị là điểm tạm tính)"
                : "Đã hoàn tất chấm điểm"}
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-md shrink-0">
            <div className="text-right">
              <span className="block text-[10px] font-bold uppercase text-indigo-200">
                {isPending ? "Điểm tạm tính (Thang 10)" : "Điểm quy đổi (Thang 10)"}
              </span>
              <div className="font-mono text-3xl font-black">
                {score} <span className="text-sm font-semibold text-indigo-200">/ {maxScore}</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-indigo-600 font-black text-sm shadow-md">
              {percent}%
            </div>
          </div>
        </div>
      </div>

      {/* CHI TIẾT BÀI LÀM TỪNG CÂU */}
      {res.answers && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Chi tiết bài làm từng câu</h2>

          {res.answers.map((a: any, i: number) => {
            const earned = a.points_earned ?? a.earned_points ?? a.score ?? 0;
            const maxPts = a.points ?? a.max_points ?? 1;
            const isCorrect = a.is_correct;

            return (
              <div key={a.question_id || i} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white shrink-0 mt-0.5">
                      #{i + 1}
                    </span>
                    <p className="text-xs font-bold text-slate-800 leading-relaxed">{a.content}</p>
                  </div>

                  {/* HIỂN THỊ CHÍNH XÁC BADGE */}
                  <div className="shrink-0">
                    {isCorrect === true && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                        ✓ Đúng ({earned}/{maxPts} đ)
                      </span>
                    )}

                    {isCorrect === false && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700 border border-rose-200">
                        ✕ Sai ({earned}/{maxPts} đ)
                      </span>
                    )}

                    {(isCorrect === null || isCorrect === undefined) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 border border-amber-200/80">
                        ⏳ Chờ giảng viên chấm ({earned}/{maxPts} đ)
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bạn trả lời:</span>
                  <div className="text-xs font-semibold text-slate-800 whitespace-pre-wrap">
                    {renderUserAnswer(a)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}