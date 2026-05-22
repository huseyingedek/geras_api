import axios from 'axios';
import prisma from '../lib/prisma.js';

const META_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v25.0';

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
  const days   = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const hours   = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} - ${hours}:${minutes}`;
};

/**
 * Salonun Meta Cloud API kimlik bilgilerini DB'den getir
 *   waApiKey    → Meta user/system access token
 *   waChannelId → Meta phone_number_id
 */
const getWACredentials = async (accountId) => {
  if (!accountId) return null;

  try {
    const account = await prisma.accounts.findUnique({
      where: { id: accountId },
      select: {
        waEnabled: true, waConnected: true, waApiKey: true, waChannelId: true,
        businessName: true, phone: true, address: true, mapUrl: true
      }
    });

    if (!account?.waEnabled || !account?.waConnected || !account?.waApiKey || !account?.waChannelId) {
      return null;
    }

    return {
      accessToken: account.waApiKey,
      phoneNumberId: account.waChannelId,
      businessName: account.businessName,
      phone: account.phone || '',
      address: account.address || '',
      mapUrl: account.mapUrl || ''
    };
  } catch (err) {
    console.error('WA credentials DB hatası:', err.message);
    return null;
  }
};

/**
 * Meta Cloud API'ye mesaj gönder
 * POST https://graph.facebook.com/{version}/{phone_number_id}/messages
 */
const callMetaAPI = async (accessToken, phoneNumberId, payload) => {
  const response = await axios.post(
    `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`,
    payload,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );
  return response.data;
};

/**
 * WhatsApp şablon mesajı gönder
 * Şablonlar Meta'da önceden onaylanmış olmalıdır.
 * 24 saatlik pencere dışında da çalışır.
 */
export const sendWhatsAppTemplate = async (to, templateName, languageCode = 'tr', components = [], accountId) => {
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

    const result = await callMetaAPI(creds.accessToken, creds.phoneNumberId, payload);
    console.log(`✅ WA template gönderildi → ${phone} (${templateName})`);
    return { success: true, messageId: result.messages?.[0]?.id };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`❌ WA template hatası (${to}):`, errMsg);
    return { success: false, error: errMsg };
  }
};

/**
 * Serbest metin mesajı gönder
 * Müşteri son 24 saat içinde mesaj göndermişse çalışır (Meta kısıtı).
 * Hatırlatma için sendWhatsAppTemplate kullanılmalıdır.
 */
export const sendWhatsAppText = async (to, message, accountId) => {
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

    const result = await callMetaAPI(creds.accessToken, creds.phoneNumberId, payload);
    console.log(`✅ WA text gönderildi → ${phone}`);
    return { success: true, messageId: result.messages?.[0]?.id };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error(`❌ WA text hatası (${to}):`, errMsg);
    return { success: false, error: errMsg };
  }
};

/* ─────────────────────────────────────────────
   HAZIR MESAJ FORMATLARI
   Şablon değişken sırası Meta WhatsApp Manager'daki
   onaylı şablonlarla birebir eşleşmelidir.
───────────────────────────────────────────── */

/**
 * Tarih ve saati ayrı ayrı formatla
 */
export const formatDate = (date) => {
  const d = new Date(date);
  const days   = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

export const formatTime = (date) => {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Randevu onay mesajı
 * Şablon: appointment_confirmation
 * {{1}} müşteri adı, {{2}} salon adı, {{3}} tarih, {{4}} saat,
 * {{5}} hizmet, {{6}} personel, {{7}} adres, {{8}} telefon
 * Buton: Konumu Gör → mapUrl
 */
export const sendAppointmentConfirmationWA = async ({
  phone, clientName, serviceName, appointmentDate, staffName, accountId
}) => {
  const creds = await getWACredentials(accountId);
  if (!creds) return { success: false, skipped: true, reason: 'WA_NOT_CONFIGURED' };

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName },
        { type: 'text', text: creds.businessName },
        { type: 'text', text: formatDate(appointmentDate) },
        { type: 'text', text: formatTime(appointmentDate) },
        { type: 'text', text: serviceName },
        { type: 'text', text: staffName },
        { type: 'text', text: creds.address || '-' },
        { type: 'text', text: creds.phone || '-' }
      ]
    }
  ];

  if (creds.mapUrl) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: creds.mapUrl }]
    });
  }

  return sendWhatsAppTemplate(phone, 'appointment_confirmation', 'tr', components, accountId);
};

/**
 * Randevu hatırlatma mesajı
 * Şablon: appointment_reminder
 * {{1}} müşteri adı, {{2}} salon adı, {{3}} tarih, {{4}} saat,
 * {{5}} hizmet, {{6}} personel, {{7}} adres, {{8}} telefon
 * Buton: Konumu Gör → mapUrl
 */
export const sendAppointmentReminderWA = async ({
  phone, clientName, serviceName, appointmentDate, staffName, accountId
}) => {
  const creds = await getWACredentials(accountId);
  if (!creds) return { success: false, skipped: true, reason: 'WA_NOT_CONFIGURED' };

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName },
        { type: 'text', text: creds.businessName },
        { type: 'text', text: formatDate(appointmentDate) },
        { type: 'text', text: formatTime(appointmentDate) },
        { type: 'text', text: serviceName },
        { type: 'text', text: staffName },
        { type: 'text', text: creds.address || '-' },
        { type: 'text', text: creds.phone || '-' }
      ]
    }
  ];

  if (creds.mapUrl) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: creds.mapUrl }]
    });
  }

  return sendWhatsAppTemplate(phone, 'appointment_reminder', 'tr', components, accountId);
};

/**
 * Randevu iptal mesajı
 * Şablon: appointment_cancelled
 * {{1}} müşteri adı, {{2}} salon adı, {{3}} tarih, {{4}} saat, {{5}} telefon
 */
export const sendAppointmentCancellationWA = async ({
  phone, clientName, appointmentDate, accountId
}) => {
  const creds = await getWACredentials(accountId);
  if (!creds) return { success: false, skipped: true, reason: 'WA_NOT_CONFIGURED' };

  return sendWhatsAppTemplate(phone, 'appointment_cancelled', 'tr', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: clientName },
        { type: 'text', text: creds.businessName },
        { type: 'text', text: formatDate(appointmentDate) },
        { type: 'text', text: formatTime(appointmentDate) },
        { type: 'text', text: creds.phone || '-' }
      ]
    }
  ], accountId);
};
