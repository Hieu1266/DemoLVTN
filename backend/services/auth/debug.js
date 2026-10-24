// Chạy: k6 run debug.js
// Mục đích: gửi lần lượt từng bước với 1 user và IN RA status + nội dung phản hồi để biết fail vì lý do gì.
import http from 'k6/http';

const users = JSON.parse(open('./users.json'));
const EXAM_URL = 'http://localhost:31001/api/v1';
const ACCESS_CODE = 'YMY8S3'; // đổi thành mã PIN đề cần thử

export const options = { vus: 1, iterations: 1 };

function show(step, res) {
  console.log(`\n=== ${step} ===\nstatus: ${res.status}\nbody: ${String(res.body).slice(0, 600)}`);
}

export default function () {
  const user = users[0]; // đổi chỉ số để thử user khác
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    },
  };

  // 1. Join
  const join = http.post(`${EXAM_URL}/attempts/join`, JSON.stringify({ access_code: ACCESS_CODE }), params);
  show('1. JOIN', join);
  if (join.status !== 200 && join.status !== 201) {
    console.log('\n>>> Dừng ở bước JOIN. Đọc "body" ở trên: đó là lý do thật.');
    return;
  }

  const attemptId = join.json('attempt_id');
  const questions = join.json('questions') || [];
  console.log(`\nattempt_id=${attemptId}, số câu hỏi=${questions.length}`);

  const answers = {};
  questions.forEach((q) => { answers[q.question_id] = 'option_1'; });

  // 2. Draft
  show('2. DRAFT', http.put(`${EXAM_URL}/attempts/${attemptId}/draft`, JSON.stringify({ answers }), params));
  // 3. Submit
  show('3. SUBMIT', http.post(`${EXAM_URL}/attempts/${attemptId}/submit`, JSON.stringify({ answers }), params));
  // 4. Result
  show('4. RESULT', http.get(`${EXAM_URL}/attempts/${attemptId}/result`, params));
}