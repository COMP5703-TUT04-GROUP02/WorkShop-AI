# Workshop AI

Workshop AI is a local-services marketplace for customers, service providers, and administrators. Customers find providers, discuss a job, book a visit, pay in two stages, and review completed work. Prices are in Turkish lira (TRY).

The project includes a FastAPI API and an Expo / React Native client for web, iOS, and Android. The checked-in Docker stack is a development/demo deployment; payments default to iyzico Sandbox.

## What is implemented

- **Customers:** provider discovery and filters, favourites, profiles and addresses, booking attachments, customer–provider chat, visit and service payments, reviews, refunds, and complaints.
- **Providers:** independent identity and service-qualification applications, payout-account setup, operating settings and service areas, availability, portfolios, visit quotes, arrival evidence, final-quote revisions, and completion evidence.
- **Administrators:** account management, verification decisions, booking and payment oversight, settlement/refund handling, complaints, review moderation, and customer AI configuration.
- **AI assistance:** provider search and recommendations, review search, booking drafts, and confirmation cards for supported write actions. Chat needs a configured model connection; review vector search uses Milvus and local TEI embeddings in Docker.
- **Accounts and messaging:** password login, email-code registration and email changes, optional Google/Apple login, RS256 JWT sessions, HTTP chat history, WebSocket delivery, and in-app notifications. Phone verification remains a demo flow without SMS delivery.

### Booking and payment flow

```text
Request → provider visit quote → customer accepts and pays visit fee
→ provider records arrival → final service quote (revision supported)
→ customer accepts and pays service fee → provider completes
→ customer confirms completion → review
```

Cancellation does not automatically refund paid fees. Refunds follow customer request → provider review → admin appeal where applicable. Settlement and refund results depend on iyzico responses; completion confirmation does not charge the customer again. New orders require approved identity, approved service qualification, and an active iyzico payout account.

## Quick start: Docker

Install Docker with Compose v2. From the repository root:

```bash
cp .env.example .env
# Optional: configure external services in .env (see deployment guide).
docker compose up --build -d
docker compose ps
docker compose logs -f api
```

| Service | Local address |
| --- | --- |
| Web app | http://127.0.0.1:8090 |
| API documentation | http://127.0.0.1:8000/docs |
| API health | http://127.0.0.1:8000/health |

The stack has nine services: PostgreSQL, Redis, etcd, MinIO, Milvus, TEI, API, Celery worker, and web. API startup generates local JWT keys if absent and runs Alembic migrations. TEI downloads its model on first use, so its first start needs network access and extra time. Only the web client runs in Docker; mobile development runs on the host.

**No paid API key is required to start the basic app and inspect the sample data.** AI chat, address autocomplete, social login, outgoing email, and payments each need their own configuration. See [Deployment and credentials](docs/deployment.md) for what to obtain yourself and what works without it.

## Demo data

On a fresh database, migration `0018_workshop_samples` installs fixed sample data: 5 customers, 30 providers, 300 completed bookings, 300 reviews, and 60 approved portfolio entries. Migration `0019_sample_trade_photographs` updates retired demo image references. Startup does not run a separate seed command.

All sample accounts use password `Demo1234`:

| Role | Email |
| --- | --- |
| Admin | `demo_admin@workshop.ai` |
| Customer | `demo_customer_1@workshop.ai` … `demo_customer_5@workshop.ai` |
| Provider | `demo_provider_1@workshop.ai` … `demo_provider_30@workshop.ai` |

Sample payout records are local Sandbox drafts, not active iyzico submerchants. Use the provider payout-account flow and your own Sandbox credentials to activate a selected provider before testing new bookings and checkout. Database initialization makes no external payment requests.

Migrations run once per database. Rebuilding images preserves volumes. If an older database already has conflicting demo emails, the sample migration stops rather than overwriting them; back up and reconcile the data or use a separate fresh development database. Do not delete a working database to refresh sample images.

## Local API and Expo development

Use Python 3.12 and Node.js 20 to match the Docker images and CI.

```bash
# Repository root
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
python scripts/generate_jwt_keys.py
docker compose up -d postgres redis
alembic upgrade head
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

On Windows, activate with `.venv\Scripts\activate`. In a second terminal:

```bash
cd frontend/mobile
cp .env.example .env
npm ci
npm run web
# Or: npm run ios / npm run android
```

For a browser, use `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`. For a physical phone, set `EXPO_PUBLIC_LAN_API_BASE_URL` to your computer's reachable LAN address and use the same network. Native Google login requires a development build. See [deployment](docs/deployment.md) for CORS, social login, embeddings, worker setup, and differences between host and container addresses.

## Repository layout

```text
backend/             FastAPI routers, schemas, models, business actions, AI, tasks
frontend/mobile/     Expo client (web, iOS, Android)
migrations/          Versioned schema and fixed sample-data migrations
scripts/             JWT key generation and sample-snapshot authoring
tests/               Backend tests
docker/              API entrypoint and web build/reverse proxy
docs/                Deployment, API and contributor reference
docker-compose.yml   Development/demo stack
```

## Checks

Run the checks appropriate to your changes (see [Contributing](CONTRIBUTING.md)):

```bash
pytest
ruff check backend tests
cd frontend/mobile && npm run typecheck
```

Backend CI also applies migrations against PostgreSQL 16. Documentation changes should be checked against source routes, environment configuration, and relative links.

## Documentation

- [Documentation index](docs/README.md)
- [Deployment and credentials](docs/deployment.md)
- [API usage and route inventory](docs/api-usage.md)
- [Backend architecture and business flows](docs/backend-feature-map.md)
- [API conventions](docs/backend-api-standard.md)
- [Contributing](CONTRIBUTING.md)

Work on a branch and open a pull request; do not push directly to `main`. Do not commit `.env`, private keys, OAuth tokens, or uploads.
