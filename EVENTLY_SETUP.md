# Evently setup

Evently is a Vite + React + TypeScript + Tailwind frontend on the WebDev full-stack template. The prototype works immediately with realistic local mock data, and it persists created events and bookings in `localStorage` so the complete discovery → checkout → confirmation journey can be tested without credentials.

## Test the booking flow

1. Open `/explore` and select an event.
2. Choose a ticket and quantity, then continue to checkout.
3. Enter any attendee name and valid email. The checkout displays the event organizer’s UPI ID and WhatsApp number, plus an optional payment reference field.
4. Pay the organizer manually, then submit the registration. The booking appears as `PENDING` in the organizer workspace.
5. The organizer uses **Mark paid & issue QR** after confirming the payment. Evently generates one unique pass ID and visually distinct QR frame per participant ticket.
6. The confirmation page and `/dashboard/passes` wallet include each unique QR pass with a **Download QR pass** action. The invoice remains print-ready; choose **Save as PDF** in the browser print dialog to download it.

## Manual UPI/WhatsApp payments

Each event has organizer-managed payment fields:

- `paymentUpi` — the UPI ID shown at checkout.
- `paymentWhatsapp` — the WhatsApp number attendees use to share payment proof.
- `ticketTheme` — a stored theme hint for event-specific ticket branding.

Organizers enter these values while creating or editing an event. Attendees submit a manual registration; organizers confirm payment in the organizer dashboard, which generates the participant QR passes. Stripe scaffolding remains available in `server/stripe.ts` for a future automated payment option, but it is no longer used by the primary checkout UI.

## Database

`drizzle/schema.ts` contains `users`, `events`, `ticketTypes`, `bookings`, `eventStaff`, and `ticketPasses`. The generated migrations are in `drizzle/0001_red_beyonder.sql`, `drizzle/0002_flippant_fenris.sql`, and `drizzle/0003_dry_morph.sql`; all have been applied to the managed database. Ticket passes store only opaque IDs, status, check-in timestamp, and checker ID—never attendee-sensitive data inside the QR payload.

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
