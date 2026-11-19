"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  getBankQuestions,
  deleteQuestion,
  createQuestion,
  updateQuestion,
  QuestionPayload,
} from "@/src/actions/question";
import { errMsg } from "@/src/lib/api";
import { Question } from "@/src/types/exam";

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

const PAGE_SIZE = 10;

function getQuestionTypeBadge(qType: string, qData: any) {
  const t = String(qType || "").toLowerCase();
  const mode = String(qData?.mode || "").toLowerCase();

  if (t === "single_choice") return { label: "1 Đáp án", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  if (t === "multiple_select") return { label: "Nhiều đáp án", color: "bg-violet-50 text-violet-700 border-violet-200" };
  if (t === "true_false") return { label: "Đúng / Sai", color: "bg-sky-50 text-sky-700 border-sky-200" };
  if (t === "fill_blank_select" || (t === "fill_blank" && mode === "select")) {
    return { label: "Điền khuyết (Trắc nghiệm)", color: "bg-teal-50 text-teal-700 border-teal-200" };
  }
  if (t === "fill_blank_text" || t === "fill_blank") {
    return { label: "Điền khuyết (Nhập chữ)", color: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (t === "essay") return { label: "Tự luận", color: "bg-rose-50 text-rose-700 border-rose-200" };
  return { label: qType, color: "bg-slate-100 text-slate-700 border-slate-200" };
}

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  // State thu gọn / mở rộng chi tiết đáp án cho từng câu
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});

  // State Modal Form (Dùng chung cho cả Tạo mới & Chỉnh sửa)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formType, setFormType] = useState<string>("single_choice");
  const [formContent, setFormContent] = useState("");
  const [formPoints, setFormPoints] = useState<number>(1);

  // Data Đáp án
  const [options, setOptions] = useState([
    { id: "opt_1", text: "", isCorrect: true },
    { id: "opt_2", text: "", isCorrect: false },
  ]);
  const [statements, setStatements] = useState([
    { id: "stmt_1", text: "", isCorrect: true },
  ]);
  const [textBlanks, setTextBlanks] = useState([
    { id: "blank_1", correctAnswers: "" },
  ]);
  const [selectBlanks, setSelectBlanks] = useState([
    { id: "blank_1", optionsText: "Đáp án A, Đáp án B", correctAnswer: "Đáp án A" },
  ]);
  const [sampleAnswer, setSampleAnswer] = useState("");

  // Load danh sách
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getBankQuestions({
        type: selectedType,
        search: search,
      });
      setQuestions(data || []);
      setCurrentPage(1);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [selectedType, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Lọc bổ sung ở client (phòng trường hợp API trả về full list)
  const filteredQuestions = questions.filter((q: any) => {
    const qType = String(q.type || q.question_type || "").toLowerCase();
    const qContent = String(q.title || q.content || "").toLowerCase();
    const matchType =
      selectedType === "ALL" ||
      qType === selectedType.toLowerCase() ||
      (selectedType === "fill_blank" && qType.startsWith("fill_blank"));
    const matchSearch = !search.trim() || qContent.includes(search.trim().toLowerCase());
    return matchType && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / PAGE_SIZE));
  const paginatedQuestions = filteredQuestions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  async function handleDelete(id: string) {
    if (!confirm("Bạn có chắc chắn muốn xóa câu hỏi này khỏi ngân hàng?")) return;
    try {
      await deleteQuestion(id);
      setQuestions((prev) => prev.filter((q) => (q.id || (q as any).question_id) !== id));
    } catch (err) {
      alert(errMsg(err));
    }
  }

  function resetForm() {
    setEditingQuestionId(null);
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

  function openCreateModal() {
    resetForm();
    setIsModalOpen(true);
  }

  // Mở Modal Sửa câu hỏi và đổ toàn bộ dữ liệu cũ vào form
  function openEditModal(q: any) {
    const qId = q.id || q.question_id;
    const rawType = String(q.type || q.question_type || "single_choice").toLowerCase();
    const qData = q.data || {};
    const qMode = String(qData.mode || "").toLowerCase();

    setEditingQuestionId(qId);
    setFormContent(q.title || q.content || "");
    setFormPoints(Number(q.points) || 1);

    // Xác định đúng key formType
    let resolvedType = rawType;
    if (rawType === "fill_blank" || rawType === "fill_blank_text" || rawType === "fill_blank_select") {
      const isSelect =
        rawType === "fill_blank_select" ||
        qMode === "select" ||
        (Array.isArray(qData.blanks) && qData.blanks.some((b: any) => Array.isArray(b.options) && b.options.length > 0));
      resolvedType = isSelect ? "fill_blank_select" : "fill_blank_text";
    }
    setFormType(resolvedType);

    // Đổ dữ liệu chi tiết theo từng loại
    if (resolvedType === "single_choice" || resolvedType === "multiple_select") {
      const existingOpts = qData.options || q.options || [];
      setOptions(
        existingOpts.length >= 2
          ? existingOpts.map((o: any, idx: number) => ({
              id: o.id || `opt_${idx + 1}`,
              text: typeof o === "string" ? o : o.text || "",
              isCorrect: Boolean(o.isCorrect),
            }))
          : [
              { id: "opt_1", text: "", isCorrect: true },
              { id: "opt_2", text: "", isCorrect: false },
            ]
      );
    } else if (resolvedType === "true_false") {
      const existingStmts = qData.statements || q.statements || [];
      setStatements(
        existingStmts.length > 0
          ? existingStmts.map((s: any, idx: number) => ({
              id: s.id || `stmt_${idx + 1}`,
              text: s.text || "",
              isCorrect: s.isCorrect !== undefined ? Boolean(s.isCorrect) : true,
            }))
          : [{ id: "stmt_1", text: "", isCorrect: true }]
      );
    } else if (resolvedType === "fill_blank_text") {
      const existingBlanks = qData.blanks || q.blanks || [];
      setTextBlanks(
        existingBlanks.length > 0
          ? existingBlanks.map((b: any, idx: number) => ({
              id: b.id || `blank_${idx + 1}`,
              correctAnswers: Array.isArray(b.correctAnswers)
                ? b.correctAnswers.join(", ")
                : b.correctAnswer || "",
            }))
          : [{ id: "blank_1", correctAnswers: "" }]
      );
    } else if (resolvedType === "fill_blank_select") {
      const existingBlanks = qData.blanks || q.blanks || [];
      setSelectBlanks(
        existingBlanks.length > 0
          ? existingBlanks.map((b: any, idx: number) => {
              const optsArr = Array.isArray(b.options)
                ? b.options.map((o: any) => (typeof o === "string" ? o : o.text || ""))
                : [];
              return {
                id: b.id || `blank_${idx + 1}`,
                optionsText: optsArr.join(", "),
                correctAnswer: b.correctAnswer || optsArr[0] || "",
              };
            })
          : [{ id: "blank_1", optionsText: "Đáp án A, Đáp án B", correctAnswer: "Đáp án A" }]
      );
    } else if (resolvedType === "essay") {
      setSampleAnswer(qData.sample_answer || q.sample_answer || q.explanation || "");
    }

    setIsModalOpen(true);
  }

  // Submit Tạo mới hoặc Cập nhật câu hỏi
  async function handleSaveSubmit(e: React.FormEvent) {
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
      question_type: backendType,
      content: formContent.trim(),
      points: Number(formPoints),
      data: questionData,
      exam_id: null,
    };

    setSaving(true);
    try {
      if (editingQuestionId) {
        await updateQuestion(editingQuestionId, payload);
      } else {
        await createQuestion(payload);
      }
      setIsModalOpen(false);
      resetForm();
      await loadData();
    } catch (err) {
      alert(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  const toggleCollapse = (qId: string) => {
    setCollapsedIds((prev) => ({ ...prev, [qId]: !prev[qId] }));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6 px-4">
      {/* HEADER PAGE */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Ngân hàng câu hỏi</h1>
          <p className="text-xs text-slate-500">
            Kho lưu trữ, chỉnh sửa và khởi tạo câu hỏi phục vụ đề thi trực tuyến
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:shadow-indigo-500/35 active:scale-95"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Thêm câu hỏi mới
        </button>
      </div>

      {/* THANH BỘ LỌC */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm nội dung câu hỏi..."
          className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
        />

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="ALL">Tất cả dạng câu hỏi</option>
          <option value="single_choice">Trắc nghiệm 1 đáp án</option>
          <option value="multiple_select">Trắc nghiệm nhiều đáp án</option>
          <option value="true_false">Đúng / Sai</option>
          <option value="fill_blank">Điền khuyết</option>
          <option value="essay">Tự luận</option>
        </select>

        <span className="text-[11px] font-bold text-slate-400 px-2">
          Tổng: <b className="text-indigo-600">{filteredQuestions.length}</b> câu
        </span>
      </div>

      {/* ERROR MSG */}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-600 font-semibold">
          {error}
        </div>
      )}

      {/* DANH SÁCH CÂU HỎI */}
      {loading ? (
        <div className="py-12 text-center text-xs font-bold text-slate-400">
          Đang tải dữ liệu ngân hàng câu hỏi...
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-xs text-slate-400">
          Không tìm thấy câu hỏi nào phù hợp. Bấm <b>&quot;Thêm câu hỏi mới&quot;</b> để tạo.
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedQuestions.map((q: any, idx) => {
            const qId = q.id || q.question_id;
            const qContent = q.title || q.content;
            const qType = String(q.type || q.question_type || "").toLowerCase();
            const qData = q.data || {};
            const badge = getQuestionTypeBadge(qType, qData);
            const globalIndex = (currentPage - 1) * PAGE_SIZE + idx + 1;
            const isCollapsed = collapsedIds[qId] ?? false;

            const qOptions = qData.options || q.options || [];
            const qStatements = qData.statements || q.statements || [];
            const qBlanks = qData.blanks || q.blanks || [];
            const qSample = qData.sample_answer || q.sample_answer || q.explanation;

            return (
              <div
                key={qId}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:border-indigo-200 transition space-y-3"
              >
                {/* TOP BAR CỦA CÂU HỎI */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 min-w-6 px-1.5 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white">
                        #{globalIndex}
                      </span>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">
                        · {q.points || 1} điểm
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-relaxed">{qContent}</p>
                  </div>

                  {/* CỤM NÚT THAO TÁC: THU GỌN / SỬA / XÓA */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(qId)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition"
                    >
                      {isCollapsed ? "Hiện đáp án" : "Thu gọn"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(q)}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(qId)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 transition"
                    >
                      Xóa
                    </button>
                  </div>
                </div>

                {/* CHI TIẾT ĐÁP ÁN TRỰC QUAN */}
                {!isCollapsed && (
                  <div className="pt-2 border-t border-slate-100">
                    {/* 1. Trắc nghiệm 1 hoặc nhiều đáp án */}
                    {(qType === "single_choice" || qType === "multiple_select") && qOptions.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {qOptions.map((opt: any, oIdx: number) => {
                          const isCorrect = Boolean(opt.isCorrect);
                          const text = typeof opt === "string" ? opt : opt.text;
                          return (
                            <div
                              key={opt.id || oIdx}
                              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs border ${
                                isCorrect
                                  ? "border-emerald-200 bg-emerald-50/70 font-bold text-emerald-800"
                                  : "border-slate-100 bg-slate-50/50 text-slate-600"
                              }`}
                            >
                              <span className="font-mono font-bold">
                                {String.fromCharCode(65 + oIdx)}.
                              </span>
                              <span className="flex-1">{text}</span>
                              {isCorrect && (
                                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white uppercase">
                                  Đúng
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 2. Đúng / Sai nhiều mệnh đề */}
                    {qType === "true_false" && qStatements.length > 0 && (
                      <div className="space-y-1.5">
                        {qStatements.map((stmt: any, sIdx: number) => (
                          <div
                            key={stmt.id || sIdx}
                            className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs border border-slate-100"
                          >
                            <span className="text-slate-700 font-medium">
                              <b className="text-indigo-600 mr-1.5">{String.fromCharCode(97 + sIdx)})</b>
                              {stmt.text}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase shrink-0 ${
                                stmt.isCorrect
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {stmt.isCorrect ? "ĐÚNG" : "SAI"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 3. Điền khuyết */}
                    {qType.includes("fill_blank") && qBlanks.length > 0 && (
                      <div className="space-y-1.5">
                        {qBlanks.map((b: any, bIdx: number) => {
                          const ansText = Array.isArray(b.correctAnswers)
                            ? b.correctAnswers.join(" / ")
                            : b.correctAnswer || "";
                          const optsList = Array.isArray(b.options) ? b.options.join(", ") : "";
                          return (
                            <div
                              key={b.id || bIdx}
                              className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs border border-slate-100"
                            >
                              <span className="font-bold text-slate-600">Ô #{bIdx + 1}:</span>
                              <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                                Đáp án: {ansText}
                              </span>
                              {optsList && (
                                <span className="text-[11px] text-slate-400">
                                  (Lựa chọn: {optsList})
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 4. Tự luận */}
                    {qType === "essay" && (
                      <div className="rounded-xl bg-indigo-50/50 border border-indigo-100 px-3.5 py-2.5 text-xs text-indigo-950">
                        <span className="font-bold text-indigo-700">Gợi ý đáp án: </span>
                        {qSample || <span className="italic text-slate-400">(Không có đáp án mẫu)</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* PHÂN TRANG */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3">
              <span className="text-xs text-slate-500">
                Trang <b>{currentPage}</b> / {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  ← Trước
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Sau →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL FORM TẠO MỚI / CHỈNH SỬA CÂU HỎI */}
      {/* ================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-indigo-100 bg-white p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold border border-indigo-100">
                  {editingQuestionId ? "🛠️" : "✏️"}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    {editingQuestionId ? "Chỉnh sửa câu hỏi" : "Tạo câu hỏi mới"}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    {editingQuestionId
                      ? "Cập nhật nội dung và đáp án cho câu hỏi trong ngân hàng"
                      : "Lưu trực tiếp vào Ngân hàng câu hỏi dùng chung"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSubmit} className="space-y-6">
              {/* BƯỚC 1: CHỌN LOẠI CÂU HỎI */}
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

              {/* BƯỚC 2: NỘI DUNG & ĐIỂM SỐ */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">2</span>
                  Nội dung & Thang điểm
                </label>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-3">
                    <textarea
                      required
                      rows={3}
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      placeholder="Nhập nội dung câu hỏi (Dùng [___] để biểu thị vị trí ô điền nếu là câu điền khuyết)..."
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

              {/* BƯỚC 3: CẤU HÌNH ĐÁP ÁN */}
              <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 sm:p-5">
                <label className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">3</span>
                  Thiết lập đáp án đúng
                </label>

                {/* 1 & 2. Trắc nghiệm Single / Multiple */}
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
                              setOptions(
                                options.map((o) => ({
                                  ...o,
                                  isCorrect: o.id === opt.id,
                                }))
                              );
                            } else {
                              setOptions(
                                options.map((o) =>
                                  o.id === opt.id ? { ...o, isCorrect: e.target.checked } : o
                                )
                              );
                            }
                          }}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        <input
                          type="text"
                          required
                          value={opt.text}
                          onChange={(e) =>
                            setOptions(
                              options.map((o) =>
                                o.id === opt.id ? { ...o, text: e.target.value } : o
                              )
                            )
                          }
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
                      onClick={() =>
                        setOptions([
                          ...options,
                          { id: `opt_${Date.now()}`, text: "", isCorrect: false },
                        ])
                      }
                      className="text-xs font-bold text-indigo-600 hover:underline pt-1 inline-flex items-center gap-1"
                    >
                      + Thêm lựa chọn
                    </button>
                  </div>
                )}

                {/* 3. Đúng / Sai */}
                {formType === "true_false" && (
                  <div className="space-y-2">
                    {statements.map((stmt, idx) => (
                      <div key={stmt.id} className="flex items-center gap-2 rounded-xl bg-white p-2 border border-slate-200/80 shadow-2xs">
                        <input
                          type="text"
                          required
                          value={stmt.text}
                          onChange={(e) =>
                            setStatements(
                              statements.map((s) =>
                                s.id === stmt.id ? { ...s, text: e.target.value } : s
                              )
                            )
                          }
                          placeholder={`Mệnh đề ${idx + 1}`}
                          className="flex-1 bg-transparent text-xs font-medium text-slate-800 outline-none"
                        />
                        <select
                          value={stmt.isCorrect ? "true" : "false"}
                          onChange={(e) =>
                            setStatements(
                              statements.map((s) =>
                                s.id === stmt.id
                                  ? { ...s, isCorrect: e.target.value === "true" }
                                  : s
                              )
                            )
                          }
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-indigo-900"
                        >
                          <option value="true">ĐÚNG</option>
                          <option value="false">SAI</option>
                        </select>
                        {statements.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setStatements(statements.filter((s) => s.id !== stmt.id))}
                            className="text-xs text-rose-500 font-bold px-2 hover:underline"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setStatements([
                          ...statements,
                          { id: `stmt_${Date.now()}`, text: "", isCorrect: true },
                        ])
                      }
                      className="text-xs font-bold text-indigo-600 hover:underline pt-1"
                    >
                      + Thêm mệnh đề
                    </button>
                  </div>
                )}

                {/* 4A. Điền khuyết - Nhập chữ */}
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
                          onChange={(e) =>
                            setTextBlanks(
                              textBlanks.map((item) =>
                                item.id === b.id ? { ...item, correctAnswers: e.target.value } : item
                              )
                            )
                          }
                          placeholder="VD: Hà Nội, Ha Noi, HaNoi"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setTextBlanks([
                          ...textBlanks,
                          { id: `blank_${Date.now()}`, correctAnswers: "" },
                        ])
                      }
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      + Thêm ô khuyết nhập từ
                    </button>
                  </div>
                )}

                {/* 4B. Điền khuyết - Chọn trắc nghiệm Dropdown */}
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
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400 font-semibold block">
                            Các lựa chọn cho menu thả xuống (phân cách bởi dấu phẩy):
                          </label>
                          <input
                            type="text"
                            required
                            value={b.optionsText}
                            onChange={(e) =>
                              setSelectBlanks(
                                selectBlanks.map((item) =>
                                  item.id === b.id ? { ...item, optionsText: e.target.value } : item
                                )
                              )
                            }
                            placeholder="VD: Hà Nội, Sài Gòn, Đà Nẵng"
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[11px] font-bold text-slate-600">Đáp án đúng chính xác:</span>
                          <input
                            type="text"
                            required
                            value={b.correctAnswer}
                            onChange={(e) =>
                              setSelectBlanks(
                                selectBlanks.map((item) =>
                                  item.id === b.id ? { ...item, correctAnswer: e.target.value } : item
                                )
                              )
                            }
                            placeholder="Nhập 1 giá trị khớp với các lựa chọn trên"
                            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectBlanks([
                          ...selectBlanks,
                          {
                            id: `blank_${Date.now()}`,
                            optionsText: "Lựa chọn 1, Lựa chọn 2",
                            correctAnswer: "Lựa chọn 1",
                          },
                        ])
                      }
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      + Thêm ô khuyết trắc nghiệm
                    </button>
                  </div>
                )}

                {/* 5. Tự luận */}
                {formType === "essay" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 block">
                      Đáp án gợi ý / Thang hướng dẫn chấm (Không bắt buộc)
                    </label>
                    <textarea
                      rows={2}
                      value={sampleAnswer}
                      onChange={(e) => setSampleAnswer(e.target.value)}
                      placeholder="Nhập dàn ý hoặc các ý chính để được tính điểm..."
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/35 active:scale-95 disabled:opacity-50 transition"
                >
                  {saving ? "Đang lưu..." : editingQuestionId ? "Lưu thay đổi" : "Lưu vào Ngân hàng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}