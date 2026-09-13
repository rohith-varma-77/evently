# Evently setup

Evently is a Vite + React + TypeScript + Tailwind frontend on the WebDev full-stack template. The prototype works immediately with realistic local mock data, and it persists created events and bookings in `localStorage` so the complete discovery → checkout → confirmation journey can be tested without credentials.

## Test the booking flow

1. Open `/explore` and select an event.
2. Choose a ticket and quantity, then continue to checkout.
3. Use any attendee name, a valid email, and the Stripe test card `4242 4242 4242 4242`.
4. Use any future expiry and CVC in a real Stripe environment; in the built-in demo flow the placeholder fields are intentionally represented visually.
5. The confirmation page and `/dashboard/passes` wallet include one unique QR pass per purchased ticket, with an opaque pass ID and a **Download QR pass** action. The invoice remains print-ready; choose **Save as PDF** in the browser print dialog to download it.

## Stripe TEST MODE

The server scaffold in `server/stripe.ts` provides:

- `POST /api/stripe/create-checkout-session` for hosted Checkout sessions.
- `POST /api/stripe/webhook` with signature verification and the required `evt_test_` verification response.
- Metadata for user, attendee email/name, and booking identifiers.

Set `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` from Stripe test mode in the project or Vercel environment. Never commit real secrets. Use the test card above and claim the Stripe sandbox before a public pilot.

## Database

`drizzle/schema.ts` contains `users`, `events`, `ticketTypes`, `bookings`, `eventStaff`, and `ticketPasses`. The generated migrations are in `drizzle/0001_red_beyonder.sql` and `drizzle/0002_flippant_fenris.sql`; both have been applied to the managed database. Ticket passes store only opaque IDs, status, check-in timestamp, and checker ID—never attendee-sensitive data inside the QR payload.

## QR check-in and roles

Evently supports `user`, `organizer`, `staff`, and `admin` roles. Organizer and admin accounts can issue passes; organizers can scan their own events; staff can scan only events assigned through `eventStaff`; and admins can manage roles and staff assignments. The server enforces these rules through tRPC middleware and event-scope checks. The scanner is available at `/scanner`, and `/403` is the clean unauthorized state.

For a demo walkthrough, the scanner provides **Use valid demo** (`EVT-DEMO24-PASS-1`) and **Use used demo** (`EVT-DEMO24-PASS-USED`) controls. Real pass IDs are verified through `ticketPasses.verify` and are atomically marked `CHECKED_IN` through `ticketPasses.checkIn`, preventing duplicate check-ins.

## Deployment

The project is ready for Vercel-style deployment through the managed WebDev runtime. Add the environment variables from `.env.example`, configure the Stripe webhook to target `/api/stripe/webhook`, and run:

```bash
pnpm check
pnpm test
pnpm build
```

Email confirmation is intentionally structured as a provider-agnostic integration boundary. Add the chosen provider credentials, then call the email provider from the confirmed-booking webhook handler without storing message content in the database.
