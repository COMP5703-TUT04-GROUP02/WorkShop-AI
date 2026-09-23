# WS-99 — register must pick a place: test evidence

Captured against the live backend with a real Places API key, so the suggestions
and coordinates come from Google through our own proxy.

Each run registers two fresh accounts (a customer and a provider), so the script
can be re-run without cleanup.

## 1. Register asks for a service location

![The register form with a service location row](01-register-with-location-row.png)

## 2. A complete form without a place cannot be submitted

Names, email, password and the Terms box are all filled in; only the place is
missing.

![Pick your service location from the suggestions](02-place-required.png)

## 3. The place comes from the WS-72 picker

The row shows the formatted address returned by `/places/details` — not the
suggestion text, and not something typed.

![The chosen place on the register form](03-place-chosen.png)

## 4. Registration goes through

![Signed in after registering](04-registered.png)

## 5. A provider is held to the same rule, with the same picker

![The provider register form with a place](05-provider-same-picker.png)

---

## Where the place ends up

`/register` does not accept a location, so the chosen place is saved straight
after sign-up through WS-98's address book. Verified against the API for the
account the run created:

```json
{
  "label": "Home",
  "formatted_address": "Taksim Square, Kocatepe, 34435 Beyoğlu/İstanbul, Türkiye",
  "latitude": 41.0370023,
  "longitude": 28.985091699999998,
  "place_id": "ChIJY71WBmW3yhQRw7YgjLJYoIw",
  "is_default": true
}
```

A new customer therefore starts with one saved default address instead of an
empty book.

**Providers are held to the same rule but their place is not stored yet.** A
provider profile does not exist at registration — it is created later in the
profile step — so there is nowhere to put it. Flagged in the PR.

## How these were captured

```bash
node docs/testing/ws-99/shoot.js
```

A clean run prints:

```
PASS: register asks for a service location
PASS: a form without a place cannot be submitted
PASS: the chosen place is shown on the form (Taksim Square, Kocatepe, 34435 Beyoğlu/İstanbul,…)
PASS: customer registered with a place (ws99_customer_…@workshop.ai)
PASS: a provider is held to the same rule
PASS: provider registered with a place (ws99_provider_…@workshop.ai)
ALL CHECKS PASSED
```

Live results are matched by shape rather than by one exact string, because
Google's wording changes.
