# Evently QR/RBAC visual QA

Desktop captures confirmed the dedicated QR pass wallet renders two distinct pass cards for a two-ticket booking, each with a unique pass ID, QR pattern, event metadata, status badge, and download action. The scanner screen renders the mobile-camera-inspired scanning panel, live check-in counter, secure lookup field, valid/used demo controls, and role-safe workflow. The 403 page clearly communicates access restriction and provides a safe return path.

The scanner intentionally supports a deterministic valid demo (`EVT-DEMO24-PASS-1`) and already-used demo (`EVT-DEMO24-PASS-USED`) for prototype walkthroughs; all non-demo IDs call the server-side tRPC verify/check-in procedures.

Mobile capture confirmed the QR wallet stacks each pass card vertically with readable identifiers and full-width touch-safe download controls. The scanner stacks the camera panel above the secure lookup card, keeps the check-in counter visible, and avoids horizontal overflow at 390px wide.

Interactive browser QA completed on the live preview: selecting the valid demo pass showed attendee/ticket details, Check attendee in produced the success toast and CHECKED_IN state, and selecting the used demo pass displayed the yellow ALREADY_USED state with re-entry blocked.
