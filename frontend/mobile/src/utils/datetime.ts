/**
 * Dates are written the unambiguous way: 5 Jul 2026, never 7/5/2026, which
 * reads as two different days either side of the Atlantic. The locale is
 * pinned rather than taken from the browser so every visitor sees the same
 * thing — the product is English, whoever is looking at it.
 */
const DATE_LOCALE = "en-GB";

export function formatDayAndMonth(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : parseDateTime(value);
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(DATE_LOCALE, {
    day: "numeric",
    month: "short",
  });
}

export function formatTime(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : parseDateTime(value);
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(DATE_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : parseDateTime(value);
  if (!date || Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value.slice(0, 10) : "—";
  }

  return date.toLocaleDateString(DATE_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = parseDateTime(value);
  if (!date) {
    return value;
  }

  return date.toLocaleString(DATE_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * A booking's start and end. Written out twice it repeats the date for what is
 * almost always a job inside one day - "26 May 2026, 17:00 - 26 May 2026,
 * 19:00" - which is both longer than a phone has room for and not how anyone
 * says it. When the two ends share a day, the date is said once.
 */
export function formatDateTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
) {
  if (!start) {
    return formatDateTime(end);
  }
  if (!end) {
    return formatDateTime(start);
  }

  const from = parseDateTime(start);
  const to = parseDateTime(end);
  if (!from || !to) {
    return `${formatDateTime(start)} - ${formatDateTime(end)}`;
  }

  const sameDay = from.toDateString() === to.toDateString();
  return sameDay
    ? `${formatDateTime(start)} - ${formatTime(end)}`
    : `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

export function formatShortDateTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = parseDateTime(value);
  if (!date) {
    return value.replace("T", " ").slice(0, 16);
  }

  return date.toLocaleString(DATE_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeInput(date: Date) {
  return `${toDatetimeLocalValue(date)}:00`;
}

export function toEditableDateTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = parseDateTime(value);
  if (!date) {
    return value.replace("Z", "").slice(0, 19);
  }

  return formatDateTimeInput(date);
}

export function toDatetimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function fromDatetimeLocalValue(value: string) {
  if (!value) {
    return "";
  }

  return value.length === 16 ? `${value}:00` : value;
}

export function parseDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/** The same rule, for the compact form the schedule uses. */
export function formatShortDateTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
) {
  if (!start) return formatShortDateTime(end);
  if (!end) return formatShortDateTime(start);

  const from = parseDateTime(start);
  const to = parseDateTime(end);
  if (!from || !to) {
    return `${formatShortDateTime(start)} - ${formatShortDateTime(end)}`;
  }

  return from.toDateString() === to.toDateString()
    ? `${formatShortDateTime(start)} - ${formatTime(end)}`
    : `${formatShortDateTime(start)} - ${formatShortDateTime(end)}`;
}
