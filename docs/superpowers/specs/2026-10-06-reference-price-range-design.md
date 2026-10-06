# Reference Price Range Design

## Goal

Add an independent Workshop AI feature that gives providers a non-binding price recommendation while they prepare a quote and gives customers the same historical reference range when they review a submitted quote. The feature must use one shared backend calculation and must not restrict the provider's chosen price.

## Scope

The feature includes:

- a booking-time snapshot of the selected canonical service classification;
- one backend calculation for historical reference prices;
- provider displays for initial and final quote entry;
- customer displays for initial and final quote review;
- database, API, and frontend tests for the agreed rules.

The feature does not include location, date windows, provider ratings, duration, urgency, comment filtering, price enforcement, or predictive pricing.

## Service Classification

The implementation must reuse the application's canonical service classification rather than introduce a parallel taxonomy. The current domain model uses the controlled `ProviderApprovedService.service_category` value and does not have a separate stable service or category ID. Therefore `Booking` gains a nullable `service_category` field that stores that canonical value as a booking-time snapshot. If the domain model gains a stable canonical identifier before implementation, the identifier must be reused instead of adding this string field.

New booking requests must supply a service selected from the target provider's enabled approved services. The backend validates that the service is currently enabled for that provider before creating the booking.

The customer app uses the provider's existing enabled service tags as the choices. It automatically selects the service when only one is available and requires an explicit choice when multiple services are available. The selected value is stored as a booking-time snapshot and is not changed when the provider later changes enabled services.

Existing bookings remain nullable and are not guessed or backfilled. A legacy booking without a service classification cannot contribute to, or receive, a historical range.

## Historical Sample Definition

The source is `BookingQuoteRevision`, joined to its booking.

A historical booking is eligible when:

- it has the same non-null canonical service classification as the current booking;
- it has at least one persisted formal quote revision created by the normal initial-quote or final-quote submission flow;
- it is not the current booking.

Each eligible historical booking contributes at most one sample. For each eligible booking, the persisted formal `BookingQuoteRevision` with the highest `revision_number` is selected and its `quote_amount` is the sample value. Earlier revisions from the same booking do not contribute additional samples. This prevents bookings with more quote revisions from receiving disproportionate weight.

The selected latest revision can be an initial, revised, or final quote, including a formal revision that was later declined. Draft input is never persisted and therefore never contributes. Excluding the entire current booking prevents self-reference across its initial, revised, and final quotes. Visit fees are not part of the reference price calculation.

## Calculation and Rounding

For one or more samples:

1. Calculate the arithmetic mean of all sampled quote amounts.
2. Set the lower bound to the mean multiplied by `0.9`.
3. Set the upper bound to the mean multiplied by `1.1`.
4. Round each bound to a whole TRY amount using decimal `ROUND_HALF_UP` behavior.

For zero samples, no monetary bounds are returned.

No time, location, rating, duration, urgency, or provider-specific weighting is applied.

## Backend Contract

A focused backend utility calculates the range so both roles use identical data and rules. Booking detail formatting calls it and adds:

```json
{
  "reference_price_range": {
    "has_history": true,
    "minimum": 900,
    "maximum": 1100,
    "currency": "TRY",
    "sample_count": 3
  }
}
```

When no valid history exists, the response is:

```json
{
  "reference_price_range": {
    "has_history": false,
    "minimum": null,
    "maximum": null,
    "currency": "TRY",
    "sample_count": 0
  }
}
```

The calculation is read-only. Quote submission does not compare, clamp, reject, or otherwise change the provider's amount based on the range.

`sample_count` is the number of eligible historical bookings included in the calculation, not the number of quote revisions.

## Provider Experience

The provider booking detail modal displays `Recommended price range` beside the amount entry area for both the initial quote and the final quote.

When `has_history` is true, it displays the rounded range using the app's TRY/₺ formatter. When false, it displays no invented monetary range. The recommendation does not prefill, clamp, or reject the provider's input and creates no new validation rule.

## Customer Experience

When an initial or final quote is visible to the customer, the booking detail modal always displays a fixed reference block headed `Typical range for similar jobs`.

When `has_history` is true, the rounded TRY range appears below the heading. When false, the block remains visible and shows the fixed fallback `No historical data for similar jobs`.

## Data Flow

1. Customer selects one enabled canonical service classification and creates a booking.
2. Backend validates and stores the booking-time service snapshot.
3. A booking detail request identifies matching historical bookings, selects the latest persisted formal quote revision from each eligible booking, and calculates the range while excluding the current booking.
4. Provider and customer screens read the same `reference_price_range` object.
5. Provider submits any positive amount allowed by the existing quote rules, regardless of the recommendation.

## Migration and Compatibility

The migration reuses an existing booking-level canonical service identifier if one is available at implementation time. With the current domain model, no such booking field or stable service ID exists, so the migration adds nullable, indexed `bookings.service_category` using the canonical `ProviderApprovedService.service_category` value. It deliberately performs no heuristic backfill and does not create a duplicate service taxonomy.

The API exposes the field in booking responses. Updated clients send it for new bookings. Existing stored bookings continue to load and receive the no-history response when their category is null.

## Testing

Backend tests cover:

- zero matching historical bookings;
- one matching historical booking;
- multiple matching historical bookings and arithmetic mean;
- decimal half-up rounding;
- different service classifications being excluded;
- the current booking being excluded entirely;
- multiple revisions of one historical booking contributing only one sample;
- the latest persisted formal revision being selected for each historical booking;
- a legacy booking with no service classification;
- booking creation validation against the provider's enabled approved services;
- visit fees being excluded from the calculation.

Frontend tests cover the display model for:

- provider display of `Recommended price range`;
- customer display of `Typical range for similar jobs`;
- a real historical range;
- the visible no-history fallback;
- TRY formatting;
- initial quote state;
- final quote state;
- the recommendation remaining informational rather than an input constraint.

Verification includes the complete backend test suite, the frontend reference-price tests, and the frontend TypeScript check.

## Delivery

The work is isolated on branch `feat/reference-price-range` and delivered as one independent pull request. The PR description documents the implementation, formula, test results, legacy-booking behavior, and explicit exclusions.
