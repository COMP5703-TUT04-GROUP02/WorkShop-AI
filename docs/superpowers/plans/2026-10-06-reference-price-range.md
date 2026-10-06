# Reference Price Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared, booking-based historical reference price range for provider quote entry and customer quote review.

**Architecture:** Persist the selected canonical provider service on each new booking, then calculate a range only for a single-booking detail response by selecting the latest formal quote revision from each matching historical booking. Mobile screens fetch that detail before opening quote modals and render a shared response object through audience-specific presentation copy.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, pytest, React Native/Expo, TypeScript, Node test runner

**Spec:** `docs/superpowers/specs/2026-10-06-reference-price-range-design.md`

## Global Constraints

- Use canonical `ProviderApprovedService.service_category` values; never submit localized display labels.
- Each eligible historical booking contributes at most one sample: its highest `revision_number`, with stable `created_at DESC, id DESC` tie-breakers.
- Exclude the current booking entirely, include formally submitted quotes even if later declined, and exclude visit fees.
- Calculate arithmetic mean × `0.9` and × `1.1`; round bounds to integer TRY with `ROUND_HALF_UP`.
- Zero samples produce no monetary bounds; one sample is sufficient.
- Provider copy is `Recommended price range`; it does not prefill, clamp, reject, or add validation.
- Customer copy is always `Typical range for similar jobs`; no history displays `No historical data for similar jobs`.
- Do not add location, time-window, rating, duration, urgency, comment-filtering, or transaction-price logic.
- Keep reference-price calculation out of booking-list serialization to avoid N+1 queries.

## Review Focus

- A display label such as `Plumbing` must be rejected when the enabled canonical value is `plumbing`; Task 1 pins exact canonical validation.
- A provider disabling a formerly approved service must prevent new bookings for it without changing historical booking snapshots; Task 1 covers the create-time boundary.
- Repeated revisions, including declined ones, must yield one deterministic latest sample per historical booking; Task 2 covers ordering and deduplication.
- A current booking that contains the only revisions for its category must still return no history; Task 2 covers whole-booking exclusion.
- Booking list endpoints must not calculate ranges per row, while both roles can fetch the same single-booking result; Tasks 2 and 4 cover response shape and detail loading.

---

### Task 1: Canonical Service Snapshot on Bookings

**Files:**
- Create: `migrations/versions/0017_reference_price_range.py`
- Create: `tests/test_reference_price_migration.py`
- Create: `tests/test_booking_service_category.py`
- Modify: `backend/models/booking.py`
- Modify: `backend/schemas/booking.py`
- Modify: `backend/routers/customer/bookings.py`
- Modify: `backend/utils/customer_booking_actions.py`
- Modify: `backend/utils/formatters.py`
- Modify: `tests/conftest.py`
- Modify: direct booking payloads in `tests/test_marketplace.py`, `tests/test_ws101_http.py`, and `tests/test_bookings.py`

**Interfaces:**
- Consumes: `ProviderApprovedService(provider_profile_id, service_category, is_enabled)`.
- Produces: nullable indexed `Booking.service_category: str | None`; required `BookingCreate.service_category: str`; booking responses containing `service_category`.

- [ ] **Step 1: Write failing migration and creation tests**

Add tests named `test_reference_price_migration_adds_nullable_indexed_service_category`, `test_booking_creation_persists_enabled_canonical_service`, `test_booking_creation_rejects_display_label`, `test_booking_creation_rejects_disabled_service`, and `test_existing_booking_can_have_null_service_category`. Assert the migration upgrades/downgrades cleanly, `plumbing` succeeds, `Plumbing` fails with 422, a disabled row fails with 422, and a model-level legacy row remains valid with `None`.

- [ ] **Step 2: Run the focused backend tests and verify RED**

Run: `pytest tests/test_reference_price_migration.py tests/test_booking_service_category.py -q`

Expected: FAIL because the migration, field, form value, and validation do not exist.

- [ ] **Step 3: Add the migration and backend field**

Create revision `0017_reference_price_range` with `down_revision = "0016_email_verification_codes"`. Add nullable `String(64)` column `bookings.service_category` and non-unique index `ix_bookings_service_category`; downgrade removes both. Mirror the field in `Booking` and `format_booking_response`.

- [ ] **Step 4: Validate the canonical enabled service during booking creation**

Add `service_category: str` to `BookingCreate` and the multipart `/bookings` form. In `create_customer_booking_action`, require an exact match on provider ID, canonical value, and `is_enabled is True` before constructing the booking; return 422 for an invalid selection. Persist the exact canonical value.

- [ ] **Step 5: Update existing backend booking fixtures and direct payloads**

Make `tests.conftest.create_booking` send `extra.get("service_category", "plumbing")`. Add the same canonical field to direct successful booking posts; preserve intentional malformed/missing-field cases and update their expected validation result only when the test is specifically about the new required field.

- [ ] **Step 6: Run focused and existing booking tests**

Run: `pytest tests/test_reference_price_migration.py tests/test_booking_service_category.py tests/test_bookings.py tests/test_ws101_http.py tests/test_marketplace.py -q`

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add migrations/versions/0017_reference_price_range.py backend/models/booking.py backend/schemas/booking.py backend/routers/customer/bookings.py backend/utils/customer_booking_actions.py backend/utils/formatters.py tests/conftest.py tests/test_reference_price_migration.py tests/test_booking_service_category.py tests/test_marketplace.py tests/test_ws101_http.py tests/test_bookings.py
git commit -m "feat: persist booking service category"
```

### Task 2: Shared Booking-Based Reference Price Calculation

**Files:**
- Create: `backend/utils/reference_price.py`
- Create: `tests/test_reference_price_range.py`
- Modify: `backend/utils/booking.py`
- Modify: `backend/routers/shared.py`

**Interfaces:**
- Consumes: `Booking.service_category`, `BookingQuoteRevision.booking_id`, `revision_number`, `created_at`, `id`, and `quote_amount`.
- Produces: `calculate_reference_price_range(booking: models.Booking, db: Session) -> dict[str, bool | int | str | None]`; opt-in `format_booking_detail_response(..., include_reference_price_range: bool = False)`; `GET /bookings/{booking_id}` includes `reference_price_range`.

- [ ] **Step 1: Write failing calculation tests**

Add tests named `test_reference_range_has_no_history_for_zero_matches`, `test_reference_range_uses_one_historical_booking`, `test_reference_range_averages_multiple_historical_bookings`, `test_reference_range_rounds_half_up`, `test_reference_range_excludes_other_service_categories`, `test_reference_range_excludes_current_booking_entirely`, `test_reference_range_uses_only_latest_revision_per_booking`, `test_reference_range_latest_declined_revision_still_counts`, `test_reference_range_ignores_visit_fee`, and `test_reference_range_has_no_history_for_legacy_booking`. Assert the exact stable object, integer bounds, and booking-based `sample_count`.

- [ ] **Step 2: Write failing API and N+1 guard tests**

Add `test_booking_detail_exposes_shared_reference_range_to_customer_and_provider` and `test_booking_lists_do_not_serialize_reference_price_range`. Fetch `/bookings/{id}` as each role and assert identical objects; fetch customer/provider lists and assert the field is absent so no per-row calculation path is active.

- [ ] **Step 3: Run reference-price tests and verify RED**

Run: `pytest tests/test_reference_price_range.py -q`

Expected: FAIL because the calculator and response field do not exist.

- [ ] **Step 4: Implement the single-query calculator**

Implement `calculate_reference_price_range`. Return the stable no-history object immediately for a null service classification. Query matching revisions joined to bookings, exclude the current booking ID, order by booking ID then `revision_number DESC, created_at DESC, id DESC`, and take the first row per historical booking. Average selected `Decimal` amounts, multiply by `Decimal("0.9")` and `Decimal("1.1")`, then quantize to `Decimal("1")` with `ROUND_HALF_UP` and return integers.

- [ ] **Step 5: Add detail-only response integration**

Extend `format_booking_detail_response` with keyword-only `include_reference_price_range: bool = False`. Calculate and attach the object only when true. Pass true from all role branches of `GET /bookings/{booking_id}`; leave list endpoints and existing action formatters on the default false path.

- [ ] **Step 6: Run the reference-price and booking suites**

Run: `pytest tests/test_reference_price_range.py tests/test_bookings.py tests/test_booking_attachments.py tests/test_quote_attachments.py -q`

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/utils/reference_price.py backend/utils/booking.py backend/routers/shared.py tests/test_reference_price_range.py
git commit -m "feat: calculate booking reference price range"
```

### Task 3: Customer Service Selection with Canonical Values

**Files:**
- Create: `frontend/mobile/src/utils/bookingService.ts`
- Create: `frontend/mobile/src/utils/__tests__/bookingService.test.cjs`
- Modify: `frontend/mobile/src/components/BookingRequestModal.tsx`
- Modify: `frontend/mobile/src/types/booking.ts`
- Modify: `frontend/mobile/src/api/customer.ts`
- Modify: `frontend/mobile/src/screens/customer/CustomerProviderDetailScreen.tsx`
- Modify: `frontend/mobile/src/screens/ChatRoomScreen.tsx`
- Modify: `frontend/mobile/package.json`

**Interfaces:**
- Consumes: canonical `ProviderProfile.tags: string[]` and `getProviderTagLabel(value)` for presentation only.
- Produces: `BookingRequestFormState.serviceCategory: string`; `BookingPayload.service_category: string`; `getDefaultServiceCategory(values: string[]) -> string`; `isCanonicalServiceSelection(value: string, values: string[]) -> boolean`.

- [ ] **Step 1: Write failing canonical-selection utility tests**

Assert one canonical choice auto-selects, multiple choices require an explicit selection, exact `plumbing` validates, and display label `Plumbing` does not validate against `plumbing`.

- [ ] **Step 2: Run the frontend test and verify RED**

Run: `cd frontend/mobile && npm run test:booking-service`

Expected: FAIL because the script and booking-service utility do not exist.

- [ ] **Step 3: Implement the pure selection utility and test script**

Add `test:booking-service` to compile `bookingService.ts` into `.test-build`, then run its Node test file. Implement exact-value helpers without label normalization.

- [ ] **Step 4: Add service selection to the booking form and payload**

Add `serviceCategory` to form state and `service_category` to payload types. Render canonical values as selectable chips using `getProviderTagLabel` only for text, keep the canonical string in state, require it in `buildBookingRequestPayload`, and append it unchanged in `createCustomerBooking`.

- [ ] **Step 5: Supply enabled canonical choices in both creation flows**

In `CustomerProviderDetailScreen`, initialize from `detail.provider.tags`. In `ChatRoomScreen`, load the existing customer provider detail for `route.params.providerProfileId`, retain its canonical tags, and pass them to the booking form. Show a scoped booking error when no enabled service can be selected. Preserve `serviceCategory` in edit-form state but do not make the stored snapshot editable.

- [ ] **Step 6: Run frontend unit tests and typecheck**

Run: `cd frontend/mobile && npm run test:booking-service && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add frontend/mobile/package.json frontend/mobile/src/utils/bookingService.ts frontend/mobile/src/utils/__tests__/bookingService.test.cjs frontend/mobile/src/components/BookingRequestModal.tsx frontend/mobile/src/types/booking.ts frontend/mobile/src/api/customer.ts frontend/mobile/src/screens/customer/CustomerProviderDetailScreen.tsx frontend/mobile/src/screens/ChatRoomScreen.tsx
git commit -m "feat: select booking service category"
```

### Task 4: Provider and Customer Reference Price Displays

**Files:**
- Create: `frontend/mobile/src/utils/referencePrice.ts`
- Create: `frontend/mobile/src/utils/__tests__/referencePrice.test.cjs`
- Create: `frontend/mobile/src/components/ReferencePriceRange.tsx`
- Modify: `frontend/mobile/src/types/booking.ts`
- Modify: `frontend/mobile/src/components/ProviderBookingDetailModal.tsx`
- Modify: `frontend/mobile/src/components/CustomerBookingDetailModal.tsx`
- Modify: `frontend/mobile/src/screens/provider/ProviderBookingsScreen.tsx`
- Modify: `frontend/mobile/src/screens/customer/CustomerBookingsScreen.tsx`
- Modify: `frontend/mobile/package.json`

**Interfaces:**
- Consumes: `BookingDetail.reference_price_range?: ReferencePriceRange`; existing `getBookingById(bookingId)`.
- Produces: `ReferencePriceRange` type; `buildReferencePricePresentation(range, audience) -> { label: string; value: string | null }`; `shouldShowCustomerReferencePrice(status: string) -> boolean`; reusable `ReferencePriceRange` component.

- [ ] **Step 1: Write failing presentation tests**

Assert provider history produces label `Recommended price range` and value `₺900–₺1,100`; provider no-history produces no monetary value; customer history produces `Typical range for similar jobs` and the same value; customer no-history produces `No historical data for similar jobs`; both initial `quoted` and final `final_quote_sent` states show the customer block; pending does not. Also assert the presentation function has no input-value or validation output.

- [ ] **Step 2: Run the frontend test and verify RED**

Run: `cd frontend/mobile && npm run test:reference-price`

Expected: FAIL because the reference-price utility does not exist.

- [ ] **Step 3: Implement presentation helpers and component**

Add `test:reference-price` to compile `referencePrice.ts` and run its Node test file. Format whole TRY bounds with `Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })`, prefix each bound with `₺`, and join with an en dash. The component renders provider content only beside active initial/final amount inputs; for customers it renders the fixed block whenever `shouldShowCustomerReferencePrice` is true, including the no-history fallback.

- [ ] **Step 4: Load shared booking detail before opening list modals**

Make provider and customer `openBooking` paths call `getBookingById` before setting modal state, falling back to the list booking only on a request error. This ensures both roles consume the same detail-only backend calculation while list endpoints remain free of per-row range queries.

- [ ] **Step 5: Run frontend verification**

Run: `cd frontend/mobile && npm run test:booking-service && npm run test:reference-price && npm run test:booking-actions && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add frontend/mobile/package.json frontend/mobile/src/utils/referencePrice.ts frontend/mobile/src/utils/__tests__/referencePrice.test.cjs frontend/mobile/src/components/ReferencePriceRange.tsx frontend/mobile/src/types/booking.ts frontend/mobile/src/components/ProviderBookingDetailModal.tsx frontend/mobile/src/components/CustomerBookingDetailModal.tsx frontend/mobile/src/screens/provider/ProviderBookingsScreen.tsx frontend/mobile/src/screens/customer/CustomerBookingsScreen.tsx
git commit -m "feat: show reference price ranges"
```

### Task 5: Full Verification and PR Preparation

**Files:**
- Modify only if verification exposes an in-scope defect.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: verified feature branch and PR-ready test evidence.

- [ ] **Step 1: Run backend formatting and full tests**

Run: `ruff check backend tests`

Expected: exit 0.

Run: `pytest -q`

Expected: all tests pass.

- [ ] **Step 2: Run frontend tests and typecheck**

Run: `cd frontend/mobile && npm run test:booking-service && npm run test:reference-price && npm run test:booking-actions && npm run typecheck`

Expected: all commands exit 0.

- [ ] **Step 3: Verify migration graph and clean diff**

Run: `alembic heads && git diff --check && git status --short`

Expected: one migration head for this branch, no whitespace errors, and only intentional feature files or unrelated pre-existing files outside the commit set.

- [ ] **Step 4: Review the requirement checklist**

Confirm all 16 requested constraints and the four implementation guardrails against the final diff, explicitly checking that comment filtering and unrelated local files are absent.

- [ ] **Step 5: Prepare the PR**

Use a clear title such as `feat: add reference price ranges for quotes`. Include implementation summary, booking-based latest-revision formula, `ROUND_HALF_UP`, test commands/results, legacy-null behavior, declined-quote semantics, and explicit exclusions in the PR body.
