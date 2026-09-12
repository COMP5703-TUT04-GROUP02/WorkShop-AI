# WS-96 — Account menu IA: test evidence

Captured against a locally running API (`uvicorn backend.main:app`) on a freshly
migrated and seeded database, signed in as `demo_customer_1@workshop.ai` and
`demo_provider_1@workshop.ai`. Every image is a real run, not a mockup.

Subtasks covered: **WS-108** (menu IA and Favourite entry), **WS-109**
(Help and Support), **WS-110** (Payments entry and history).

---

## 1. Account — customer

Favourites, Payments, Notification settings and Help and Support are all
present. The notification **inbox** is no longer a row; it is the badged bell in
the header, top right.

![Account menu as a customer](01-account-customer.png)

## 2. Payments — customer (WS-110)

Real records: one `PAID` (225.32 TRY) and one `PENDING` (243.23 TRY), each with
its booking and the provider. Taken through `POST /bookings/{id}/payments` then
`PUT /payments/{id}/pay`, so these are genuine rows rather than fixtures.

![Customer payment history](02-payments-customer.png)

## 3. Help and Support (WS-109)

Title reads "Help and Support"; FAQ and Contact us are both present as
placeholders.

![Help and Support with FAQ and Contact us](03-help-and-support.png)

## 4. Notification settings (WS-108)

The destination that replaces the inbox row.

![Notification settings placeholder](04-notification-settings.png)

## 5. Favourites — customer (WS-108)

The entry point this ticket owns. The saved-provider list itself is WS-75.

![Favourites entry point](05-favourites-customer.png)

## 6. Account — provider (WS-108)

**Favourites is absent.** Payments, Notification settings and Help and Support
are present, matching the customer menu minus the customer-only row.

![Account menu as a provider, without Favourites](06-account-provider.png)

## 7. Payments — provider (WS-110)

Same screen, provider wording, reading `GET /provider/payments`.

![Provider payment history](07-payments-provider.png)

---

## How these were captured

`docs/testing/ws-96/shoot.js` drives the flows with Playwright and asserts the
role rule rather than leaving it to the eye — it prints
`PASS: Favourites hidden for provider`. Re-run it with the API and
`npx expo start --web --port 8090` both up:

```bash
node docs/testing/ws-96/shoot.js
```
