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
      return res.json({ received: true, demo: true });
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
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured. Use the built-in demo payment flow or add test keys." });
    }

    const { amount, eventTitle, userId, email, name, bookingId } = req.body ?? {};
    if (!amount || !eventTitle || !email) {
      return res.status(400).json({ error: "amount, eventTitle, and email are required" });
    }

    try {
      const origin = req.headers.origin ?? "http://localhost:3000";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price_data: { currency: "inr", product_data: { name: eventTitle }, unit_amount: Math.round(Number(amount) * 100) }, quantity: 1 }],
        customer_email: email,
        client_reference_id: String(userId ?? bookingId ?? "guest"),
        metadata: { user_id: String(userId ?? "guest"), customer_email: email, customer_name: String(name ?? ""), booking_id: String(bookingId ?? "") },
        allow_promotion_codes: true,
        success_url: `${origin}/confirmation?id=${bookingId ?? "stripe"}`,
        cancel_url: `${origin}/explore`,
      });
      return res.json({ url: session.url });
    } catch (error) {
      console.error("[Stripe checkout] Session creation failed", error);
      return res.status(500).json({ error: "Unable to create Stripe checkout session" });
    }
  });
}
