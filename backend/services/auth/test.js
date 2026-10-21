import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp-up nhẹ nhàng trong 30s
    { duration: '1m',  target: 200 },  // Đạt đỉnh 200 VUs
    { duration: '30s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // Đặt mốc latency p95 < 1s cho 200 VUs
    http_req_failed: ['rate<0.05'],    // Tỷ lệ lỗi cho phép < 5%
  },
};

const AUTH_URL = 'http://localhost:8000/api/v1';
const EXAM_URL = 'http://localhost:8001/api/v1';

export default function () {
  // Lấy duy nhất 1 ID sinh viên duy nhất cho mỗi lượt chạy (Xoay vòng từ student1 -> student200)
  const uniqueId = (exec.scenario.iterationInTest % 200) + 1;
  const studentEmail = `student${uniqueId}@lumer.edu.vn`;

  // 1. ĐĂNG NHẬP (Auth Service)
  const loginRes = http.post(`${AUTH_URL}/users/login`, JSON.stringify({
    email: studentEmail,
    password: 'Password123!',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const isLoginOk = check(loginRes, {
    '1. [Auth] Login thành công (200)': (r) => r.status === 200,
  });

  if (!isLoginOk || !loginRes.json('access_token')) return;

  const token = loginRes.json('access_token');
  const authHeaders = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  sleep(1);

  // 2. NHẬP MÃ PIN VÀO PHÒNG THI (Exam Service)
  const joinRes = http.post(`${EXAM_URL}/attempts/join`, JSON.stringify({
    access_code: 'PZ3S27',
  }), authHeaders);

  const isJoinOk = check(joinRes, {
    '2. [Exam] Join phòng thi (200)': (r) => r.status === 200,
  });

  if (!isJoinOk || !joinRes.json('attempt_id')) return;

  const attemptId = joinRes.json('attempt_id');
  const questions = joinRes.json('questions') || [];

  // Lấy chi tiết attempt
  http.get(`${EXAM_URL}/attempts/${attemptId}`, authHeaders);

  sleep(2);

  // 3. LƯU BÀI THI NHÁP (Draft)
  const answersMap = {};
  if (questions.length > 0) {
    questions.forEach((q) => {
      answersMap[q.question_id] = `option_${Math.floor(Math.random() * 4) + 1}`;
    });
  }

  const draftRes = http.put(
    `${EXAM_URL}/attempts/${attemptId}/draft`,
    JSON.stringify({ answers: answersMap }),
    authHeaders
  );

  check(draftRes, {
    '3. [Exam] Save draft (200)': (r) => r.status === 200,
  });

  sleep(2);

  // 4. NỘP BÀI THI
  const submitRes = http.post(
    `${EXAM_URL}/attempts/${attemptId}/submit`,
    JSON.stringify({ answers: answersMap }),
    authHeaders
  );

  check(submitRes, {
    '4. [Exam] Submit (200)': (r) => r.status === 200,
  });

  sleep(1);

  // 5. XEM KẾT QUẢ BÀI THI
  const resultRes = http.get(
    `${EXAM_URL}/attempts/${attemptId}/result`,
    authHeaders
  );

  check(resultRes, {
    '5. [Exam] Xem kết quả (200)': (r) => r.status === 200,
  });

  sleep(1);
}