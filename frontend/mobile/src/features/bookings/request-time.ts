export function syncEndTimeAfterStartChange(
  startTime: string,
  endTime: string,
): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start > end) {
    return startTime;
  }
  return endTime;
}

export function isBookingTimeRangeValid(
  startTime: string,
  endTime: string,
): boolean {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    end > start;
}

export function isProviderUnavailableMessage(message: string): boolean {
  return /^Provider is unavailable on \d{4}-\d{2}-\d{2}; cannot create booking$/i.test(message.trim());
}
