import twilio from 'twilio';

let client = null;
let isConfigured = false;

try {
  if (process.env.TWILIO_ACCOUNT_SID && 
      process.env.TWILIO_AUTH_TOKEN && 
      process.env.TWILIO_PHONE_NUMBER) {
    
    if (process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
      client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      isConfigured = true;
      console.log('✅ Twilio SMS servisi aktif');
    } else {
      console.warn('⚠️ TWILIO_ACCOUNT_SID "AC" ile başlamalıdır');
    }
  } else {
    console.warn('⚠️ Twilio credentials tanımlı değil - SMS servisi deaktif');
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
    // Twilio yapılandırılmamışsa early return
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

    console.log(`📱 SMS gönderiliyor: ${phoneNumber} - ${message}`);

    const response = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

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
      error: error.message
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