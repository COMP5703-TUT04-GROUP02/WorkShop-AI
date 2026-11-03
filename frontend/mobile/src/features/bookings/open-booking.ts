type OpenBooking = {
  id: number;
  reference_price_range?: unknown;
};

// The booking lists leave out the reference price range, which only the
// detail call works out, so an open booking keeps the one it already has.
export function mergeOpenBooking<T extends OpenBooking>(current: T | null, latest: T): T {
  return {
    ...latest,
    reference_price_range: latest.reference_price_range ?? current?.reference_price_range,
  };
}

// A refreshed list carries the other party's moves; the booking on screen
// has to take them too, or it keeps offering actions that are already done.
export function refreshOpenBooking<T extends OpenBooking>(current: T | null, bookings: T[]): T | null {
  if (!current) return current;
  const latest = bookings.find((booking) => booking.id === current.id);
  return latest ? mergeOpenBooking(current, latest) : current;
}
