import crypto from 'node:crypto';

/* ===== RÉGLAGES (à ajuster ici uniquement) ===== */
export const COMMISSION_CENTS = { oneshot: 50, monthly: 150, yearly: 300, lifetime: 800 }; // montants par défaut, à valider
export const TIERS = [[30, 1.5], [10, 1.25], [0, 1.0]]; // [nb de clients payants du mois, multiplicateur]
export const SIGNUP_WINDOW_DAYS = 2;    // un compte ne peut être rattaché que s'il a moins de 2 jours
export const BASE_URL = process.env.FRONTEND_BASE_URL || 'https://www.solaneskin.com';

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const DAY = 86400000;

export async function db(method, path, body, prefer = 'return=representation') {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase env vars missing');
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) { const e = new Error(`supabase ${r.status}: ${txt.slice(0, 300)}`); e.status = r.status; throw e; }
  return data;
}
export async function getAuthUser(token) {
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

export function normalizeSlug(s) {
  s = String(s || '').trim().toLowerCase();
  return /^[a-z0-9_-]{2,40}$/.test(s) ? s : null;
}
export function safeEq(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function isAdmin(req) {
  const t = process.env.ADMIN_TOKEN;
  return !!t && safeEq(req.headers['x-admin-token'], t);
}
export const q = (v) => encodeURIComponent(v);

export async function getCreatorBySlug(slug, activeOnly = true) {
  const rows = await db('GET', `creators?slug=eq.${q(slug)}${activeOnly ? '&is_active=eq.true' : ''}&select=*&limit=1`);
  return rows[0] || null;
}

/* Rattache un compte à un créateur (une seule fois). Renvoie un statut HTTP logique. */
export async function attributeUser(user, code) {
  const slug = normalizeSlug(code);
  if (!slug) return { status: 404, error: 'unknown_code' };
  const created = Date.parse(user.created_at || '') || 0;
  const rows = await db('GET', `profiles?id=eq.${user.id}&select=id,creator_id&limit=1`);
  const profile = rows[0];
  if (!profile) return { status: 202, error: 'profile_not_ready' };
  if (profile.creator_id) return { status: 200, ok: true, already: true };
  if (Date.now() - created > SIGNUP_WINDOW_DAYS * DAY) return { status: 403, error: 'account_too_old' };
  const creator = await getCreatorBySlug(slug);
  if (!creator) return { status: 404, error: 'unknown_code' };
  await db('PATCH', `profiles?id=eq.${user.id}&creator_id=is.null`, {
    creator_id: creator.id, creator_attributed_at: new Date().toISOString(), referent: creator.slug,
  });
  return { status: 200, ok: true, slug: creator.slug };
}

export function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  const now = new Date();
  const y = m ? +m[1] : now.getUTCFullYear(), mo = m ? +m[2] - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(y, mo, 1)), end = new Date(Date.UTC(y, mo + 1, 1));
  return { start, end, label: `${y}-${String(mo + 1).padStart(2, '0')}` };
}
export function multiplierFor(n) { for (const [min, mult] of TIERS) if (n >= min) return mult; return 1; }

export async function creatorMonth(creator, month) {
  const { start, end, label } = monthRange(month);
  const rows = await db('GET', `profiles?creator_id=eq.${creator.id}&creator_attributed_at=gte.${start.toISOString()}&creator_attributed_at=lt.${end.toISOString()}&select=plan,oneshot_credits`);
  const kind = (r) => ['monthly', 'yearly', 'lifetime'].includes(r.plan) ? r.plan : ((r.oneshot_credits || 0) > 0 ? 'oneshot' : null);
  const payers = rows.map(kind).filter(Boolean);
  const byProduct = {}; payers.forEach(p => { byProduct[p] = (byProduct[p] || 0) + 1; });
  const mult = multiplierFor(payers.length);
  const total = Math.round(payers.reduce((a, p) => a + COMMISSION_CENTS[p], 0) * mult);
  return { month: label, clicks: creator.clicks, signups: rows.length, payers: payers.length, by_product: byProduct,
    bonus_pct: Math.round((mult - 1) * 100), multiplier: mult, total_cents: total };
}
