# Backend API conventions

Use this as a contributor guide, with [API usage](api-usage.md), [architecture](backend-feature-map.md), and the current server's `/docs` and `/openapi.json`. Endpoint-specific schemas and dependency checks in source take precedence over illustrative examples.

## HTTP contracts

- Put routes in the relevant `backend/routers/` module and request/response schemas in `backend/schemas/`.
- Use `ApiRouter` and shared response helpers. Most responses have `{ "success": true, "message": "...", "data": ... }`; errors use the central error handlers and an `error` payload. OAuth token responses, provider callbacks, files and health endpoints may have specialised contracts.
- Use `HTTPException` for expected failures and shared permission dependencies for role/ownership checks.
- Send `Authorization: Bearer <access_token>` for protected HTTP endpoints. Public routes and token requirements are defined by each route, not by its URL prefix alone.
- Use the shared pagination helpers; pages start at 1. Follow the declared schema for list metadata.
- File routes use multipart uploads. Check allowed types, size, ownership and reference scope using existing upload helpers. Verification files require protected access.
- Use the project's clock helpers and explicit schedule schemas; do not invent free-text time parsing.

## Authentication and verification

Password identities are stored separately from users. Access tokens use RS256 and carry the user ID plus refresh-session identifier. Login/refresh/logout must preserve session revocation behavior.

Registration consumes a code requested with `/register/email-code`. Signed-in verification/email changes use `/auth/email-code` with the appropriate purpose. Codes are hashed, expiring and attempt-limited. Console delivery prints the actual code to logs; it does not accept arbitrary six-digit email codes. Phone verification remains a separate demo-only flow without SMS.

Use server-side Google/Apple token verification and configured audiences. Never trust a client-supplied email as proof of a social identity. Public registration/social login cannot provision admin accounts.

## Booking and payments

Reuse customer/provider business action functions for both regular endpoints and confirmed AI actions. Keep state validation, history, chat system messages and notifications consistent.

Payments use iyzico Hosted Checkout for `visit_fee` and `service_fee`. Preserve idempotency and callback/retrieval verification; do not introduce a mock payment shortcut. The customer must accept each quote before its payment stage. Completion confirmation is not a payment operation. Cancellation does not automatically refund paid money. Apply refund and settlement terminal states only after the external operation has been confirmed.

Canonical service category values must come from approved/enabled provider services. Localised labels are display values. Historical reference prices belong in booking detail, not every list row; see the [design](superpowers/specs/2026-10-06-reference-price-range-design.md).

## AI confirmation

Supported write tools prepare server-side pending actions. The UI displays a confirmation card and confirms via `POST /ai/actions/confirm` with an `action_id`. Execute only the stored server payload after rechecking owner, expiry and current permissions/state. Never execute frontend preview fields as an action payload. Incomplete booking drafts are not completed bookings.

Read-only tools can execute directly. Slow AI/indexing tasks use Celery task records. Chat credentials do not automatically provide embeddings; see [deployment](deployment.md).

## WebSockets

Connect to `/ws/me` or `/ws/chats/{chat_room_id}` and send the authentication frame first:

```json
{"type":"auth","token":"<access_token>"}
```

Do not put the access token in a URL query. The server accepts the socket before authenticating and closes invalid sessions with a policy-violation error. Chat access requires membership and the current permission checks.

Chat supports `chat_message`, `mark_read`, `typing_start` and `typing_stop`. Upload attachments over HTTP before referencing their IDs in a message. HTTP history remains the persisted source. Use structured message metadata to render booking cards rather than parsing text.

## Change checklist

- Route in the correct module with appropriate role/ownership dependencies.
- Typed request/response contract and current OpenAPI documentation.
- Shared response, pagination, error and upload helpers.
- Business state, history, notifications and related chat updates kept together.
- Both HTTP and AI write paths reuse the relevant action functions.
- Database changes use a new Alembic revision; never edit an applied migration.
- Consider Redis, Milvus and queued task effects.
- Run applicable checks in [Contributing](../CONTRIBUTING.md); never commit credentials or uploads.
