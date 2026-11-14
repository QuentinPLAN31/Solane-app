const crypto = require('node:crypto');

/* ===== RÉGLAGES (à ajuster ici uniquement) ===== */
const COMMISSION_CENTS = { oneshot: 50, premium: 150, lifetime: 800 }; // montants par défaut, à valider (premium = mensuel ou annuel)
const TIERS = [[30, 1.5], [10, 1.25], [0, 1.0]]; // [nb de clients payants du mois, multiplicateur]
const SIGNUP_WINDOW_DAYS = 2;    // un compte ne peut être rattaché que s'il a moins de 2 jours
const BASE_URL = process.env.FRONTEND_BASE_URL || 'https://www.solaneskin.com';

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const DAY = 86400000;

async function db(method, path, body, prefer = 'return=representation') {
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
async function getAuthUser(token) {
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

function normalizeSlug(s) {
  s = String(s || '').trim().toLowerCase();
  return /^[a-z0-9_-]{2,40}$/.test(s) ? s : null;
}
function safeEq(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function isAdmin(req) {
  const t = process.env.ADMIN_TOKEN;
  return !!t && safeEq(req.headers['x-admin-token'], t);
}
const q = (v) => encodeURIComponent(v);

async function getCreatorBySlug(slug, activeOnly = true) {
  const rows = await db('GET', `creators?slug=eq.${q(slug)}${activeOnly ? '&is_active=eq.true' : ''}&select=*&limit=1`);
  return rows[0] || null;
}

/* Rattache un compte à un créateur (une seule fois). Renvoie un statut HTTP logique. */
async function attributeUser(user, code) {
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

function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  const now = new Date();
  const y = m ? +m[1] : now.getUTCFullYear(), mo = m ? +m[2] - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(y, mo, 1)), end = new Date(Date.UTC(y, mo + 1, 1));
  return { start, end, label: `${y}-${String(mo + 1).padStart(2, '0')}` };
}
function multiplierFor(n) { for (const [min, mult] of TIERS) if (n >= min) return mult; return 1; }

async function creatorMonth(creator, month) {
  const { start, end, label } = monthRange(month);
  const rows = await db('GET', `profiles?creator_id=eq.${creator.id}&creator_attributed_at=gte.${start.toISOString()}&creator_attributed_at=lt.${end.toISOString()}&select=plan,oneshot_credits`);
  const kind = (r) => ['monthly', 'yearly'].includes(r.plan) ? 'premium' : r.plan === 'lifetime' ? 'lifetime' : ((r.oneshot_credits || 0) > 0 ? 'oneshot' : null);
  const payers = rows.map(kind).filter(Boolean);
  const byProduct = {}; payers.forEach(p => { byProduct[p] = (byProduct[p] || 0) + 1; });
  const mult = multiplierFor(payers.length);
  const total = Math.round(payers.reduce((a, p) => a + COMMISSION_CENTS[p], 0) * mult);
  return { month: label, clicks: creator.clicks, signups: rows.length, payers: payers.length, by_product: byProduct,
    bonus_pct: Math.round((mult - 1) * 100), multiplier: mult, total_cents: total };
}


async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
const links = (slug, key) => ({
  short: `${BASE_URL}/c/${slug}`, full: `${BASE_URL}/?via=${slug}`, code: slug.toUpperCase(),
  ...(key ? { dashboard: `${BASE_URL}/createur?c=${slug}&k=${key}` } : {}),
});

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const a = String(req.query.a || '');
  try {
    // --- public : compteur de clics
    if (a === 'click' && req.method === 'POST') {
      const { code } = await readJson(req); const slug = normalizeSlug(code);
      if (slug) await db('POST', 'rpc/increment_creator_clicks', { p_slug: slug }, 'return=minimal');
      return res.status(200).json({ ok: true });
    }
    // --- connecté : rattachement du compte au créateur
    if (a === 'attribute' && req.method === 'POST') {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const user = token ? await getAuthUser(token) : null;
      if (!user || !user.id) return res.status(401).json({ error: 'unauthorized' });
      const { code } = await readJson(req);
      const r = await attributeUser(user, code);
      return res.status(r.status).json(r);
    }
    // --- page créateur : stats (protégée par clé)
    if (a === 'stats' && req.method === 'GET') {
      const slug = normalizeSlug(req.query.c); const creator = slug && await getCreatorBySlug(slug, false);
      if (!creator || !safeEq(req.query.k, creator.dashboard_key)) return res.status(404).json({ error: 'not_found' });
      const stats = await creatorMonth(creator, req.query.month);
      return res.status(200).json({
        creator: { slug: creator.slug, name: creator.name }, links: links(creator.slug), ...stats,
        grid: COMMISSION_CENTS, tiers: TIERS.filter(t => t[0] > 0).map(([n, m]) => ({ from: n, bonus_pct: Math.round((m - 1) * 100) })),
      });
    }
    // --- admin
    if (a.startsWith('admin')) {
      if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
      if (a === 'admin-create' && req.method === 'POST') {
        const b = await readJson(req); const slug = normalizeSlug(b.slug);
        if (!slug || !b.name) return res.status(400).json({ error: 'slug et name requis (slug : a-z 0-9 - _, 2 à 40)' });
        if (await getCreatorBySlug(slug, false)) return res.status(409).json({ error: 'Ce slug existe déjà' });
        const key = crypto.randomBytes(16).toString('base64url');
        await db('POST', 'creators', { slug, name: String(b.name), contact: b.contact || null, dashboard_key: key });
        return res.status(200).json({ ok: true, slug, ...links(slug, key), dashboard_key: key });
      }
      if (a === 'admin-link' && req.method === 'GET') {
        const c = await getCreatorBySlug(normalizeSlug(req.query.c), false);
        if (!c) return res.status(404).json({ error: 'not_found' });
        return res.status(200).json({ slug: c.slug, ...links(c.slug, c.dashboard_key) });
      }
      if (a === 'admin-summary' && req.method === 'GET') {
        const all = await db('GET', 'creators?select=*&order=created_at.asc');
        const out = [];
        for (const c of all) out.push({ slug: c.slug, name: c.name, contact: c.contact, ...(await creatorMonth(c, req.query.month)) });
        return res.status(200).json(out.map(o => ({ ...o, total_eur: o.total_cents / 100 })));
      }
    }
    return res.status(404).json({ error: 'unknown_action' });
  } catch (e) {
    console.error('[creators]', e.message);
    return res.status(500).json({ error: 'server_error' });
  }
}

module.exports = handler;
