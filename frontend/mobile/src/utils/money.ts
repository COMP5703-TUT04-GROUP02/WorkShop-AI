import { currentLocale, getCurrentLanguage } from "../i18n/language";

export const CURRENCY_CODE = "TRY";

export function formatMoney(value: number | string | null | undefined) {
  if (value == null || value === "") {
    return "—";
  }

  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return "—";
  }

  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency: CURRENCY_CODE,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPayLabel(value: number | string | null | undefined) {
  if (value == null || value === "") {
    return getCurrentLanguage() === "tr" ? "Öde" : "Pay";
  }

  return `${getCurrentLanguage() === "tr" ? "Öde" : "Pay"} ${formatMoney(value)}`;
}
