# Evently Production Readiness Audit

**Audit date:** 14 September 2026  
**Scope:** Existing Evently codebase, managed deployment, server/runtime behavior, database model, authentication, payments, QR passes, RBAC, storage, and core attendee/organizer journeys.

## Executive conclusion

Evently is a polished prototype with a working managed preview and a compilable Node/Express runtime, but it is **not production-ready as a real event platform**. The most important product paths—event discovery data, event creation, booking, inventory, manual-payment approval, organizer analytics, confirmation, and attendee wallet—are still authoritative in browser `localStorage`. The visible login/signup flow does not authenticate users. The visible QR artifact is decorative rather than a standards-compliant QR code. The Stripe integration is only scaffolding and its webhook does not fulfill bookings. The current repository also is not directly deployable to Vercel serverless because it starts a long-running Express listener and has no Vercel function adapter or rewrite configuration.

The audit did identify and fix several server hardening issues: production configuration now fails fast when core variables are missing or the session secret is weak; session tokens are rejected when their application ID does not match the configured app; unknown `/api/*` routes return JSON 404 responses rather than the SPA HTML; ticket issuance and check-in fail instead of reporting success when the database is unavailable; and the unused client-trusted Stripe checkout endpoint is disabled with HTTP 410 while manual organizer payments are the active flow.

## Deployment

| Item | Status | Evidence |
|---|---|---|
| Managed Evently deployment | **PASS** | `https://eventlyapp-efkkgnfg.manus.space/` returned HTTP 200 for `/` and `/explore`. |
| Managed preview health | **PASS** | WebDev status reported the server running with no TypeScript diagnostics. |
| Vercel serverless deployment | **BLOCKED** | No `vercel.json`, Vercel function entrypoint, exported request handler, or rewrite configuration exists. The app starts a persistent Express process with `server.listen()`. |
| Production build | **PASS WITH WARNING** | `pnpm build` succeeded. Vite reports a large client chunk of approximately 876 KiB minified. |
| Unknown API route behavior | **PASS LOCALLY / NOT YET DEPLOYED** | Rebuilt production smoke test returned `404 application/json` with `{"error":"API route not found"}` for `/api/not-real`. The currently reachable managed domain still returned SPA HTML with HTTP 200 because it had not yet picked up this checkpoint. |

## Fixed errors

| Error | Root cause | Fix | Status |
|---|---|---|---|
| Production could start with an empty or weak session secret and missing database/auth configuration | `server/_core/env.ts` defaulted critical values to empty strings and did not validate production configuration | Added `validateProductionEnv()` and invoked it before server startup | **FIXED AND TESTED** |
| A valid session signed for another application could be accepted | JWT verification checked that `appId` was non-empty but did not compare it with `ENV.appId` | Added an exact application-ID comparison | **FIXED AND COMPILED** |
| Unknown `/api/*` paths returned the SPA HTML with HTTP 200 | The static catch-all ran for API paths | Added an explicit `/api` JSON 404 handler before the SPA fallback | **FIXED AND LOCALLY VERIFIED** |
| Ticket issuance could return passes when no database was available | `issueTicketPasses()` generated records and returned them even when `getDb()` returned null | Database unavailability now throws before returning a pass payload | **FIXED AND TESTED BY BUILD** |
| Check-in could collapse database failure into an invalid-ticket result | `markTicketPassCheckedIn()` returned `undefined` when the database was unavailable | Database unavailability now throws a service error | **FIXED AND TESTED BY BUILD** |
| Unused Stripe checkout trusted client-supplied amount, identity, booking, and origin | The route was scaffold code not tied to a server booking | Disabled the route with HTTP 410 while manual UPI/WhatsApp payment is the active flow | **FIXED AS A SAFETY BLOCK** |

## API audit

| Endpoint or boundary | Status | Notes |
|---|---|---|
| `GET /api/oauth/callback` | **PARTIAL** | OAuth callback includes nonce/state cookie checks, but the visible Evently login/signup screens do not use the real auth flow. |
| `POST /api/trpc` auth procedures | **PASS FOR AUTH PROCEDURES** | `auth.me` and `auth.logout` are wired through tRPC and cookie handling. |
| `POST /api/trpc` ticket pass procedures | **PARTIAL** | Server role guards and event access checks exist, but issuance does not yet validate booking-to-event-to-ticket relationships, payment state, or idempotency. |
| `POST /api/trpc` check-in procedures | **PARTIAL** | Server-side staff/organizer checks and an `ACTIVE` conditional update exist. Authorization and state transition are not fully transactional, and database errors need typed operational responses. |
| `POST /api/stripe/webhook` | **FAIL** | Signature verification exists when configured, but booking/payment/inventory/pass fulfillment is not implemented. Missing Stripe configuration now fails with HTTP 503 rather than a fake success response. |
| `POST /api/stripe/create-checkout-session` | **SAFE-BLOCKED** | Disabled with HTTP 410 because the previous implementation trusted client-controlled prices and metadata. A future Stripe path must accept only a server-side booking/cart reference. |
| `GET /manus-storage/*` | **PARTIAL** | Signed storage proxy exists, but application-level ownership, namespace, file type, file size, and quota controls are not implemented. |
| Unknown `/api/*` | **PASS LOCALLY** | Rebuilt production server returns JSON 404 instead of the client SPA. The managed domain requires a refreshed deployment before this is externally observable. |
| Event, ticket, booking, organizer, analytics API | **FAIL** | No server procedures back the primary frontend workflows. |

## Production feature status

| Feature | Status | Finding |
|---|---|---|
| Authentication | **FAIL** | The visible login/signup form accepts local strings and navigates to the dashboard. It does not create a user or authenticate a session. |
| Event discovery | **FAIL** | The public catalog uses hardcoded `DEFAULT_EVENTS` and browser state rather than published database events. |
| Event management | **FAIL** | Organizer create/edit/delete/publish behavior mutates localStorage and is not persisted or ownership-protected server-side. |
| Booking | **FAIL** | Checkout uses a timer and browser state. It does not create a durable booking, reserve inventory, or prevent concurrent overselling. |
| Manual UPI/WhatsApp payment | **FAIL** | UI instructions are present, but payment references, proofs, approval decisions, reviewer identity, and audit history are not durably stored. |
| Stripe payment | **BLOCKED** | The unsafe checkout path is disabled. Webhook fulfillment is not implemented. |
| Booking confirmation | **FAIL** | Confirmation can fall back to fabricated demo data for missing/unknown IDs and does not resolve a server-authoritative booking/payment state. |
| Email confirmation | **BLOCKED** | No transactional email provider or booking-confirmation delivery workflow is implemented. |
| QR pass generation | **FAIL** | Pass IDs are secure on the server when issued through the real route, but the primary UI creates local demo IDs and renders a hand-built 13×13 decorative pattern that is not a standards-compliant QR code. |
| QR validation | **PARTIAL** | Real server verification/check-in procedures exist, but the primary UI does not reliably produce server-issued decodable QR payloads and includes demo scanner bypasses. |
| Duplicate check-in prevention | **PARTIAL** | The database update is conditional on `ACTIVE`, which prevents two successful transitions, but the surrounding authorization and error semantics require transactional hardening. |
| RBAC | **PARTIAL** | Server middleware exists for admin, organizer, and staff procedures. Core Evently screens and route dispatch do not enforce authentication/role gates, and several core mutations do not exist server-side. |
| Database | **PARTIAL** | A persistent MySQL/TiDB schema and migrations exist, but core product writes are not used and key foreign keys, relationship constraints, idempotency constraints, and aggregate queries are missing. |
| File/image uploads | **BLOCKED** | Low-level storage helpers exist, but no authenticated event-image upload workflow with ownership, MIME, size, quota, and resource-scoped download policy is implemented. |
| Admin | **PARTIAL** | Role and staff assignment procedures exist, but they lack affected-row validation, database uniqueness constraints, and broad platform-management workflows. |
| Vercel | **BLOCKED** | Current traditional Express process architecture requires a persistent Node host or a Vercel adapter/function conversion. |

## Critical remaining blockers

1. **Replace browser-authoritative state.** Implement server-backed public event queries and authenticated organizer/attendee mutations for events, ticket types, bookings, inventory, approvals, dashboards, and confirmation. Remove `localStorage` as the source of truth.
2. **Integrate real authentication.** Replace the local login/signup acceptance path with the existing OAuth flow and add route-level loading, unauthorized, and role-aware guards.
3. **Implement atomic booking and inventory operations.** Add server-side price calculation, conditional inventory reservation, idempotency keys, duplicate-registration rules, and cancellation/expiry handling.
4. **Implement manual-payment persistence.** Store payment reference, optional proof object key, amount, state, reviewer, timestamps, and an audit trail. Approve and issue passes in one authorized, idempotent server transaction.
5. **Use a standards-compliant QR encoder.** Encode only a secure opaque server token or signed URL. Verify downloaded and on-screen QR codes with real phone scanners before release.
6. **Harden ticket-pass issuance.** Validate booking existence, event ownership, ticket-type ownership, confirmed/manual-approved payment state, quantity, and prior issuance. Add foreign keys and uniqueness/idempotency constraints.
7. **Complete payment fulfillment or remove Stripe entirely.** If Stripe is re-enabled, derive totals from the database and fulfill only from an idempotent verified webhook. Otherwise remove the unused Stripe dependency and routes after confirming manual payments are the permanent product decision.
8. **Implement transactional email.** Add a provider adapter, sender configuration, delivery status, retry behavior, and failure observability. Do not claim an email was sent when the provider fails.
9. **Choose a deployment target.** Either deploy the current persistent Node process to a compatible host or convert the runtime to Vercel-compatible functions and verify deep links, tRPC, OAuth, storage, and webhook behavior on a real Vercel deployment.
10. **Add integration tests.** The current suite contains 5 test files and 9 tests. It does not cover real database transactions, booking concurrency, auth route guards, Stripe webhook fulfillment, storage authorization, email delivery, or production deployment routing.

## Environment variables and credentials still required

Values are intentionally not included.

| Variable | Required for | Current state |
|---|---|---|
| `DATABASE_URL` | Persistent production database | Required and now validated at production startup. |
| `JWT_SECRET` | Session signing | Required; production validation requires at least 32 characters. The current runtime value was detected as set but did not satisfy the smoke-test strength requirement. Replace it with a strong production secret before release. |
| `VITE_APP_ID` | Manus OAuth/application identity | Required and validated at production startup. |
| `OAUTH_SERVER_URL` | OAuth server endpoint | Required and validated at production startup. |
| `VITE_OAUTH_PORTAL_URL` | Browser login redirect | Confirm the production value is configured for the final public origin. |
| `OWNER_OPEN_ID` and `OWNER_NAME` | Owner/admin synchronization | Required for intended owner administration behavior. |
| `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` | Managed storage and built-in integrations | Required for storage and related managed services. Keep server-side keys out of client bundles. |
| `STRIPE_SECRET_KEY` | Only if Stripe is re-enabled | Not sufficient by itself; the server-side booking/webhook fulfillment must be implemented first. |
| `STRIPE_WEBHOOK_SECRET` | Only if Stripe is re-enabled | Required for verified webhook delivery. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Only if Stripe is re-enabled | Not used by the active manual-payment flow. |
| Transactional email provider key and sender/domain settings | Booking, ticket, payment, update, and cancellation emails | Not currently implemented; provider choice and credentials are still required. |
| Production application URL / allowlisted origin | OAuth redirects, future payment redirects, CORS/origin policy | Must be set explicitly for the final deployment target. |

## Verification performed

The following checks passed in the current sandbox:

- `pnpm check`
- `pnpm test` — 5 files, 9 tests passed
- `pnpm build`
- Local production smoke test for `/` — HTTP 200 HTML
- Local production smoke test for `/explore` — HTTP 200 HTML
- Local production smoke test for `/api/not-real` — HTTP 404 JSON
- Managed-domain smoke test for `/` and `/explore` — HTTP 200 HTML

These checks validate compilation, selected regressions, and runtime routing. They do **not** prove that the application is production-ready because the core product workflows remain client-local and several integrations are incomplete.

## References

[1]: client/src/pages/Evently.tsx "Evently frontend routes, local state, checkout, organizer dashboard, confirmation, and QR UI"

[2]: server/routers.ts "Evently tRPC procedures and server-side role checks"

[3]: server/db.ts "Evently database helpers, ticket issuance, pass lookup, and check-in persistence"

[4]: drizzle/schema.ts "Evently database schema"

[5]: server/stripe.ts "Stripe checkout and webhook integration boundary"

[6]: server/_core/env.ts "Runtime environment configuration and production validation"

[7]: server/_core/index.ts "Express server startup, middleware, and route registration"

[8]: server/_core/vite.ts "Development and production static serving with SPA fallback"

[9]: EVENTLY_SETUP.md "Evently setup and deployment notes"
