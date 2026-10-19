"use client";

import { api, EXAM_URL } from "@/src/lib/api";
import { Question } from "@/src/types/exam";

// Kiểu dữ liệu payload khi gửi lên Backend FastAPI
export interface QuestionPayload {
  question_type: string; // "single_choice" | "multiple_select" | "true_false" | "essay" | "fill_blank"
  content: string;
  data?: Record<string, any>;
  points?: number;
  exam_id?: string | null; // null = Lưu vào Ngân hàng câu hỏi
}

export interface QuestionFilterParams {
  type?: string;
  search?: string;
}

/**
 * Lấy danh sách câu hỏi thuộc Ngân hàng (exam_id IS NULL)
 */
export async function getBankQuestions(params?: QuestionFilterParams) {
  const query = new URLSearchParams();
  if (params?.type && params.type !== "ALL") query.append("type", params.type);
  if (params?.search) query.append("search", params.search.trim());

  const queryString = query.toString() ? `?${query.toString()}` : "";
  return await api<Question[]>(EXAM_URL, `/questions/bank${queryString}`, {
    method: "GET",
  });
}

/**
 * Tạo câu hỏi mới và lưu vào Ngân hàng câu hỏi
 */
export async function createQuestion(payload: QuestionPayload) {
  return await api<Question>(EXAM_URL, "/questions/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Cập nhật câu hỏi trong Ngân hàng
 */
export async function updateQuestion(
  questionId: string,
  payload: Partial<QuestionPayload>
) {
  return await api<Question>(EXAM_URL, `/questions/${questionId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/**
 * Xóa câu hỏi khỏi Ngân hàng
 */
export async function deleteQuestion(questionId: string) {
  return await api<void>(EXAM_URL, `/questions/${questionId}`, {
    method: "DELETE",
  });
}