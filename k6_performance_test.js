import http from 'k6/http';
import { check, sleep } from 'k6';

// 1. CẤU HÌNH TẢI (LOAD PROFILE)
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp-up lên 50 sinh viên trong 30s
    { duration: '1m',  target: 200 },  // Tăng tải lên 200 sinh viên thi cùng lúc
    { duration: '2m',  target: 200 },  // Duy trì 200 sinh viên thi trong 2 phút (Đỉnh tải)
    { duration: '30s', target: 0 },    // Ramp-down giảm tải về 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% request phải có latency < 500ms
    http_req_failed: ['rate<0.01'],   // Tỷ lệ lỗi toàn hệ thống < 1%
  },
};

const BASE_URL = 'http://localhost:8000/api/v1'; // Đổi thành URL Gateway/Server của bạn

export default function () {
  const userId = `student_${__VU}_${__ITER}`;
  
  // -----------------------------------------------------------------
  // BƯỚC 1: BẮT ĐẦU -> ĐĂNG NHẬP (Luồng Sync)
  // -----------------------------------------------------------------
  const loginPayload = JSON.stringify({
    username: `student_${__VU}`,
    password: 'Password123!',
  });

  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    '1. Login thành công (200)': (r) => r.status === 200,
    '1. Có JWT Token': (r) => r.json('access_token') !== undefined,
  });

  const token = loginRes.json('access_token');
  const authHeaders = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  sleep(1); // Sinh viên dừng 1s đọc giao diện

  // -----------------------------------------------------------------
  // BƯỚC 2: NHẬP MÃ PIN / VÀO PHÒNG THI (Luồng Sync)
  // -----------------------------------------------------------------
  const joinPayload = JSON.stringify({
    pin_code: '2DX6YC',
  });

  const joinRes = http.post(`${BASE_URL}/attempts/join`, joinPayload, authHeaders);

  check(joinRes, {
    '2. Nhập mã PIN vào thi thành công (200/201)': (r) => r.status === 200 || r.status === 201,
    '2. Lấy được attempt_id': (r) => r.json('attempt_id') !== undefined,
  });

  const attemptId = joinRes.json('attempt_id') || 'att_test_123';
  sleep(2); // Dừng 2s chuẩn bị làm bài

  // -----------------------------------------------------------------
  // BƯỚC 3: LÀM BÀI THI - LƯU NHÁP LIÊN TỤC (Luồng Async - High Frequency)
  // -----------------------------------------------------------------
  // Giả lập sinh viên làm 5 câu hỏi trắc nghiệm
  const totalQuestions = 5;

  for (let q = 1; q <= totalQuestions; q++) {
    const saveAnswerPayload = JSON.stringify({
      question_id: `q_${q}`,
      selected_option: `option_${Math.floor(Math.random() * 4) + 1}`, // Chọn random A/B/C/D
      client_timestamp: new Date().toISOString(),
    });

    // API Async đẩy vào Queue (Kafka/Redis Stream)
    const saveRes = http.put(
      `${BASE_URL}/attempts/${attemptId}/save-answer`,
      saveAnswerPayload,
      authHeaders
    );

    check(saveRes, {
      '3. Lưu đáp án Async thành công (202 Accepted)': (r) => r.status === 202 || r.status === 200,
    });

    // Mô phỏng sinh viên suy nghĩ giữa từng câu (từ 3s đến 7s)
    sleep(Math.floor(Math.random() * 5) + 3);
  }

  // -----------------------------------------------------------------
  // BƯỚC 4: NỘP BÀI THI CHÍNH THỨC (Luồng Sync)
  // -----------------------------------------------------------------
  const submitRes = http.post(
    `${BASE_URL}/attempts/${attemptId}/submit`,
    null,
    authHeaders
  );

  check(submitRes, {
    '4. Nộp bài thành công (200)': (r) => r.status === 200,
    '4. Trạng thái đã chốt (CLOSED/SUBMITTED)': (r) => r.json('status') !== undefined,
  });

  sleep(1);

  // -----------------------------------------------------------------
  // BƯỚC 5: XEM KẾT QUẢ BÀI THI (Luồng Sync)
  // -----------------------------------------------------------------
  const resultRes = http.get(
    `${BASE_URL}/attempts/${attemptId}/result`,
    authHeaders
  );

  check(resultRes, {
    '5. Lấy điểm/kết quả thành công (200)': (r) => r.status === 200,
  });

  sleep(2); // Kết thúc 1 phiên người dùng
}