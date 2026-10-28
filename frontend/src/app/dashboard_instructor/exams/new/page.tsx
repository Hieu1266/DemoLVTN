"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createExam, ExamPayload } from "@/src/actions/exam";
import { getBankQuestions, QuestionPayload } from "@/src/actions/question";
import { errMsg } from "@/src/lib/api";
import { Question } from "@/src/types/exam";
import BankQuestionModal from "@/src/components/BankQuestionSelectModal";

// Hàm sinh mã PIN ngẫu nhiên 6 ký tự
function generateRandomAccessCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Danh mục loại câu hỏi
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

interface SelectBlankOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface SelectBlankItem {
  id: string;
  options: SelectBlankOption[];
}

interface ExamQuestionItem {
  tempId: string;
  isBank: boolean;
  bankId?: string;
  title: string;
  type: string;
  points: number;
  inlinePayload?: QuestionPayload;
}

export default function CreateExamPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // 1. Cấu hình Đề thi
  const [examName, setExamName] = useState("");
  const [accessCode, setAccessCode] = useState(() => generateRandomAccessCode(6));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [allowReview, setAllowReview] = useState(true);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [minDateTime, setMinDateTime] = useState("");

  useEffect(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setMinDateTime(now.toISOString().slice(0, 16));
  }, []);

  // 2. Danh sách câu hỏi trong đề
  const [examQuestions, setExamQuestions] = useState<ExamQuestionItem[]>([]);

  // 3. Modal Ngân hàng câu hỏi
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [tempSelectedBankIds, setTempSelectedBankIds] = useState<string[]>([]);

  // 4. Modal Soạn câu hỏi trực tiếp (Inline)
  const [isInlineModalOpen, setIsInlineModalOpen] = useState(false);
  const [formType, setFormType] = useState<string>("single_choice");
  const [formContent, setFormContent] = useState("");
  const [formPoints, setFormPoints] = useState<number>(1);

  // State đáp án Inline
  const [options, setOptions] = useState([
    { id: "opt_1", text: "", isCorrect: true },
    { id: "opt_2", text: "", isCorrect: false },
  ]);
  const [statements, setStatements] = useState([
    { id: "stmt_1", text: "", isCorrect: true },
  ]);
  const [textBlanks, setTextBlanks] = useState([{ id: "blank_1", correctAnswers: "" }]);
  
  // STATE ĐIỀN KHUYẾT TRẮC NGHIỆM: Mỗi ô điền khuyết có bộ trắc nghiệm riêng
  const [selectBlanks, setSelectBlanks] = useState<SelectBlankItem[]>([
    {
      id: "blank_1",
      options: [
        { id: "opt_1_1", text: "", isCorrect: true },
        { id: "opt_1_2", text: "", isCorrect: false },
      ],
    },
  ]);
  const [sampleAnswer, setSampleAnswer] = useState("");

  function handleRegenerateAccessCode() {
    setAccessCode(generateRandomAccessCode(6));
  }

  // LOGIC NGÂN HÀNG CÂU HỎI
  const loadBankQuestions = useCallback(async () => {
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
      loadBankQuestions();
    }
  }, [isBankModalOpen, loadBankQuestions]);

  function handleOpenBankModal() {
    const existingBankIds = examQuestions
      .filter((q) => q.isBank && q.bankId)
      .map((q) => q.bankId as string);
    setTempSelectedBankIds(existingBankIds);
    setIsBankModalOpen(true);
  }

  function handleConfirmBankSelection() {
    const inlineItems = examQuestions.filter((q) => !q.isBank);
    const newBankItems: ExamQuestionItem[] = bankQuestions
      .filter((q: any) => tempSelectedBankIds.includes(q.id || q.question_id))
      .map((q: any) => {
        const id = q.id || q.question_id;
        return {
          tempId: `bank_${id}`,
          isBank: true,
          bankId: id,
          title: q.title || q.content || "",
          type: q.type || q.question_type || "single_choice",
          points: q.points || 1,
        };
      });

    setExamQuestions([...inlineItems, ...newBankItems]);
    setIsBankModalOpen(false);
  }

  // HELPERS QUẢN LÝ DẠNG TRẮC NGHIỆM ĐIỀN KHUYẾT (SELECT BLANKS)
  const addSelectBlank = () => {
    const now = Date.now();
    setSelectBlanks((prev) => [
      ...prev,
      {
        id: `blank_${now}`,
        options: [
          { id: `opt_${now}_1`, text: "", isCorrect: true },
          { id: `opt_${now}_2`, text: "", isCorrect: false },
        ],
      },
    ]);
  };

  const removeSelectBlank = (blankId: string) => {
    if (selectBlanks.length <= 1) return;
    setSelectBlanks((prev) => prev.filter((b) => b.id !== blankId));
  };

  const addOptionToSelectBlank = (blankId: string) => {
    setSelectBlanks((prev) =>
      prev.map((b) => {
        if (b.id !== blankId) return b;
        return {
          ...b,
          options: [
            ...b.options,
            { id: `opt_${Date.now()}`, text: "", isCorrect: false },
          ],
        };
      })
    );
  };

  const removeOptionFromSelectBlank = (blankId: string, optionId: string) => {
    setSelectBlanks((prev) =>
      prev.map((b) => {
        if (b.id !== blankId) return b;
        if (b.options.length <= 2) {
          alert("Mỗi ô trắc nghiệm cần ít nhất 2 lựa chọn!");
          return b;
        }
        return {
          ...b,
          options: b.options.filter((o) => o.id !== optionId),
        };
      })
    );
  };

  const updateOptionInSelectBlank = (
    blankId: string,
    optionId: string,
    text: string,
    isCorrect: boolean
  ) => {
    setSelectBlanks((prev) =>
      prev.map((b) => {
        if (b.id !== blankId) return b;
        return {
          ...b,
          options: b.options.map((o) => {
            if (isCorrect) {
              return { ...o, isCorrect: o.id === optionId, text: o.id === optionId ? text : o.text };
            }
            return o.id === optionId ? { ...o, text } : o;
          }),
        };
      })
    );
  };

  // HELPER MANAGERS KHÁC
  const addOption = () => {
    setOptions((prev) => [
      ...prev,
      { id: `opt_${Date.now()}`, text: "", isCorrect: false },
    ]);
  };
  const removeOption = (id: string) => {
    if (options.length <= 2) {
      alert("Câu hỏi trắc nghiệm cần tối thiểu 2 lựa chọn!");
      return;
    }
    setOptions((prev) => prev.filter((o) => o.id !== id));
  };

  const addStatement = () => {
    setStatements((prev) => [
      ...prev,
      { id: `stmt_${Date.now()}`, text: "", isCorrect: true },
    ]);
  };
  const removeStatement = (id: string) => {
    if (statements.length <= 1) return;
    setStatements((prev) => prev.filter((s) => s.id !== id));
  };

  const addTextBlank = () => {
    setTextBlanks((prev) => [
      ...prev,
      { id: `blank_${Date.now()}`, correctAnswers: "" },
    ]);
  };
  const removeTextBlank = (id: string) => {
    if (textBlanks.length <= 1) return;
    setTextBlanks((prev) => prev.filter((b) => b.id !== id));
  };

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
    setSelectBlanks([
      {
        id: "blank_1",
        options: [
          { id: "opt_1_1", text: "", isCorrect: true },
          { id: "opt_1_2", text: "", isCorrect: false },
        ],
      },
    ]);
    setSampleAnswer("");
  }

  function handleAddInlineQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!formContent.trim()) {
      alert("Vui lòng nhập nội dung câu hỏi!");
      return;
    }

    let questionData: Record<string, any> = {};

    if (formType === "single_choice" || formType === "multiple_select") {
      questionData.options = options.map((opt) => ({
        id: opt.id,
        text: opt.text.trim(),
        isCorrect: opt.isCorrect,
      }));
    } else if (formType === "true_false") {
      questionData.statements = statements.map((stmt) => ({
        id: stmt.id,
        text: stmt.text.trim(),
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
        const opts = b.options.map((o) => o.text.trim()).filter(Boolean);
        const correctOpt = b.options.find((o) => o.isCorrect);
        return {
          id: b.id,
          options: opts,
          correctAnswer: correctOpt ? correctOpt.text.trim() : opts[0] || "",
        };
      });
    } else if (formType === "essay") {
      questionData.sample_answer = sampleAnswer.trim();
    }

    const backendType = formType.startsWith("fill_blank") ? "fill_blank" : formType;

    const payload: QuestionPayload = {
      question_type: backendType,
      content: formContent.trim(),
      points: Number(formPoints),
      data: questionData,
      exam_id: null,
    };

    const newItem: ExamQuestionItem = {
      tempId: `inline_${Date.now()}`,
      isBank: false,
      title: formContent.trim(),
      type: backendType,
      points: Number(formPoints),
      inlinePayload: payload,
    };

    setExamQuestions((prev) => [...prev, newItem]);
    setIsInlineModalOpen(false);
    resetInlineForm();
  }

  function handleRemoveQuestion(tempId: string) {
    setExamQuestions((prev) => prev.filter((q) => q.tempId !== tempId));
  }

  const totalPoints = examQuestions.reduce((acc, q) => acc + q.points, 0);

  // SUBMIT TẠO ĐỀ THI
  async function handleSubmit(statusId: "DRAFT" | "PUBLISHED") {
    if (!examName.trim() || !accessCode.trim()) {
      alert("Vui lòng điền Tên đề thi và Mã PIN tham gia!");
      return;
    }

    const now = new Date();
    if (startAt) {
      const startDate = new Date(startAt);
      if (startDate < new Date(now.getTime() - 5 * 60 * 1000)) {
        alert("Thời gian mở đề không được nằm trong quá khứ!");
        return;
      }
    }

    if (endAt) {
      const endDate = new Date(endAt);
      if (startAt) {
        const startDate = new Date(startAt);
        if (endDate <= startDate) {
          alert("Thời gian đóng đề phải lớn hơn thời gian mở đề!");
          return;
        }
      } else if (endDate <= now) {
        alert("Thời gian đóng đề phải ở tương lai!");
        return;
      }
    }

    if (examQuestions.length === 0 && statusId === "PUBLISHED") {
      if (!confirm("Đề thi chưa có câu hỏi nào. Bạn vẫn muốn xuất bản?")) return;
    }

    const questionIds = examQuestions
      .filter((q) => q.isBank && q.bankId)
      .map((q) => q.bankId as string);

    const inlineQuestions = examQuestions
      .filter((q) => !q.isBank && q.inlinePayload)
      .map((q) => q.inlinePayload as QuestionPayload);

    const payload: ExamPayload = {
      exam_name: examName.trim(),
      access_code: accessCode.trim().toUpperCase(),
      duration_minutes: Number(durationMinutes),
      max_attempts: Number(maxAttempts) > 0 ? Number(maxAttempts) : null,
      allow_review_answers: allowReview,
      start_at: startAt ? new Date(startAt).toISOString() : null,
      end_at: endAt ? new Date(endAt).toISOString() : null,
      status_id: statusId,
      question_ids: questionIds,
      inline_questions: inlineQuestions,
    };

    setSubmitting(true);
    try {
      await createExam(payload);
      alert(
        statusId === "PUBLISHED"
          ? `Tạo và xuất bản đề thi thành công!\nMã PIN phòng thi: ${accessCode.toUpperCase()}`
          : "Lưu bản nháp thành công!"
      );
      router.push("/dashboard_instructor");
    } catch (err) {
      alert(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6 px-4">
      {/* HEADER PAGE */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Tạo Đề Thi Mới</h1>
          <p className="text-xs text-slate-500">
            Cấu hình phòng thi, cài đặt số lần thi, mã PIN và biên soạn câu hỏi
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit("DRAFT")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition"
          >
            Lưu bản nháp
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit("PUBLISHED")}
            className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 active:scale-95 disabled:opacity-50 transition"
          >
            {submitting ? "Đang xử lý..." : "Xuất bản Đề thi"}
          </button>
        </div>
      </div>

      {/* BLOCK 1: THÔNG TIN PHÒNG THI */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-5">
        <h2 className="text-xs font-black uppercase tracking-wider text-indigo-900 border-b border-slate-100 pb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">1</span>
          Thông tin & Thiết lập phòng thi
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700">
              Tên đề thi <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="VD: Kiểm tra giữa kỳ Lập trình Web"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Mã PIN tham gia <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleRegenerateAccessCode}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1"
              >
                🎲 Mã ngẫu nhiên
              </button>
            </div>
            <input
              type="text"
              required
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="VD: EXAM26"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-mono font-black tracking-wider uppercase text-indigo-600 outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              Thời gian làm bài (Phút)
            </label>
            <input
              type="number"
              min="1"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Số lần thi tối đa / Sinh viên
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition">
                <input
                  type="checkbox"
                  checked={maxAttempts === 0}
                  onChange={(e) => setMaxAttempts(e.target.checked ? 0 : 1)}
                  className="h-3.5 w-3.5 rounded accent-indigo-600 cursor-pointer"
                />
                Không giới hạn
              </label>
            </div>

            {maxAttempts === 0 ? (
              <div className="w-full rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-3.5 py-2.5 text-xs font-bold text-indigo-700 flex items-center gap-2">
                <span className="text-base">∞</span> Cho phép sinh viên thi lại không giới hạn số lần
              </div>
            ) : (
              <input
                type="number"
                min="1"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                placeholder="Nhập số lần (Ví dụ: 1, 2, 4...)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              Mở đề từ (Không bắt buộc)
            </label>
            <input
              type="datetime-local"
              min={minDateTime}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              Đóng đề lúc (Không bắt buộc)
            </label>
            <input
              type="datetime-local"
              min={startAt || minDateTime}
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <input
            type="checkbox"
            id="allowReview"
            checked={allowReview}
            onChange={(e) => setAllowReview(e.target.checked)}
            className="h-4 w-4 rounded-md accent-indigo-600 cursor-pointer"
          />
          <label htmlFor="allowReview" className="text-xs font-medium text-slate-700 cursor-pointer">
            Cho phép sinh viên xem lại đáp án & lời giải sau khi nộp bài
          </label>
        </div>
      </div>

      {/* BLOCK 2: QUẢN LÝ CÂU HỎI */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">2</span>
              Nội dung câu hỏi ({examQuestions.length} câu)
            </h2>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              Tổng điểm đề thi: <b className="text-indigo-600">{totalPoints} điểm</b>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenBankModal}
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

        {examQuestions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-500">Chưa có câu hỏi nào trong đề thi này.</p>
            <p>Bấm <b>&quot;Chọn từ Ngân hàng&quot;</b> hoặc <b>&quot;Soạn câu hỏi mới&quot;</b> để bắt đầu.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {examQuestions.map((q, idx) => (
              <div
                key={q.tempId}
                className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 hover:border-indigo-200 hover:bg-white transition shadow-2xs"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white">
                      #{idx + 1}
                    </span>
                    <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">
                      {q.type}
                    </span>
                    {q.isBank ? (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-200">
                        Ngân hàng
                      </span>
                    ) : (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 border border-amber-200">
                        Soạn mới
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-slate-400">
                      · {q.points} điểm
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 line-clamp-2">{q.title}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveQuestion(q.tempId)}
                  className="text-xs font-bold text-rose-500 hover:underline shrink-0"
                >
                  Gỡ bỏ
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <BankQuestionModal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        bankQuestions={bankQuestions}
        bankLoading={bankLoading}
        bankSearch={bankSearch}
        onSearchChange={setBankSearch}
        tempSelectedBankIds={tempSelectedBankIds}
        setTempSelectedBankIds={setTempSelectedBankIds}
        onConfirm={handleConfirmBankSelection}
      />

      {/* MODAL SOẠN CÂU HỎI MỚI TRỰC TIẾP */}
      {isInlineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-indigo-100 bg-white p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold border border-indigo-100">
                  ✍️
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Soạn câu hỏi mới vào đề</h2>
                  <p className="text-[11px] text-slate-400">Câu hỏi sẽ tự động được đồng bộ vào Ngân hàng câu hỏi</p>
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
              {/* 1. Chọn loại câu hỏi */}
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
                              {formType === t.key && <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{t.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Nội dung & Điểm */}
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
                      placeholder="Nhập nội dung câu hỏi (Dùng [___] làm vị trí ô điền khuyết)..."
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

              {/* 3. Cấu hình đáp án */}
              <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 sm:p-5">
                <label className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">3</span>
                  Thiết lập đáp án đúng
                </label>

                {/* A. TRẮC NGHIỆM TỰ DO */}
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
                          className="h-4 w-4 accent-indigo-600 shrink-0 ml-1 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-400 w-5 text-center">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        <input
                          type="text"
                          required
                          value={opt.text}
                          onChange={(e) =>
                            setOptions(options.map((o) => (o.id === opt.id ? { ...o, text: e.target.value } : o)))
                          }
                          placeholder={`Lựa chọn ${String.fromCharCode(65 + idx)}...`}
                          className="flex-1 text-xs outline-none bg-transparent font-medium text-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(opt.id)}
                          className="text-slate-400 hover:text-rose-500 font-bold px-2 text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addOption}
                      className="text-xs font-bold text-indigo-600 hover:underline pt-1 inline-block"
                    >
                      + Thêm lựa chọn đáp án
                    </button>
                  </div>
                )}

                {/* B. ĐÚNG / SAI */}
                {formType === "true_false" && (
                  <div className="space-y-2.5">
                    {statements.map((stmt, idx) => (
                      <div key={stmt.id} className="flex items-center gap-3 rounded-xl bg-white p-3 border border-slate-200/80">
                        <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                        <input
                          type="text"
                          required
                          value={stmt.text}
                          onChange={(e) =>
                            setStatements(statements.map((s) => (s.id === stmt.id ? { ...s, text: e.target.value } : s)))
                          }
                          placeholder="Mệnh đề cần đánh giá..."
                          className="flex-1 text-xs outline-none font-medium text-slate-800"
                        />
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 cursor-pointer">
                            <input
                              type="radio"
                              name={`tf_${stmt.id}`}
                              checked={stmt.isCorrect === true}
                              onChange={() => setStatements(statements.map((s) => s.id === stmt.id ? { ...s, isCorrect: true } : s))}
                              className="accent-emerald-600"
                            />
                            ĐÚNG
                          </label>
                          <label className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 cursor-pointer">
                            <input
                              type="radio"
                              name={`tf_${stmt.id}`}
                              checked={stmt.isCorrect === false}
                              onChange={() => setStatements(statements.map((s) => s.id === stmt.id ? { ...s, isCorrect: false } : s))}
                              className="accent-rose-600"
                            />
                            SAI
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStatement(stmt.id)}
                          className="text-slate-400 hover:text-rose-500 font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addStatement}
                      className="text-xs font-bold text-indigo-600 hover:underline pt-1 inline-block"
                    >
                      + Thêm mệnh đề Đúng/Sai
                    </button>
                  </div>
                )}

                {/* C. ĐIỀN KHUYẾT (NHẬP CHỮ) */}
                {formType === "fill_blank_text" && (
                  <div className="space-y-2.5">
                    {textBlanks.map((b, idx) => (
                      <div key={b.id} className="space-y-1.5 rounded-xl bg-white p-3 border border-slate-200/80">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-indigo-900">Ô trống #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeTextBlank(b.id)}
                            className="text-xs text-rose-500 font-bold"
                          >
                            Xóa ô
                          </button>
                        </div>
                        <input
                          type="text"
                          required
                          value={b.correctAnswers}
                          onChange={(e) =>
                            setTextBlanks(textBlanks.map((item) => item.id === b.id ? { ...item, correctAnswers: e.target.value } : item))
                          }
                          placeholder="Các đáp án đúng (Phân cách bằng dấu phẩy, VD: Hà Nội, Ha Noi)..."
                          className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addTextBlank}
                      className="text-xs font-bold text-indigo-600 hover:underline pt-1 inline-block"
                    >
                      + Thêm ô điền khuyết
                    </button>
                  </div>
                )}

                {/* D. ĐIỀN KHUYẾT CHỌN TRẮC NGHIỆM (TỰ ĐỘNG SINH BỘ TRẮC NGHIỆM CHO MỖI Ô) */}
                {formType === "fill_blank_select" && (
                  <div className="space-y-4">
                    {selectBlanks.map((b, bIdx) => (
                      <div key={b.id} className="space-y-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-2xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="text-xs font-bold text-indigo-900 uppercase">
                            Bộ trắc nghiệm cho Ô chọn #{bIdx + 1}
                          </span>
                          {selectBlanks.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSelectBlank(b.id)}
                              className="text-xs font-bold text-rose-500 hover:underline"
                            >
                              Xóa ô
                            </button>
                          )}
                        </div>

                        {/* Danh sách lựa chọn cho Ô chọn này */}
                        <div className="space-y-2">
                          {b.options.map((opt, oIdx) => (
                            <div key={opt.id} className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2 border border-slate-200/80">
                              <input
                                type="radio"
                                name={`select_correct_${b.id}`}
                                checked={opt.isCorrect}
                                onChange={() =>
                                  updateOptionInSelectBlank(b.id, opt.id, opt.text, true)
                                }
                                className="h-4 w-4 accent-indigo-600 shrink-0 ml-1 cursor-pointer"
                              />
                              <span className="text-xs font-bold text-slate-400 w-5 text-center">
                                {String.fromCharCode(65 + oIdx)}.
                              </span>
                              <input
                                type="text"
                                required
                                value={opt.text}
                                onChange={(e) =>
                                  updateOptionInSelectBlank(b.id, opt.id, e.target.value, opt.isCorrect)
                                }
                                placeholder={`Lựa chọn ${String.fromCharCode(65 + oIdx)}...`}
                                className="flex-1 text-xs outline-none bg-transparent font-medium text-slate-800"
                              />
                              <button
                                type="button"
                                onClick={() => removeOptionFromSelectBlank(b.id, opt.id)}
                                className="text-slate-400 hover:text-rose-500 font-bold px-2 text-sm"
                              >
                                ✕
                              </button>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => addOptionToSelectBlank(b.id)}
                            className="text-xs font-bold text-indigo-600 hover:underline pt-1 inline-block"
                          >
                            + Thêm lựa chọn đáp án cho Ô #{bIdx + 1}
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={addSelectBlank}
                      className="text-xs font-bold text-indigo-600 hover:underline pt-1 inline-block"
                    >
                      + Thêm ô chọn trắc nghiệm mới
                    </button>
                  </div>
                )}

                {/* E. TỰ LUẬN */}
                {formType === "essay" && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700">Đáp án mẫu / Barem chấm:</span>
                    <textarea
                      rows={3}
                      value={sampleAnswer}
                      onChange={(e) => setSampleAnswer(e.target.value)}
                      placeholder="Nhập hướng dẫn chấm hoặc đáp án gợi ý..."
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* FOOTER ACTION MODAL */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsInlineModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700 active:scale-95 transition"
                >
                  Thêm vào Đề thi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}