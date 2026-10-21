"use client";

import { api, EXAM_URL } from "@/src/lib/api";
import { QuestionPayload } from "@/src/actions/question";

export interface ExamPayload {
  exam_name: string;
  access_code: string;
  duration_minutes: number;
  max_attempts?: number | null;
  allow_review_answers: boolean;
  start_at?: string | null;
  end_at?: string | null;
  status_id?: string;
  question_ids?: string[];
  inline_questions?: QuestionPayload[];
}

export interface Exam {
  exam_id: string;
  owner_id: string;
  exam_name: string;
  access_code: string;
  duration_minutes: number;
  allow_review_answers: boolean;
  start_at?: string | null;
  end_at?: string | null;
  status_id: string;
  created_at: string;
  updated_at: string;
}

export interface ExamDetail extends Exam {
  questions: Array<{
    question_id: string;
    question_type: string;
    content: string;
    data?: Record<string, any>;
    points: number;
  }>;
}

export async function getMyExams(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search.trim())}` : "";
  return await api<Exam[]>(EXAM_URL, `/exams/${query}`, {
    method: "GET",
  });
}

export async function createExam(payload: ExamPayload) {
  return await api<Exam>(EXAM_URL, "/exams/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getExamDetail(examId: string) {
  return await api<ExamDetail>(EXAM_URL, `/exams/${examId}`, {
    method: "GET",
  });
}

export async function updateExam(examId: string, payload: Partial<ExamPayload>) {
  return await api<Exam>(EXAM_URL, `/exams/${examId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteExam(examId: string) {
  return await api<void>(EXAM_URL, `/exams/${examId}`, {
    method: "DELETE",
  });
}

/**
 * Sinh viên nhập mã PIN để vào làm bài (Tự động khôi phục lượt thi dở dang nếu reload/văng ra)
 */
export async function joinExam(accessCode: string) {
  return await api<any>(EXAM_URL, "/attempts/join", {
    method: "POST",
    body: JSON.stringify({ access_code: accessCode }),
  });
}

export async function listMyResults() {
  return await api<any>(EXAM_URL, "/attempts/my-results", {
    method: "GET",
  });
}

export async function getResult(attemptId: string) {
  return await api<any>(EXAM_URL, `/attempts/${attemptId}/result`, {
    method: "GET",
  });
}

export async function getAttempt(attemptId: string) {
  return await api<any>(EXAM_URL, `/attempts/${attemptId}`, {
    method: "GET",
  });
}

/**
 * Lưu nháp toàn bộ đáp án khi đang làm bài
 */
export async function saveDraft(attemptId: string, payload: { answers: Record<string, any> }) {
  return await api<any>(EXAM_URL, `/attempts/${attemptId}/draft`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/**
 * [MỚI] Tự động lưu nháp từng câu hỏi riêng biệt ngay khi sinh viên tick chọn
 */
export async function saveSingleAnswer(attemptId: string, questionId: string, answerData: any) {
  return await api<any>(EXAM_URL, `/attempts/${attemptId}/save-answer`, {
    method: "PUT",
    body: JSON.stringify({
      question_id: questionId,
      answer_data: answerData,
    }),
  });
}

export async function submitAttempt(attemptId: string, payload: { answers: Record<string, any> }) {
  return await api<any>(EXAM_URL, `/attempts/${attemptId}/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export { createQuestion, deleteQuestion } from "@/src/actions/question";
export const getExam = getExamDetail;

export async function listQuestions(examId: string) {
  const detail = await getExamDetail(examId);
  return detail.questions || [];
}

export async function listSubmissions(examId: string) {
  return await api<any>(EXAM_URL, `/exams/${examId}/submissions`, {
    method: "GET",
  });
}

export async function getSubmission(attemptId: string) {
  return await api<any>(EXAM_URL, `/exams/submissions/${attemptId}`, {
    method: "GET",
  });
}

export async function gradeAnswer(attemptId: string, questionId: string, points: number) {
  return await api<any>(EXAM_URL, `/exams/submissions/${attemptId}/grade`, {
    method: "POST",
    body: JSON.stringify({
      grades: {
        [questionId]: {
          earned_points: points,
          score: points,
          is_correct: points > 0,
        },
      },
      question_id: questionId,
      score: points,
      points: points,
    }),
  });
}