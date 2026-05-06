import axios from 'axios';
import prisma from '../lib/prisma.js';

// ─── 360dialog API sabitleri ──────────────────────────────────────────────────
const DIALOG360_BASE_URL = 'https://waba.360dialog.io/v1/messages';
const DIALOG360_PARTNER_ID = process.env.DIALOG360_PARTNER_ID || null;
const DIALOG360_PARTNER_TOKEN = process.env.DIALOG360_PARTNER_TOKEN || null;
const DIALOG360_CALLBACK_URL = process.env.DIALOG360_CALLBACK_URL || 'https://api.gerasonline.com/api/whatsapp/360dialog/callback';

// ─── Global fallback (tek numara modu, eski yapı) ────────────────────────────
// Bunlar artık sadece fallback — asıl kullanım per-salon
const WA_GLOBAL_API_KEY = process.env.WHATSAPP_ACCESS_TOKEN || null;
const WA_GLOBAL_CHANNEL_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || null;

console.log(DIALOG360_PARTNER_ID
  ? `✅ 360dialog Partner modu aktif (Partner ID: ${DIALOG360_PARTNER_ID})`
  : '⚠️ 360dialog Partner ID eksik — DIALOG360_PARTNER_ID env gerekli'
);

/**
 * Telefon numarasını WhatsApp formatına çevir
 * 05354676801 → 905354676801
 */
export const formatWAPhone = (phone) => {
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
export const formatAppointmentDateTime = (date) => {
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
 * Salon'un WA kimlik bilgilerini getir
 * 1) Salon'un kendi 360dialog API key'i varsa onu kullan
 * 2) Yoksa global fallback
 */
const getWACredentials = async (accountId) => {
  if (accountId) {
    try {
      const account = await prisma.accounts.findUnique({
        where: { id: accountId },
        select: { waEnabled: true, waConnected: true, waApiKey: true, waChannelId: true }
      });

      if (account?.waEnabled && account?.waConnected && account?.waApiKey) {
        return { apiKey: account.waApiKey, channelId: account.waChannelId, source: 'per-salon' };
      }
    } catch (err) {
      console.error('WA credentials DB hatası:', err.message);
    }
  }

  // Global fallback (tek numara modu)
  if (WA_GLOBAL_API_KEY && WA_GLOBAL_CHANNEL_ID) {
    return { apiKey: WA_GLOBAL_API_KEY, channelId: WA_GLOBAL_CHANNEL_ID, source: 'global' };
  }

  return null;
};

/**
 * 360dialog API'ye mesaj gönder
 * 360dialog: Authorization header D360-API-KEY
 */
const call360dialogAPI = async (apiKey, payload) => {
  const response = await axios.post(DIALOG360_BASE_URL, payload, {
    headers: {
      'D360-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });
  return response.data;
};

/**
 * WhatsApp şablon mesajı gönder (outbound — 24h penceresi dışında da çalışır)
 * @param {string} to          - telefon numarası
 * @param {string} templateName - Meta onaylı şablon adı
 * @param {string} languageCode - dil kodu ('tr')
 * @param {Array}  components  - şablon değişkenleri
 * @param {number} accountId   - salon ID (per-salon key için)
 */
export const sendWhatsAppTemplate = async (to, templateName, languageCode = 'tr', components = [], accountId = null) => {
  try {
    const creds = await getWACredentials(accountId);
    if (!creds) {
      return { success: false, skipped: true, reason: 'WA_NOT_CONFIGURED' };
    }

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

    const result = await call360dialogAPI(creds.apiKey, payload);
    console.log(`✅ WA template gönderildi [${creds.source}] → ${phone} (${templateName})`);
    return { success: true, messageId: result.messages?.[0]?.id, data: result };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`❌ WA template hatası (${to}):`, errMsg);
    return { success: false, error: errMsg };
  }
};

/**
 * Serbest metin mesajı gönder (sadece 24h içinde — müşteri ilk yazmış olmalı)
 */
export const sendWhatsAppText = async (to, message, accountId = null) => {
  try {
    const creds = await getWACredentials(accountId);
    if (!creds) {
      return { success: false, skipped: true, reason: 'WA_NOT_CONFIGURED' };
    }

    const phone = formatWAPhone(to);
    if (!phone) return { success: false, error: 'Geçersiz telefon numarası' };

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message }
    };

    const result = await call360dialogAPI(creds.apiKey, payload);
    console.log(`✅ WA text gönderildi [${creds.source}] → ${phone}`);
    return { success: true, messageId: result.messages?.[0]?.id };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`❌ WA text hatası (${to}):`, errMsg);
    return { success: false, error: errMsg };
  }
};

/* ─────────────────────────────────────────────
   HAZIR MESAJ FORMATLARI (per-salon accountId ile)
───────────────────────────────────────────── */

/**
 * Randevu onay mesajı
 * Template: "appointment_confirmation"
 * Body: "Merhaba {{1}}, {{2}} için randevunuz onaylandı. Tarih: {{3}} | Uzman: {{4}} | Salon: {{5}}"
 */
export const sendAppointmentConfirmationWA = async ({ phone, clientName, serviceName, appointmentDate, staffName, businessName, accountId = null }) => {
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
  ], accountId);
};

/**
 * Randevu hatırlatma mesajı
 * Template: "appointment_reminder"
 * Body: "Merhaba {{1}}, yarın {{2}} için randevunuz var. Tarih: {{3}} | Uzman: {{4}} | Salon: {{5}}"
 */
export const sendAppointmentReminderWA = async ({ phone, clientName, serviceName, appointmentDate, staffName, businessName, accountId = null }) => {
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
  ], accountId);
};

/**
 * Randevu iptal mesajı
 * Template: "appointment_cancelled"
 * Body: "Merhaba {{1}}, {{2}} tarihindeki {{3}} randevunuz iptal edilmiştir. Sorularınız için bizi arayabilirsiniz."
 */
export const sendAppointmentCancellationWA = async ({ phone, clientName, serviceName, appointmentDate, businessName, accountId = null }) => {
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
  ], accountId);
};

/* ─────────────────────────────────────────────
   360dialog PARTNER CONNECT FLOW
───────────────────────────────────────────── */

/**
 * Salon için 360dialog Connect URL üret
 * Salon bu URL'ye yönlendirilir, 360dialog'da numarasını bağlar,
 * sonra callback URL'e geri döner.
 */
export const generate360dialogConnectUrl = (accountId) => {
  if (!DIALOG360_PARTNER_ID) {
    throw new Error('DIALOG360_PARTNER_ID env değişkeni eksik');
  }
  const params = new URLSearchParams({
    redirect_url: DIALOG360_CALLBACK_URL,
    state: String(accountId)
  });
  return `https://hub.360dialog.com/dashboard/app/${DIALOG360_PARTNER_ID}/permissions?${params.toString()}`;
};

/**
 * 360dialog callback — salon bağlantıyı tamamladığında burası çağrılır
 * client ve channels parametreleri gelir, Partner API'den API key alınır
 */
export const handle360dialogCallback = async (clientId, channels, accountId) => {
  if (!DIALOG360_PARTNER_TOKEN) {
    throw new Error('DIALOG360_PARTNER_TOKEN env değişkeni eksik');
  }

  // Partner API'den her kanal için API key al
  const channelData = Array.isArray(channels) ? channels : JSON.parse(channels || '[]');
  if (!channelData.length) {
    throw new Error('Kanal bilgisi gelmedi');
  }

  const channel = channelData[0]; // İlk kanalı kullan
  const wabaId = channel.waba_id || channel.id;

  // API key oluştur
  const apiKeyRes = await axios.post(
    `https://hub.360dialog.com/api/v2/partners/${DIALOG360_PARTNER_ID}/channels/${wabaId}/api-keys`,
    {},
    {
      headers: {
        'Authorization': `Bearer ${DIALOG360_PARTNER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  const apiKey = apiKeyRes.data?.api_key || apiKeyRes.data?.data?.api_key;
  if (!apiKey) throw new Error('API key alınamadı');

  const phoneNumber = channel.phone_number || null;

  // DB'ye kaydet
  await prisma.accounts.update({
    where: { id: parseInt(accountId) },
    data: {
      waEnabled: true,
      waConnected: true,
      waApiKey: apiKey,
      waChannelId: wabaId,
      waClientId: clientId,
      waPhoneNumber: phoneNumber
    }
  });

  console.log(`✅ 360dialog bağlandı — Account ${accountId}, Phone: ${phoneNumber}`);
  return { apiKey, channelId: wabaId, phoneNumber };
};
