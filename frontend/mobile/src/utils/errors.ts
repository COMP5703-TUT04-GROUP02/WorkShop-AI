import axios from "axios";
import { getCurrentLanguage } from "../i18n/language";
import { translateText } from "../i18n/translations";

const turkishErrorKeys: Record<string, string> = {
  invalid_credentials: "E-posta adresi veya şifre hatalı.",
  email_registered: "Bu e-posta adresi zaten kayıtlı.",
  incorrect_password: "Geçerli şifre hatalı.",
  social_account_missing: "Henüz hesabınız yok. Hesap oluşturmak için Kullanım Koşulları'nı kabul edin.",
  password_login_unavailable: "Bu hesap için şifreyle giriş kullanılamıyor.",
  invalid_token: "Oturumunuz geçersiz. Lütfen tekrar giriş yapın.",
  account_inactive: "Bu hesap etkin değil.",
  account_banned: "Bu hesap engellendi.",
  email_not_verified: "E-posta adresinizi doğrulayın.",
  booking_not_found: "Rezervasyon bulunamadı.",
  provider_not_found: "Hizmet sağlayıcı bulunamadı.",
  provider_payout_not_ready: "Sağlayıcının ödeme hesabı hazır değil.",
  refund_not_found: "İade talebi bulunamadı.",
  customer_only: "Bu işlemi yalnızca müşteriler yapabilir.",
  validation_error: "Girdiğiniz bilgileri kontrol edin.",
  internal_server_error: "Sunucuda bir sorun oluştu. Lütfen tekrar deneyin.",
  request_failed: "İstek başarısız oldu. Lütfen tekrar deneyin.",
};

export function getErrorMessage(error: unknown) {
  if (getCurrentLanguage() === "tr") {
    if (axios.isAxiosError(error)) {
      const key = error.response?.data?.error?.key;
      if (typeof key === "string" && turkishErrorKeys[key]) return turkishErrorKeys[key];
      if (error.response?.status === 413) return "Seçilen dosyalar yüklemek için çok büyük.";
      if (error.response?.status === 422) return turkishErrorKeys.validation_error;
      return turkishErrorKeys.request_failed;
    }
    if (error instanceof Error) {
      const translated = translateText("tr", error.message);
      return translated === error.message ? turkishErrorKeys.request_failed : translated;
    }
    return turkishErrorKeys.request_failed;
  }
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    const nestedError = responseData?.error;

    if (typeof nestedError?.detail === "string") {
      return nestedError.detail;
    }

    if (Array.isArray(nestedError?.detail)) {
      return formatErrorItems(nestedError.detail);
    }

    if (Array.isArray(nestedError?.errors)) {
      return formatErrorItems(nestedError.errors);
    }

    if (typeof responseData?.message === "string") {
      return responseData.message;
    }

    if (typeof responseData?.detail === "string") {
      return responseData.detail;
    }

    if (Array.isArray(responseData?.detail)) {
      return formatErrorItems(responseData.detail);
    }

    if (error.response?.status === 413) {
      return "The selected files are too large to upload.";
    }

    if (error.response?.status) {
      return `Request failed (${error.response.status}).`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Try again.";
}

function formatErrorItems(items: Array<{ message?: string; msg?: string; detail?: string } | string>) {
  return items
    .map((item) =>
      typeof item === "string"
        ? item
        : item.message || item.msg || item.detail || String(item),
    )
    .join("\n");
}
