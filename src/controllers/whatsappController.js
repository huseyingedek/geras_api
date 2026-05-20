import axios from 'axios';
import prisma from '../lib/prisma.js';
import { sendWhatsAppText, formatAppointmentDateTime } from '../utils/whatsappService.js';

const WA_VERIFY_TOKEN  = process.env.WHATSAPP_VERIFY_TOKEN || 'geras_webhook_verify_2026';
const META_APP_ID      = process.env.META_APP_ID;
const META_APP_SECRET  = process.env.META_APP_SECRET;
const META_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v25.0';

/* ─────────────────────────────────────────────
   WEBHOOK
───────────────────────────────────────────── */

/**
 * GET /api/whatsapp/webhook
 * Meta webhook doğrulama (uygulama ilk kurulurken bir kez çalışır)
 */
export const verifyWebhook = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'Forbidden' });
};

/**
 * POST /api/whatsapp/webhook
 * Meta'dan gelen mesajları işle.
 * metadata.phone_number_id ile mesajın hangi salona ait olduğu bulunur.
 */
export const receiveWebhook = async (req, res) => {
  // Meta 200 almazsa webhook'u tekrar gönderir — önce cevap ver
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;

        const value         = change.value;
        const messages      = value?.messages || [];
        const contacts      = value?.contacts || [];
        const phoneNumberId = value?.metadata?.phone_number_id;

        if (!phoneNumberId) continue;

        // Mesajın hangi salona ait olduğunu phone_number_id üzerinden bul
        const account = await prisma.accounts.findFirst({
          where: { waChannelId: phoneNumberId, waConnected: true }
        });

        if (!account) {
          console.warn(`⚠️ Tanımsız phone_number_id: ${phoneNumberId}`);
          continue;
        }

        for (const message of messages) {
          await handleIncomingMessage(message, contacts, account);
        }
      }
    }
  } catch (error) {
    console.error('❌ WhatsApp webhook işleme hatası:', error);
  }
};

/**
 * Gelen mesajı tipine göre yönlendir
 */
const handleIncomingMessage = async (message, contacts, account) => {
  const from       = message.from;
  const msgType    = message.type;
  const contact    = contacts.find(c => c.wa_id === from);
  const senderName = contact?.profile?.name || 'Müşteri';

  if (msgType === 'text') {
    const text = message.text?.body?.toLowerCase()?.trim() || '';
    await handleTextMessage(from, senderName, text, account);
  }
};

/**
 * Anahtar kelime tabanlı yanıtlar
 */
const handleTextMessage = async (from, senderName, text, account) => {
  if (text.includes('randevu') && (text.includes('sorgula') || text.includes('ne zaman') || text.includes('bak'))) {
    await queryAppointmentByPhone(from, account);
    return;
  }

  if (text.includes('iptal')) {
    await sendWhatsAppText(
      from,
      `❌ Randevu iptali için lütfen *${account.businessName}* ile iletişime geçin.`,
      account.id
    );
    return;
  }

  if (text.match(/^(merhaba|selam|hey|hi|hello|iyi günler)/)) {
    await sendWhatsAppText(
      from,
      `Merhaba ${senderName}! 👋\n\n` +
      `*${account.businessName}* randevu asistanıyım.\n\n` +
      `• *randevu sorgula* — aktif randevunuzu görün\n` +
      `• *iptal* — randevu iptali için yönlendirme`,
      account.id
    );
    return;
  }
};

/**
 * Telefon numarasına göre o salondaki yaklaşan randevuyu bul
 */
const queryAppointmentByPhone = async (waPhone, account) => {
  try {
    const phoneVariants = [
      waPhone,
      '0' + waPhone.slice(2),
      '+' + waPhone
    ];

    const now    = new Date();
    const client = await prisma.clients.findFirst({
      where: {
        phone:     { in: phoneVariants },
        accountId: account.id
      }
    });

    if (!client) {
      await sendWhatsAppText(
        waPhone,
        `*${account.businessName}* sisteminde kayıtlı bir hesap bulunamadı.`,
        account.id
      );
      return;
    }

    const appointment = await prisma.appointments.findFirst({
      where: {
        clientId:        client.id,
        accountId:       account.id,
        appointmentDate: { gte: now },
        status:          'PLANNED'
      },
      orderBy: { appointmentDate: 'asc' },
      include: {
        service: { select: { serviceName: true } },
        staff:   { select: { fullName: true } }
      }
    });

    if (!appointment) {
      await sendWhatsAppText(
        waPhone,
        'Yaklaşan planlanmış bir randevunuz bulunmuyor.',
        account.id
      );
      return;
    }

    const dateStr = formatAppointmentDateTime(appointment.appointmentDate);

    await sendWhatsAppText(
      waPhone,
      `📅 *Yaklaşan Randevunuz*\n\n` +
      `👤 İsim: ${client.firstName} ${client.lastName}\n` +
      `✂️ Hizmet: ${appointment.service.serviceName}\n` +
      `👩 Uzman: ${appointment.staff.fullName}\n` +
      `🕐 Tarih: ${dateStr}\n` +
      `🏢 Salon: ${account.businessName}`,
      account.id
    );
  } catch (error) {
    console.error('❌ Randevu sorgulama hatası:', error);
  }
};

/* ─────────────────────────────────────────────
   META EMBEDDED SIGNUP — BAĞLANTI AKIŞI

   Akış:
   1. Frontend'de Meta Embedded Signup popup açılır (FB SDK)
   2. Salon Meta hesabıyla giriş yapar, WhatsApp Business'ını seçer
   3. Meta frontend'e kısa ömürlü bir `code` döner
   4. Frontend bu code'u bu endpoint'e gönderir
   5. Backend code → access_token çevirir
   6. Backend token ile phone_number_id'yi alır
   7. DB'ye kaydeder
───────────────────────────────────────────── */

/**
 * POST /api/whatsapp/connect
 * Embedded Signup'tan gelen code ile bağlantıyı tamamla
 */
export const connectWhatsApp = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { code }      = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'code zorunlu' });
    }

    if (!META_APP_ID || !META_APP_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'META_APP_ID veya META_APP_SECRET .env dosyasında tanımlı değil'
      });
    }

    // 1. Code → Access Token
    const tokenRes = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
      { params: { client_id: META_APP_ID, client_secret: META_APP_SECRET, code } }
    );

    const accessToken = tokenRes.data?.access_token;
    if (!accessToken) {
      return res.status(400).json({ success: false, message: 'Access token alınamadı' });
    }

    // 2. Bağlanan hesabın WhatsApp Business Account'larını getir
    const wabaRes = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/me/whatsapp_business_accounts`,
      { params: { access_token: accessToken } }
    );

    const wabas = wabaRes.data?.data || [];
    if (!wabas.length) {
      return res.status(400).json({
        success: false,
        message: 'Bu Meta hesabına bağlı WhatsApp Business Account bulunamadı'
      });
    }

    const wabaId = wabas[0].id;

    // 3. WABA'ya bağlı telefon numarasını getir
    const phoneRes = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/phone_numbers`,
      { params: { access_token: accessToken } }
    );

    const phoneNumbers = phoneRes.data?.data || [];
    if (!phoneNumbers.length) {
      return res.status(400).json({
        success: false,
        message: "Bu WABA'ya bağlı telefon numarası bulunamadı"
      });
    }

    const phoneNumberId   = phoneNumbers[0].id;
    const displayPhone    = phoneNumbers[0].display_phone_number;

    // 4. DB'ye kaydet
    await prisma.accounts.update({
      where: { id: accountId },
      data: {
        waEnabled:     true,
        waConnected:   true,
        waApiKey:      accessToken,   // Meta access token
        waChannelId:   phoneNumberId, // Meta phone_number_id
        waPhoneNumber: displayPhone,
        waClientId:    wabaId         // WABA ID (referans)
      }
    });

    res.json({
      success: true,
      message: 'WhatsApp başarıyla bağlandı',
      data: { phoneNumber: displayPhone }
    });

  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error('❌ WhatsApp connect hatası:', errMsg);
    res.status(500).json({ success: false, message: errMsg });
  }
};

/* ─────────────────────────────────────────────
   DURUM & YÖNETİM
───────────────────────────────────────────── */

/**
 * GET /api/whatsapp/status
 * Salonun WA bağlantı durumunu döndür
 */
export const getWhatsAppStatus = async (req, res) => {
  try {
    const { accountId } = req.user;
    const account = await prisma.accounts.findUnique({
      where: { id: accountId },
      select: {
        waEnabled:     true,
        waConnected:   true,
        waPhoneNumber: true
      }
    });

    res.json({
      success: true,
      data: {
        enabled:     account?.waEnabled     ?? false,
        connected:   account?.waConnected   ?? false,
        phoneNumber: account?.waPhoneNumber ?? null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/whatsapp/toggle
 * WA bildirimlerini aç/kapat (önce bağlı olmak gerekir)
 */
export const toggleWhatsApp = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { enabled }   = req.body;

    const account = await prisma.accounts.findUnique({
      where:  { id: accountId },
      select: { waConnected: true }
    });

    if (!account?.waConnected && enabled) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp bağlı değil. Önce numaranızı bağlayın.'
      });
    }

    await prisma.accounts.update({
      where: { id: accountId },
      data:  { waEnabled: enabled }
    });

    res.json({
      success: true,
      message: enabled ? 'WhatsApp bildirimleri aktif edildi' : 'WhatsApp bildirimleri durduruldu'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/whatsapp/disconnect
 * Salonun WA bağlantısını kaldır
 */
export const disconnectWhatsApp = async (req, res) => {
  try {
    const { accountId } = req.user;

    await prisma.accounts.update({
      where: { id: accountId },
      data: {
        waEnabled:     false,
        waConnected:   false,
        waApiKey:      null,
        waChannelId:   null,
        waClientId:    null,
        waPhoneNumber: null
      }
    });

    res.json({ success: true, message: 'WhatsApp bağlantısı kaldırıldı' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/whatsapp/test-send
 * Test mesajı gönder — bağlı salon, yalnızca geliştirme ortamında kullan
 */
export const testSendMessage = async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'phone ve message zorunlu' });
    }

    const { accountId } = req.user;
    const result = await sendWhatsAppText(phone, message, accountId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
