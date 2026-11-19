from decimal import Decimal
from typing import Any, Dict, Tuple
from app.models.question import QuestionType


def grade_question(
    question_type: str,
    question_data: Dict[str, Any],
    question_points: Decimal,
    student_answer: Any
) -> Tuple[Decimal, bool, bool]:
    """
    Hàm chấm điểm tự động cho 1 câu hỏi.
    
    Returns:
        (points_earned, is_correct, needs_manual_grading)
    """
    if student_answer is None:
        return Decimal("0.00"), False, False

    q_data = question_data or {}
    points = Decimal(str(question_points))

    # 1. TRẮC NGHIỆM 1 ĐÁP ÁN (SINGLE_CHOICE)
    if question_type == QuestionType.SINGLE_CHOICE.value:
        options = q_data.get("options", [])
        correct_opt = next((opt for opt in options if opt.get("isCorrect")), None)
        
        if correct_opt and str(student_answer) == str(correct_opt.get("id")):
            return points, True, False
        return Decimal("0.00"), False, False

    # 2. TRẮC NGHIỆM NHIỀU ĐÁP ÁN (MULTIPLE_SELECT)
    elif question_type == QuestionType.MULTIPLE_SELECT.value:
        options = q_data.get("options", [])
        correct_ids = {str(opt["id"]) for opt in options if opt.get("isCorrect")}
        student_ids = set(map(str, student_answer)) if isinstance(student_answer, list) else set()

        if correct_ids == student_ids and len(correct_ids) > 0:
            return points, True, False
        return Decimal("0.00"), False, False

    # 3. ĐÚNG / SAI (TRUE_FALSE)
    elif question_type == QuestionType.TRUE_FALSE.value:
        statements = q_data.get("statements", [])
        if not statements or not isinstance(student_answer, dict):
            return Decimal("0.00"), False, False

        correct_count = 0
        for stmt in statements:
            stmt_id = str(stmt.get("id"))
            expected = bool(stmt.get("isCorrect"))
            actual = student_answer.get(stmt_id)
            if actual is not None and bool(actual) == expected:
                correct_count += 1

        total_stmts = len(statements)
        if total_stmts > 0 and correct_count == total_stmts:
            return points, True, False
        elif total_stmts > 0 and correct_count > 0:
            earned = (points * Decimal(correct_count)) / Decimal(total_stmts)
            return round(earned, 2), False, False
        return Decimal("0.00"), False, False

    # 4. ĐIỀN KHUYẾT (FILL_BLANK - HỖ TRỢ CẢ CHUỖI ĐƠN LẪN DICT & CẢ correctAnswer / correctAnswers)
    elif question_type == QuestionType.FILL_BLANK.value:
        blanks = q_data.get("blanks", [])
        if not blanks:
            return Decimal("0.00"), False, False

        # Chuẩn hóa câu trả lời của sinh viên thành dict {blank_id: value}
        if isinstance(student_answer, str):
            first_id = str(blanks[0].get("id", "blank_1"))
            ans_map = {first_id: student_answer}
        elif isinstance(student_answer, dict):
            ans_map = {str(k): v for k, v in student_answer.items()}
        else:
            return Decimal("0.00"), False, False

        correct_blanks = 0
        for blank in blanks:
            b_id = str(blank.get("id"))
            
            # Lấy danh sách đáp án hợp lệ (hỗ trợ cả dạng mảng correctAnswers và chuỗi đơn correctAnswer)
            valid_answers = []
            if isinstance(blank.get("correctAnswers"), list):
                valid_answers.extend([str(ans).strip().lower() for ans in blank["correctAnswers"] if ans])
            if blank.get("correctAnswer"):
                valid_answers.append(str(blank["correctAnswer"]).strip().lower())

            user_input = str(ans_map.get(b_id, "")).strip().lower()

            if user_input and user_input in valid_answers:
                correct_blanks += 1

        total_blanks = len(blanks)
        if total_blanks > 0 and correct_blanks == total_blanks:
            return points, True, False
        elif total_blanks > 0 and correct_blanks > 0:
            earned = (points * Decimal(correct_blanks)) / Decimal(total_blanks)
            return round(earned, 2), False, False
        return Decimal("0.00"), False, False

    # 5. TỰ LUẬN (ESSAY) - CẦN GIẢNG VIÊN CHẤM TAY
    elif question_type == QuestionType.ESSAY.value:
        return Decimal("0.00"), False, True

    return Decimal("0.00"), False, False