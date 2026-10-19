"use client";

import React, { useState, useMemo } from "react";
import { Question } from "@/src/types/exam";

interface BankQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankQuestions: Question[];
  bankLoading: boolean;
  bankSearch: string;
  onSearchChange: (value: string) => void;
  tempSelectedBankIds: string[];
  setTempSelectedBankIds: React.Dispatch<React.SetStateAction<string[]>>;
  onConfirm: () => void;
}

export default function BankQuestionModal({
  isOpen,
  onClose,
  bankQuestions,
  bankLoading,
  bankSearch,
  onSearchChange,
  tempSelectedBankIds,
  setTempSelectedBankIds,
  onConfirm,
}: BankQuestionModalProps) {
  const [randomCountInput, setRandomCountInput] = useState<string>("");

  // Lấy tất cả danh sách ID từ ngân hàng
  const allBankIds = useMemo(
    () => bankQuestions.map((q: any) => q.id || q.question_id),
    [bankQuestions]
  );

  // Kiểm tra đã chọn tất cả chưa
  const isAllBankSelected =
    allBankIds.length > 0 &&
    allBankIds.every((id) => tempSelectedBankIds.includes(id));

  // Toggle chọn tất cả / bỏ chọn tất cả
  function handleToggleSelectAllBank() {
    if (isAllBankSelected) {
      setTempSelectedBankIds([]);
    } else {
      setTempSelectedBankIds([...allBankIds]);
    }
  }

  // Toggle từng câu hỏi
  function toggleBankSelect(id: string) {
    setTempSelectedBankIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  // Bốc câu hỏi ngẫu nhiên N câu
  function handleSelectRandomQuestions() {
    const count = parseInt(randomCountInput, 10);
    if (isNaN(count) || count <= 0) {
      alert("Vui lòng nhập số lượng câu hỏi hợp lệ (lớn hơn 0)!");
      return;
    }

    if (allBankIds.length === 0) {
      alert("Ngân hàng câu hỏi hiện tại đang trống!");
      return;
    }

    // Xáo trộn mảng ngẫu nhiên (Fisher-Yates)
    const shuffled = [...allBankIds].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(count, allBankIds.length));

    setTempSelectedBankIds(selected);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden">
        {/* HEADER MODAL */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900">
              Chọn câu hỏi từ Ngân hàng
            </h3>
            <p className="text-[11px] text-slate-400">
              Đã tích chọn {tempSelectedBankIds.length} câu hỏi
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-lg"
          >
            ✕
          </button>
        </div>

        {/* TOOLBAR TÌM KIẾM & BỐC NGẪU NHIÊN */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-100 space-y-3">
          <input
            type="text"
            value={bankSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm kiếm nội dung trong ngân hàng..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-indigo-500"
          />

          {bankQuestions.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200/60">
              {/* CHỌN TẤT CẢ */}
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-indigo-700 hover:text-indigo-900 transition">
                <input
                  type="checkbox"
                  checked={isAllBankSelected}
                  onChange={handleToggleSelectAllBank}
                  className="h-4 w-4 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                />
                <span>
                  {isAllBankSelected ? "Bỏ chọn tất cả" : "Chọn tất cả câu hỏi"}
                </span>
              </label>

              {/* BỐC NGẪU NHIÊN N CÂU HỎI */}
              <div className="flex items-center gap-2 bg-indigo-50/80 p-1.5 rounded-xl border border-indigo-100">
                <span className="text-[11px] font-bold text-indigo-900 pl-1">
                  Bốc ngẫu nhiên:
                </span>
                <input
                  type="number"
                  min={1}
                  max={allBankIds.length}
                  value={randomCountInput}
                  onChange={(e) => setRandomCountInput(e.target.value)}
                  placeholder="Số câu"
                  className="w-16 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-black text-indigo-600 text-center outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSelectRandomQuestions}
                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition"
                >
                  🎲 Tự động chọn
                </button>
              </div>
            </div>
          )}
        </div>

        {/* DANH SÁCH CÂU HỎI */}
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
              const isChecked = tempSelectedBankIds.includes(qId);

              return (
                <label
                  key={qId}
                  onClick={() => toggleBankSelect(qId)}
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
                    className="mt-0.5 h-4 w-4 accent-indigo-600 shrink-0 cursor-pointer"
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

        {/* FOOTER ACTIONS */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700"
          >
            Đưa vào đề thi ({tempSelectedBankIds.length})
          </button>
        </div>
      </div>
    </div>
  );
}