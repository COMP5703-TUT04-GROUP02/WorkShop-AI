# Deployment and credentials

This guide follows the checked-in `docker-compose.yml`, backend configuration, and Expo environment template. The Compose stack is intended for development and demos. All external credentials must come from your own authorised accounts; no working keys are included.

## Which credentials do I need to obtain?

| Feature | Obtain yourself | Configure | Without it |
| --- | --- | --- | --- |
| Basic local app, sample accounts and browsing | Nothing external | Copy root `.env.example` to `.env` | Works without paid API keys |
| Customer AI chat | API key and permitted model from your chosen LLM provider | `LLM_PROVIDER`, `LLM_API_KEY`; set `LLM_BASE_URL` and `LLM_MODEL` for your account | Model-backed chat is unavailable; normal marketplace screens remain usable |
| Review vector search | No external key for default local TEI | Compose supplies `EMBEDDING_*`; Milvus, TEI and worker must run | Vector search/indexing is unavailable if these services are stopped |
| Address autocomplete | Google Cloud key with Places API (New) enabled and required billing | Server-only `WORKSHOP_GOOGLE_MAPS_API_KEY` | Place suggestions/details are unavailable; service-area reference lists are separate |
| Google login | OAuth client IDs for each target platform | Root `WORKSHOP_GOOGLE_CLIENT_IDS` and matching `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` | Google sign-in is hidden for platforms without an ID; password login remains |
| Apple login | Apple developer signing/capability setup for the app identifier | `WORKSHOP_APPLE_CLIENT_IDS` (default `com.comp5703.workshopai`) and native build | Apple sign-in is unavailable; password login remains |
| Real verification emails | SMTP mailbox credentials or an app password | `WORKSHOP_EMAIL_BACKEND=smtp`, `WORKSHOP_SMTP_*`, `WORKSHOP_EMAIL_FROM` | Default `console` logs the actual one-time code instead of mailing it |
| Checkout, payout sync, settlement and refunds | iyzico Sandbox API key and secret; Marketplace-enabled account for submerchant operations | `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, callback and return URLs | Browsing works, but payment-dependent booking flows cannot complete |
| JWT authentication | Generate locally; no vendor key | Docker entrypoint or `python scripts/generate_jwt_keys.py` | Token issuance requires the generated key pair |
| Phone verification | No SMS credentials are currently integrated | Demo endpoint only | No real proof of phone ownership or SMS delivery |

OAuth client IDs are public identifiers, not secret API keys. Keep LLM keys, iyzico secrets, SMTP passwords and private JWT keys on the server. Never put them in `EXPO_PUBLIC_*` variables, which are bundled into the client.

## Docker setup

```bash
cp .env.example .env
# Edit .env for the optional features you want.
docker compose up --build -d
docker compose ps
docker compose logs -f api worker tei
```

The API entrypoint generates JWT keys and applies `alembic upgrade head`. The worker starts after the API health check. TEI starts independently and may still be downloading its model when the API becomes healthy; `/health` alone does not verify AI readiness.

| Service | Host port | Address used inside Compose |
| --- | --- | --- |
| Web | 8090 | `web:80` |
| API | 8000 | `api:8000` |
| PostgreSQL | 5436 | `postgres:5432` |
| Redis | 6379 | `redis:6379` |
| TEI | 8091 | `tei:80` |
| Milvus | 19530; health/metrics 9091 | `milvus:19530` |
| MinIO | 9000; console 9001 | `minio:9000` |

Do not use `127.0.0.1` for another container. Compose supplies database, Redis, Milvus and embedding addresses. The web build uses `same-origin`; Nginx proxies API, uploads, sample media, and WebSockets to `api`.

Named volumes persist PostgreSQL, Redis, Milvus dependencies, TEI weights, JWT/AI credentials and uploads. `docker compose down` stops the stack without deleting those volumes. Back up data and credentials before migrations or deployment changes.

## Language models

Set a provider and your own API key. The generic key is accepted as a fallback by the provider resolver:

```dotenv
LLM_PROVIDER=qwen
LLM_API_KEY=replace-with-your-key
LLM_BASE_URL=https://your-account-compatible-endpoint/v1
LLM_MODEL=your-available-model-id
```

Use the endpoint and model enabled for your account. The Qwen preset in `backend/llm_provider.py` contains a project-specific host; a new account should supply its own `LLM_BASE_URL`. Preset model names are code defaults, not a guarantee of access or availability.

The resolver recognises `qwen`, `openai`, `claude`, `kimi`, `kimi-code`, `deepseek`, `grok` and `custom`. For Docker, use `LLM_API_KEY`, which Compose forwards to API and worker. Vendor-specific variables other than `QWEN_API_KEY` and `OPENAI_API_KEY` are not currently forwarded by Compose; use the generic key or add an explicit Compose override. Likewise, only variables listed in the Compose `environment` blocks are forwarded: merely adding a variable to `.env` does not inject it into a container.

An admin can save a model connection under **Customer AI**. Stored server configuration in `backend/certs/llm_api.json` overrides environment-based API settings until cleared. The dashboard also contains ChatGPT/Grok device-login integrations; these depend on the external service and should not be assumed to replace a developer API key. This documentation does not verify those external login services.

Local TEI embeddings are independent of the chat provider and require no paid embedding key. Keep the embedding model, vector dimension and Milvus collection schema consistent; switching models can require recreating the review index and resynchronising it.

## Email codes

Registration requests a code with `POST /register/email-code` and submits it as `email_code` to `POST /register`. Signed-in email verification and address changes request purpose-specific codes through `POST /auth/email-code`.

The actual six-digit code must match; an arbitrary code is rejected. Codes expire after ten minutes, have five verification attempts, and have sending limits. With `WORKSHOP_EMAIL_BACKEND=console`, read the code in API logs. For real delivery, use your own authorised mailbox:

```dotenv
WORKSHOP_EMAIL_BACKEND=smtp
WORKSHOP_SMTP_HOST=smtp.gmail.com
WORKSHOP_SMTP_PORT=587
WORKSHOP_SMTP_USERNAME=your-mailbox@example.com
WORKSHOP_SMTP_PASSWORD=your-mailbox-app-password
WORKSHOP_EMAIL_FROM=your-mailbox@example.com
```

The example mailbox fields are placeholders. Replace them before enabling SMTP. The implementation uses STARTTLS; choose a compatible mail server. Restart API/worker after changing runtime variables.

## Google Places and social login

**Places:** configure the backend key in `WORKSHOP_GOOGLE_MAPS_API_KEY`. The app calls `/places/autocomplete` and `/places/details` through the backend. Restrict the key for the backend's intended use; do not expose it in Expo configuration.

**Google:** configure an OAuth consent screen and client IDs for the intended platforms. Match the native identifiers in `frontend/mobile/app.json` (`com.comp5703.workshopai`), the Android signing certificate, and the actual web origins/redirects used by your build. Put permitted IDs, comma-separated, in `WORKSHOP_GOOGLE_CLIENT_IDS`. Set matching client values:

```dotenv
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

For Docker web these are build arguments from the root `.env`; rebuild `web` when they change. For host Expo use `frontend/mobile/.env`. Native Google sign-in needs a development build (`npx expo run:ios` / `npx expo run:android`), rather than Expo Go.

**Apple:** enable Sign in with Apple for the app identifier and configure the native signing team. Apple sign-in is iOS only. The backend audience must match the build's bundle ID. Expo Go testing uses its own audience (`host.exp.Exponent`); include that only for the intended development test.

## iyzico payments

Set your Sandbox API key and secret. `IYZICO_BASE_URL` defaults to `https://sandbox-api.iyzipay.com`. Marketplace/submerchant operations require the corresponding account capability; ordinary checkout credentials alone do not prove Marketplace access.

- `IYZICO_CALLBACK_URL`: backend `/payments/iyzico/callback` URL reachable by the checkout integration.
- `IYZICO_FRONTEND_RETURN_URL`: app payment-result page reachable by the customer's browser.
- Localhost defaults are only for the same-machine demo. Use reachable addresses for a phone or remote checkout; a remote service cannot reach your machine through its own `localhost`.
- `PLATFORM_COMMISSION_RATE`: defaults to `0.10`.
- Sample provider payout drafts must be synchronised through the provider payout-account flow before the provider is eligible for new orders.

Hosted Checkout is used for both `visit_fee` and `service_fee`. The backend verifies payment results before recording success. Do not bypass that flow by manually editing payment states. No live payment acceptance is established by running this Sandbox stack.

## Host API / Expo and review indexing

Follow the root README for PostgreSQL, Redis, API and Expo. Use the host ports in the table above. For local review embeddings:

```bash
docker compose up -d postgres redis etcd minio milvus tei
# In root .env, uncomment the host EMBEDDING_* values from .env.example.
celery -A backend.tasks.celery_app worker --loglevel=info
```

Use `EMBEDDING_BASE_URL=http://127.0.0.1:8091/v1`, `EMBEDDING_API_KEY=tei`, `EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B`, and `EMBEDDING_DIMENSION=1024`. The `tei` value is a local client placeholder, not a vendor credential. The host API must be restarted after environment changes.

As an authenticated admin, initialise/check the collection through `POST /ai/milvus/review-collection`, enqueue indexing with `POST /ai/milvus/sync-reviews`, and inspect `GET /ai/milvus/review-sync-status`. Existing sample reviews are not proof that the vector index is populated. Check worker logs and embedding health if jobs remain pending.

For a phone, expose the host API on the LAN and set `EXPO_PUBLIC_LAN_API_BASE_URL`. For a host web origin outside the defaults, add the origin to `WORKSHOP_CORS_ORIGINS`. Docker API has an explicit CORS list in Compose; changing root `.env` alone does not override that list. Use a Compose override when needed.

## Before a public deployment

The supplied stack has demo accounts, shared demo passwords, development database/MinIO credentials and host-exposed infrastructure ports. Provision a separate deployment database, replace default credentials, restrict infrastructure access, terminate HTTPS, set reachable payment URLs and permitted origins, and arrange backups for the database, uploads and certs. Do not publish this unmodified demo stack with its sample accounts.

Changes to the reviewed sample snapshot are authoring work (`python scripts/build_sample_snapshot.py`), not a deployment step. Already-applied migrations do not rerun after rebuilding images; use a new migration for intentional data changes.
