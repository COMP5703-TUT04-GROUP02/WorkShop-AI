export type AppLanguage = "en" | "tr";

export const DEFAULT_LANGUAGE: AppLanguage = "en";
let currentLanguage: AppLanguage = DEFAULT_LANGUAGE;

export function setCurrentLanguage(language: AppLanguage) {
  currentLanguage = language;
}

export function getCurrentLanguage(): AppLanguage {
  return currentLanguage;
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "en" || value === "tr";
}

export function localeFor(language: AppLanguage): string {
  return language === "tr" ? "tr-TR" : "en-GB";
}

export function currentLocale(): string {
  return localeFor(currentLanguage);
}
