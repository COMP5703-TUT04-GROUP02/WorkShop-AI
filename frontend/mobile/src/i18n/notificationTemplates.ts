import type { Notification } from "../types/notification";
import type { AppLanguage } from "./language";

const turkishTemplates: Record<string, { title: string; content: string }> = {
  chat_started: { title: "Yeni sohbet", content: "Yeni bir sohbet başladı." },
  chat_message_received: { title: "Yeni mesaj", content: "Yeni bir sohbet mesajı aldınız." },
  booking_created: { title: "Yeni rezervasyon talebi", content: "Yeni bir rezervasyon talebi aldınız." },
  booking_quoted: { title: "Yeni teklif", content: "Rezervasyonunuz için yeni bir teklif var." },
  booking_quote_accepted: { title: "Teklif kabul edildi", content: "İlk teklif kabul edildi." },
  booking_quote_rejected: { title: "Teklif reddedildi", content: "İlk teklif reddedildi; nedeni rezervasyonda inceleyin." },
  booking_rejected: { title: "Rezervasyon reddedildi", content: "Rezervasyon talebi reddedildi." },
  booking_cancelled: { title: "Rezervasyon iptal edildi", content: "Rezervasyon iptal edildi." },
  booking_completed_by_provider: { title: "Hizmet tamamlandı", content: "Sağlayıcı hizmeti tamamlandı olarak işaretledi." },
  booking_completion_confirmed: { title: "Tamamlanma onaylandı", content: "Müşteri hizmetin tamamlandığını onayladı." },
  booking_completion_rejected: { title: "Tamamlanma reddedildi", content: "Müşteri hizmetin tamamlandığını onaylamadı." },
  booking_status_updated_by_admin: { title: "Rezervasyon güncellendi", content: "Rezervasyon durumu yönetici tarafından güncellendi." },
  payment_paid: { title: "Ödeme alındı", content: "Rezervasyon için ödeme tamamlandı." },
  refund_requested: { title: "İade talep edildi", content: "Rezervasyon için iade talebi oluşturuldu." },
  refund_approved: { title: "İade onaylandı", content: "İade talebi onaylandı." },
  refund_rejected: { title: "İade reddedildi", content: "İade talebi reddedildi; ayrıntıları inceleyin." },
  refund_appealed: { title: "İadeye itiraz edildi", content: "Reddedilen iade talebine itiraz edildi." },
  refund_admin_approved: { title: "İade itirazı onaylandı", content: "İade itirazı yönetici tarafından onaylandı." },
  refund_admin_rejected: { title: "İade itirazı reddedildi", content: "İade itirazı yönetici tarafından reddedildi." },
  refund_cancelled: { title: "İade talebi iptal edildi", content: "İade talebi iptal edildi." },
  complaint_created: { title: "Yeni şikâyet", content: "Yeni bir şikâyet oluşturuldu." },
  complaint_resolved: { title: "Şikâyet çözüldü", content: "Şikâyet çözüldü." },
  complaint_rejected: { title: "Şikâyet reddedildi", content: "Şikâyet reddedildi." },
  complaint_reopened: { title: "Şikâyet yeniden açıldı", content: "Şikâyet yeniden incelemeye alındı." },
  provider_profile_approved: { title: "Profil onaylandı", content: "Sağlayıcı profiliniz onaylandı." },
  provider_profile_rejected: { title: "Profil reddedildi", content: "Sağlayıcı profiliniz reddedildi." },
  provider_portfolio_approved: { title: "Portföy onaylandı", content: "Portföy öğeniz onaylandı." },
  provider_portfolio_rejected: { title: "Portföy reddedildi", content: "Portföy öğeniz reddedildi." },
};

function fill(template: string, params: Notification["template_params"]): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params?.[key] ?? ""));
}

export function notificationCopy(notification: Notification, language: AppLanguage) {
  if (language === "en" || !notification.template_key) {
    return { title: notification.title, content: notification.content };
  }
  const template = turkishTemplates[notification.template_key];
  if (!template) {
    return { title: "Bildirim", content: "Yeni bir güncellemeniz var." };
  }
  const params = notification.template_params;
  const attachmentCount = Number(params?.attachment_count ?? 0);
  if (notification.template_key === "chat_message_received") {
    const sender = params?.sender_role === "customer" ? "Bir müşteri" : params?.sender_role === "provider" ? "Bir hizmet sağlayıcı" : "Bir kullanıcı";
    return {
      title: template.title,
      content: attachmentCount > 0
        ? `${sender} size ${attachmentCount} ek içeren bir mesaj gönderdi.`
        : `${sender} size bir mesaj gönderdi.`,
    };
  }
  if (notification.template_key === "booking_created" && attachmentCount > 0) {
    return { title: template.title, content: `Yeni bir rezervasyon talebi aldınız (${attachmentCount} ek).` };
  }
  if (notification.template_key === "provider_profile_approved" || notification.template_key === "provider_profile_rejected") {
    const step = params?.step === "identity" ? "Kimlik" : params?.step === "qualification" ? "Hizmet yeterliliği" : "Profil";
    const approved = notification.template_key === "provider_profile_approved";
    const reason = typeof params?.reason === "string" ? params.reason : "";
    return {
      title: `${step} incelemesi ${approved ? "onaylandı" : "reddedildi"}`,
      content: approved
        ? `${step} incelemeniz onaylandı.${params?.step === "qualification" ? " Artık listelerde görünebilir ve rezervasyon kabul edebilirsiniz." : ""}`
        : `${step} incelemeniz reddedildi.${reason ? ` Neden: ${reason}` : ""}`,
    };
  }
  if (notification.template_key === "provider_portfolio_approved" || notification.template_key === "provider_portfolio_rejected") {
    const title = typeof params?.title === "string" ? params.title : "";
    const reason = typeof params?.reason === "string" ? params.reason : "";
    const approved = notification.template_key === "provider_portfolio_approved";
    return {
      title: template.title,
      content: `${title ? `“${title}” başlıklı portföy öğeniz` : "Portföy öğeniz"} ${approved ? "onaylandı." : `reddedildi.${reason ? ` Neden: ${reason}` : ""}`}`,
    };
  }
  return {
    title: fill(template.title, notification.template_params),
    content: fill(template.content, notification.template_params),
  };
}
