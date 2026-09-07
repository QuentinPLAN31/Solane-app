// Serverless function (Vercel Node runtime) — opens Stripe's own Customer
// Portal so a subscriber can cancel (or change payment method, view invoices,
// etc.) for real, instead of a local-only "cancel" toggle. Stripe handles the
// UI; our stripe-webhook.js syncs the account back to "free" once the
// subscription actually ends there.
//
// Front-end calls: POST /api/create-portal-session { userId }

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server misconfigured.' });
  }

  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId.' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
  const { data: profile, error } = await supabase
    .from('profiles').select('stripe_customer_id').eq('id', userId).single();

  if (error || !profile || !profile.stripe_customer_id) {
    return res.status(400).json({ error: 'No Stripe customer on file for this account yet.' });
  }

  const stripe = new Stripe(secretKey);
  const origin = process.env.PUBLIC_ORIGIN || 'https://solane-app.vercel.app';

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/`,
    });
    return res.status(200).json({ url: portalSession.url });
  } catch (e) {
    console.error('create-portal-session error:', e);
    return res.status(500).json({ error: 'Could not create billing portal session.' });
  }
}
