export enum QuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',       // Trắc nghiệm 1 đáp án
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',   // Trắc nghiệm nhiều đáp án
  FILL_IN_BLANK = 'FILL_IN_BLANK',       // Điền khuyết
  TRUE_FALSE = 'TRUE_FALSE',             // Đúng / Sai
  ESSAY = 'ESSAY',
                         // Tự luận
}

export interface Option {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface BlankItem {
  id: string;
  type: 'SELECT' | 'TEXT_INPUT';
  options?: string[];
  correctAnswers: string[];
}

export interface StatementItem {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  title: string;
  type: QuestionType;
  points: number;
  options?: Option[];
  sampleAnswer?: string;
  blanks?: BlankItem[];
  statements?: StatementItem[];
}

export interface ExamForm {
  title: string;
  description: string;
  durationMinutes: number;
  passingScore: number;
  questions: Question[];
}


export interface ResultSummary {
  attempt_id: string;
  exam_id: string;
  exam_name: string;
  score: number;
  max_score: number;
  submitted_at: string;
  status: string;
}

export interface ResultDetail {
  attempt_id: string;
  exam_id: string;
  exam_name: string;
  score: number;
  max_score: number;
  submitted_at: string;
  duration_seconds?: number;
  status: string;
  answers?: Array<{
    question_id: string;
    question_type: string;
    content: string;
    student_answer: any;
    correct_answer?: any;
    is_correct?: boolean;
    points_awarded?: number;
    max_points?: number;
  }>;
}

export interface AttemptStart {
  attempt_id: string;
  exam_id: string;
  exam_name: string;
  duration_minutes: number;
  ends_at: string;
  saved_answers?: Record<string, any>;
  questions: Array<{
    question_id: string;
    question_type: string;
    content: string;
    data?: Record<string, any>;
    points: number;
  }>;
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
  created_at?: string;
  updated_at?: string;
}


export interface SubmissionRow {
  attempt_id: string;
  student_id: string;
  student_name?: string;
  submitted_at: string;
  score: number;
  max_score: number;
  status: string;
}

export interface SubmissionDetail {
  attempt_id: string;
  exam_id: string;
  student_id: string;
  student_name?: string;
  submitted_at: string;
  score: number;
  max_score: number;
  status: string;
  answers: Array<{
    question_id: string;
    question_type: string;
    content: string;
    student_answer: any;
    sample_answer?: string;
    max_points: number;
    points_awarded?: number;
    is_graded?: boolean;
  }>;
}







