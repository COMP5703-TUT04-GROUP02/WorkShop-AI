# Review visibility sweeps: test evidence

## What this does

A review has two states, visible and hidden. This adds two mirror actions to the
admin dashboard, each one check and one click.

**Hide reviews bought with cheap bookings.** Checks every **visible** review and
finds the ones whose booking total was below an amount — too cheap to have been
a real job. That is how a provider farms their own rating: have someone place a
token-priced order and leave five stars for it. Hiding removes the review from
the provider's public profile **and from their average rating**, because
`get_provider_rating_summary` only counts visible reviews. The farmed stars stop
lifting the score.

**Restore hidden reviews on real bookings.** The mirror. Checks every **hidden**
review and finds the ones whose booking was at or above an amount, then makes
them visible again. This is the way back from a sweep run at too high a number,
without hunting for reviews one at a time.

| | Scans | Comparison | Order | Result |
| --- | --- | --- | --- | --- |
| Hide | visible reviews | `< threshold` | cheapest first | hidden |
| Restore | hidden reviews | `>= threshold` | dearest first | visible |

The hide comparison is strict and the restore comparison is inclusive, so the
same number used on both sides is a clean round trip: nothing falls between them
and nothing is caught twice.

## The threshold

Default **100 TRY** on both, editable before each run.

100 TRY came from the data rather than a guess: the median provider on the
platform charges 119 TRY an hour, so a booking under 100 TRY cannot pay for even
one hour of a typical provider's time. It does not have to be exactly right,
because the admin sees the full list, with the booking total that paid for each
review, before anything changes.

## Hiding

The sweep runs on load at the default and reports how many reviews it matched.

![The hide sweep at its default threshold](01-default-check.png)

Every row carries the booking total, the provider, the rating and the comment,
so the admin decides on evidence rather than on a count.

![The list, cheapest first](02-list-with-amounts.png)

Narrowing the threshold to 53 TRY cuts the list from 20 reviews to 3.

![A narrower threshold](03-threshold-changed.png)

Hiding says what it did.

![Hidden](04-hidden.png)

## Restoring

The mirror sweep, set to 50 TRY, finds exactly the three that were just hidden —
dearest first this time.

![The restore sweep](05-restore-check.png)

![Restored](06-restored.png)

![Nothing left hidden](07-nothing-left-hidden.png)

Because the evidence run is a round trip, it leaves the database exactly where
it started: 300 visible reviews before and after.

## How these were captured

```bash
node docs/testing/low-value-reviews/shoot.js
```

A clean run prints:

```
PASS  the admin dashboard carries the hide sweep
PASS  it checks every visible review at the 100 TRY default
PASS  each row shows the booking total behind the review
PASS  the threshold is the admin's to set
PASS  hiding reports what it did
PASS  the dashboard carries the mirror sweep
PASS  the restore sweep finds the three that were just hidden
PASS  restoring reports what it did
PASS  nothing is left hidden above that amount

9 passed, 0 failed
```

## Automated tests

`tests/test_low_value_reviews.py` — 17 tests. For the hide sweep: the strict
threshold boundary, visible-only scope, cheapest-first ordering, that hiding
removes the review from the public profile and recomputes the average rating,
that a second sweep hides nothing, that the per-review visibility control still
restores one by hand, that the threshold must be positive, and that only an
admin can run it. For the restore sweep: the inclusive boundary, hidden-only
scope, dearest-first ordering, that restoring puts the review back on the
profile and into the rating, that a second run restores nothing, admin-only
access, and a full hide-then-restore round trip that leaves only the
token-priced review hidden.
