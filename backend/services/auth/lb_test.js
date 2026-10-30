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
  lb100: [
    { duration: '30s', target: 100 },
    { duration: '4m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  lb500: [
    { duration: '1m', target: 500 },
    { duration: '5m', target: 500 },
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