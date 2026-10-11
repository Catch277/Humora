import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const PORT = process.env.PORT || 3000;
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY trong .env');
  process.exit(1);
}
const GRACE = Number(process.env.CHECK_IN_GRACE_MINUTES || 5);
const TZ = 'Asia/Bangkok';                       // UTC+7, giống web
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Hàm giờ (cùng quy tắc với web: giờ nghiệp vụ UTC+7, giờ do SERVER quyết định) ----------
const businessDay = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

function minutesOfDay(d) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = Object.fromEntries(p.filter((x) => x.type === 'hour' || x.type === 'minute').map((x) => [x.type, Number(x.value)]));
  return v.hour * 60 + v.minute;
}
function parseTime(t) {                          // "08:00:00" -> 480, rỗng -> null
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const hhmm = (t) => (t ? t.slice(0, 5) : null);
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const firstOf = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// ---------- Trạng thái đúng giờ / trễ (sao chép từ web: attendanceStatus.ts) ----------
function checkInStatus(at, startTime) {
  const s = parseTime(startTime);
  if (s === null) return 'ON_TIME';
  return minutesOfDay(at) > s + GRACE ? 'LATE' : 'ON_TIME';
}
function shiftStillRunning(at, endTime) {
  const e = parseTime(endTime);
  return e !== null && minutesOfDay(at) < e - GRACE;
}
function storedStatus(row, startTime) {          // trạng thái do quản lý sửa thì giữ nguyên
  if (row.corrected_by !== null || row.check_in_at === null) return row.status;
  return checkInStatus(new Date(row.check_in_at), startTime);
}
function checkOutStatus(at, endTime, current) {  // trễ không bị xóa khi về sớm
  return current === 'LATE' || !shiftStillRunning(at, endTime) ? current : 'EARLY_LEAVE';
}

// ---------- Khuôn mặt: GIẢ LẬP. Sau này chỉ thay hàm này bằng so khớp thật ----------
async function verifyFace({ image, simulateFail }) {
  return simulateFail ? { matched: false, score: 0.1 } : { matched: true, score: 0.99 };
}

// ---------- Tiện ích ----------
const fail = (res, status, code) => res.status(status).json({ code });          // lỗi = mã, app tự dịch
const normalizeRole = (r) => { const x = (r ?? '').trim().toUpperCase(); return x === 'CHU' ? 'MANAGER' : x; };
function parsePoint(body) {
  const { latitude: la, longitude: lo } = body ?? {};
  const has = (v) => v !== undefined && v !== null;
  if (!has(la) && !has(lo)) return { ok: true, lat: null, lng: null };
  if (typeof la !== 'number' || typeof lo !== 'number' || Math.abs(la) > 90 || Math.abs(lo) > 180) return { ok: false };
  return { ok: true, lat: la, lng: lo };
}

// ---------- Xác thực: nhận Bearer token của Supabase, dùng chính token đó để gọi database ----------
async function auth(req, res, next) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return fail(res, 401, 'AUTH_REQUIRED');
  const token = m[1];
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return fail(res, 401, 'AUTH_INVALID');
  const { data: profile, error: pErr } = await db
    .from('users').select('id, full_name, role, branch_id').eq('id', data.user.id).maybeSingle();
  if (pErr) { console.error(pErr); return fail(res, 500, 'DB_ERROR'); }
  if (!profile) return fail(res, 403, 'PROFILE_MISSING');
  req.db = db;
  req.user = profile;
  next();
}

// ---------- Ứng dụng ----------
const app = express();
const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: (o, cb) => cb(null, !o || origins.includes(o)) }));
app.use(express.json({ limit: '5mb' }));
const api = express.Router();

api.get('/health', (req, res) => res.json({ ok: true }));
api.get('/server-time', (req, res) => res.json({ utc: new Date().toISOString() }));

api.get('/me', auth, (req, res) => {
  res.json({ id: req.user.id, full_name: req.user.full_name, role: normalizeRole(req.user.role), branch_id: req.user.branch_id });
});

const SHIFT_COLS = 'id, branch_id, shift_id, work_date, status, note, shift:shifts (id, name, start_time, end_time)';
const mapAssignment = (r) => {
  const s = firstOf(r.shift);
  return { id: r.id, branch_id: r.branch_id, shift_id: r.shift_id, work_date: r.work_date, status: r.status, note: r.note,
    shift_name: s?.name ?? null, start_time: hhmm(s?.start_time), end_time: hhmm(s?.end_time) };
};

// Lịch làm của tôi (mặc định hôm nay tới +7 ngày)
api.get('/schedules', auth, async (req, res) => {
  const today = businessDay(new Date());
  const from = req.query.from || today, to = req.query.to || addDays(today, 7);
  if (!YMD.test(from) || !YMD.test(to)) return fail(res, 400, 'VALIDATION_ERROR');
  const { data, error } = await req.db.from('shift_assignments').select(SHIFT_COLS)
    .eq('employee_id', req.user.id).gte('work_date', from).lte('work_date', to).order('work_date');
  if (error) { console.error(error); return fail(res, 500, 'DB_ERROR'); }
  res.json(data.map(mapAssignment));
});

// Màn hình chính: ca hôm nay + đã chấm công chưa
api.get('/today', auth, async (req, res) => {
  const now = new Date(), workDate = businessDay(now);
  const [a, t] = await Promise.all([
    req.db.from('shift_assignments').select(SHIFT_COLS).eq('employee_id', req.user.id).eq('work_date', workDate).order('work_date'),
    req.db.from('attendance').select('id, shift_id, check_in_at, check_out_at, status').eq('employee_id', req.user.id).eq('work_date', workDate),
  ]);
  if (a.error || t.error) { console.error(a.error || t.error); return fail(res, 500, 'DB_ERROR'); }
  res.json({ server_time: now.toISOString(), work_date: workDate, assignments: a.data.map(mapAssignment), attendance: t.data });
});

// Chấm công VÀO. Không đọc bất kỳ trường giờ nào do app gửi: giờ là giờ server.
api.post('/attendance/check-in', auth, async (req, res) => {
  const { db, user } = req;
  if (normalizeRole(user.role) !== 'EMPLOYEE') return fail(res, 403, 'ATT_ROLE_FORBIDDEN');
  const { shift_id, photo_url = null, note = null, image, simulate_face_fail } = req.body ?? {};
  if (typeof shift_id !== 'string' || !UUID.test(shift_id)) return fail(res, 400, 'VALIDATION_ERROR');
  if (photo_url !== null && typeof photo_url !== 'string') return fail(res, 400, 'VALIDATION_ERROR');
  if (note !== null && (typeof note !== 'string' || note.length > 500)) return fail(res, 400, 'VALIDATION_ERROR');
  const pt = parsePoint(req.body);
  if (!pt.ok) return fail(res, 400, 'VALIDATION_ERROR');
  if (!user.branch_id) return fail(res, 403, 'ATT_BRANCH_NOT_ASSIGNED');

  const face = await verifyFace({ image, simulateFail: simulate_face_fail === true });
  if (!face.matched) return fail(res, 403, 'ATT_FACE_MISMATCH');

  const now = new Date(), workDate = businessDay(now);
  const { data: asg, error: aErr } = await db.from('shift_assignments').select(SHIFT_COLS)
    .eq('employee_id', user.id).eq('shift_id', shift_id).eq('work_date', workDate).eq('status', 'SCHEDULED').maybeSingle();
  if (aErr) { console.error(aErr); return fail(res, 500, 'DB_ERROR'); }
  if (!asg) return fail(res, 409, 'ATT_NO_SHIFT_TODAY');
  if (asg.branch_id !== user.branch_id) return fail(res, 403, 'BRANCH_FORBIDDEN');

  const dup = await db.from('attendance').select('id').eq('employee_id', user.id).eq('work_date', workDate).eq('shift_id', shift_id).limit(1);
  if (dup.data?.length) return fail(res, 409, 'ATT_ALREADY_CHECKED_IN');

  const shift = firstOf(asg.shift);
  const { data, error } = await db.from('attendance').insert({
    employee_id: user.id, branch_id: asg.branch_id, shift_id, work_date: workDate,
    check_in_at: now.toISOString(), check_in_latitude: pt.lat, check_in_longitude: pt.lng,
    check_in_photo_url: photo_url, note, status: checkInStatus(now, shift?.start_time),
  }).select('id, shift_id, work_date, check_in_at, status, check_in_distance_m').single();
  if (error) {
    if (error.code === '23505') return fail(res, 409, 'ATT_ALREADY_CHECKED_IN');   // 2 lần bấm cùng lúc: database chặn
    console.error(error); return fail(res, 500, 'DB_ERROR');
  }
  res.status(201).json({ ...data, shift_name: shift?.name ?? null, start_time: hhmm(shift?.start_time), end_time: hhmm(shift?.end_time) });
});

// Chấm công RA
api.post('/attendance/check-out', auth, async (req, res) => {
  const { db, user } = req;
  if (normalizeRole(user.role) !== 'EMPLOYEE') return fail(res, 403, 'ATT_ROLE_FORBIDDEN');
  const { attendance_id = null, photo_url = null } = req.body ?? {};
  if (attendance_id !== null && (typeof attendance_id !== 'string' || !UUID.test(attendance_id))) return fail(res, 400, 'VALIDATION_ERROR');
  if (photo_url !== null && typeof photo_url !== 'string') return fail(res, 400, 'VALIDATION_ERROR');
  const pt = parsePoint(req.body);
  if (!pt.ok) return fail(res, 400, 'VALIDATION_ERROR');

  const now = new Date(), workDate = businessDay(now);
  const { data: rows, error } = await db.from('attendance')
    .select('id, shift_id, check_in_at, check_out_at, status, corrected_by')
    .eq('employee_id', user.id).eq('work_date', workDate);
  if (error) { console.error(error); return fail(res, 500, 'DB_ERROR'); }

  let target;
  if (attendance_id) {
    target = rows.find((r) => r.id === attendance_id && r.check_in_at);
    if (!target) return fail(res, 409, 'ATT_NOT_CHECKED_IN');
    if (target.check_out_at) return fail(res, 409, 'ATT_ALREADY_CHECKED_OUT');
  } else {
    const open = rows.filter((r) => r.check_in_at && !r.check_out_at);
    if (open.length === 0) return fail(res, 409, rows.some((r) => r.check_out_at) ? 'ATT_ALREADY_CHECKED_OUT' : 'ATT_NOT_CHECKED_IN');
    if (open.length > 1) return fail(res, 400, 'ATT_AMBIGUOUS_SHIFT');
    target = open[0];
  }

  let shift = null;
  if (target.shift_id) shift = (await db.from('shifts').select('id, start_time, end_time').eq('id', target.shift_id).maybeSingle()).data;
  const status = checkOutStatus(now, shift?.end_time ?? null, storedStatus(target, shift?.start_time ?? null));

  const upd = await db.from('attendance').update({
    check_out_at: now.toISOString(), check_out_latitude: pt.lat, check_out_longitude: pt.lng,
    check_out_photo_url: photo_url, status, updated_at: now.toISOString(),
  }).eq('id', target.id).is('check_out_at', null).select('id, shift_id, work_date, check_in_at, check_out_at, status').maybeSingle();
  if (upd.error) { console.error(upd.error); return fail(res, 500, 'DB_ERROR'); }
  if (!upd.data) return fail(res, 409, 'ATT_ALREADY_CHECKED_OUT');
  res.json(upd.data);
});

// Lịch sử chấm công của tôi (chỉ đọc, mặc định 30 ngày gần nhất)
api.get('/attendance/history', auth, async (req, res) => {
  const today = businessDay(new Date());
  const from = req.query.from || addDays(today, -30), to = req.query.to || today;
  if (!YMD.test(from) || !YMD.test(to)) return fail(res, 400, 'VALIDATION_ERROR');
  const { data, error } = await req.db.from('attendance')
    .select('id, shift_id, work_date, check_in_at, check_out_at, status, check_in_distance_m, complaint_status')
    .eq('employee_id', req.user.id).gte('work_date', from).lte('work_date', to)
    .order('work_date', { ascending: false }).limit(Math.min(Number(req.query.limit) || 100, 200));
  if (error) { console.error(error); return fail(res, 500, 'DB_ERROR'); }
  res.json(data);
});

app.use('/api/v1', api);
app.use((req, res) => fail(res, 404, 'NOT_FOUND'));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'INVALID_JSON');
  console.error(err);
  fail(res, 500, 'INTERNAL_ERROR');
});
app.listen(PORT, () => console.log(`App API chạy ở http://localhost:${PORT}/api/v1`));