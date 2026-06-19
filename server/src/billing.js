import Stripe from "stripe";
import { config } from "./config.js";
import { requireAuth } from "./auth.js";
import { grantStripeCheckoutCredits } from "./database.js";

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey, {
  apiVersion: "2026-05-27.dahlia"
}) : null;

const CREDIT_PACKS = [
  {
    id: "credits_50",
    label: "50 credits",
    credits: 50,
    priceId: config.stripeCreditPrice50
  },
  {
    id: "credits_250",
    label: "250 credits",
    credits: 250,
    priceId: config.stripeCreditPrice250
  }
];

function configuredPacks() {
  return CREDIT_PACKS.filter(pack => Boolean(pack.priceId));
}

function publicBillingConfig() {
  const packs = configuredPacks();
  return {
    enabled: Boolean(stripe && packs.length),
    packs: packs.map(({ id, label, credits }) => ({ id, label, credits }))
  };
}

function checkoutUrl(kind) {
  const configured = kind === "success" ? config.stripeSuccessUrl : config.stripeCancelUrl;
  if (configured) return configured;
  const url = new URL(config.clientOrigin);
  url.searchParams.set("checkout", kind);
  return url.toString();
}

function stripeSessionToCreditGrant(session, eventId = "") {
  const metadata = session.metadata || {};
  return {
    userEmail: metadata.userEmail || session.client_reference_id || session.customer_email || "",
    credits: Number(metadata.credits || 0),
    stripeSessionId: session.id,
    stripeEventId: eventId,
    stripePriceId: metadata.priceId || "",
    packId: metadata.packId || ""
  };
}

export function handleStripeWebhook(req, res, next) {
  try {
    if (!stripe || !config.stripeWebhookSecret) {
      return res.status(501).json({ error: "Stripe webhooks are not configured." });
    }

    const signature = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);
    } catch (err) {
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    const session = event.data?.object;
    const shouldFulfill =
      event.type === "checkout.session.async_payment_succeeded" ||
      (event.type === "checkout.session.completed" && session?.payment_status === "paid");

    if (!shouldFulfill) return res.json({ received: true });

    grantStripeCheckoutCredits(stripeSessionToCreditGrant(session, event.id))
      .then(user => res.json({ received: true, creditsRemaining: user?.creditsRemaining }))
      .catch(next);
  } catch (err) {
    next(err);
  }
}

export function registerBillingRoutes(app) {
  app.get("/api/billing/config", requireAuth, (req, res) => {
    res.json(publicBillingConfig());
  });

  app.post("/api/billing/create-checkout-session", requireAuth, async (req, res, next) => {
    try {
      if (!stripe) return res.status(501).json({ error: "Stripe is not configured." });

      const { packId } = req.body || {};
      const pack = configuredPacks().find(item => item.id === packId);
      if (!pack) return res.status(400).json({ error: "Select a valid credit pack." });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: req.authUser.email,
        client_reference_id: req.authUser.email,
        success_url: checkoutUrl("success"),
        cancel_url: checkoutUrl("canceled"),
        allow_promotion_codes: true,
        line_items: [
          {
            price: pack.priceId,
            quantity: 1
          }
        ],
        metadata: {
          userEmail: req.authUser.email,
          userId: req.authUser.id || "",
          packId: pack.id,
          credits: String(pack.credits),
          priceId: pack.priceId
        }
      });

      res.json({ url: session.url });
    } catch (err) {
      next(err);
    }
  });
}
