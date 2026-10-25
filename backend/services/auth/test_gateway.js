import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { Trend } from 'k6/metrics';

// Cho phép các HTTP Status 200, 201, 400 và 503 (Load Shedding từ Gateway) 
http.setResponseCallback(http.expectedStatuses(200, 201, 400, 503));

// 1. TẠO TẬP METRICS ĐO TỐC ĐỘ (LATENCY) RIÊNG CHO TỪNG BƯỚC
const joinTrend = new Trend('delay_exam_join');
const draftTrend = new Trend('delay_exam_draft');
const submitTrend = new Trend('delay_exam_submit');
const resultTrend = new Trend('delay_exam_result');

// 2. LOAD DANH SÁCH USER
const users = new SharedArray('users_data', function () {
  return JSON.parse(open('./users.json'));
});

export const options = {
  stages: [
    // Mốc 1 VU: Chạy 30s để lấy Baseline chuẩn
    // { duration: '30s', target: 1 },

    // // Ramp-up lên 10 VUs (15s) và Giữ tải 10 VUs (30s)
    // { duration: '15s', target: 10 },
    // { duration: '30s', target: 10 },

    // // Ramp-up lên 50 VUs (15s) và Giữ tải 50 VUs (30s)
    // { duration: '15s', target: 50 },
    // { duration: '30s', target: 50 },

    // // Ramp-up lên 100 VUs (15s) và Giữ tải 100 VUs (1m)
    // { duration: '15s', target: 100 },
    // { duration: '1m',  target: 100 },

    // // Ramp-up lên 500 VUs (30s) và Giữ tải 500 VUs (1m)
    // { duration: '30s', target: 500 },
    // { duration: '1m',  target: 500 },

    // // Ramp-up lên 1000 VUs (30s) và Giữ tải 1000 VUs (1m)
    // { duration: '30s', target: 1000 },
    // { duration: '1m',  target: 1000 },

    // // Ramp-up lên 4000 VUs (1m) và Giữ tải 4000 VUs (1m) - Mốc Stress Test
    { duration: '1m',  target: 4000 },
    { duration: '1m',  target: 4000 },

    // // Ramp-down giảm tải về 0
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'delay_exam_submit': ['p(95)<1500'], // Luồng Submit ưu tiên cao nhất: p(95) < 1.5s
    'delay_exam_join': ['p(95)<2000'],   // Luồng Join: p(95) < 2s
    http_req_failed: ['rate<0.10'],      // Tỷ lệ lỗi hệ thống không mong muốn < 10%
  },
};

// ĐIỀU CHỈNH: Trỏ vào API Gateway trên Kubernetes NodePort 30888
const GATEWAY_URL = 'http://localhost:30888/api/v1'; 
const ACCESS_CODE = 'X4B25K'; // Mã PIN phòng thi

export default function () {
  const userIndex = (exec.scenario.iterationInTest) % users.length;
  const currentUser = users[userIndex];
  const token = currentUser.token;

  if (!token) return;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  let attemptId = null;
  let questions = [];

  // ==========================================
  // BƯỚC 1: NHẬP MÃ PIN VÀO PHÒNG THI (JOIN)
  // ==========================================
  const joinPayload = JSON.stringify({ access_code: ACCESS_CODE });
  const joinRes = http.post(`${GATEWAY_URL}/attempts/join`, joinPayload, params);

  // Đẩy thời gian phản hồi vào Metric riêng của Join
  joinTrend.add(joinRes.timings.duration);

  if (joinRes.status === 200 || joinRes.status === 201) {
    attemptId = joinRes.json('attempt_id');
    questions = joinRes.json('questions') || [];
  } else if (joinRes.status === 400) {
    // Nếu user đã join rồi, lấy active attempt hiện tại để làm tiếp
    const activeRes = http.get(`${GATEWAY_URL}/attempts/active?access_code=${ACCESS_CODE}`, params);
    if (activeRes.status === 200) {
      attemptId = activeRes.json('attempt_id');
      questions = activeRes.json('questions') || [];
    }
  } else if (joinRes.status === 503) {
    // Bị Load Shedding xả bớt do Gateway quá tải
  } else {
    // Log lỗi bất thường (1% sample rate)
    if (Math.random() < 0.01) {
      console.log(`❌ Lỗi Join [VU ${exec.vu.idInTest} - Status ${joinRes.status}]: ${joinRes.body}`);
    }
  }

  const isJoinOk = check(joinRes, {
    '1. [Gateway] Join phòng thi (200/201/400/503)': (r) => [200, 201, 400, 503].includes(r.status),
  });

  if (!attemptId || !isJoinOk) return;

  sleep(1);

  // Tạo câu trả lời ngẫu nhiên
  const answersMap = {};
  if (questions.length > 0) {
    questions.forEach((q) => {
      answersMap[q.question_id] = `option_${Math.floor(Math.random() * 4) + 1}`;
    });
  }

  // ==========================================
  // BƯỚC 2: LƯU BÀI THI NHÁP (DRAFT)
  // ==========================================
  const draftRes = http.put(
    `${GATEWAY_URL}/attempts/${attemptId}/draft`,
    JSON.stringify({ answers: answersMap }),
    params
  );
  draftTrend.add(draftRes.timings.duration);

  check(draftRes, {
    '2. [Gateway] Save draft (200/503)': (r) => r.status === 200 || r.status === 503,
  });

  sleep(1);

  // ==========================================
  // BƯỚC 3: NỘP BÀI THI (SUBMIT) - ƯU TIÊN CAO NHẤT
  // ==========================================
  const submitRes = http.post(
    `${GATEWAY_URL}/attempts/${attemptId}/submit`,
    JSON.stringify({ answers: answersMap }),
    params
  );
  submitTrend.add(submitRes.timings.duration);

  check(submitRes, {
    '3. [Gateway] Submit bài thi thành công (200)': (r) => r.status === 200,
  });

  sleep(1);

  // ==========================================
  // BƯỚC 4: XEM KẾT QUẢ BÀI THI (RESULT)
  // ==========================================
  const resultRes = http.get(
    `${GATEWAY_URL}/attempts/${attemptId}/result`,
    params
  );
  resultTrend.add(resultRes.timings.duration);

  check(resultRes, {
    '4. [Gateway] Xem kết quả (200/503)': (r) => r.status === 200 || r.status === 503,
  });

  sleep(1);
}