"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  getBankQuestions,
  deleteQuestion,
  createQuestion,
  QuestionPayload,
} from "@/src/actions/question";
import { errMsg } from "@/src/lib/api";
import { Question } from "@/src/types/exam";

// Danh mục nhóm câu hỏi
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

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("ALL");

  // State Modal Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

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
  
  // Điền khuyết 1: Nhập chữ
  const [textBlanks, setTextBlanks] = useState([
    { id: "blank_1", correctAnswers: "" },
  ]);

  // Điền khuyết 2: Chọn trắc nghiệm dropdown
  const [selectBlanks, setSelectBlanks] = useState([
    { id: "blank_1", optionsText: "Hà Nội, Sài Gòn, Đà Nẵng", correctAnswer: "Hà Nội" },
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

  // Submit Tạo câu hỏi
  async function handleCreateSubmit(e: React.FormEvent) {
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
    } 
    else if (formType === "true_false") {
      questionData.statements = statements.map((stmt) => ({
        id: stmt.id,
        text: stmt.text,
        isCorrect: stmt.isCorrect,
      }));
    } 
    else if (formType === "fill_blank_text") {
      questionData.mode = "text";
      questionData.blanks = textBlanks.map((b) => ({
        id: b.id,
        correctAnswers: b.correctAnswers.split(",").map((s) => s.trim()).filter(Boolean),
      }));
    } 
    else if (formType === "fill_blank_select") {
      questionData.mode = "select";
      questionData.blanks = selectBlanks.map((b) => {
        const opts = b.optionsText.split(",").map((s) => s.trim()).filter(Boolean);
        return {
          id: b.id,
          options: opts,
          correctAnswer: b.correctAnswer || opts[0] || "",
        };
      });
    } 
    else if (formType === "essay") {
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

    setCreating(true);
    try {
      await createQuestion(payload);
      setIsModalOpen(false);
      resetForm();
      await loadData();
    } catch (err) {
      alert(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6 px-4">
      {/* HEADER PAGE */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Ngân hàng câu hỏi</h1>
          <p className="text-xs text-slate-500">
            Kho lưu trữ và khởi tạo câu hỏi phục vụ đề thi trực tuyến
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
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
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition"
        />

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
        >
          <option value="ALL">Tất cả dạng câu hỏi</option>
          <option value="single_choice">Trắc nghiệm 1 đáp án</option>
          <option value="multiple_select">Trắc nghiệm nhiều đáp án</option>
          <option value="true_false">Đúng / Sai</option>
          <option value="fill_blank">Điền khuyết</option>
          <option value="essay">Tự luận</option>
        </select>
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
          Đang kết nối CSDL...
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-xs text-slate-400">
          Chưa có câu hỏi nào trong ngân hàng. Bấm <b>&quot;Thêm câu hỏi mới&quot;</b> để tạo.
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q: any, idx) => {
            const qId = q.id || q.question_id;
            const qContent = q.title || q.content;
            const qType = q.type || q.question_type;

            return (
              <div
                key={qId}
                className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-indigo-200 transition"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white">
                      #{idx + 1}
                    </span>
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 uppercase">
                      {qType}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      · {q.points || 1} điểm
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">{qContent}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(qId)}
                  className="text-xs font-bold text-rose-500 hover:underline shrink-0"
                >
                  Xóa
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL FORM TẠO CÂU HỎI MỚI */}
      {/* ================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-indigo-100 bg-white p-6 sm:p-8 shadow-2xl space-y-6">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold border border-indigo-100">
                  ✏️
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    Tạo câu hỏi mới
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Lưu trực tiếp vào Ngân hàng câu hỏi dùng chung
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

            <form onSubmit={handleCreateSubmit} className="space-y-6">
              
              {/* BƯỚC 1: GOM NHÓM CHỌN LOẠI CÂU HỎI */}
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

              {/* BƯỚC 3: CẤU HÌNH ĐÁP ÁN (DỰA THEO LOẠI CÂU HỎI) */}
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
                  disabled={creating}
                  className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/35 active:scale-95 disabled:opacity-50 transition"
                >
                  {creating ? "Đang lưu..." : "Lưu vào Ngân hàng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}