import axios from 'axios';

const WA_ENABLED = (process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true';
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || null;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || null;
const WA_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v25.0';

if (WA_ENABLED && WA_TOKEN && WA_PHONE_ID) {
  console.log('✅ WhatsApp Business API servisi aktif');
} else if (WA_ENABLED) {
  console.warn('⚠️ WhatsApp aktif ama credentials eksik: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID');
}

/**
 * Telefon numarasını WhatsApp formatına çevir (başında + olmadan)
 * Örn: 05354676801 → 905354676801
 */
const formatWAPhone = (phone) => {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '90' + cleaned.slice(1);
  if (!cleaned.startsWith('90') && cleaned.length === 10) cleaned = '90' + cleaned;
  return cleaned;
};

/**
 * Tarih + saati Türkçe formatta döndür
 * Örn: "Çarşamba, 23 Nisan 2026 - 14:30"
 */
const formatAppointmentDateTime = (date) => {
  const d = new Date(date);
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const dayName = days[d.getDay()];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${dayName}, ${day} ${month} ${year} - ${hours}:${minutes}`;
};

/**
 * Meta Cloud API'ye istek gönder
 */
const callMetaAPI = async (payload) => {
  const url = `https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_ID}/messages`;
  const response = await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });
  return response.data;
};

/**
 * Şablon mesajı gönder (outbound - 24 saat penceresi dışında da çalışır)
 * Meta onaylı template gerektirir
 */
export const sendWhatsAppTemplate = async (to, templateName, languageCode = 'tr', components = []) => {
  try {
    if (!WA_ENABLED) return { success: false, skipped: true, reason: 'WA_DISABLED' };
    if (!WA_TOKEN || !WA_PHONE_ID) return { success: false, skipped: true, reason: 'WA_NOT_CONFIGURED' };

    const phone = formatWAPhone(to);
    if (!phone) return { success: false, error: 'Geçersiz telefon numarası' };

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 && { components })
      }
    };

    const result = await callMetaAPI(payload);
    console.log(`✅ WhatsApp template gönderildi → ${phone} (${templateName})`);
    return { success: true, messageId: result.messages?.[0]?.id, data: result };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`❌ WhatsApp template hatası (${to}):`, errMsg);
    return { success: false, error: errMsg };
  }
};

/**
 * Serbest metin mesajı gönder (sadece 24 saat içinde - müşteri ilk yazmış olmalı)
 */
export const sendWhatsAppText = async (to, message) => {
  try {
    if (!WA_ENABLED) return { success: false, skipped: true, reason: 'WA_DISABLED' };
    if (!WA_TOKEN || !WA_PHONE_ID) return { success: false, skipped: true, reason: 'WA_NOT_CONFIGURED' };

    const phone = formatWAPhone(to);
    if (!phone) return { success: false, error: 'Geçersiz telefon numarası' };

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message }
    };

    const result = await callMetaAPI(payload);
    console.log(`✅ WhatsApp text gönderildi → ${phone}`);
    return { success: true, messageId: result.messages?.[0]?.id };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`❌ WhatsApp text hatası (${to}):`, errMsg);
    return { success: false, error: errMsg };
  }
};

/* ─────────────────────────────────────────────
   HAZIR MESAJ FORMATLARI
───────────────────────────────────────────── */

/**
 * Randevu onay mesajı — template: "appointment_confirmation"
 * Template body örneği (Meta'da oluşturulacak):
 * "Merhaba {{1}}, {{2}} için randevunuz onaylandı.
 *  Tarih: {{3}}
 *  Uzman: {{4}}
 *  Salon: {{5}}"
 */
export const sendAppointmentConfirmationWA = async ({ phone, clientName, serviceName, appointmentDate, staffName, businessName }) => {
  const dateStr = formatAppointmentDateTime(appointmentDate);

  return sendWhatsAppTemplate(phone, 'appointment_confirmation', 'tr', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName },
        { type: 'text', text: serviceName },
        { type: 'text', text: dateStr },
        { type: 'text', text: staffName },
        { type: 'text', text: businessName }
      ]
    }
  ]);
};

/**
 * Randevu hatırlatma mesajı — template: "appointment_reminder"
 * Template body örneği:
 * "Merhaba {{1}}, yarın {{2}} için randevunuz var.
 *  Tarih: {{3}}
 *  Uzman: {{4}}"
 */
export const sendAppointmentReminderWA = async ({ phone, clientName, serviceName, appointmentDate, staffName, businessName }) => {
  const dateStr = formatAppointmentDateTime(appointmentDate);

  return sendWhatsAppTemplate(phone, 'appointment_reminder', 'tr', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName },
        { type: 'text', text: serviceName },
        { type: 'text', text: dateStr },
        { type: 'text', text: staffName },
        { type: 'text', text: businessName }
      ]
    }
  ]);
};

/**
 * Randevu iptal mesajı — template: "appointment_cancelled"
 * Template body örneği:
 * "Merhaba {{1}}, {{2}} tarihindeki {{3}} randevunuz iptal edilmiştir.
 *  Sorularınız için bizi arayabilirsiniz."
 */
export const sendAppointmentCancellationWA = async ({ phone, clientName, serviceName, appointmentDate, businessName }) => {
  const dateStr = formatAppointmentDateTime(appointmentDate);

  return sendWhatsAppTemplate(phone, 'appointment_cancelled', 'tr', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName },
        { type: 'text', text: dateStr },
        { type: 'text', text: serviceName }
      ]
    }
  ]);
};

export { formatWAPhone, formatAppointmentDateTime };
