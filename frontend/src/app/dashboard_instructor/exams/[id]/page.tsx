"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getExam, listQuestions, updateExam } from "@/src/actions/exam";
import { createQuestion, deleteQuestion, getBankQuestions, QuestionPayload } from "@/src/actions/question";
import { errMsg } from "@/src/lib/api";
import { Exam, Question, QuestionType } from "@/src/types/exam";

// Danh mục loại câu hỏi cho Modal soạn trực tiếp
const QUESTION_CATEGORIES = [
  {
    category: "Trắc nghiệm",
    types: [
      { key: "single_choice", label: "1 Đáp án", desc: "Chọn 1 đáp án đúng duy nhất" },
      { key: "multiple_select", label: "Nhiều đáp án", desc: "Chọn một hoặc nhiều đáp án đúng" },
      { key: "true_false", label: "Đúng / Sai", desc: "Đánh giá các mệnh đề Đúng hay Sai" },
    ],
  },
  {
    category: "Điền khuyết",
    types: [
      { key: "fill_blank_text", label: "Nhập chữ", desc: "Sinh viên tự gõ câu trả lời vào ô" },
      { key: "fill_blank_select", label: "Chọn trắc nghiệm", desc: "Sinh viên chọn đáp án từ menu thả xuống" },
    ],
  },
  {
    category: "Tự luận",
    types: [
      { key: "essay", label: "Viết tự luận", desc: "Sinh viên gõ bài làm tự luận dài" },
    ],
  },
];

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedPin, setCopiedPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // --- 1. MODAL CHỌN CÂU HỎI TỪ NGÂN HÀNG ---
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);

  // --- 2. MODAL SOẠN CÂU HỎI MỚI TRỰC TIẾP ---
  const [isInlineModalOpen, setIsInlineModalOpen] = useState(false);
  const [formType, setFormType] = useState<string>("single_choice");
  const [formContent, setFormContent] = useState("");
  const [formPoints, setFormPoints] = useState<number>(1);

  // States đáp án cho Soạn trực tiếp
  const [options, setOptions] = useState([
    { id: "opt_1", text: "", isCorrect: true },
    { id: "opt_2", text: "", isCorrect: false },
  ]);
  const [statements, setStatements] = useState([
    { id: "stmt_1", text: "", isCorrect: true },
  ]);
  const [textBlanks, setTextBlanks] = useState([{ id: "blank_1", correctAnswers: "" }]);
  const [selectBlanks, setSelectBlanks] = useState([
    { id: "blank_1", optionsText: "Đáp án A, Đáp án B", correctAnswer: "Đáp án A" },
  ]);
  const [sampleAnswer, setSampleAnswer] = useState("");

  // LOAD THÔNG TIN ĐỀ THI & CÂU HỎI
  const loadExamDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [examData, questionsData] = await Promise.all([
        getExam(id),
        listQuestions(id),
      ]);
      setExam(examData);
      setQuestions((questionsData || []) as unknown as Question[]);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadExamDetail();
  }, [loadExamDetail]);

  // CẬP NHẬT CẤU HÌNH ĐỀ THI (Status, Allow Review)
  async function patchExam(payload: Partial<Exam>) {
    if (!exam) return;
    try {
      const updated = await updateExam(id, payload);
      setExam(updated);
    } catch (err) {
      alert(errMsg(err));
    }
  }

  // SAO CHÉP MÃ PIN
  function handleCopyPin() {
    if (!exam?.access_code) return;
    navigator.clipboard.writeText(exam.access_code);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  }

  // --- LOGIC NGÂN HÀNG CÂU HỎI ---
  const fetchBankQuestions = useCallback(async () => {
    setBankLoading(true);
    try {
      const data = await getBankQuestions({ search: bankSearch });
      setBankQuestions(data || []);
    } catch (err) {
      alert(errMsg(err));
    } finally {
      setBankLoading(false);
    }
  }, [bankSearch]);

  useEffect(() => {
    if (isBankModalOpen) {
      fetchBankQuestions();
    }
  }, [isBankModalOpen, fetchBankQuestions]);

  function toggleSelectBankQuestion(qId: string) {
    setSelectedBankIds((prev) =>
      prev.includes(qId) ? prev.filter((item) => item !== qId) : [...prev, qId]
    );
  }

  // Thêm các câu hỏi đã chọn từ ngân hàng vào đề thi
  async function handleAddFromBank() {
    if (selectedBankIds.length === 0) return;
    setSubmitting(true);
    try {
      for (const bqId of selectedBankIds) {
        const bq: any = bankQuestions.find(
          (q: any) => (q.id || q.question_id) === bqId
        );
        if (bq) {
          await createQuestion({
            exam_id: id,
            question_type: bq.type || bq.question_type || "single_choice",
            content: bq.title || bq.content || "",
            points: bq.points || 1,
            data: bq.data || null,
          });
        }
      }
      setIsBankModalOpen(false);
      setSelectedBankIds([]);
      await loadExamDetail();
    } catch (err) {
      alert(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  // --- LOGIC SOẠN CÂU HỎI MỚI INLINE ---
  function resetInlineForm() {
    setFormContent("");
    setFormPoints(1);
    setFormType("single_choice");
    setOptions([
      { id: "opt_1", text: "", isCorrect: true },
      { id: "opt_2", text: "", isCorrect: false },
    ]);
    setStatements([{ id: "stmt_1", text: "", isCorrect: true }]);
    setTextBlanks([{ id: "blank_1", correctAnswers: "" }]);
    setSelectBlanks([{ id: "blank_1", optionsText: "Đáp án A, Đáp án B", correctAnswer: "Đáp án A" }]);
    setSampleAnswer("");
  }

  async function handleAddInlineQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!formContent.trim()) {
      alert("Vui lòng nhập nội dung câu hỏi!");
      return;
    }

    let questionData: Record<string, any> = {};

    if (formType === "single_choice" || formType === "multiple_select") {
      questionData.options = options.map((opt) => ({
        id: opt.id,
        text: opt.text,
        isCorrect: opt.isCorrect,
      }));
    } else if (formType === "true_false") {
      questionData.statements = statements.map((stmt) => ({
        id: stmt.id,
        text: stmt.text,
        isCorrect: stmt.isCorrect,
      }));
    } else if (formType === "fill_blank_text") {
      questionData.mode = "text";
      questionData.blanks = textBlanks.map((b) => ({
        id: b.id,
        correctAnswers: b.correctAnswers.split(",").map((s) => s.trim()).filter(Boolean),
      }));
    } else if (formType === "fill_blank_select") {
      questionData.mode = "select";
      questionData.blanks = selectBlanks.map((b) => {
        const opts = b.optionsText.split(",").map((s) => s.trim()).filter(Boolean);
        return {
          id: b.id,
          options: opts,
          correctAnswer: b.correctAnswer || opts[0] || "",
        };
      });
    } else if (formType === "essay") {
      questionData.sample_answer = sampleAnswer;
    }

    const backendType = formType.startsWith("fill_blank") ? "fill_blank" : formType;

    const payload: QuestionPayload = {
      exam_id: id,
      question_type: backendType,
      content: formContent.trim(),
      points: Number(formPoints),
      data: questionData,
    };

    setSubmitting(true);
    try {
      await createQuestion(payload);
      setIsInlineModalOpen(false);
      resetInlineForm();
      await loadExamDetail();
    } catch (err) {
      alert(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  // XÓA CÂU HỎI KHỎI ĐỀ THI
  async function handleRemoveQuestion(qid: string) {
    if (!confirm("Bạn có chắc chắn muốn xóa câu hỏi này khỏi đề thi?")) return;
    try {
      await deleteQuestion(qid);
      setQuestions((prev) => prev.filter((q: any) => (q.id || q.question_id) !== qid));
    } catch (err) {
      alert(errMsg(err));
    }
  }

  // Tính tổng điểm
  const totalPoints = questions.reduce((acc, q) => acc + (q.points || 1), 0);

  if (loading) {
    return (
      <div className="py-16 text-center text-xs font-bold text-slate-400">
        Đang tải thông tin đề thi...
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center">
        <p className="text-xs font-bold text-rose-600">{error || "Không tìm thấy đề thi."}</p>
        <button
          onClick={() => router.push("/dashboard_instructor")}
          className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
        >
          Quay lại Bảng điều khiển
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6 px-4">
      {/* HEADER PAGE */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard_instructor"
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              ← Bảng điều khiển
            </Link>
            <span className="text-xs text-slate-300">•</span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                exam.status_id === "PUBLISHED"
                  ? "bg-emerald-100 text-emerald-700"
                  : exam.status_id === "CLOSED"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {exam.status_id === "PUBLISHED"
                ? "Đang mở thi"
                : exam.status_id === "CLOSED"
                ? "Đã đóng"
                : "Bản nháp"}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900">{exam.exam_name}</h1>
          <p className="text-xs font-medium text-slate-500">
            Thời gian làm bài: <b>{exam.duration_minutes} phút</b>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard_instructor/exams/${id}/grading`}
            className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs"
          >
            📊 Chấm bài & Kết quả
          </Link>
        </div>
      </div>

      {/* BLOCK 1: THÔNG TIN VÀ CHUYỂN TRẠNG THÁI */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500">Mã PIN tham gia phòng thi:</span>
            <span className="font-mono text-lg font-black tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-100">
              {exam.access_code}
            </span>
            <button
              onClick={handleCopyPin}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              {copiedPin ? "✓ Đã sao chép" : "Sao chép"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {exam.status_id !== "PUBLISHED" && (
              <button
                onClick={() => patchExam({ status_id: "PUBLISHED" })}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
              >
                ▶ Mở đề thi
              </button>
            )}
            {exam.status_id === "PUBLISHED" && (
              <button
                onClick={() => patchExam({ status_id: "CLOSED" })}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition"
              >
                ⏸ Đóng đề thi
              </button>
            )}
            {exam.status_id !== "DRAFT" && (
              <button
                onClick={() => patchExam({ status_id: "DRAFT" })}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                Chuyển về Nháp
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="reviewToggle"
            checked={exam.allow_review_answers}
            onChange={(e) => patchExam({ allow_review_answers: e.target.checked })}
            className="h-4 w-4 rounded-md accent-indigo-600"
          />
          <label htmlFor="reviewToggle" className="text-xs font-medium text-slate-700 cursor-pointer">
            Cho phép sinh viên xem lại đáp án & lời giải sau khi nộp bài
          </label>
        </div>
      </div>

      {/* BLOCK 2: QUẢN LÝ CÂU HỎI TRONG ĐỀ THI */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-2">
              Danh sách câu hỏi ({questions.length} câu)
            </h2>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              Tổng điểm đề thi: <b className="text-indigo-600">{totalPoints} điểm</b>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBankModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
            >
              📚 Chọn từ Ngân hàng
            </button>
            <button
              type="button"
              onClick={() => setIsInlineModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700 active:scale-95 transition"
            >
              ✍️ Soạn câu hỏi mới
            </button>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-500">Chưa có câu hỏi nào trong đề thi này.</p>
            <p>Bấm <b>&quot;Chọn từ Ngân hàng&quot;</b> hoặc <b>&quot;Soạn câu hỏi mới&quot;</b> để thêm.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q: any, idx) => {
              const qId = q.id || q.question_id;
              const qTitle = q.title || q.content;
              const qType = q.type || q.question_type;
              const qPoints = q.points || 1;

              return (
                <div
                  key={qId}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-2 hover:border-indigo-200 hover:bg-white transition shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white">
                          #{idx + 1}
                        </span>
                        <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">
                          {qType}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          · {qPoints} điểm
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-800">{qTitle}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qId)}
                      className="text-xs font-bold text-rose-500 hover:underline shrink-0"
                    >
                      Xóa
                    </button>
                  </div>

                  {/* Hiển thị gợi ý lựa chọn đáp án */}
                  {(qType === "single_choice" || qType === "multiple_select" || qType === QuestionType.SINGLE_CHOICE || qType === QuestionType.MULTIPLE_CHOICE) && (
                    <ul className="mt-2 list-disc pl-6 text-xs space-y-1 text-slate-600">
                      {(q.options || q.data?.options)?.map((o: any, k: number) => (
                        <li
                          key={k}
                          className={o.isCorrect || k === q.data?.correct ? "font-bold text-emerald-600" : ""}
                        >
                          {typeof o === "string" ? o : o.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL 1: CHỌN CÂU HỎI TỪ NGÂN HÀNG */}
      {/* ================================================================= */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Chọn câu hỏi từ Ngân hàng
                </h3>
                <p className="text-[11px] text-slate-400">
                  Đã tích chọn {selectedBankIds.length} câu hỏi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBankModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-slate-50/50 border-b border-slate-100">
              <input
                type="text"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                placeholder="Tìm kiếm nội dung câu hỏi trong ngân hàng..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {bankLoading ? (
                <div className="py-8 text-center text-xs font-bold text-slate-400">
                  Đang tải danh sách câu hỏi...
                </div>
              ) : bankQuestions.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Không tìm thấy câu hỏi phù hợp.
                </div>
              ) : (
                bankQuestions.map((q: any) => {
                  const qId = q.id || q.question_id;
                  const isChecked = selectedBankIds.includes(qId);

                  return (
                    <label
                      key={qId}
                      onClick={() => toggleSelectBankQuestion(qId)}
                      className={`flex items-start gap-3 rounded-2xl p-3 border cursor-pointer transition ${
                        isChecked
                          ? "border-indigo-600 bg-indigo-50/40"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 h-4 w-4 accent-indigo-600 shrink-0"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">
                            {q.type || q.question_type}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">
                            · {q.points || 1} điểm
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          {q.title || q.content}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
              <button
                type="button"
                onClick={() => setIsBankModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={submitting || selectedBankIds.length === 0}
                onClick={handleAddFromBank}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? "Đang thêm..." : `Thêm vào đề thi (${selectedBankIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: SOẠN CÂU HỎI MỚI TRỰC TIẾP */}
      {/* ================================================================= */}
      {isInlineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-indigo-100 bg-white p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold border border-indigo-100">
                  ✍️
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    Soạn câu hỏi mới vào đề
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Thêm trực tiếp câu hỏi mới vào đề thi hiện tại
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsInlineModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddInlineQuestion} className="space-y-6">
              {/* Chọn loại câu hỏi */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">1</span>
                  Chọn loại câu hỏi
                </label>

                <div className="grid gap-4 sm:grid-cols-3">
                  {QUESTION_CATEGORIES.map((cat) => (
                    <div key={cat.category} className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3">
                      <p className="text-[11px] font-black uppercase text-slate-400 border-b border-slate-200/60 pb-1">
                        {cat.category}
                      </p>
                      <div className="space-y-1.5">
                        {cat.types.map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => setFormType(t.key)}
                            className={`w-full text-left rounded-xl p-2.5 transition border ${
                              formType === t.key
                                ? "border-indigo-600 bg-white text-indigo-950 shadow-xs ring-2 ring-indigo-500/10"
                                : "border-transparent hover:bg-white/80 text-slate-600"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold">{t.label}</span>
                              {formType === t.key && (
                                <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{t.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nội dung & Thang điểm */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">2</span>
                  Nội dung câu hỏi
                </label>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-3">
                    <textarea
                      required
                      rows={3}
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      placeholder="Nhập nội dung câu hỏi (Dùng [___] để làm ô điền khuyết nếu có)..."
                      className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50/50 p-3.5 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition shadow-inner"
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-center flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Thang điểm</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      value={formPoints}
                      onChange={(e) => setFormPoints(parseFloat(e.target.value) || 1)}
                      className="w-full text-center rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm font-black text-indigo-600 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Cấu hình đáp án */}
              <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 sm:p-5">
                <label className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">3</span>
                  Thiết lập đáp án đúng
                </label>

                {(formType === "single_choice" || formType === "multiple_select") && (
                  <div className="space-y-2.5">
                    {options.map((opt, idx) => (
                      <div key={opt.id} className="flex items-center gap-2.5 rounded-xl bg-white p-2 border border-slate-200/80 shadow-2xs">
                        <input
                          type={formType === "single_choice" ? "radio" : "checkbox"}
                          name="correct_opt"
                          checked={opt.isCorrect}
                          onChange={(e) => {
                            if (formType === "single_choice") {
                              setOptions(options.map((o) => ({ ...o, isCorrect: o.id === opt.id })));
                            } else {
                              setOptions(options.map((o) => o.id === opt.id ? { ...o, isCorrect: e.target.checked } : o));
                            }
                          }}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        <input
                          type="text"
                          required
                          value={opt.text}
                          onChange={(e) => setOptions(options.map((o) => o.id === opt.id ? { ...o, text: e.target.value } : o))}
                          placeholder={`Lựa chọn ${idx + 1}`}
                          className="flex-1 bg-transparent text-xs font-medium text-slate-800 outline-none"
                        />
                        {options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setOptions(options.filter((o) => o.id !== opt.id))}
                            className="text-xs text-rose-500 font-bold px-2 hover:underline"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setOptions([...options, { id: `opt_${Date.now()}`, text: "", isCorrect: false }])}
                      className="text-xs font-bold text-indigo-600 hover:underline pt-1 inline-flex items-center gap-1"
                    >
                      + Thêm lựa chọn
                    </button>
                  </div>
                )}

                {formType === "true_false" && (
                  <div className="space-y-2">
                    {statements.map((stmt, idx) => (
                      <div key={stmt.id} className="flex items-center gap-2 rounded-xl bg-white p-2 border border-slate-200/80 shadow-2xs">
                        <input
                          type="text"
                          required
                          value={stmt.text}
                          onChange={(e) => setStatements(statements.map((s) => s.id === stmt.id ? { ...s, text: e.target.value } : s))}
                          placeholder={`Mệnh đề ${idx + 1}`}
                          className="flex-1 bg-transparent text-xs font-medium text-slate-800 outline-none"
                        />
                        <select
                          value={stmt.isCorrect ? "true" : "false"}
                          onChange={(e) => setStatements(statements.map((s) => s.id === stmt.id ? { ...s, isCorrect: e.target.value === "true" } : s))}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-indigo-900"
                        >
                          <option value="true">ĐÚNG</option>
                          <option value="false">SAI</option>
                        </select>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setStatements([...statements, { id: `stmt_${Date.now()}`, text: "", isCorrect: true }])}
                      className="text-xs font-bold text-indigo-600 hover:underline pt-1"
                    >
                      + Thêm mệnh đề
                    </button>
                  </div>
                )}

                {formType === "fill_blank_text" && (
                  <div className="space-y-3">
                    {textBlanks.map((b, idx) => (
                      <div key={b.id} className="rounded-xl bg-white p-3 border border-slate-200/80 space-y-1.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-600 block">
                            Ô khuyết #{idx + 1} (Các từ chấp nhận đúng, phân cách bởi dấu phẩy)
                          </label>
                          {textBlanks.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setTextBlanks(textBlanks.filter((item) => item.id !== b.id))}
                              className="text-xs text-rose-500 font-bold hover:underline"
                            >
                              Xóa ô
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          required
                          value={b.correctAnswers}
                          onChange={(e) => setTextBlanks(textBlanks.map((item) => item.id === b.id ? { ...item, correctAnswers: e.target.value } : item))}
                          placeholder="VD: Hà Nội, Ha Noi, HaNoi"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTextBlanks([...textBlanks, { id: `blank_${Date.now()}`, correctAnswers: "" }])}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      + Thêm ô khuyết nhập từ
                    </button>
                  </div>
                )}

                {formType === "fill_blank_select" && (
                  <div className="space-y-3">
                    {selectBlanks.map((b, idx) => (
                      <div key={b.id} className="rounded-xl bg-white p-3 border border-slate-200/80 space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold text-indigo-900">
                            Ô khuyết #{idx + 1} (Danh sách lựa chọn)
                          </p>
                          {selectBlanks.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setSelectBlanks(selectBlanks.filter((item) => item.id !== b.id))}
                              className="text-xs text-rose-500 font-bold hover:underline"
                            >
                              Xóa ô
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          required
                          value={b.optionsText}
                          onChange={(e) => setSelectBlanks(selectBlanks.map((item) => item.id === b.id ? { ...item, optionsText: e.target.value } : item))}
                          placeholder="VD: Hà Nội, Sài Gòn, Đà Nẵng"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                        />
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[11px] font-bold text-slate-600">Đáp án đúng chính xác:</span>
                          <input
                            type="text"
                            required
                            value={b.correctAnswer}
                            onChange={(e) => setSelectBlanks(selectBlanks.map((item) => item.id === b.id ? { ...item, correctAnswer: e.target.value } : item))}
                            placeholder="Nhập 1 giá trị khớp với danh sách trên"
                            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectBlanks([...selectBlanks, { id: `blank_${Date.now()}`, optionsText: "Đáp án A, Đáp án B", correctAnswer: "Đáp án A" }])}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      + Thêm ô khuyết trắc nghiệm
                    </button>
                  </div>
                )}

                {formType === "essay" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 block">
                      Đáp án gợi ý / Thang hướng dẫn chấm (Không bắt buộc)
                    </label>
                    <textarea
                      rows={2}
                      value={sampleAnswer}
                      onChange={(e) => setSampleAnswer(e.target.value)}
                      placeholder="Nhập gợi ý chấm điểm..."
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons Inline Form */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsInlineModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/35 active:scale-95 disabled:opacity-50 transition"
                >
                  {submitting ? "Đang xử lý..." : "Đưa vào đề thi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}