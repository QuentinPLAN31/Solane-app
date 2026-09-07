// Shared helper used by the Stripe webhook to actually grant an entitlement in
// Supabase once a payment is confirmed server-side. Uses the SERVICE ROLE key
// (server-side only, bypasses Row Level Security) so it can write to any
// user's profile row regardless of who is currently logged in.

import { createClient } from '@supabase/supabase-js';

let cachedClient = null;
function getSupabaseAdmin() {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

// Grants a plan (or a one-shot credit) to a user after a successful Stripe
// payment. Safe to call more than once for the same purchase — oneshot credits
// are the only additive field, and Stripe's own idempotency (one
// checkout.session.completed event per session) keeps that from double-firing
// in normal operation.
export async function applyPurchase({ plan, userId, customerId, subscriptionId }) {
  if (!plan || !userId) {
    console.error('applyPurchase: missing plan or userId', { plan, userId });
    return;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('applyPurchase: Supabase admin client not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).');
    return;
  }

  if (plan === 'oneshot') {
    const { data: profile, error: readErr } = await supabase
      .from('profiles').select('oneshot_credits').eq('id', userId).single();
    if (readErr) { console.error('applyPurchase: could not read profile for oneshot credit', readErr); return; }
    const nextCredits = (profile?.oneshot_credits || 0) + 1;
    const { error } = await supabase.from('profiles').update({ oneshot_credits: nextCredits }).eq('id', userId);
    if (error) console.error('applyPurchase: failed to grant oneshot credit', error);
    return;
  }

  const update = { plan };
  if (customerId) update.stripe_customer_id = customerId;
  if (subscriptionId) update.stripe_subscription_id = subscriptionId;
  const { error } = await supabase.from('profiles').update(update).eq('id', userId);
  if (error) console.error('applyPurchase: failed to update plan', error);
}

// Called when Stripe tells us a subscription actually ended (cancelled at
// period end, or payment failure exhausted retries) — moves that customer's
// account back to the free plan.
export async function revertToFree(customerId) {
  if (!customerId) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('revertToFree: Supabase admin client not configured.');
    return;
  }
  const { error } = await supabase
    .from('profiles')
    .update({ plan: 'free', stripe_subscription_id: null })
    .eq('stripe_customer_id', customerId);
  if (error) console.error('revertToFree: failed to revert plan', error);
}
