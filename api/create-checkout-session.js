// Serverless function (Vercel Node runtime) — creates a real Stripe Checkout
// Session and hands the front-end the URL to redirect the user to.
//
// Front-end calls: POST /api/create-checkout-session { plan, userId, email, lang }
// plan is one of: 'monthly' | 'yearly' | 'oneshot' | 'lifetime'.
//
// STRIPE_SECRET_KEY must be set as a Vercel environment variable — it must
// NEVER appear in front-end code. Prices are defined inline below (via Stripe's
// price_data) rather than referencing pre-created Price IDs, so there is
// nothing else to configure in the Stripe dashboard for this to work.

import Stripe from 'stripe';

const PLAN_CONFIG = {
  monthly: { mode: 'subscription', unit_amount: 990, interval: 'month', name: 'Solane Premium — mensuel' },
  yearly: { mode: 'subscription', unit_amount: 7900, interval: 'year', name: 'Solane Premium — annuel' },
  oneshot: { mode: 'payment', unit_amount: 490, name: "Solane — analyse à l'unité" },
  lifetime: { mode: 'payment', unit_amount: 9900, name: 'Solane Premium à vie' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Server misconfigured: STRIPE_SECRET_KEY is not set.' });
  }

  const { plan, userId, email, lang } = req.body || {};
  const cfg = PLAN_CONFIG[plan];
  if (!cfg) {
    return res.status(400).json({ error: 'Invalid or missing "plan".' });
  }
  if (!userId || !email) {
    return res.status(400).json({ error: 'Missing userId or email — user must be logged in.' });
  }

  const stripe = new Stripe(secretKey);
  const origin = process.env.PUBLIC_ORIGIN || 'https://solane-app.vercel.app';
  const locale = ['fr', 'en', 'de', 'it'].includes(lang) ? lang : 'auto';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: cfg.mode,
      customer_email: email,
      client_reference_id: userId,
      locale,
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: cfg.unit_amount,
            product_data: { name: cfg.name },
            ...(cfg.mode === 'subscription' ? { recurring: { interval: cfg.interval } } : {}),
          },
          quantity: 1,
        },
      ],
      metadata: { plan, userId },
      ...(cfg.mode === 'subscription' ? { subscription_data: { metadata: { plan, userId } } } : {}),
      success_url: `${origin}/?checkout=success&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session error:', e);
    return res.status(500).json({ error: 'Could not create checkout session.' });
  }
}
