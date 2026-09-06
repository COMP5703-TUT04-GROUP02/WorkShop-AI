# Workshop AI

Workshop AI is a local-services marketplace: customers find nearby providers, request a quote, book a visit, pay, and leave a review. The demo data is set in Istanbul and amounts are in Turkish lira (TRY).

The repository contains a FastAPI backend and an Expo app that runs on iOS, Android, and web.

## Features

- Public provider search by service tag, area, price, and availability
- Customer and provider chat, including real-time WebSocket delivery
- Booking flow: request → quote → pay → complete → review
- Provider profiles, portfolios, and working-hour calendars
- Admin tools for users, verification, bookings, refunds, and complaints
- Optional customer AI chat (API key, or admin ChatGPT Plus device-code login)



## Status

This is a working demo, not a production deployment.

- Checkout uses a mock payment gateway. The quoted amount is charged in TRY; no card processor is connected.
- Google and Apple buttons on the sign-in screen are placeholders until OAuth client IDs are configured.
- Address autocomplete needs a Google Maps API key. The rest of the app runs without it.
- Vector search for reviews (Milvus) runs in Docker Compose. A local Python process can omit it.



## Stack


| Layer    | Choice                                           |
| -------- | ------------------------------------------------ |
| API      | FastAPI, SQLAlchemy, Alembic                     |
| Database | PostgreSQL 16                                    |
| Auth     | RS256 JWTs, refresh-token sessions               |
| Realtime | WebSockets, Redis                                |
| App      | Expo / React Native (web included)               |
| Optional | Redis-backed Celery, Milvus, Qwen-compatible LLM |




## Repository layout

```text
backend/            API, models, routers, and services
frontend/mobile/   Expo client
migrations/        Alembic revisions
tests/             pytest suite
docs/              API notes and conventions
scripts/           JWT key generation
docker-compose.yml PostgreSQL, Redis, Milvus, API, Expo web
```



## Requirements

- Python 3.11 or newer
- Node.js 20 or newer
- Docker (optional full stack; PostgreSQL is on host port **5436**, Redis **6379**, API **8000**, web **8090**)



## Getting started

### Docker (API + web)

This starts PostgreSQL, Redis, Milvus, the API, a Celery worker, and the Expo web build. Copy `.env.example` to `.env` and set `LLM_API_KEY` (and `LLM_PROVIDER` if needed). Compose reads that file for chat and review embeddings. Do not point `WORKSHOP_DATABASE_URL` at `127.0.0.1` inside the containers; Compose already injects the Docker network URLs.

The browser talks to the API on the host (`http://127.0.0.1:8000`), not the Docker network name.

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

### Local process (API on the host)

#### 1. Clone and configure the API

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
cp .env.example .env
python scripts/generate_jwt_keys.py
```

The key script writes `backend/certs/jwt-private.pem` and `backend/certs/jwt-public.pem`. Those files stay local and should not be committed.

#### 2. Start PostgreSQL and Redis (if you are not using the full Docker stack)

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
python -m backend.seed_demo_data
```



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




## Configuration

Copy `.env.example` and adjust as needed. The values most people change first:


| Variable                                                   | Purpose                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `WORKSHOP_DATABASE_URL`                                    | SQLAlchemy URL (PostgreSQL on port 5436 by default)     |
| `WORKSHOP_JWT_*`                                           | RS256 key paths and token lifetimes                     |
| `WORKSHOP_CORS_ORIGINS`                                    | Allowed web origins (Expo web ports are already listed) |
| `LLM_PROVIDER` | Chat vendor: `qwen`, `openai`, or `custom` |
| `LLM_API_KEY` / `QWEN_API_KEY` / `OPENAI_API_KEY` | API key for the selected vendor |
| `LLM_BASE_URL` / `LLM_MODEL` | Optional overrides for the provider preset |
| `WORKSHOP_GOOGLE_CLIENT_IDS` / `WORKSHOP_APPLE_CLIENT_IDS` | OAuth audience checks for `/social-login` |
| `EXPO_PUBLIC_API_BASE_URL`                                 | API used by the Expo web/dev client                     |
| `EXPO_PUBLIC_LAN_API_BASE_URL`                             | API used by Expo Go on a phone                          |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`                          | Place search in the location picker                     |


Vector search uses Milvus. Docker Compose starts it with the rest of the stack. A local Python process can skip it and still run bookings and chat.

## Language models

Customer AI chat can use either a **developer API key** or an **admin-signed subscription**.

### API keys

Set `LLM_PROVIDER` and the matching key:

| `LLM_PROVIDER` | Key | Default model | API host |
| --- | --- | --- | --- |
| `qwen` (default) | `LLM_API_KEY` or `QWEN_API_KEY` | `qwen3.8-max` | DashScope compatible-mode |
| `openai` (alias `gpt`) | `OPENAI_API_KEY` | `gpt-6-astra` | `https://api.openai.com/v1` |
| `custom` | `LLM_API_KEY` | (set `LLM_MODEL`) | (set `LLM_BASE_URL`) |

`LLM_MODEL` and `LLM_BASE_URL` override the preset when you need a specific model ID. Comment them out when switching vendors, otherwise the old host is reused. Qwen and OpenAI both provide the embeddings used for review search; override with `EMBEDDING_*` if needed.

### ChatGPT Plus subscription

An admin signs in with ChatGPT Plus/Pro from the Admin dashboard. No local callback port is opened, and tokens are stored `0600` under `backend/certs/`. Customer AI Chat then uses that membership quota instead of a billed API key.

1. Sign in as `demo_admin@workshop.ai`.
2. Open **Customer AI subscription**.
3. Click **Sign in** on ChatGPT Plus/Pro, open the URL, enter the pairing code.
4. Click **Use this subscription**.

ChatGPT subscription traffic goes to the Codex Responses API (`chatgpt.com/backend-api/codex/responses`), not `api.openai.com`, and defaults to `gpt-5.5`. Set `LLM_MODEL` to override that default.

Treat this as an operator credential for a demo or a machine you control. It is not a way to share one personal Plus account with arbitrary end users in production.

## Tests

```bash
pytest
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

- Branch: `<usyd-unikey>/short-slug` (example: `xhua0028/postgres-english-tests`). No direct pushes to `main`.
- Commit and PR title: `<type>: <description>` (example: `feat: add RS256 JWT sessions`).
- Merge only via pull request. At least one reviewer when another maintainer is available. Only repository maintainers may merge `main`.
- Checks when they apply: `pytest` and `ruff check backend tests`; mobile `npm run typecheck`; new Alembic revision (never edit applied ones).
- Do not commit `.env` files, JWT keys, or upload artifacts.

