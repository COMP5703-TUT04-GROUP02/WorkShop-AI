# Reference Price Range Design

## Goal

Add an independent Workshop AI feature that gives providers a non-binding price recommendation while they prepare a quote and gives customers the same historical reference range when they review a submitted quote. The feature must use one shared backend calculation and must not restrict the provider's chosen price.

## Scope

The feature includes:

- a service category snapshot on each new booking;
- one backend calculation for historical reference prices;
- provider displays for initial and final quote entry;
- customer displays for initial and final quote review;
- database, API, and frontend tests for the agreed rules.

The feature does not include location, date windows, provider ratings, duration, urgency, comment filtering, price enforcement, or predictive pricing.

## Service Category

`Booking` gains a nullable `service_category` column. New booking requests must supply a category selected from the target provider's enabled approved services. The backend validates that the category is currently enabled for that provider before creating the booking.

The customer app uses the provider's existing enabled service tags as the choices. It automatically selects the category when only one is available and requires an explicit choice when multiple categories are available. The selected value is stored as a booking snapshot and is not changed when the provider later changes enabled services.

Existing bookings remain nullable and are not guessed or backfilled. A legacy booking without a category cannot contribute to, or receive, a historical range.

## Historical Sample Definition

The source is `BookingQuoteRevision`, joined to its booking.

A sample is valid when:

- its booking has the same non-null `service_category` as the current booking;
- it is a persisted quote revision created by the normal initial-quote or final-quote submission flow;
- its booking is not the current booking.

Every persisted formal revision is one sample. This includes initial quotes, final quotes, and formally submitted revisions that were later declined. Draft input is never persisted and therefore never contributes. Excluding the entire current booking prevents self-reference across initial quotes, revised quotes, and final quotes.

The sampled amount is `BookingQuoteRevision.quote_amount`, which is the expected service amount for an initial quote and the submitted service amount for a final quote. Visit fees are not part of the reference price calculation.

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

## Provider Experience

The provider booking detail modal displays `Recommended price range` beside the amount entry area for both the initial quote and the final quote.

When `has_history` is true, it displays the rounded range using the app's TRY/₺ formatter. When false, it displays no invented monetary range. The recommendation is explanatory only and creates no new validation rule.

## Customer Experience

When an initial or final quote is visible to the customer, the booking detail modal displays the fixed label `Typical range for similar jobs`.

When `has_history` is true, the rounded TRY range is shown. When false, the fixed fallback is `No historical data for similar jobs`.

## Data Flow

1. Customer selects one enabled service category and creates a booking.
2. Backend validates and stores the category snapshot.
3. A booking detail request calculates the range from matching historical quote revisions while excluding the current booking.
4. Provider and customer screens read the same `reference_price_range` object.
5. Provider submits any positive amount allowed by the existing quote rules, regardless of the recommendation.

## Migration and Compatibility

An Alembic migration adds the nullable, indexed `bookings.service_category` column. It deliberately performs no heuristic backfill.

The API exposes the field in booking responses. Updated clients send it for new bookings. Existing stored bookings continue to load and receive the no-history response when their category is null.

## Testing

Backend tests cover:

- zero matching revisions;
- one matching revision;
- multiple matching revisions and arithmetic mean;
- decimal half-up rounding;
- different service categories being excluded;
- all revisions belonging to the current booking being excluded;
- a legacy booking with no category;
- booking creation validation against the provider's enabled approved services.

Frontend tests cover the display model for:

- a real historical range;
- the no-history fallback;
- TRY formatting;
- the recommendation remaining informational rather than an input constraint.

Verification includes the complete backend test suite, the frontend reference-price tests, and the frontend TypeScript check.

## Delivery

The work is isolated on branch `feat/reference-price-range` and delivered as one independent pull request. The PR description documents the implementation, formula, test results, legacy-booking behavior, and explicit exclusions.
