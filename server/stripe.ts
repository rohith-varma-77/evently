import Stripe from "stripe";
import express, { type Express } from "express";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function getStripe() {
  return stripeSecretKey ? new Stripe(stripeSecretKey) : null;
}

export function registerStripeWebhook(app: Express) {
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const stripe = getStripe();
    if (!stripe || !webhookSecret) {
      console.error("[Stripe webhook] Stripe secrets are not configured");
      return res.status(503).json({ error: "Stripe webhook is not configured" });
    }

    try {
      const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"] as string, webhookSecret);
      if (event.id.startsWith("evt_test_")) {
        console.log("[Stripe webhook] Test event verified", event.id);
        return res.json({ verified: true });
      }
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[Stripe webhook] Checkout completed", session.id, session.client_reference_id);
        // Persist only Stripe identifiers and business fulfillment data here.
      }
      return res.json({ received: true });
    } catch (error) {
      console.error("[Stripe webhook] Signature verification failed", error);
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  });
}

export function registerStripeCheckout(app: Express) {
  app.post("/api/stripe/create-checkout-session", async (req, res) => {
    console.warn("[Stripe checkout] Disabled: Evently currently uses organizer-managed manual payments");
    return res.status(410).json({ error: "Stripe checkout is disabled; use the event organizer's UPI and WhatsApp instructions" });
  });
}
