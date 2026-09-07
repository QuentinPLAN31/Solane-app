// Serverless function (Vercel Node runtime) — Stripe webhook endpoint. This is
// the SOURCE OF TRUTH for granting/revoking access: the front-end never trusts
// its own "payment succeeded" belief, it only redirects to Stripe and back —
// this endpoint is what actually updates Supabase once Stripe confirms money
// moved (or a subscription ended).
//
// Configure in the Stripe Dashboard once deployed: Developers → Webhooks →
// Add endpoint → URL = https://<your-domain>/api/stripe-webhook, events:
//   - checkout.session.completed
//   - customer.subscription.deleted
// Then copy the "Signing secret" (whsec_...) into the STRIPE_WEBHOOK_SECRET
// Vercel environment variable.

import Stripe from 'stripe';
import { applyPurchase, revertToFree } from './_applyPurchase.js';

// Stripe needs the raw, unparsed request body to verify the signature — this
// disables Vercel's automatic JSON body parsing for this route only.
export const config = {
  api: { bodyParser: false },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    console.error('stripe-webhook: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not set.');
    return res.status(500).end('Server misconfigured');
  }

  const stripe = new Stripe(secretKey);

  let event;
  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('stripe-webhook: signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const plan = session.metadata && session.metadata.plan;
        const userId = (session.metadata && session.metadata.userId) || session.client_reference_id;
        await applyPurchase({
          plan,
          userId,
          customerId: session.customer,
          subscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await revertToFree(subscription.customer);
        break;
      }
      default:
        // Other event types are ignored on purpose — this app only needs to
        // know when a purchase completes and when a subscription actually ends.
        break;
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('stripe-webhook: handler error:', e);
    // Returning 500 makes Stripe retry the event later, which is what we want
    // if our own processing (e.g. a transient Supabase error) failed.
    return res.status(500).json({ error: 'Webhook handler failed.' });
  }
}
