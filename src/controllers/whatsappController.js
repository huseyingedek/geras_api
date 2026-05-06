import prisma from '../lib/prisma.js';
import { sendWhatsAppText, generate360dialogConnectUrl, handle360dialogCallback } from '../utils/whatsappService.js';

const WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'geras_webhook_verify_2026';

/**
 * GET /api/whatsapp/webhook
 * Meta webhook doğrulama
 */
export const verifyWebhook = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook doğrulandı');
    return res.status(200).send(challenge);
  }

  console.warn('❌ WhatsApp webhook doğrulama başarısız — token uyuşmuyor');
  return res.status(403).json({ error: 'Forbidden' });
};

/**
 * POST /api/whatsapp/webhook
 * Gelen WhatsApp mesajları (360dialog da aynı format gönderir)
 */
export const receiveWebhook = async (req, res) => {
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    // 360dialog ve Meta aynı payload formatını kullanır
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;

        const value    = change.value;
        const messages = value?.messages || [];
        const contacts = value?.contacts || [];

        for (const message of messages) {
          await handleIncomingMessage(message, contacts, value.metadata);
        }
      }
    }
  } catch (error) {
    console.error('❌ WhatsApp webhook işleme hatası:', error);
  }
};

/**
 * Gelen mesajı işle
 */
const handleIncomingMessage = async (message, contacts, metadata) => {
  const from       = message.from;
  const msgType    = message.type;
  const contact    = contacts.find(c => c.wa_id === from);
  const senderName = contact?.profile?.name || 'Bilinmeyen';

  console.log(`📩 WhatsApp mesajı [${from}] (${senderName}): ${msgType}`);

  if (msgType === 'text') {
    const text = message.text?.body?.toLowerCase()?.trim() || '';
    await handleTextMessage(from, senderName, text);
  } else if (msgType === 'interactive') {
    const reply = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
    console.log(`📋 Interactive yanıt: ${reply}`);
  }
};

/**
 * Metin mesajı — anahtar kelime yanıtları
 */
const handleTextMessage = async (from, senderName, text) => {
  if (text.includes('randevu') && (text.includes('sorgula') || text.includes('ne zaman') || text.includes('bak'))) {
    await queryAppointmentByPhone(from);
    return;
  }

  if (text.includes('iptal')) {
    await sendWhatsAppText(from,
      '❌ Randevu iptali için lütfen salonumuzu arayın veya randevu sistemi üzerinden işlem yapın.\n\n📞 Bizi arayın ve randevunuzu iptal edelim.'
    );
    return;
  }

  if (text.match(/^(merhaba|selam|hey|hi|hello|iyi günler)/)) {
    await sendWhatsAppText(from,
      `Merhaba ${senderName}! 👋\n\nBen GERAS Online Randevu asistanıyım.\n\n` +
      `Aşağıdaki konularda yardımcı olabilirim:\n` +
      `• *randevu sorgula* — aktif randevunuzu görün\n` +
      `• *iptal* — randevu iptali için yönlendirme\n\n` +
      `Online randevu almak için: app.gerasonline.com/booking`
    );
    return;
  }

  console.log(`ℹ️ WhatsApp işlenmeyen mesaj: "${text}" — ${from}`);
};

/**
 * Telefon numarasına göre yaklaşan randevuyu bul
 */
const queryAppointmentByPhone = async (waPhone) => {
  try {
    const phoneVariants = [
      waPhone,
      '0' + waPhone.slice(2),
      '+' + waPhone,
    ];

    const now    = new Date();
    const client = await prisma.clients.findFirst({
      where: { phone: { in: phoneVariants } }
    });

    if (!client) {
      await sendWhatsAppText(waPhone,
        'Sisteme kayıtlı bir hesap bulunamadı. Lütfen salonumuzla iletişime geçin.'
      );
      return;
    }

    const appointment = await prisma.appointments.findFirst({
      where: {
        clientId: client.id,
        appointmentDate: { gte: now },
        status: 'PLANNED'
      },
      orderBy: { appointmentDate: 'asc' },
      include: {
        service: { select: { serviceName: true } },
        staff:   { select: { fullName: true } },
        account: { select: { businessName: true } }
      }
    });

    if (!appointment) {
      await sendWhatsAppText(waPhone,
        'Yaklaşan planlanmış bir randevunuz bulunmuyor.\n\n' +
        'Online randevu almak için: app.gerasonline.com/booking'
      );
      return;
    }

    const { formatAppointmentDateTime } = await import('../utils/whatsappService.js');
    const dateStr = formatAppointmentDateTime(appointment.appointmentDate);

    await sendWhatsAppText(waPhone,
      `📅 *Yaklaşan Randevunuz*\n\n` +
      `👤 İsim: ${client.firstName} ${client.lastName}\n` +
      `✂️ Hizmet: ${appointment.service.serviceName}\n` +
      `👩 Uzman: ${appointment.staff.fullName}\n` +
      `🕐 Tarih: ${dateStr}\n` +
      `🏢 Salon: ${appointment.account.businessName}`
    );
  } catch (error) {
    console.error('❌ Randevu sorgulama hatası:', error);
  }
};

/* ─────────────────────────────────────────────
   360dialog CONNECT FLOW
───────────────────────────────────────────── */

/**
 * GET /api/whatsapp/connect
 * Salon için 360dialog bağlantı URL'sini üretir ve yönlendirir
 * Sadece OWNER yetkili kullanıcılar
 */
export const initWhatsAppConnect = async (req, res) => {
  try {
    const { accountId } = req.user;
    const connectUrl = generate360dialogConnectUrl(accountId);
    res.json({ success: true, connectUrl });
  } catch (error) {
    console.error('❌ 360dialog connect URL hatası:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/whatsapp/360dialog/callback
 * 360dialog, salon numarayı bağlayınca buraya yönlendirir
 * Query: client, channels (JSON array), state (accountId)
 *
 * PUBLIC endpoint — auth yok (360dialog yönlendirmesi)
 * Frontend sayfasına yönlendiririz, o sayfada bilgi gösterilir
 */
export const handle360dialogCallbackEndpoint = async (req, res) => {
  try {
    const { client: clientId, channels, state: accountId } = req.query;

    if (!clientId || !accountId) {
      return res.redirect(`https://app.gerasonline.com/settings/whatsapp?error=missing_params`);
    }

    await handle360dialogCallback(clientId, channels, accountId);

    // Frontend'e başarı ile yönlendir
    res.redirect(`https://app.gerasonline.com/settings/whatsapp?success=1&phone=connected`);
  } catch (error) {
    console.error('❌ 360dialog callback hatası:', error);
    res.redirect(`https://app.gerasonline.com/settings/whatsapp?error=${encodeURIComponent(error.message)}`);
  }
};

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
        waEnabled: true,
        waConnected: true,
        waPhoneNumber: true,
        waChannelId: true
      }
    });

    res.json({
      success: true,
      data: {
        enabled:     account?.waEnabled ?? false,
        connected:   account?.waConnected ?? false,
        phoneNumber: account?.waPhoneNumber ?? null,
        channelId:   account?.waChannelId ?? null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/whatsapp/toggle
 * WA bildirimlerini aç/kapat (bağlı olmak zorunda)
 */
export const toggleWhatsApp = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { enabled } = req.body;

    const account = await prisma.accounts.findUnique({
      where: { id: accountId },
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
      data: { waEnabled: enabled }
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
        waEnabled:    false,
        waConnected:  false,
        waApiKey:     null,
        waChannelId:  null,
        waClientId:   null,
        waPhoneNumber: null
      }
    });

    res.json({ success: true, message: 'WhatsApp bağlantısı kaldırıldı' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/whatsapp/test-send (sadece geliştirme)
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
