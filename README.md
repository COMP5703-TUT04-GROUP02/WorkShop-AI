# Workshop AI

Workshop AI is a local-services marketplace: customers find nearby providers, request a quote, book a visit, pay, and leave a review. The demo data is set in Istanbul and amounts are in Turkish lira (TRY).

The repository contains a FastAPI backend and an Expo app that runs on iOS, Android, and web.

## Features

- Public provider search by service tag, area, price, and availability
- Customer and provider chat, including real-time WebSocket delivery
- Booking flow: request → visit quote → pay visit fee → arrival → final quote → pay service fee → complete → review
- Provider profiles, portfolios, and working-hour calendars
- Admin tools for users, verification, bookings, payments, settlements, refunds, and complaints
- Optional customer AI chat (API key, or admin ChatGPT Plus device-code login)



## Status

This is a working demo, not a production deployment.

- Checkout uses iyzico Sandbox. Marketplace payments require an iyzico-enabled Marketplace merchant account; no live funds are involved.
- Customers pay the visit fee first through Hosted Checkout. The provider submits arrival evidence and a final quote; the customer can decline and renegotiate, or accept and pay the service fee before work starts.
- Cancellation closes the booking without automatically refunding paid fees. Refunds follow Customer request → Provider review → Admin appeal, with at most one successful full/partial refund per booking.
- Payment APIs cover both payment stages, callback verification, checkout idempotency, Marketplace settlement retry, and refunds. Customer completion confirmation does not charge the card again.
- Marketplace settlement approval and full/partial refunds are confirmed by iyzico before local terminal states are written. The app does not claim to know when a provider receives money.
- Google and Apple buttons on the sign-in screen are placeholders until OAuth client IDs are configured.
- Address autocomplete needs a server-side Google Places API (New) key. The rest of the app runs without it.
- Vector search for reviews (Milvus + local TEI embeddings) starts with Docker Compose. A split local API process can omit it.
- Provider ID verification, Service verification, and Payout account can be submitted independently. New orders require both Admin approvals and an active iyzico payout account; seeded providers' existing bookings remain viewable.



## Stack


| Layer    | Choice                                                           |
| -------- | ---------------------------------------------------------------- |
| API      | FastAPI, SQLAlchemy, Alembic                                     |
| Database | PostgreSQL 16                                                    |
| Auth     | RS256 JWTs, refresh-token sessions                               |
| Realtime | WebSockets, Redis                                                |
| App      | Expo / React Native (web included)                               |
| Optional | Redis-backed Celery, Milvus, TEI embeddings, Qwen-compatible LLM |




## Repository layout

```text
backend/            API, models, routers, and services
frontend/mobile/   Expo client
migrations/        Alembic revisions
tests/             pytest suite
docs/              API notes and conventions
scripts/           JWT key generation
docker-compose.yml PostgreSQL, Redis, Milvus, TEI, API, Expo web
```



## Requirements

- **Docker** (recommended one-command stack)
- Python 3.11 or newer and Node.js 20 or newer (only for split local debug)
- Host ports: PostgreSQL **5436**, Redis **6379**, TEI **8091**, API **8000**, web **8090**



## Getting started

Prefer Docker. Use the host API / Expo process only when you need to debug one side without rebuilding images.

### 1. Docker (recommended)

This starts PostgreSQL, Redis, Milvus, TEI (`Qwen3-Embedding-0.6B`), the API, a Celery worker, and the Expo web build. Copy `.env.example` to `.env` and set `LLM_API_KEY` (and `LLM_PROVIDER` if needed). Compose reads that file for chat. Review embeddings default to the TEI container (`http://tei:80/v1`); do not point `EMBEDDING_BASE_URL` or `WORKSHOP_DATABASE_URL` at `127.0.0.1` inside the stack. The first TEI start downloads model weights into a volume.

```bash
cp .env.example .env
# set LLM_API_KEY=...
docker compose up --build
```

- App: [http://127.0.0.1:8090](http://127.0.0.1:8090)
- API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

Demo accounts are seeded automatically (`Demo1234`). An admin can still sign in with ChatGPT Plus from the dashboard instead of (or in addition to) an API key.

iOS / Android / Expo Go still run on the host (`cd frontend/mobile && npm start`). Only the web client is containerised.

### 2. Split local debug (API / Expo on the host)

Use this when you want `--reload` on the API, Expo web/dev tools, or a phone client, without rebuilding the web image. Keep Docker for PostgreSQL and Redis (and TEI if you need review search).

#### 1. Clone and configure the API

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
cp .env.example .env
python scripts/generate_jwt_keys.py
```

The key script writes `backend/certs/jwt-private.pem` and `backend/certs/jwt-public.pem`. Those files stay local and should not be committed.

#### 2. Start PostgreSQL and Redis

```bash
docker compose up -d postgres redis
```

The default database URL in `.env.example` is:

```text
postgresql+psycopg://workshop:workshop@127.0.0.1:5436/workshop
```



#### 3. Migrate and seed

```bash
alembic upgrade head
python -m backend.seed_locations
python -m backend.seed_demo_data
```

`backend.seed_locations` loads the required Turkish service-area reference
data. Demo users and providers remain optional and are seeded separately.



#### 4. Run the API

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

- Health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- OpenAPI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)



#### 5. Run the app

```bash
cd frontend/mobile
cp .env.example .env
npm install
npm start
```

Point `EXPO_PUBLIC_API_BASE_URL` at the API (for a local browser session, `http://127.0.0.1:8000` is enough). On a physical device, set `EXPO_PUBLIC_LAN_API_BASE_URL` to the machine’s LAN address, for example `http://192.168.1.10:8000`, and keep the phone on the same network.

```bash
npm run web      # browser
npm run ios      # simulator / device
npm run android
```



## Demo accounts

Every seeded account uses the password `Demo1234`.


| Role     | Email                                                          |
| -------- | -------------------------------------------------------------- |
| Admin    | `demo_admin@workshop.ai`                                       |
| Customer | `demo_customer_1@workshop.ai` … `demo_customer_5@workshop.ai`  |
| Provider | `demo_provider_1@workshop.ai` … `demo_provider_30@workshop.ai` |




## iyzico Sandbox testing

Successful Sandbox cards:

| Card number | Bank / type |
| ----------- | ----------- |
| `5526080000000006` | Akbank Mastercard credit |
| `4603450000000000` | Denizbank Visa credit |
| `4987490000000002` | QNB Visa debit |

Use a future expiry date and a correctly formatted CVV. These cards simulate payments only; they do not move real funds.

Seeded payout details use the following Sandbox fixtures:

| Field | Personal / private company | Limited / joint stock company |
| ----- | -------------------------- | ----------------------------- |
| Name | `John's market` | `John's market` |
| Email | `email@submerchantemail.com` | `email@submerchantemail.com` |
| Phone | `+905350000000` | `+905350000000` |
| Address | `Nidakule Göztepe, Merdivenköy Mah. Bora Sok. No:1` | same |
| IBAN | `TR180006200119000006672315` | `TR180006200119000006672315` |
| Identity number | `31300864726` | — |
| Tax office | `Tax office` | `Tax office` |
| Legal company title | `John Doe inc` | `XYZ inc` |
| Tax number | — | `9261877` |

The regular demo seed creates 30 providers and 300 bookings. Providers 6–9 are kept as negative onboarding samples without payout records; the other 26 providers receive deterministic, evenly distributed Personal, Private Company, or Limited / Joint Stock Company fixtures.

To synchronize one provider payout record with the Sandbox Marketplace account, run:

```bash
docker compose exec api python -m backend.seed_sandbox_submerchants --provider-id 29
```

The regular demo seed only creates local payout drafts and does not call iyzico. The command above makes one explicit Sandbox request and stores the returned status, external key, or error. It never marks a provider active locally when Sandbox rejects the details, and providers 6–9 remain reserved as negative samples.




## Configuration

Copy `.env.example` and adjust as needed. The values most people change first:


| Variable                                                   | Purpose                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WORKSHOP_DATABASE_URL`                                    | SQLAlchemy URL (PostgreSQL on port 5436 by default)                                                                                                       |
| `WORKSHOP_JWT_*`                                           | RS256 key paths and token lifetimes                                                                                                                       |
| `WORKSHOP_CORS_ORIGINS`                                    | Allowed web origins (Expo web ports are already listed)                                                                                                   |
| `LLM_PROVIDER`                                             | Chat vendor: `qwen`, `openai`, `claude`, `kimi`, `kimi-code`, `deepseek`, `grok`, or `custom`                                                             |
| `LLM_API_KEY` / vendor `*_API_KEY`                         | API key for the selected vendor                                                                                                                           |
| `LLM_BASE_URL` / `LLM_MODEL`                               | Optional overrides for the provider preset                                                                                                                |
| `EMBEDDING_*`                                              | Review vectors. Compose defaults to local TEI (`Qwen3-Embedding-0.6B`, 1024). Leave blank in Docker; uncomment the host URL only for a local API process. |
| `WORKSHOP_GOOGLE_CLIENT_IDS` / `WORKSHOP_APPLE_CLIENT_IDS` | OAuth audience checks for `/social-login`                                                                                                                 |
| `WORKSHOP_GOOGLE_MAPS_API_KEY`                             | Server-only key for the Places API (New) proxy                                                                                                             |
| `WORKSHOP_EMAIL_BACKEND`                                   | `console` logs verification codes (default); `smtp` mails them                                                                                             |
| `WORKSHOP_SMTP_USERNAME` / `WORKSHOP_SMTP_PASSWORD`        | Gmail address and its App Password (needs 2-Step Verification)                                                                                             |
| `WORKSHOP_EMAIL_FROM`                                      | Sender address; use the same Gmail address                                                                                                                 |
| `IYZICO_BASE_URL` / `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` | iyzico Sandbox endpoint and credentials                                                                                                                     |
| `IYZICO_CALLBACK_URL` / `IYZICO_FRONTEND_RETURN_URL`       | Hosted Checkout callback and frontend return URLs                                                                                                           |
| `IYZICO_CHECKOUT_TTL_SECONDS`                              | Hosted Checkout lifetime before a new checkout is required                                                                                                 |
| `EXPO_PUBLIC_API_BASE_URL`                                 | API used by the Expo web/dev client                                                                                                                       |
| `EXPO_PUBLIC_LAN_API_BASE_URL`                             | API used by Expo Go on a phone                                                                                                                            |


Vector search uses Milvus plus local TEI embeddings. The recommended Docker stack starts both. A split local API process can skip them and still run bookings and chat. For review search on the host API, start TEI with `docker compose up -d tei` and uncomment the `EMBEDDING_*` host values in `.env`.

## Language models

Customer AI chat can use a **developer API key** or an **admin-signed ChatGPT / Grok subscription**. An admin picks a vendor and key on the Admin dashboard (**Customer AI**), then loads the official `/models` list. Keys are stored `0600` as `backend/certs/llm_api.json` and override `.env` until cleared.

### API keys

Set `LLM_PROVIDER` and the matching key, or save the same values from the dashboard:


| `LLM_PROVIDER`         | Key                                  | Default model     | API host                         |
| ---------------------- | ------------------------------------ | ----------------- | -------------------------------- |
| `qwen` (default)       | `LLM_API_KEY` or `QWEN_API_KEY`      | `qwen3.8-max`     | DashScope compatible-mode        |
| `openai` (alias `gpt`) | `OPENAI_API_KEY`                     | `gpt-6-astra`     | `https://api.openai.com/v1`      |
| `claude`               | `ANTHROPIC_API_KEY`                  | `claude-sonnet-5` | `https://api.anthropic.com/v1`   |
| `kimi`                 | `KIMI_API_KEY` or `MOONSHOT_API_KEY` | `kimi-k3`         | `https://api.moonshot.cn/v1`     |
| `kimi-code`            | `KIMI_CODE_API_KEY`                  | `k3`              | `https://api.kimi.com/coding/v1` |
| `deepseek`             | `DEEPSEEK_API_KEY`                   | `deepseek-chat`   | `https://api.deepseek.com/v1`    |
| `grok`                 | `XAI_API_KEY`                        | `grok-4.7`        | `https://api.x.ai/v1`            |
| `custom`               | `LLM_API_KEY`                        | (set `LLM_MODEL`) | (set `LLM_BASE_URL`)             |


`LLM_MODEL` and `LLM_BASE_URL` override the preset when you need a specific model ID. Comment them out when switching vendors, otherwise the old host is reused.

Review search does not use a ChatGPT subscription. Compose defaults to Hugging Face Text Embeddings Inference (TEI) running `Qwen/Qwen3-Embedding-0.6B` (1024 dimensions). That is independent of the chat vendor. If `EMBEDDING_*` is unset outside Docker, Qwen and OpenAI API keys can still provide embeddings (`text-embedding-v4` / `text-embedding-3-large`).

### ChatGPT Plus subscription

An admin signs in with ChatGPT Plus/Pro from the Admin dashboard. Customer AI Chat then uses that membership quota instead of a billed API key.

1. Sign in as `demo_admin@workshop.ai`.
2. Open **Customer AI**.
3. Click **Sign in** on ChatGPT Plus/Pro, open the URL, enter the pairing code.
4. Click **Use this subscription**. Use **Save and use** on the API key card to switch back.

After sign-in, click **Load official models** and pick one.

### Grok subscription

The same Admin page can sign in with SuperGrok / X Premium+ through xAI’s device-code OAuth (`auth.x.ai`). Load models, then **Use this subscription**.

## Tests

```bash
pytest
pytest tests/test_marketplace.py
cd frontend/mobile && npm run typecheck
```

CI runs Alembic against PostgreSQL 16, Ruff (syntax and undefined-name checks), pytest, and the Expo TypeScript check.

## Auth notes

- Passwords live on `authentication_identities`, not on `users`.
- Access tokens are RS256 JWTs. `sub` is the user id. `sid` is the refresh-token `jti`, so logout can revoke the session.
- WebSocket routes `/ws/me` and `/ws/chats/{id}` accept the socket first, then require `{ "type": "auth", "token": "<access_token>" }`.



## Provider tags

`cleaning`, `childcare`, `elderly_care`, `electrician`, `plumbing`, `painter`, `locksmith`, `technician`, `moving`, `other`

## Documentation

- [API usage](docs/api-usage.md)
- [Backend feature map](docs/backend-feature-map.md)
- [API conventions](docs/backend-api-standard.md)
- [Contributing](CONTRIBUTING.md)



## Contributing

Full rules: [CONTRIBUTING.md](CONTRIBUTING.md).

- Branch: `<usyd-unikey>/WS-<num>-short-slug` (example: `xhua0028/WS-23-auth-api`). Omit `WS-<num>` only when there is no Jira item. No direct pushes to `main`.
- Commit and PR title: `WS-<num> <type>: <description>` (example: `WS-23 feat: add RS256 JWT sessions`). Omit `WS-<num>` only when there is no Jira item.
- Merge only via pull request. At least one reviewer when another maintainer is available. Only repository maintainers may merge `main`.
- Checks when they apply: `pytest` and `ruff check backend tests`; mobile `npm run typecheck`; new Alembic revision (never edit applied ones).
- Do not commit `.env` files, JWT keys, or upload artifacts.

