import type { AppLanguage } from "./language";
import { translateText } from "./translations";

/** Translate action words while leaving names, filenames and IDs untouched. */
export function accessibilityCopy(language: AppLanguage, label: string): string {
  if (language === "en") return label;
  const exact = translateText(language, label);
  if (exact !== label) return exact;

  let match: RegExpMatchArray | null;
  if ((match = label.match(/^Notifications, (\d+) unread$/))) return `Bildirimler, ${match[1]} okunmamış`;
  if ((match = label.match(/^View booking #(\d+) details$/))) return `#${match[1]} numaralı rezervasyonun ayrıntılarını görüntüle`;
  if ((match = label.match(/^Filter bookings: (.+)$/))) return `Rezervasyonları filtrele: ${translateText(language, match[1])}`;
  if ((match = label.match(/^Select review #(\d+)$/))) return `#${match[1]} numaralı yorumu seç`;
  if ((match = label.match(/^(\d+) stars$/))) return `${match[1]} yıldız`;
  if ((match = label.match(/^Remove (.+) from favourites$/))) return `${match[1]} adlı sağlayıcıyı favorilerden kaldır`;
  if ((match = label.match(/^Remove (.+)$/))) return `${match[1]} öğesini kaldır`;
  if ((match = label.match(/^Open (.+)$/))) return `${match[1]} öğesini aç`;
  if ((match = label.match(/^(.+): (.+)$/))) return `${translateText(language, match[1])}: ${match[2]}`;
  return label;
}
