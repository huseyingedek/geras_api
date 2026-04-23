import prisma from '../lib/prisma.js';
import { sendWhatsAppText } from '../utils/whatsappService.js';

const WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'geras_webhook_verify_2026';

/**
 * GET /api/whatsapp/webhook
 * Meta'nın webhook doğrulama isteği — ilk kurulumda bir kez çağrılır
 */
export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
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
 * Gelen WhatsApp mesajları burada işlenir
 */
export const receiveWebhook = async (req, res) => {
  // Meta 200 bekliyor, hemen gönder
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;

        const value = change.value;
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
  const from = message.from; // telefon numarası
  const msgType = message.type;
  const contact = contacts.find(c => c.wa_id === from);
  const senderName = contact?.profile?.name || 'Bilinmeyen';

  console.log(`📩 WhatsApp mesajı alındı — ${from} (${senderName}): ${msgType}`);

  if (msgType === 'text') {
    const text = message.text?.body?.toLowerCase()?.trim() || '';
    await handleTextMessage(from, senderName, text);
  } else if (msgType === 'interactive') {
    // Buton/liste yanıtları için (ileride kullanılabilir)
    const reply = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
    console.log(`📋 Interactive yanıt: ${reply}`);
  }
};

/**
 * Metin mesajı işle — basit anahtar kelime yanıtları
 */
const handleTextMessage = async (from, senderName, text) => {
  // Randevu sorgulama
  if (text.includes('randevu') && (text.includes('sorgula') || text.includes('ne zaman') || text.includes('bak'))) {
    await queryAppointmentByPhone(from);
    return;
  }

  // İptal
  if (text.includes('iptal')) {
    await sendWhatsAppText(from,
      '❌ Randevu iptali için lütfen salonumuzu arayın veya randevu sistemi üzerinden işlem yapın.\n\n📞 Bizi arayın ve randevunuzu iptal edelim.'
    );
    return;
  }

  // Merhaba / Selam
  if (text.match(/^(merhaba|selam|hey|hi|hello|iyi günler)/)) {
    await sendWhatsAppText(from,
      `Merhaba ${senderName}! 👋\n\nBen GERAS Online Randevu asistanıyım.\n\n` +
      `Aşağıdaki konularda yardımcı olabilirim:\n` +
      `• *randevu sorgula* — aktif randevunuzu görün\n` +
      `• *iptal* — randevu iptali için yönlendirme\n\n` +
      `Online randevu almak için: wisorsoft.xyz/booking`
    );
    return;
  }

  // Bilinmeyen mesaj — yanıt verme (spam önleme)
  console.log(`ℹ️ WhatsApp'tan işlenmeyen mesaj: "${text}" — ${from}`);
};

/**
 * Telefon numarasına göre yaklaşan randevuyu bul ve gönder
 */
const queryAppointmentByPhone = async (waPhone) => {
  try {
    // WA numarası 905xxx formatında, DB'de 05xxx veya +905xxx olabilir
    const phoneVariants = [
      waPhone,
      '0' + waPhone.slice(2),   // 905354... → 05354...
      '+' + waPhone,             // 905354... → +905354...
    ];

    const now = new Date();
    const client = await prisma.clients.findFirst({
      where: {
        phone: { in: phoneVariants }
      }
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
        staff: { select: { fullName: true } },
        account: { select: { businessName: true } }
      }
    });

    if (!appointment) {
      await sendWhatsAppText(waPhone,
        'Yaklaşan planlanmış bir randevunuz bulunmuyor.\n\n' +
        'Online randevu almak için: wisorsoft.xyz/booking'
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

/**
 * POST /api/whatsapp/test-send (sadece OWNER, geliştirme için)
 */
export const testSendMessage = async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'phone ve message zorunlu' });
    }
    const result = await sendWhatsAppText(phone, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
