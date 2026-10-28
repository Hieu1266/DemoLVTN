"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAttempt, saveDraft, submitAttempt } from "@/src/actions/exam";
import { errMsg } from "@/src/lib/api";

const fmtTime = (s: number) => {
  if (isNaN(s) || s < 0) return "00:00";
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export default function TakeExamPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const router = useRouter();

  const [attempt, setAttempt] = useState<any | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [left, setLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const answersRef = useRef(answers);
  const done = useRef(false);

  // Luôn giữ answersRef đồng bộ với state mới nhất
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Key lưu trữ LocalStorage theo từng lượt thi
  const storageKey = attemptId ? `exam_answers_${attemptId}` : "";

  // 1. TẢI DỮ LIỆU ĐỀ THI & TRỘN ĐÁP ÁN TỪ LOCALSTORAGE + SERVER
  useEffect(() => {
    if (!attemptId) return;
    getAttempt(attemptId)
      .then((a) => {
        setAttempt(a);

        // A. Lấy đáp án từ Server
        const serverSaved = a.saved_answers || a.draft_answers || {};

        // B. Lấy đáp án sao lưu ở LocalStorage trình duyệt
        let localSaved = {};
        try {
          const raw = localStorage.getItem(`exam_answers_${attemptId}`);
          if (raw) localSaved = JSON.parse(raw);
        } catch (e) {
          console.warn("Lỗi đọc đáp án từ LocalStorage:", e);
        }

        // C. Ưu tiên gộp dữ liệu (LocalStorage đè Server nếu mới hơn)
        const mergedAnswers = { ...serverSaved, ...localSaved };

        setAnswers(mergedAnswers);
        answersRef.current = mergedAnswers;
      })
      .catch((e) => setError(errMsg(e)));
  }, [attemptId]);

  // 2. CẬP NHẬT ĐÁP ÁN TỨC THÌ (LƯU LOCALSTORAGE & GỬI DRAFT)
  const updateAnswer = useCallback((qId: string, val: any) => {
    setAnswers((prev) => {
      const next = { ...prev, [qId]: val };
      answersRef.current = next;

      // A. Lưu ngay vào LocalStorage để chống mất dữ liệu khi reload
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch (e) {
          console.warn("Lỗi ghi LocalStorage:", e);
        }
      }

      // B. Tự động lưu nháp về Server ngay lập tức (không chờ 30s)
      if (attemptId && !done.current) {
        saveDraft(attemptId, { answers: next }).catch(() => {});
      }

      return next;
    });
  }, [attemptId, storageKey]);

  // 3. NỘP BÀI THI
  const submit = useCallback(async () => {
    if (done.current) return;
    done.current = true;
    setSubmitting(true);
    setError("");

    try {
      const payload = { answers: answersRef.current };
      await submitAttempt(attemptId, payload);

      // Xóa cache LocalStorage sau khi nộp bài thành công
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }

      router.replace(`/dashboard_student/results/${attemptId}`);
    } catch (e) {
      done.current = false;
      setSubmitting(false);
      setError(errMsg(e));
    }
  }, [attemptId, router, storageKey]);

  // 4. ĐẾM NGƯỢC THỜI GIAN
  useEffect(() => {
    if (!attempt) return;

    let endTimeMs = 0;
    if (attempt.ends_at) {
      endTimeMs = new Date(attempt.ends_at).getTime();
    }
    
    if (!endTimeMs || isNaN(endTimeMs)) {
      const startTime = attempt.started_at ? new Date(attempt.started_at).getTime() : Date.now();
      const durationMs = (attempt.duration_minutes || 60) * 60 * 1000;
      endTimeMs = startTime + durationMs;
    }

    const tick = () => {
      const remainingSeconds = Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000));
      setLeft(remainingSeconds);

      if (remainingSeconds === 0 && !done.current) {
        submit(); // Tự động nộp bài khi hết giờ
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [attempt, submit]);

  // 5. TỰ ĐỘNG LƯU NHÁP ĐỊNH KỲ (DỰ PHÒNG MỖI 30 GIÂY)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!done.current && attemptId && Object.keys(answersRef.current).length > 0) {
        saveDraft(attemptId, { answers: answersRef.current }).catch(() => {});
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [attemptId]);

  if (!attempt) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        {error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-xs font-bold text-rose-600 shadow-2xs">
            {error}
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-400 animate-pulse">Đang chuẩn bị đề thi...</p>
        )}
      </div>
    );
  }

  const questionsList = attempt.questions || [];
  
  // Đếm số câu sinh viên đã hoàn thành
  const answeredCount = questionsList.filter((q: any) => {
    const qId = String(q.question_id || q.id || "");
    const ans = answers[qId];
    if (ans === undefined || ans === null || ans === "") return false;
    if (Array.isArray(ans) && ans.length === 0) return false;
    return true;
  }).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6 px-4">
      {/* HEADER TỔNG QUAN & ĐẾM NGƯỢC */}
      <div className="sticky top-4 z-40 flex items-center justify-between rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-lg backdrop-blur-md">
        <div className="space-y-0.5">
          <h1 className="text-base font-black text-slate-900">{attempt.exam_name}</h1>
          <p className="text-[11px] font-semibold text-slate-400">
            Đã làm: <span className="font-bold text-indigo-600">{answeredCount}</span> / {questionsList.length} câu
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Thời gian còn lại</span>
            <span
              className={`font-mono text-xl font-black ${
                left !== null && left < 60 ? "text-rose-600 animate-pulse" : "text-indigo-600"
              }`}
            >
              {left === null ? "--:--" : fmtTime(left)}
            </span>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              if (confirm(`Bạn đã làm ${answeredCount}/${questionsList.length} câu. Bạn có chắc chắn muốn nộp bài ngay?`)) {
                submit();
              }
            }}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/35 active:scale-95 disabled:opacity-50 transition"
          >
            {submitting ? "Đang nộp..." : "Nộp bài thi"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-600">
          {error}
        </div>
      )}

      {/* DANH SÁCH CÂU HỎI */}
      <div className="space-y-5">
        {questionsList.map((q: any, i: number) => {
          const qId = String(q.question_id || q.id || "");
          const qType = (q.question_type || q.type || "single_choice").toLowerCase();
          const qContent = q.content || q.title;
          const qOptions = q.options || q.data?.options || [];
          const currentAns = answers[qId];

          return (
            <div
              key={qId || i}
              className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-4"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white shrink-0 mt-0.5">
                  #{i + 1}
                </span>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    ({q.points || 1} điểm)
                  </span>
                  <p className="text-xs font-bold text-slate-800 leading-relaxed">{qContent}</p>
                </div>
              </div>

              {/* A. TRẮC NGHIỆM 1 ĐÁP ÁN (single_choice) */}
              {(qType === "single_choice" || qType === "single_select") && (
                <div className="space-y-2 pt-1">
                  {qOptions.map((o: any, k: number) => {
                    const optText = typeof o === "string" ? o : o?.text || "";
                    const optVal = typeof o === "object" && o?.id !== undefined ? String(o.id) : String(k);
                    
                    const isChecked = 
                      currentAns === optVal || 
                      currentAns === String(k) || 
                      currentAns === optText;

                    return (
                      <label
                        key={k}
                        className={`flex items-center gap-3 rounded-2xl p-3.5 border cursor-pointer transition ${
                          isChecked
                            ? "border-indigo-600 bg-indigo-50/60 font-bold text-indigo-950 shadow-2xs"
                            : "border-slate-200 bg-slate-50/50 hover:bg-white text-slate-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name={qId}
                          checked={isChecked}
                          onChange={() => updateAnswer(qId, optVal)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        <span className="text-xs">
                          <b>{String.fromCharCode(65 + k)}.</b> {optText}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* B. TRẮC NGHIỆM NHIỀU ĐÁP ÁN (multiple_select) */}
              {(qType === "multiple_select" || qType === "multiple_choice") && (
                <div className="space-y-2 pt-1">
                  {qOptions.map((o: any, k: number) => {
                    const optText = typeof o === "string" ? o : o?.text || "";
                    const optVal = typeof o === "object" && o?.id !== undefined ? String(o.id) : String(k);
                    const selectedList: string[] = Array.isArray(currentAns) ? currentAns : [];
                    const isChecked = selectedList.includes(optVal) || selectedList.includes(String(k));

                    return (
                      <label
                        key={k}
                        className={`flex items-center gap-3 rounded-2xl p-3.5 border cursor-pointer transition ${
                          isChecked
                            ? "border-indigo-600 bg-indigo-50/60 font-bold text-indigo-950 shadow-2xs"
                            : "border-slate-200 bg-slate-50/50 hover:bg-white text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...selectedList, optVal]
                              : selectedList.filter((v) => v !== optVal && v !== String(k));
                            updateAnswer(qId, updated);
                          }}
                          className="h-4 w-4 accent-indigo-600 rounded-md"
                        />
                        <span className="text-xs">
                          <b>{String.fromCharCode(65 + k)}.</b> {optText}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* C. ĐIỀN KHUYẾT (TỰ ĐỘNG PHÂN BIỆT NHẬP TAY VS CHỌN TRẮC NGHIỆM) */}
              {(qType.includes("fill") || qType.includes("blank")) && (
                <div className="pt-1 space-y-3">
                  {(() => {
                    const qData = q.data || {};
                    const blanks = qData.blanks || [];

                    // Kiểm tra xem có phải dạng CHỌN TRẮC NGHIỆM (SELECT MODE) không
                    const isSelectMode =
                      qType === "fill_blank_select" ||
                      qData.mode === "select" ||
                      blanks.some(
                        (b: any) =>
                          (b.options && b.options.length > 0) || b.optionsText
                      );

                    // 🔴 DẠNG 1: CHỌN TRẮC NGHIỆM -> RENDER MENU THẢ XUỐNG (<select>)
                    if (isSelectMode) {
                      const blanksToRender =
                        blanks.length > 0
                          ? blanks
                          : [
                              {
                                id: "blank_1",
                                options: q.options || qData.options || [],
                              },
                            ];

                      return (
                        <div className="space-y-3">
                          <p className="text-[11px] font-bold text-indigo-900">
                            Chọn đáp án thích hợp từ danh sách bên dưới:
                          </p>
                          {blanksToRender.map((b: any, bIdx: number) => {
                            let rawOpts =
                              b.options ||
                              b.optionsText ||
                              q.options ||
                              qData.options ||
                              [];
                            let optionsList: string[] = [];

                            if (Array.isArray(rawOpts)) {
                              optionsList = rawOpts.map((opt: any) =>
                                typeof opt === "string"
                                  ? opt
                                  : opt.text || String(opt)
                              );
                            } else if (typeof rawOpts === "string") {
                              optionsList = rawOpts
                                .split(",")
                                .map((s: string) => s.trim())
                                .filter(Boolean);
                            }

                            const currentVal =
                              typeof currentAns === "object" &&
                              currentAns !== null
                                ? currentAns[b.id] || ""
                                : typeof currentAns === "string"
                                ? currentAns
                                : "";

                            return (
                              <div
                                key={b.id || bIdx}
                                className="flex flex-col sm:flex-row sm:items-center gap-2.5 rounded-2xl bg-slate-50 p-3.5 border border-slate-200"
                              >
                                {blanksToRender.length > 1 && (
                                  <span className="text-xs font-bold text-indigo-950 shrink-0">
                                    Ô chọn #{bIdx + 1}:
                                  </span>
                                )}
                                <select
                                  value={currentVal}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (blanksToRender.length > 1) {
                                      const prevObj =
                                        typeof currentAns === "object" &&
                                        currentAns !== null
                                          ? currentAns
                                          : {};
                                      updateAnswer(qId, {
                                        ...prevObj,
                                        [b.id]: val,
                                      });
                                    } else {
                                      updateAnswer(qId, val);
                                    }
                                  }}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-indigo-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10 transition cursor-pointer"
                                >
                                  <option value="">
                                    -- Click để chọn đáp án --
                                  </option>
                                  {optionsList.map(
                                    (optStr: string, optIdx: number) => (
                                      <option key={optIdx} value={optStr}>
                                        {optStr}
                                      </option>
                                    )
                                  )}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    // 🔴 DẠNG 2: ĐIỀN KHUYẾT NHẬP CHỮ -> RENDER Ô NHẬP VĂN BẢN (<input>)
                    return (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-indigo-900">
                          Nhập câu trả lời điền vào chỗ trống:
                        </p>
                        <input
                          type="text"
                          value={
                            typeof currentAns === "string" ? currentAns : ""
                          }
                          onChange={(e) => updateAnswer(qId, e.target.value)}
                          placeholder="Gõ đáp án của bạn vào đây..."
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
                        />
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* D. ĐÚNG / SAI (true_false) */}
              {qType === "true_false" && (
                <div className="flex items-center gap-4 pt-1">
                  {["TRUE", "FALSE"].map((tfVal) => (
                    <label
                      key={tfVal}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-2xl p-3.5 border cursor-pointer text-xs font-bold transition ${
                        currentAns === tfVal
                          ? "border-indigo-600 bg-indigo-50/60 text-indigo-950 shadow-2xs"
                          : "border-slate-200 bg-slate-50/50 hover:bg-white text-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name={qId}
                        checked={currentAns === tfVal}
                        onChange={() => updateAnswer(qId, tfVal)}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      {tfVal === "TRUE" ? "ĐÚNG" : "SAI"}
                    </label>
                  ))}
                </div>
              )}

              {/* E. TỰ LUẬN (essay) */}
              {qType === "essay" && (
                <div className="pt-1">
                  <textarea
                    rows={4}
                    value={typeof currentAns === "string" ? currentAns : ""}
                    onChange={(e) => updateAnswer(qId, e.target.value)}
                    placeholder="Nhập câu trả lời tự luận chi tiết tại đây..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}