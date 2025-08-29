import twilio from 'twilio';

let client = null;
let isConfigured = false;

const SMS_ENABLED = (process.env.SMS_ENABLED || 'true').toLowerCase() !== 'false';
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || null; // MGxxxx
const TWILIO_STATUS_CALLBACK_URL = process.env.TWILIO_STATUS_CALLBACK_URL || null; // optional delivery callbacks

try {
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_PHONE_NUMBER || TWILIO_MESSAGING_SERVICE_SID)
  ) {
    if (process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
      client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      isConfigured = true;
      console.log('✅ Twilio SMS servisi aktif', TWILIO_MESSAGING_SERVICE_SID ? '(Messaging Service)' : '(Direct From)');
    } else {
      console.warn('⚠️ TWILIO_ACCOUNT_SID "AC" ile başlamalıdır');
    }
  } else {
    console.warn('⚠️ Twilio credentials veya sender eksik - SMS servisi deaktif');
  }
} catch (error) {
  console.error('❌ Twilio initialization hatası:', error.message);
}

/**
 * @param {string} to 
 * @param {string} message 
 * @returns {Promise<object>}
 */
export const sendSMS = async (to, message) => {
  try {
    // SMS opsiyonel olarak kapatılabilir veya Twilio hazır değilse sorunsuz dön
    if (!SMS_ENABLED) {
      console.warn('⚠️ SMS_ENABLED=false - SMS gönderimi atlandı');
      return { success: false, skipped: true, reason: 'SMS_DISABLED' };
    }

    if (!isConfigured || !client) {
      console.warn('⚠️ SMS gönderilemedi: Twilio yapılandırılmamış');
      return {
        success: false,
        error: 'SMS servisi aktif değil'
      };
    }

    const phoneNumber = formatPhoneNumber(to);
    
    if (!phoneNumber) {
      throw new Error('Geçersiz telefon numarası formatı');
    }

    console.log(`📱 SMS gönderiliyor: ${phoneNumber}${TWILIO_MESSAGING_SERVICE_SID ? ' via MessagingService' : ''}`);

    const payload = {
      body: message,
      to: phoneNumber,
    };

    if (TWILIO_MESSAGING_SERVICE_SID) {
      payload.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
    } else {
      payload.from = process.env.TWILIO_PHONE_NUMBER;
    }

    // Status callback URL geçerli mi? Geçerli değilse payload'a ekleme
    if (TWILIO_STATUS_CALLBACK_URL) {
      try {
        const u = new URL(TWILIO_STATUS_CALLBACK_URL);
        const isHttp = u.protocol === 'http:' || u.protocol === 'https:';
        const isLocalhost = ['localhost', '127.0.0.1'].includes(u.hostname);
        if (isHttp && !isLocalhost) {
          payload.statusCallback = TWILIO_STATUS_CALLBACK_URL;
        } else {
          console.warn('⚠️ TWILIO_STATUS_CALLBACK_URL geçersiz veya yerel. Payload\'a eklenmedi.');
        }
      } catch (_) {
        console.warn('⚠️ TWILIO_STATUS_CALLBACK_URL formatı hatalı. Payload\'a eklenmedi.');
      }
    }

    const response = await client.messages.create(payload);

    console.log('✅ SMS başarıyla gönderildi:', response.sid);
    return {
      success: true,
      messageId: response.sid,
      status: response.status
    };

  } catch (error) {
    console.error('❌ SMS gönderme hatası:', error);
    return {
      success: false,
      error: error.message,
      code: error.code,
      moreInfo: error.moreInfo
    };
  }
};

/**
 * Telefon numarasını Twilio formatına çevir
 * @param {string} phone - Telefon numarası
 * @returns {string|null} - Formatlanmış telefon numarası veya null
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  
  // Türkiye telefon numarası formatları
  let cleanPhone = phone.replace(/\D/g, ''); // Sadece rakamları al
  
  // 0090 ile başlıyorsa +90'a çevir
  if (cleanPhone.startsWith('0090')) {
    return `+${cleanPhone.slice(2)}`; // 0090xxxxxxxxxx -> +90xxxxxxxxxx
  }

  // 00 ile başlayan uluslararası formatı + ile değiştir
  if (cleanPhone.startsWith('00')) {
    return `+${cleanPhone.slice(2)}`;
  }

  // Türkiye kodu ile başlıyorsa
  if (cleanPhone.startsWith('90')) {
    return `+${cleanPhone}`;
  }
  
  // 0 ile başlıyorsa (yerli format)
  if (cleanPhone.startsWith('0')) {
    return `+9${cleanPhone}`;
  }
  
  // 5 ile başlıyorsa (0 olmadan)
  if (cleanPhone.startsWith('5') && cleanPhone.length === 10) {
    return `+90${cleanPhone}`;
  }
  
  // Zaten + ile başlıyorsa
  if (phone.startsWith('+')) {
    return phone;
  }
  
  return null;
};

/**
 * Randevu bildirimi SMS'i hazırla
 * @param {object} appointmentData - Randevu bilgileri
 * @returns {string} - SMS mesajı
 */
export const prepareAppointmentSMS = (appointmentData) => {
  const { 
    customerName, 
    serviceName, 
    appointmentDate, 
    staffName, 
    businessName 
  } = appointmentData;

  const date = new Date(appointmentDate);
  const formattedDate = date.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const formattedTime = date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return `Sayın ${customerName},

${businessName}'den bilgilendirme:

Randevunuz başarıyla oluşturulmuştur.

Tarih: ${formattedDate}
Saat: ${formattedTime}
Hizmet: ${serviceName}
Personel: ${staffName}

Zamanında gelmenizi rica eder, ilginiz için teşekkür ederiz.

İyi günler dileriz.`;
};

/**
 * Randevu iptal bildirimi SMS'i hazırla
 * @param {object} appointmentData - Randevu bilgileri
 * @returns {string} - SMS mesajı
 */
export const prepareAppointmentCancelSMS = (appointmentData) => {
  const { 
    customerName, 
    serviceName, 
    appointmentDate, 
    businessName 
  } = appointmentData;

  const date = new Date(appointmentDate);
  const formattedDate = date.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const formattedTime = date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return `Sayın ${customerName},

${businessName}'den bilgilendirme:

Randevunuz iptal edilmiştir.

Tarih: ${formattedDate}
Saat: ${formattedTime}
Hizmet: ${serviceName}

Yeni randevu için bizimle iletişime geçebilirsiniz.

İyi günler dileriz.`;
};

/**
 * Randevu hatırlatma SMS'i hazırla
 * @param {object} appointmentData - Randevu bilgileri
 * @returns {string} - SMS mesajı
 */
export const prepareAppointmentReminderSMS = (appointmentData) => {
  const { 
    customerName, 
    serviceName, 
    appointmentDate, 
    staffName, 
    businessName 
  } = appointmentData;

  const date = new Date(appointmentDate);
  const formattedTime = date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return `Sayın ${customerName},

${businessName}'den bilgilendirme:

Randevunuz hatırlatması.

Yarın randevunuz:
Saat: ${formattedTime}
Hizmet: ${serviceName}
Personel: ${staffName}

Zamanında gelmenizi rica eder, teşekkür ederiz.

İyi günler dileriz.`;
}; 