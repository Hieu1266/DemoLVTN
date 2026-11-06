// // ============================================================================
// // LOAD BALANCING & PRIORITY TEST (K8s Microservices + API Gateway)
// //
// // Mô hình dội tải đồng thời (t=0s):
// //   - Luồng THI (High Priority): 1000 VUs dội tải cực mạnh (studentPool)
// //   - Luồng XEM LỊCH SỬ (Low Priority): 10 VUs (studentPool)
// //   - Luồng CHẤM BÀI (Low Priority): 5 VUs (teacherPool - role_id=3)
// //   - Luồng TẠO ĐỀ THI (Low Priority): 5 VUs (teacherPool - role_id=3)
// //   - Luồng ADMIN TẠO USER (Low Priority): 2 VUs (adminPool - role_id=1)
// // ============================================================================
// import http from 'k6/http';
// import { check, sleep } from 'k6';
// import { SharedArray } from 'k6/data';
// import exec from 'k6/execution';
// import { Trend, Counter, Rate, Gauge } from 'k6/metrics';

// const GATEWAY_BASE = __ENV.GATEWAY_BASE || 'http://localhost:30888';
// const GATEWAY_URL = `${GATEWAY_BASE}/api/v1`;
// const ACCESS_CODE = __ENV.ACCESS_CODE || 'X4B25K';
// const PROFILE = __ENV.PROFILE || 'lb1000';

// // 200/201 = thành công, 400 = từ chối nghiệp vụ, 403 = cấm quyền, 503 = Gateway xả tải
// http.setResponseCallback(http.expectedStatuses(200, 201, 400, 403, 503));

// // ---------------------------------------------------------------- Metrics
// const joinTrend = new Trend('delay_exam_join', true);
// const draftTrend = new Trend('delay_exam_draft', true);
// const submitTrend = new Trend('delay_exam_submit', true);
// const resultTrend = new Trend('delay_exam_result', true);
// const createExamTrend = new Trend('delay_create_exam', true);
// const gradeTrend = new Trend('delay_grade_submission', true);
// const historyTrend = new Trend('delay_my_history', true);
// const createTeacherTrend = new Trend('delay_admin_create_teacher', true);

// const gatewayWait = new Trend('gateway_wait_ms', true);
// const reqByInstance = new Counter('req_by_instance');
// const shed503 = new Rate('shed_503');
// const flowCompleted = new Counter('flow_completed');
// const flowStopped = new Counter('flow_stopped');

// const gwInUse = new Gauge('gw_in_use');
// const gwWaiting = new Gauge('gw_waiting');
// const gwCapacity = new Gauge('gw_capacity');
// const instActive = new Gauge('inst_active');

// // ---------------------------------------------------------------- Hồ sơ tải
// const PROFILES = {
//   smoke: [
//     { duration: '30s', target: 1 },
//     { duration: '15s', target: 0 },
//   ],
//   lb100: [
//     { duration: '15s', target: 100 },
//     { duration: '1m', target: 100 },
//     { duration: '30s', target: 0 },
//   ],
//   lb500: [
//     { duration: '30s', target: 500 },
//     { duration: '3m', target: 500 },
//     { duration: '30s', target: 0 },
//   ],
//   lb1000: [
//     { duration: '30s', target: 1000 },
//     { duration: '3m', target: 1000 },
//     { duration: '30s', target: 0 },
//   ],
// };

// function toSec(d) {
//   const m = /^(\d+)(s|m|h)$/.exec(d);
//   return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]];
// }

// const stages = PROFILES[PROFILE] || PROFILES.lb1000;
// const totalSec = stages.reduce((sum, st) => sum + toSec(st.duration), 0);

// // ---------------------------------------------------------------- Options Scenarios
// export const options = {
//   scenarios: {
//     // 1. LUỒNG THI (HIGH PRIORITY - NẶNG NHẤT 1000 VUs)
//     heavy_student_exam: {
//       executor: 'ramping-vus',
//       exec: 'userFlow',
//       startVUs: 0,
//       startTime: '0s',
//       stages,
//       gracefulRampDown: '30s',
//     },

//     // 2. LUỒNG XEM LỊCH SỬ (LOW PRIORITY - 10 VUs)
//     low_priority_history: {
//       executor: 'constant-vus',
//       exec: 'studentHistoryFlow',
//       vus: 10,
//       startTime: '0s',
//       duration: `${totalSec}s`,
//     },

//     // 3. LUỒNG GIẢNG VIÊN CHẤM BÀI (LOW PRIORITY - 5 VUs)
//     low_priority_grading: {
//       executor: 'constant-vus',
//       exec: 'teacherGradingFlow',
//       vus: 5,
//       startTime: '0s',
//       duration: `${totalSec}s`,
//     },

//     // 4. LUỒNG GIẢNG VIÊN TẠO ĐỀ (LOW PRIORITY - 5 VUs)
//     low_priority_create_exam: {
//       executor: 'constant-vus',
//       exec: 'teacherCreateExamFlow',
//       vus: 5,
//       startTime: '0s',
//       duration: `${totalSec}s`,
//     },

//     // 5. LUỒNG ADMIN TẠO USER (LOW PRIORITY - 2 VUs)
//     low_priority_admin: {
//       executor: 'constant-vus',
//       exec: 'adminCreateTeacherFlow',
//       vus: 2,
//       startTime: '0s',
//       duration: `${totalSec}s`,
//     },

//     // 6. GIÁM SÁT GATEWAY
//     monitor: {
//       executor: 'constant-vus',
//       exec: 'monitor',
//       vus: 1,
//       startTime: '0s',
//       duration: `${totalSec}s`,
//     },
//   },

//   thresholds: {
//     delay_exam_submit: ['p(95)<2000'],
//     delay_exam_join: ['p(95)<3000'],
//     shed_503: ['rate<0.30'],
//   },
// };

// // ---------------------------------------------------------------- Load & Phân nhóm User Pools
// const allUsers = new SharedArray('users_data', function () {
//   return JSON.parse(open('./users.json'));
// });

// const adminPool = allUsers.filter((u) => u.role && u.role.toUpperCase() === 'ADMIN');
// const teacherPool = allUsers.filter((u) => u.role && u.role.toUpperCase() === 'TEACHER');
// const studentPool = allUsers.filter((u) => !u.role || u.role.toUpperCase() === 'STUDENT');

// // ---------------------------------------------------------------- Setup Precheck
// export function setup() {
//   if (__ENV.PRECHECK === 'off') return;
//   const user = studentPool.length > 0 ? studentPool[0] : allUsers[0];
//   const res = http.post(
//     `${GATEWAY_URL}/attempts/join`,
//     JSON.stringify({ access_code: ACCESS_CODE }),
//     {
//       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
//       tags: { name: 'precheck_join' },
//     }
//   );
//   console.log(`[PRECHECK] join -> HTTP ${res.status} | ${String(res.body).slice(0, 200)}`);
//   if (res.status !== 200 && res.status !== 201) {
//     exec.test.abort(`Join không thành công (HTTP ${res.status}). Kiểm tra mã ACCESS_CODE hoặc đề thi trong DB.`);
//   }
// }

// // ---------------------------------------------------------------- Helper Functions
// function header(res, name) {
//   const target = name.toLowerCase();
//   for (const k in res.headers) {
//     if (k.toLowerCase() === target) return res.headers[k];
//   }
//   return '';
// }

// function record(step, res, trend) {
//   const inst = header(res, 'x-gateway-instance') || 'none';
//   const pod = header(res, 'x-pod-name');
//   const tags = { step, inst, code: String(res.status) };
//   if (pod) tags.pod = pod;

//   trend.add(res.timings.duration, tags);
//   reqByInstance.add(1, tags);
//   shed503.add(res.status === 503, { step });

//   const wait = parseFloat(header(res, 'x-gateway-wait-seconds'));
//   if (!isNaN(wait)) gatewayWait.add(wait * 1000, { step, inst });
// }

// function safeJson(res, path) {
//   try {
//     return res.json(path);
//   } catch (e) {
//     return undefined;
//   }
// }

// // ============================================================================
// // 1. LUỒNG CHÍNH: HỌC VIÊN LÀM BÀI THI (HIGH PRIORITY - 1000 VUs)
// // ============================================================================
// export function userFlow() {
//   const pool = studentPool.length > 0 ? studentPool : allUsers;
//   const user = pool[exec.scenario.iterationInTest % pool.length];
//   if (!user || !user.token) return;

//   const headers = {
//     'Content-Type': 'application/json',
//     Authorization: `Bearer ${user.token}`,
//   };
//   const withName = (name) => ({ headers, tags: { name } });

//   // BƯỚC 1: JOIN (High Priority)
//   const joinRes = http.post(
//     `${GATEWAY_URL}/attempts/join`,
//     JSON.stringify({ access_code: ACCESS_CODE }),
//     withName('attempts/join')
//   );
//   record('join', joinRes, joinTrend);

//   if (joinRes.status !== 200 && joinRes.status !== 201) {
//     flowStopped.add(1, { at: 'join', reason: String(joinRes.status) });
//     return;
//   }

//   const attemptId = safeJson(joinRes, 'attempt_id');
//   const questions = safeJson(joinRes, 'questions') || [];
//   if (!attemptId) {
//     flowStopped.add(1, { at: 'join', reason: 'no_attempt_id' });
//     return;
//   }
//   sleep(1);

//   const answers = {};
//   questions.forEach((q) => {
//     answers[q.question_id || q.id] = `option_${Math.floor(Math.random() * 4) + 1}`;
//   });

//   // BƯỚC 2: DRAFT (Medium Priority)
//   const draftRes = http.put(
//     `${GATEWAY_URL}/attempts/${attemptId}/draft`,
//     JSON.stringify({ answers }),
//     withName('attempts/draft')
//   );
//   record('draft', draftRes, draftTrend);
//   check(draftRes, { 'draft 200/503': (r) => r.status === 200 || r.status === 503 });
//   sleep(1);

//   // BƯỚC 3: SUBMIT (Highest Priority)
//   const submitRes = http.post(
//     `${GATEWAY_URL}/attempts/${attemptId}/submit`,
//     JSON.stringify({ answers }),
//     withName('attempts/submit')
//   );
//   record('submit', submitRes, submitTrend);
//   check(submitRes, { 'submit 200': (r) => r.status === 200 });
//   sleep(1);

//   // BƯỚC 4: RESULT
//   const resultRes = http.get(
//     `${GATEWAY_URL}/attempts/${attemptId}/result`,
//     withName('attempts/result')
//   );
//   record('result', resultRes, resultTrend);
//   check(resultRes, { 'result 200/503': (r) => r.status === 200 || r.status === 503 });

//   flowCompleted.add(1);
//   sleep(1);
// }

// // ============================================================================
// // 2. LUỒNG PHỤ: HỌC VIÊN XEM LỊCH SỬ (LOW PRIORITY - 10 VUs)
// // ============================================================================
// export function studentHistoryFlow() {
//   const pool = studentPool.length > 0 ? studentPool : allUsers;
//   const user = pool[exec.scenario.iterationInTest % pool.length];
//   if (!user || !user.token) return;

//   const headers = {
//     'Content-Type': 'application/json',
//     Authorization: `Bearer ${user.token}`,
//   };

//   const res = http.get(`${GATEWAY_URL}/attempts/my-history`, {
//     headers,
//     tags: { name: 'attempts/my-history' },
//   });

//   record('my_history', res, historyTrend);
//   check(res, { 'my-history 200/503': (r) => r.status === 200 || r.status === 503 });
//   sleep(2);
// }

// // ============================================================================
// // 3. LUỒNG PHỤ: GIẢNG VIÊN TẠO ĐỀ THI (LOW PRIORITY - 5 VUs, role_id=3)
// // ============================================================================
// export function teacherCreateExamFlow() {
//   const pool = teacherPool.length > 0 ? teacherPool : allUsers;
//   const user = pool[exec.scenario.iterationInTest % pool.length];
//   if (!user || !user.token) return;

//   const headers = {
//     'Content-Type': 'application/json',
//     Authorization: `Bearer ${user.token}`,
//   };

//   const payload = JSON.stringify({
//     title: `Đề thi K8s Priority #${exec.scenario.iterationInTest}`,
//     description: 'Tự động tạo từ k6 scenario',
//     duration_minutes: 60,
//     max_attempts: 0,
//     pass_score: 5.0,
//     access_code: `TEST_${Math.floor(Math.random() * 10000)}`,
//   });

//   const res = http.post(`${GATEWAY_URL}/exams/`, payload, {
//     headers,
//     tags: { name: 'exams/create' },
//   });

//   record('create_exam', res, createExamTrend);
//   check(res, { 'exams/create 200/201/503': (r) => r.status === 200 || r.status === 201 || r.status === 503 });
//   sleep(3);
// }

// // ============================================================================
// // 4. LUỒNG PHỤ: GIẢNG VIÊN CHẤM BÀI (LOW PRIORITY - 5 VUs, role_id=3)
// // ============================================================================
// export function teacherGradingFlow() {
//   const pool = teacherPool.length > 0 ? teacherPool : allUsers;
//   const user = pool[exec.scenario.iterationInTest % pool.length];
//   if (!user || !user.token) return;

//   const headers = {
//     'Content-Type': 'application/json',
//     Authorization: `Bearer ${user.token}`,
//   };

//   // 1. Lấy danh sách đề thi
//   const examsRes = http.get(`${GATEWAY_URL}/exams/`, {
//     headers,
//     tags: { name: 'exams/list' },
//   });

//   if (examsRes.status !== 200) return;
//   const exams = safeJson(examsRes, 'data') || safeJson(examsRes) || [];
//   if (!Array.isArray(exams) || exams.length === 0) return;

//   const examId = exams[0].id || exams[0].exam_id;
//   if (!examId) return;

//   // 2. Lấy danh sách bài nộp
//   const subRes = http.get(`${GATEWAY_URL}/exams/${examId}/submissions`, {
//     headers,
//     tags: { name: 'exams/submissions' },
//   });

//   if (subRes.status !== 200) return;
//   const submissions = safeJson(subRes, 'data') || safeJson(subRes) || [];
//   if (!Array.isArray(submissions) || submissions.length === 0) return;

//   const attemptId = submissions[0].attempt_id || submissions[0].id;
//   if (!attemptId) return;

//   // 3. Thực hiện chấm bài
//   const gradePayload = JSON.stringify({
//     score: 8.5,
//     feedback: 'Bài làm thử nghiệm priority.',
//   });

//   const gradeRes = http.post(
//     `${GATEWAY_URL}/exams/submissions/${attemptId}/grade`,
//     gradePayload,
//     { headers, tags: { name: 'exams/grade' } }
//   );

//   record('grade_submission', gradeRes, gradeTrend);
//   check(gradeRes, { 'grade 200/503': (r) => r.status === 200 || r.status === 503 });
//   sleep(2);
// }

// // ============================================================================
// // 5. LUỒNG PHỤ: ADMIN TẠO USER MỚI (LOW PRIORITY - 2 VUs, role_id=1)
// // ============================================================================
// export function adminCreateTeacherFlow() {
//   const admin = adminPool.length > 0 ? adminPool[0] : allUsers[0];
//   if (!admin || !admin.token) return;

//   const headers = {
//     'Content-Type': 'application/json',
//     Authorization: `Bearer ${admin.token}`,
//   };

//   const payload = JSON.stringify({
//     username: `ins_created_${exec.scenario.iterationInTest}_${Date.now() % 10000}`,
//     email: `ins_created_${exec.scenario.iterationInTest}@lumer.edu.vn`,
//     password: 'instructor123',
//     full_name: 'Giảng viên Tạo Tự Động',
//     role_id: 3, // Tạo tài khoản Giảng viên trong CSDL
//   });

//   const res = http.post(`${GATEWAY_URL}/users/register`, payload, {
//     headers,
//     tags: { name: 'admin/register_user' },
//   });

//   record('admin_create_user', res, createTeacherTrend);
//   check(res, { 'admin create 200/201/503': (r) => r.status === 200 || r.status === 201 || r.status === 503 });
//   sleep(3);
// }

// // ============================================================================
// // 6. MONITOR: THEO DÕI STATE GATEWAY
// // ============================================================================
// export function monitor() {
//   const res = http.get(`${GATEWAY_BASE}/debug/state`, {
//     tags: { name: 'debug_state' },
//     responseCallback: http.expectedStatuses(200, 404),
//   });

//   if (res.status === 200) {
//     const state = safeJson(res);
//     if (state) {
//       const lists = state.waitlists || {};
//       for (const svc of Object.keys(lists)) {
//         gwInUse.add(lists[svc].in_use, { svc });
//         gwWaiting.add(lists[svc].waiting, { svc });
//         gwCapacity.add(lists[svc].capacity, { svc });
//       }
//       const insts = state.instances || {};
//       for (const svc of Object.keys(insts)) {
//         insts[svc].forEach((i) => instActive.add(i.active_connections, { svc, inst: i.url }));
//       }
//     }
//   }
//   sleep(5);
// }










// ============================================================================
// LOAD BALANCING TEST (qua API Gateway)
//
// Chạy (ví dụ):
//   k6 run --out csv=lb_run.csv -e PROFILE=lb100 -e ACCESS_CODE=ABC123 lb_test.js
//   python analyze_lb.py lb_run.csv
//
// PROFILE: smoke (kiểm tra nhanh) | lb100 | lb500
// Biến môi trường tùy chọn: GATEWAY_BASE (mặc định http://localhost:30888), ACCESS_CODE
//
// LƯU Ý TRƯỚC KHI CHẠY
//  - Dùng đề thi cho phép thi lại không giới hạn (max_attempts = 0), nếu không user sẽ
//    hết lượt và luồng dừng ở bước join (400), làm sai số liệu.
//  - Gateway đã trả các header x-gateway-instance / x-gateway-wait-seconds /
//    x-gateway-priority. Muốn thấy phân phối theo POD, cho backend trả thêm header
//    X-Pod-Name (giá trị biến HOSTNAME); script sẽ tự đọc nếu có.
// ============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { Trend, Counter, Rate, Gauge } from 'k6/metrics';

const GATEWAY_BASE = __ENV.GATEWAY_BASE || 'http://localhost:30888';
const GATEWAY_URL = `${GATEWAY_BASE}/api/v1`;
const ACCESS_CODE = __ENV.ACCESS_CODE || 'X4B25K';
const PROFILE = __ENV.PROFILE || 'smoke';

// 200/201 = thành công, 400 = từ chối nghiệp vụ, 503 = gateway xả tải (load shedding)
http.setResponseCallback(http.expectedStatuses(200, 201, 400, 503));

// ---------------------------------------------------------------- Hồ sơ tải
// Thời gian giữ tải đủ dài để HPA kịp thêm pod (tối đa 2 pod mỗi 30 giây).
const PROFILES = {
  smoke: [
    { duration: '30s', target: 1 },
    { duration: '15s', target: 0 },
  ],
  lb50: [
    { duration: '15s', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  lb100: [
    { duration: '15s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  lb500: [
    { duration: '30s', target: 500 },
    { duration: '5m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  lb1000: [
    { duration: '1m', target: 1000 },
    { duration: '5m', target: 1000 },
    { duration: '30s', target: 0 },
  ],
  lb3000: [
    { duration: '1m', target: 2000 },
    { duration: '5m', target: 2000 },
    { duration: '30s', target: 0 },
  ],
  lb3005: [
    { duration: '1m', target: 4000 },
    { duration: '5m', target: 4000 },
    { duration: '30s', target: 0 },
  ],
  lb3010: [
    { duration: '1m', target: 4000 },
    { duration: '10m', target: 4000 },
    { duration: '30s', target: 0 },
  ],
  lb3015: [
    { duration: '1m', target: 4000 },
    { duration: '15m', target: 4000 },
    { duration: '30s', target: 0 },
  ],
  lb3020: [
    { duration: '1m', target: 4000 },
    { duration: '20m', target: 4000 },
    { duration: '30s', target: 0 },
  ],

};

function toSec(d) {
  const m = /^(\d+)(s|m|h)$/.exec(d);
  return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]];
}

const stages = PROFILES[PROFILE] || PROFILES.smoke;
const totalSec = stages.reduce((sum, st) => sum + toSec(st.duration), 0);

// ---------------------------------------------------------------- Metrics
// Giữ nguyên tên cũ để so sánh với các lần đo trước; bổ sung tag để tách theo instance.
const joinTrend = new Trend('delay_exam_join', true);
const draftTrend = new Trend('delay_exam_draft', true);
const submitTrend = new Trend('delay_exam_submit', true);
const resultTrend = new Trend('delay_exam_result', true);

const gatewayWait = new Trend('gateway_wait_ms', true);   // x-gateway-wait-seconds
const reqByInstance = new Counter('req_by_instance');     // mỗi request +1, tag: step, inst, pod, code
const shed503 = new Rate('shed_503');                     // tỉ lệ request bị xả
const flowCompleted = new Counter('flow_completed');
const flowStopped = new Counter('flow_stopped');          // tag: at, reason

const gwInUse = new Gauge('gw_in_use');                   // tag: svc
const gwWaiting = new Gauge('gw_waiting');
const gwCapacity = new Gauge('gw_capacity');
const instActive = new Gauge('inst_active');              // tag: svc, inst

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      exec: 'userFlow',
      startVUs: 0,
      stages,
      gracefulRampDown: '30s',
    },
    monitor: {
      executor: 'constant-vus',
      exec: 'monitor',
      vus: 1,
      duration: `${totalSec}s`,
    },
  },
  thresholds: {
    delay_exam_submit: ['p(95)<1500'],
    delay_exam_join: ['p(95)<2000'],
    http_req_failed: ['rate<0.10'],
    shed_503: ['rate<0.10'],
  },
};

const users = new SharedArray('users_data', function () {
  return JSON.parse(open('./users.json'));
});

// ------------------------------------------------- Kiểm tra trước khi chạy tải
// Thử join bằng user đầu tiên. Nếu không được (hết lượt, đề chưa mở, mã PIN sai...) thì dừng
// ngay và in lý do, thay vì chạy cả bài test để rồi toàn nhận 400.
// Bỏ qua bước này bằng: -e PRECHECK=off
export function setup() {
  if (__ENV.PRECHECK === 'off') return;
  const user = users[0];
  const res = http.post(
    `${GATEWAY_URL}/attempts/join`,
    JSON.stringify({ access_code: ACCESS_CODE }),
    {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      tags: { name: 'precheck_join' },
    }
  );
  console.log(`[PRECHECK] join -> HTTP ${res.status} | ${String(res.body).slice(0, 300)}`);
  console.log(`[PRECHECK] headers gateway: ${JSON.stringify(
    Object.keys(res.headers).filter((k) => k.toLowerCase().startsWith('x-'))
  )}`);
  if (res.status !== 200 && res.status !== 201) {
    exec.test.abort(`Join không thành công (HTTP ${res.status}). Xem dòng [PRECHECK] ở trên.`);
  }
}

// ---------------------------------------------------------------- Tiện ích
function header(res, name) {
  const target = name.toLowerCase();
  for (const k in res.headers) {
    if (k.toLowerCase() === target) return res.headers[k];
  }
  return '';
}

function record(step, res, trend) {
  const inst = header(res, 'x-gateway-instance') || 'none';
  const pod = header(res, 'x-pod-name');
  const tags = { step, inst, code: String(res.status) };
  if (pod) tags.pod = pod;

  trend.add(res.timings.duration, tags);
  reqByInstance.add(1, tags);
  shed503.add(res.status === 503, { step });

  const wait = parseFloat(header(res, 'x-gateway-wait-seconds'));
  if (!isNaN(wait)) gatewayWait.add(wait * 1000, { step, inst });
}

function safeJson(res, path) {
  try {
    return res.json(path);
  } catch (e) {
    return undefined;
  }
}

// ---------------------------------------------------------------- Luồng thi
export function userFlow() {
  const user = users[exec.scenario.iterationInTest % users.length];
  if (!user || !user.token) return;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.token}`,
  };
  const withName = (name) => ({ headers, tags: { name } });

  // 1. JOIN
  const joinRes = http.post(
    `${GATEWAY_URL}/attempts/join`,
    JSON.stringify({ access_code: ACCESS_CODE }),
    withName('attempts/join')
  );
  record('join', joinRes, joinTrend);

  if (joinRes.status !== 200 && joinRes.status !== 201) {
    // 400: hết lượt / đề chưa mở. 503: gateway xả tải. Không gọi endpoint khác.
    flowStopped.add(1, { at: 'join', reason: String(joinRes.status) });
    if (joinRes.status === 400 && exec.scenario.iterationInTest % 500 === 0) {
      console.log(`[JOIN 400] ${String(joinRes.body).slice(0, 200)}`);
    }
    return;
  }

  const attemptId = safeJson(joinRes, 'attempt_id');
  const questions = safeJson(joinRes, 'questions') || [];
  if (!attemptId) {
    flowStopped.add(1, { at: 'join', reason: 'no_attempt_id' });
    return;
  }
  sleep(1);

  const answers = {};
  questions.forEach((q) => {
    answers[q.question_id] = `option_${Math.floor(Math.random() * 4) + 1}`;
  });

  // 2. DRAFT
  const draftRes = http.put(
    `${GATEWAY_URL}/attempts/${attemptId}/draft`,
    JSON.stringify({ answers }),
    withName('attempts/draft')
  );
  record('draft', draftRes, draftTrend);
  check(draftRes, { 'draft 200/503': (r) => r.status === 200 || r.status === 503 });
  sleep(1);

  // 3. SUBMIT (không được phép bị xả)
  const submitRes = http.post(
    `${GATEWAY_URL}/attempts/${attemptId}/submit`,
    JSON.stringify({ answers }),
    withName('attempts/submit')
  );
  record('submit', submitRes, submitTrend);
  check(submitRes, { 'submit 200': (r) => r.status === 200 });
  sleep(1);

  // 4. RESULT
  const resultRes = http.get(
    `${GATEWAY_URL}/attempts/${attemptId}/result`,
    withName('attempts/result')
  );
  record('result', resultRes, resultTrend);
  check(resultRes, { 'result 200/503': (r) => r.status === 200 || r.status === 503 });

  flowCompleted.add(1);
  sleep(1);
}

// ------------------------------------------------- Theo dõi trạng thái gateway
// Lưu ý: nếu có nhiều pod gateway thì mỗi lần gọi chỉ thấy trạng thái của MỘT pod.
export function monitor() {
  // Gateway đang chạy trong cụm có thể không có /debug/state (trả 404): coi 404 là bình thường,
  // để lần gọi theo dõi không bị tính vào http_req_failed.
  const res = http.get(`${GATEWAY_BASE}/debug/state`, {
    tags: { name: 'debug_state' },
    responseCallback: http.expectedStatuses(200, 404),
  });
  if (res.status === 200) {
    const state = safeJson(res);
    if (state) {
      const lists = state.waitlists || {};
      for (const svc of Object.keys(lists)) {
        gwInUse.add(lists[svc].in_use, { svc });
        gwWaiting.add(lists[svc].waiting, { svc });
        gwCapacity.add(lists[svc].capacity, { svc });
      }
      const insts = state.instances || {};
      for (const svc of Object.keys(insts)) {
        insts[svc].forEach((i) => instActive.add(i.active_connections, { svc, inst: i.url }));
      }
    }
  }
  sleep(5);
}