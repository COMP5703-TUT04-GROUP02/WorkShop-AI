# Backend architecture and business flows

Read this with [API usage](api-usage.md), [API conventions](backend-api-standard.md), and the schemas exposed by the running server at `/docs`. Source modules and the running OpenAPI schema define the current contract.

## Module map

| Location | Responsibility |
| --- | --- |
| `backend/main.py` | App setup, routers, static files, error handlers and OpenAPI |
| `backend/config.py`, `backend/llm_provider.py` | Runtime settings and provider resolution |
| `backend/models/`, `backend/schemas/` | Persisted entities and typed API contracts |
| `backend/routers/auth.py` | Email-code registration, login, sessions, social login and account security |
| `backend/routers/public.py` | Provider discovery, locations, Places, portfolios and reviews |
| `backend/routers/customer/` | Profiles, address book, discovery, bookings and feedback |
| `backend/routers/provider.py` | Provider operations, availability, portfolios and booking actions |
| `backend/routers/provider_verification.py` | Independent verification applications and protected documents |
| `backend/routers/marketplace.py`, `backend/routers/payment.py` | Payout accounts and iyzico callback |
| `backend/routers/admin.py`, `backend/routers/admin_verification.py` | Admin operations and verification decisions |
| `backend/routers/shared.py`, `backend/routers/websocket.py` | Shared booking/chat data, attachments, notifications and live delivery |
| `backend/routers/ai.py` | AI chat, pending actions, model connections, health and review indexing |
| `backend/utils/` | Shared business actions, permission/state validation and formatting |
| `backend/services/` | External integrations including email, social auth, LLM, payments, Redis and Milvus |
| `backend/ai/` | Prompts, tools, parsers and tool-calling orchestration |
| `backend/tasks/` | Celery AI, notification and review-embedding tasks |
| `migrations/` | Versioned schema and fixed demonstration data |

The frontend calls HTTP/WebSocket entry points, never Python utility functions directly. Routers and confirmed AI actions reuse business functions in `utils/customer_booking_actions.py` and `utils/provider_booking_actions.py`.

## Account lifecycle

1. Request a registration code through `/register/email-code`.
2. Submit the matching code and account details to `/register`; public registration cannot create administrators.
3. Login returns an RS256 access token and refresh-token session. Revocation is checked through the session identifier.
4. Email verification and email changes use purpose-bound, expiring one-time codes. Console email delivery logs the actual code; SMTP sends it.
5. Password changes verify the current password and revoke refresh sessions.
6. Google/Apple login validates the external identity; configured client audiences must match the app. Creating a new social account requires Terms acceptance.

Phone verification remains a demo endpoint; it does not send an SMS. It must not be described as production phone ownership verification.

## Provider onboarding

Identity verification, service qualification and payout-account setup can be submitted independently. Admin reviews identity and qualification; iyzico processes payout/submerchant configuration. Qualification approval establishes the provider profile and approved services. New-order eligibility requires identity approval, qualification approval and an active payout account.

Operating settings, enabled approved services, service areas and availability determine what can be booked. Verification documents are protected resources, not public portfolio images.

## Booking, payments and refunds

The customer selects an enabled canonical service category and submits the booking with address, schedule and optional attachments. A chat room links the customer and provider.

The provider quotes a visit fee; the customer accepts and pays it through Hosted Checkout. After arrival evidence, the provider submits the final service quote. The customer may request revisions or accept and pay the service fee before work starts. Completion evidence and customer confirmation close the booking; confirmation does not charge again.

Payment records track the stage and verified iyzico outcome. Submerchant settlement and refunds use external results before terminal local states are recorded. Cancellation closes the booking without an automatic refund. Refund requests have provider review and an admin appeal path where applicable; consult the action functions for status eligibility and amount limits.

Booking detail includes a historical reference price range when applicable. It uses the latest formal quote revision from each other booking in the same canonical category, excludes visit fees, and displays a range based on the historical mean. It is guidance rather than a price constraint. See [reference-price design](superpowers/specs/2026-10-06-reference-price-range-design.md).

## AI actions

Read-only tools can return search/review/status information immediately. Supported writes are prepared as `AIPendingAction` records and shown as confirmation cards. The client sends the stored action ID to `/ai/actions/confirm`; the backend validates ownership, expiry and current business rules before execution. Display previews are not authoritative write payloads. Incomplete booking drafts stay drafts until required fields are supplied and the user confirms.

Model configuration can be saved by an administrator and override environment settings. Chat and embeddings are separate connections. Default Docker embeddings run locally in TEI; Milvus stores review vectors. Celery performs queued indexing. Sample SQL reviews alone do not establish that the vector index is ready.

## Messaging and storage

HTTP persists chat history and manages uploads. WebSockets authenticate with a first `auth` message, then deliver chat, presence and read events. In-app notifications retain HTTP-readable history.

PostgreSQL holds marketplace records, verification snapshots, payment/refund state, AI drafts and task records. Redis supports background jobs and presence/cache use. Uploaded files and credentials need persistent storage and backups; Compose mounts separate named volumes. See [deployment](deployment.md) for addresses, credentials and indexing steps.
