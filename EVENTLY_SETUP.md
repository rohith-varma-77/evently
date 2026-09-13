# Evently setup

Evently is a Vite + React + TypeScript + Tailwind frontend on the WebDev full-stack template. The prototype works immediately with realistic local mock data, and it persists created events and bookings in `localStorage` so the complete discovery → checkout → confirmation journey can be tested without credentials.

## Test the booking flow

1. Open `/explore` and select an event.
2. Choose a ticket and quantity, then continue to checkout.
3. Use any attendee name, a valid email, and the Stripe test card `4242 4242 4242 4242`.
4. Use any future expiry and CVC in a real Stripe environment; in the built-in demo flow the placeholder fields are intentionally represented visually.
5. The confirmation page includes a deterministic QR-style ticket and a print-ready invoice. Choose **Save as PDF** in the browser print dialog to download the invoice.

## Stripe TEST MODE

The server scaffold in `server/stripe.ts` provides:

- `POST /api/stripe/create-checkout-session` for hosted Checkout sessions.
- `POST /api/stripe/webhook` with signature verification and the required `evt_test_` verification response.
- Metadata for user, attendee email/name, and booking identifiers.

Set `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` from Stripe test mode in the project or Vercel environment. Never commit real secrets. Use the test card above and claim the Stripe sandbox before a public pilot.

## Database

`drizzle/schema.ts` contains `users`, `events`, `ticketTypes`, and `bookings`. The generated migration is in `drizzle/0001_red_beyonder.sql` and has been applied to the managed database. Stripe identifiers are stored only where needed for API references and fulfillment.

## Deployment

The project is ready for Vercel-style deployment through the managed WebDev runtime. Add the environment variables from `.env.example`, configure the Stripe webhook to target `/api/stripe/webhook`, and run:

```bash
pnpm check
pnpm test
pnpm build
```

Email confirmation is intentionally structured as a provider-agnostic integration boundary. Add the chosen provider credentials, then call the email provider from the confirmed-booking webhook handler without storing message content in the database.
