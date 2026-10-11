import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const [email, password] = process.argv.slice(2);
if (!email || !password) { console.log('Dùng: npm run token -- email mat-khau'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await db.auth.signInWithPassword({ email, password });
if (error) { console.error('Đăng nhập lỗi:', error.message); process.exit(1); }
console.log(data.session.access_token);