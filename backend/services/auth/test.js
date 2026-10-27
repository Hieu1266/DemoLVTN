import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

// Bỏ đánh dấu lỗi cho status 400 khi Join phòng thi
http.setResponseCallback(http.expectedStatuses(200, 201, 400));
// 1. Load danh sách 2,000 user đã có Token từ file users.json
const users = new SharedArray('users_data', function () {
  return JSON.parse(open('./users.json'));
});

export const options = {
  // Cấu hình tăng tải từ nhẹ đến đỉnh điểm 1,000 VUs
  stages: [
  //   // Mốc 1 VU: Chạy 30s để lấy Baseline chuẩn
    // { duration: '30s', target: 1 },

    // Ramp-up lên 10 VUs (15s) và Giữ tải 10 VUs (30s)
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
    // // Ramp-up lên 4000 VUs (1m) và Giữ tải 4000 VUs (1m) - Mốc Stress Test
    
    // { duration: '1m30s',  target: 10000 },
    // { duration: '2m',  target: 10000 },
    // // Ramp-down giảm tải về 0
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // Latency p95 kỳ vọng < 2s
    http_req_failed: ['rate<0.05'],    // Tỷ lệ lỗi cho phép < 5%
  },
};

// Cấu hình NodePort của Exam Service trên K8s cluster
const EXAM_URL = 'http://localhost:31001/api/v1'; 
const ACCESS_CODE = 'X4B25K'; // Mã PIN phòng thi

export default function () {
  // Phân bổ đều 2,000 user cho các VUs theo vòng lặp
  const userIndex = (exec.scenario.iterationInTest) % users.length;
  const currentUser = users[userIndex];
  const token = currentUser.token;

  if (!token) return; // Bỏ qua nếu user thiếu token

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
  const joinRes = http.post(`${EXAM_URL}/attempts/join`, joinPayload, params);

  if (joinRes.status === 200 || joinRes.status === 201) {
    attemptId = joinRes.json('attempt_id');
    questions = joinRes.json('questions') || [];
  } else if (joinRes.status === 400) {
    // Nếu user đã join rồi (lỗi 400), gọi API lấy active attempt hiện tại để làm tiếp
    const activeRes = http.get(`${EXAM_URL}/attempts/active?access_code=${ACCESS_CODE}`, params);
    if (activeRes.status === 200) {
      attemptId = activeRes.json('attempt_id');
      questions = activeRes.json('questions') || [];
    }
  } else {
    // Log mẫu 1% số lượng lỗi bất thường khác (500, 502,...) ra console
    if (Math.random() < 0.01) {
      console.log(`❌ Lỗi Join [VU ${__VU} - Status ${joinRes.status}]: ${joinRes.body}`);
    }
  }

  const isJoinOk = check(joinRes, {
    '1. [Exam] Join phòng thi thành công (hoặc đã tham gia)': (r) => r.status === 200 || r.status === 201 || r.status === 400,
  });

  if (!attemptId || !isJoinOk) return;

  sleep(1);

  // Tạo câu trả lời ngẫu nhiên cho danh sách câu hỏi
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
    `${EXAM_URL}/attempts/${attemptId}/draft`,
    JSON.stringify({ answers: answersMap }),
    params
  );

  check(draftRes, {
    '2. [Exam] Save draft thành công (200)': (r) => r.status === 200,
  });

  sleep(1);

  // ==========================================
  // BƯỚC 3: NỘP BÀI THI (SUBMIT)
  // ==========================================
  const submitRes = http.post(
    `${EXAM_URL}/attempts/${attemptId}/submit`,
    JSON.stringify({ answers: answersMap }),
    params
  );

  check(submitRes, {
    '3. [Exam] Submit thành công (200)': (r) => r.status === 200,
  });

  sleep(1);

  // ==========================================
  // BƯỚC 4: XEM KẾT QUẢ BÀI THI (RESULT)
  // ==========================================
  const resultRes = http.get(
    `${EXAM_URL}/attempts/${attemptId}/result`,
    params
  );

  check(resultRes, {
    '4. [Exam] Xem kết quả thành công (200)': (r) => r.status === 200,
  });

  sleep(1);
}