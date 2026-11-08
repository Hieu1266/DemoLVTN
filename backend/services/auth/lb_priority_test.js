// ============================================================================
// KICH BAN 2 / 2: lb_priority_test.js  -  TAI NEN CO UU TIEN (gan thuc chien hon)
//
// Luong chinh (uu tien cao): hoc vien thi  (join -> draft -> submit -> result)
// Luong nen (uu tien thap, chay dong thoi tu t=0):
//   - Hoc vien xem lich su  : 10 VU          (HISTORY_VUS)
//   - Giang vien cham bai   : 5 VU           (GRADING_VUS)   can token giang vien
//   - Giang vien tao de     : 5 VU           (CREATE_VUS)    can token giang vien
//   - Admin tao user        : 2 VU           (ADMIN_VUS)     can token admin
//   - Monitor gateway       : 1 VU
//
// CAU HINH TOKEN GIANG VIEN / ADMIN (users.json cua ban khong co truong role):
//   python make_role_tokens.py --role-id 3 --count 5 --prefix teacher_ --out teachers.json
//   python make_role_tokens.py --role-id 1 --count 2 --prefix admin_   --out admins.json
// Script tu doc ./teachers.json va ./admins.json. Khong co file thi luong tuong ung BI BO QUA
// (khong con tinh gia mao bang token hoc vien nhu ban cu) va in canh bao o dau bai test.
// (Vai tro that trong he thong: ADMIN=1, STUDENT=2, INSTRUCTOR=3.)
//
// THAY DOI SO VOI BAN CU
//  - 400 va 403 KHONG con la "expected": http_req_failed bat duoc loi nghiep vu va loi quyen.
//    Chi con 200/201/503 la hop le (503 = gateway xa tai, do rieng bang shed_503).
//  - Giang vien cham ngau nhien de/bai, khong luon cham bai dau tien.
//  - Luong nen chi chay khi co token dung vai tro.
//
// Chay (vi du):
//   k6 run --out csv=prio_run.csv -e PROFILE=lb100 -e ACCESS_CODE=ABC123 lb_priority_test.js
//   Tai bac thang: -e PROFILE=cap -e VUS=100 -e RAMP=30 -e HOLD=120 -e DOWN=15
//   Tat luong nen (giong lb_test.js): -e LOW=off
// Ghi chu: analyze_lb.py chi phan tich luong thi. Do tre cac luong nen xem o phan tong ket cua k6
// (delay_my_history, delay_grade_submission, delay_create_exam, delay_admin_create_user).
//
// LUU Y: de thi phai max_attempts = 0. Luong tao de / tao user se tao them du lieu that trong DB.
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
const LOW_ON = __ENV.LOW !== 'off';

// Chi 200/201 (thanh cong) va 503 (gateway xa tai) la hop le.
http.setResponseCallback(http.expectedStatuses(200, 201, 503));

// ---------------------------------------------------------------- Ho so tai (luong thi chinh)
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
    { duration: '3m', target: 1000 },
    { duration: '30s', target: 0 },
  ],
};

function toSec(d) {
  const m = /^(\d+)(s|m|h)$/.exec(d);
  return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]];
}

function capProfile() {
  const vus = Number(__ENV.VUS || 50);
  return [
    { duration: `${__ENV.RAMP || 30}s`, target: vus },
    { duration: `${__ENV.HOLD || 120}s`, target: vus },
    { duration: `${__ENV.DOWN || 15}s`, target: 0 },
  ];
}

const stages = PROFILE === 'cap' ? capProfile() : (PROFILES[PROFILE] || PROFILES.smoke);
const totalSec = stages.reduce((sum, st) => sum + toSec(st.duration), 0);

// ---------------------------------------------------------------- Metrics
const joinTrend = new Trend('delay_exam_join', true);
const draftTrend = new Trend('delay_exam_draft', true);
const submitTrend = new Trend('delay_exam_submit', true);
const resultTrend = new Trend('delay_exam_result', true);
const historyTrend = new Trend('delay_my_history', true);
const gradeTrend = new Trend('delay_grade_submission', true);
const createExamTrend = new Trend('delay_create_exam', true);
const adminCreateTrend = new Trend('delay_admin_create_user', true);

const gatewayWait = new Trend('gateway_wait_ms', true);
const reqByInstance = new Counter('req_by_instance');
const shed503 = new Rate('shed_503');
const flowCompleted = new Counter('flow_completed');
const flowStopped = new Counter('flow_stopped');

const gwInUse = new Gauge('gw_in_use');
const gwWaiting = new Gauge('gw_waiting');
const gwCapacity = new Gauge('gw_capacity');
const instActive = new Gauge('inst_active');

// ---------------------------------------------------------------- Nap user theo vai tro
// open() chi chay duoc o giai doan init; thieu file thi tra mang rong (khong lam hong ca bai test).
function loadJson(path) {
  try {
    return JSON.parse(open(path));
  } catch (e) {
    return [];
  }
}

const usersFile = new SharedArray('users_data', () => loadJson('./users.json'));
const teachersFile = new SharedArray('teachers_data', () => loadJson(__ENV.TEACHERS_FILE || './teachers.json'));
const adminsFile = new SharedArray('admins_data', () => loadJson(__ENV.ADMINS_FILE || './admins.json'));

const roleOf = (u) => String(u.role || '').toUpperCase();
// users.json khong co truong role -> coi nhu hoc vien. Ten vai tro that: INSTRUCTOR (chap nhan ca TEACHER).
const studentPool = usersFile.filter((u) => u.token && (!u.role || roleOf(u) === 'STUDENT'));
const teacherPool = teachersFile.length > 0
  ? teachersFile.filter((u) => u.token)
  : usersFile.filter((u) => u.token && (roleOf(u) === 'INSTRUCTOR' || roleOf(u) === 'TEACHER'));
const adminPool = adminsFile.length > 0
  ? adminsFile.filter((u) => u.token)
  : usersFile.filter((u) => u.token && roleOf(u) === 'ADMIN');

// ---------------------------------------------------------------- Scenarios
const scenarios = {
  heavy_student_exam: {
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
};

if (LOW_ON) {
  scenarios.low_priority_history = {
    executor: 'constant-vus',
    exec: 'studentHistoryFlow',
    vus: Number(__ENV.HISTORY_VUS || 10),
    duration: `${totalSec}s`,
  };
  if (teacherPool.length > 0) {
    scenarios.low_priority_grading = {
      executor: 'constant-vus',
      exec: 'teacherGradingFlow',
      vus: Number(__ENV.GRADING_VUS || 5),
      duration: `${totalSec}s`,
    };
    scenarios.low_priority_create_exam = {
      executor: 'constant-vus',
      exec: 'teacherCreateExamFlow',
      vus: Number(__ENV.CREATE_VUS || 5),
      duration: `${totalSec}s`,
    };
  }
  if (adminPool.length > 0) {
    scenarios.low_priority_admin = {
      executor: 'constant-vus',
      exec: 'adminCreateUserFlow',
      vus: Number(__ENV.ADMIN_VUS || 2),
      duration: `${totalSec}s`,
    };
  }
}

export const options = {
  scenarios,
  thresholds: {
    delay_exam_submit: ['p(95)<1500'],
    delay_exam_join: ['p(95)<2000'],
    http_req_failed: ['rate<0.10'],
    shed_503: ['rate<0.10'],
  },
};

// ------------------------------------------------- Kiem tra truoc khi chay tai
export function setup() {
  console.log(`[POOLS] hoc vien=${studentPool.length} | giang vien=${teacherPool.length} | admin=${adminPool.length} | luong nen=${LOW_ON ? 'bat' : 'tat'}`);
  if (LOW_ON && teacherPool.length === 0) {
    console.log('[CANH BAO] Khong co token giang vien (teachers.json) -> bo qua luong cham bai va tao de.');
  }
  if (LOW_ON && adminPool.length === 0) {
    console.log('[CANH BAO] Khong co token admin (admins.json) -> bo qua luong admin tao user.');
  }
  if (studentPool.length === 0) {
    exec.test.abort('Khong co user hoc vien nao co token trong users.json.');
  }
  if (__ENV.PRECHECK === 'off') return;

  const user = studentPool[0];
  const res = http.post(
    `${GATEWAY_URL}/attempts/join`,
    JSON.stringify({ access_code: ACCESS_CODE }),
    {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      tags: { name: 'precheck_join' },
      responseCallback: http.expectedStatuses(200, 201, 400, 503),
    }
  );
  console.log(`[PRECHECK] join -> HTTP ${res.status} | ${String(res.body).slice(0, 300)}`);
  console.log(`[PRECHECK] headers gateway: ${JSON.stringify(
    Object.keys(res.headers).filter((k) => k.toLowerCase().startsWith('x-'))
  )}`);
  if (res.status !== 200 && res.status !== 201) {
    exec.test.abort(`Join khong thanh cong (HTTP ${res.status}). Xem dong [PRECHECK] o tren.`);
  }
}

// ---------------------------------------------------------------- Tien ich
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

function authHeaders(user) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// 1. LUONG CHINH: HOC VIEN LAM BAI THI (uu tien cao)
// ============================================================================
export function userFlow() {
  const user = studentPool[exec.scenario.iterationInTest % studentPool.length];
  const headers = authHeaders(user);
  const withName = (name) => ({ headers, tags: { name } });

  // 1. JOIN
  const joinRes = http.post(
    `${GATEWAY_URL}/attempts/join`,
    JSON.stringify({ access_code: ACCESS_CODE }),
    withName('attempts/join')
  );
  record('join', joinRes, joinTrend);

  if (joinRes.status !== 200 && joinRes.status !== 201) {
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

  // 3. SUBMIT (khong duoc phep bi xa)
  const submitRes = http.post(
    `${GATEWAY_URL}/attempts/${attemptId}/submit`,
    JSON.stringify({ answers }),
    withName('attempts/submit')
  );
  record('submit', submitRes, submitTrend);
  check(submitRes, { 'submit 200': (r) => r.status === 200 });
  sleep(1);

  // 4. RESULT
  const resultRes = http.get(`${GATEWAY_URL}/attempts/${attemptId}/result`, withName('attempts/result'));
  record('result', resultRes, resultTrend);
  check(resultRes, { 'result 200/503': (r) => r.status === 200 || r.status === 503 });

  flowCompleted.add(1);
  sleep(1);
}

// ============================================================================
// 2. LUONG NEN: HOC VIEN XEM LICH SU (uu tien thap)
// ============================================================================
export function studentHistoryFlow() {
  const user = studentPool[exec.scenario.iterationInTest % studentPool.length];
  const res = http.get(`${GATEWAY_URL}/attempts/my-history`, {
    headers: authHeaders(user),
    tags: { name: 'attempts/my-history' },
  });
  record('my_history', res, historyTrend);
  check(res, { 'my-history 200/503': (r) => r.status === 200 || r.status === 503 });
  sleep(2);
}

// ============================================================================
// 3. LUONG NEN: GIANG VIEN TAO DE THI (uu tien thap)
// ============================================================================
export function teacherCreateExamFlow() {
  const user = teacherPool[exec.scenario.iterationInTest % teacherPool.length];
  const payload = JSON.stringify({
    title: `De thi K8s Priority #${exec.scenario.iterationInTest}`,
    description: 'Tu dong tao tu k6 scenario',
    duration_minutes: 60,
    max_attempts: 0,
    pass_score: 5.0,
    access_code: `TEST_${Math.floor(Math.random() * 1000000)}`,
  });
  const res = http.post(`${GATEWAY_URL}/exams/`, payload, {
    headers: authHeaders(user),
    tags: { name: 'exams/create' },
  });
  record('create_exam', res, createExamTrend);
  check(res, { 'exams/create 200/201/503': (r) => r.status === 200 || r.status === 201 || r.status === 503 });
  sleep(3);
}

// ============================================================================
// 4. LUONG NEN: GIANG VIEN CHAM BAI (uu tien thap) - chon ngau nhien de va bai nop
// ============================================================================
export function teacherGradingFlow() {
  const user = teacherPool[exec.scenario.iterationInTest % teacherPool.length];
  const headers = authHeaders(user);

  const examsRes = http.get(`${GATEWAY_URL}/exams/`, { headers, tags: { name: 'exams/list' } });
  if (examsRes.status !== 200) { sleep(2); return; }
  const exams = safeJson(examsRes, 'data') || safeJson(examsRes) || [];
  if (!Array.isArray(exams) || exams.length === 0) { sleep(2); return; }
  const exam = pick(exams);
  const examId = exam.id || exam.exam_id;
  if (!examId) { sleep(2); return; }

  const subRes = http.get(`${GATEWAY_URL}/exams/${examId}/submissions`, { headers, tags: { name: 'exams/submissions' } });
  if (subRes.status !== 200) { sleep(2); return; }
  const subs = safeJson(subRes, 'data') || safeJson(subRes) || [];
  if (!Array.isArray(subs) || subs.length === 0) { sleep(2); return; }
  const sub = pick(subs);
  const attemptId = sub.attempt_id || sub.id;
  if (!attemptId) { sleep(2); return; }

  const gradeRes = http.post(
    `${GATEWAY_URL}/exams/submissions/${attemptId}/grade`,
    JSON.stringify({ score: 8.5, feedback: 'Bai lam thu nghiem priority.' }),
    { headers, tags: { name: 'exams/grade' } }
  );
  record('grade_submission', gradeRes, gradeTrend);
  check(gradeRes, { 'grade 200/503': (r) => r.status === 200 || r.status === 503 });
  sleep(2);
}

// ============================================================================
// 5. LUONG NEN: ADMIN TAO USER MOI (uu tien thap) - role_id 3 = INSTRUCTOR
// ============================================================================
export function adminCreateUserFlow() {
  const admin = adminPool[exec.scenario.iterationInTest % adminPool.length];
  const n = exec.scenario.iterationInTest;
  const payload = JSON.stringify({
    username: `ins_created_${n}_${Date.now() % 100000}`,
    email: `ins_created_${n}_${Date.now() % 100000}@lumer.edu.vn`,
    password: 'instructor123',
    role_id: 3,
  });
  const res = http.post(`${GATEWAY_URL}/users/register`, payload, {
    headers: authHeaders(admin),
    tags: { name: 'admin/register_user' },
  });
  record('admin_create_user', res, adminCreateTrend);
  check(res, { 'admin create 200/201/503': (r) => r.status === 200 || r.status === 201 || r.status === 503 });
  sleep(3);
}

// ============================================================================
// 6. MONITOR: THEO DOI TRANG THAI GATEWAY
// ============================================================================
export function monitor() {
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