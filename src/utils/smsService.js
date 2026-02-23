import axios from 'axios';

let isConfigured = false;

const SMS_ENABLED = (process.env.SMS_ENABLED || 'true').toLowerCase() !== 'false';

const ILETIBILGI_API_URL = process.env.ILETIBILGI_API_URL || null;
const ILETIBILGI_USERNAME = process.env.ILETIBILGI_USERNAME || null;
const ILETIBILGI_PASSWORD = process.env.ILETIBILGI_PASSWORD || null;
const ILETIBILGI_SENDER = process.env.ILETIBILGI_SENDER || null;
const ILETIBILGI_ENABLED = (process.env.ILETIBILGI_ENABLED || 'false').toLowerCase() === 'true';

try {
  if (ILETIBILGI_API_URL && ILETIBILGI_USERNAME && ILETIBILGI_PASSWORD && ILETIBILGI_SENDER && ILETIBILGI_ENABLED) {
    isConfigured = true;
    console.log('✅ İletiBilgi SMS servisi aktif');
  } else {
    console.warn('⚠️ İletiBilgi credentials eksik - SMS servisi deaktif');
    console.warn('Gerekli: ILETIBILGI_API_URL, ILETIBILGI_USERNAME, ILETIBILGI_PASSWORD, ILETIBILGI_SENDER, ILETIBILGI_ENABLED');
  }
} catch (error) {
  console.error('❌ İletiBilgi SMS servisi initialization hatası:', error.message);
}

/**
 * İletiBilgi API ile SMS gönder
 * @param {string} to - Telefon numarası
 * @param {string} message - Mesaj içeriği
 * @returns {Promise<object>}
 */
export const sendSMS = async (to, message) => {
  try {
    if (!SMS_ENABLED) {
      console.warn('⚠️ SMS_ENABLED=false - SMS gönderimi atlandı');
      return { success: false, skipped: true, reason: 'SMS_DISABLED' };
    }

    if (!isConfigured) {
      console.warn('⚠️ SMS gönderilemedi: İletiBilgi servisi yapılandırılmamış');
      return {
        success: false,
        error: 'SMS servisi aktif değil'
      };
    }

    const phoneNumber = formatPhoneNumber(to);
    
    if (!phoneNumber) {
      throw new Error('Geçersiz telefon numarası formatı');
    }

    const auth = Buffer.from(`${ILETIBILGI_USERNAME}:${ILETIBILGI_PASSWORD}`).toString('base64');

    const payload = {
      type: 1,              // SMS tipi
      sendingType: 0,       // Hemen gönder
      title: ILETIBILGI_SENDER,
      content: message,
      number: phoneNumber,
      encoding: 1,          // Türkçe karakter desteği
      sender: ILETIBILGI_SENDER
    };

    console.log('📱 İletiBilgi SMS gönderiliyor:', { 
      to: phoneNumber, 
      sender: ILETIBILGI_SENDER,
      messageLength: message.length 
    });

    const response = await axios.post(ILETIBILGI_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      timeout: 10000 
    });

    // Başarılı response kontrolü
    if (response.data && response.data.data && response.data.data.pkgID) {
      console.log('✅ İletiBilgi SMS başarılı:', response.data.data.pkgID);
      return {
        success: true,
        messageId: response.data.data.pkgID.toString(),
        status: 'sent'
      };
    }

    // Hata response kontrolü
    if (response.data && response.data.err) {
      throw new Error(`İletiBilgi API Hatası: ${response.data.err.message} (Code: ${response.data.err.code})`);
    }

    throw new Error('İletiBilgi API beklenmeyen response formatı');

  } catch (error) {
    console.error('❌ İletiBilgi SMS hatası:', error.message);
    
    if (error.response) {
      console.error('API Response:', error.response.data);
    }

    return {
      success: false,
      error: error.message,
      code: error.response?.data?.err?.code || 'UNKNOWN_ERROR'
    };
  }
};


/**
 * Telefon numarasını İletiBilgi formatına çevir
 * @param {string} phone - Telefon numarası
 * @returns {string|null} - Formatlanmış telefon numarası veya null
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  
  // Türkiye telefon numarası formatları - İletiBilgi için
  let cleanPhone = phone.replace(/\D/g, ''); // Sadece rakamları al
  
  // 0090 ile başlıyorsa 90'a çevir
  if (cleanPhone.startsWith('0090')) {
    return cleanPhone.slice(2); // 0090xxxxxxxxxx -> 90xxxxxxxxxx
  }

  // 00 ile başlayan uluslararası formatı
  if (cleanPhone.startsWith('00')) {
    return cleanPhone.slice(2);
  }

  // +90 ile başlıyorsa + işaretini kaldır
  if (phone.startsWith('+90')) {
    return cleanPhone;
  }

  // Türkiye kodu ile başlıyorsa
  if (cleanPhone.startsWith('90')) {
    return cleanPhone;
  }
  
  // 0 ile başlıyorsa (yerli format)
  if (cleanPhone.startsWith('0')) {
    return `9${cleanPhone}`; // 05xxxxxxxxx -> 905xxxxxxxxx
  }
  
  // 5 ile başlıyorsa (0 olmadan)
  if (cleanPhone.startsWith('5') && cleanPhone.length === 10) {
    return `90${cleanPhone}`; // 5xxxxxxxxx -> 905xxxxxxxxx
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
    businessName 
  } = appointmentData;

  const date = new Date(appointmentDate);
  const day   = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year  = date.getFullYear();
  const hour  = String(date.getHours()).padStart(2, '0');
  const min   = String(date.getMinutes()).padStart(2, '0');
  const formattedDateTime = `${day}.${month}.${year} / ${hour}:${min}`;

  return `Sn. ${customerName},

${businessName}'den bilgilendirme:

Randevunuz başarıyla oluşturulmuştur.

Tarih: ${formattedDateTime}
Hizmet: ${serviceName}

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
    businessName 
  } = appointmentData;

  const date = new Date(appointmentDate);
  const day   = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year  = date.getFullYear();
  const hour  = String(date.getHours()).padStart(2, '0');
  const min   = String(date.getMinutes()).padStart(2, '0');
  const formattedDateTime = `${day}.${month}.${year} / ${hour}:${min}`;

  return `Sn. ${customerName},

${businessName}'den hatırlatma:

${formattedDateTime} tarihli randevunuzu hatırlatmak istedik.
Hizmet: ${serviceName}

Zamanında gelmenizi rica eder, teşekkür ederiz.

İyi günler dileriz.`;
};

/**
 * SMS dogrulama kodu gonder
 * @param {string} phone - Telefon numarası
 * @param {string} code - 6 haneli doğrulama kodu
 * @returns {Promise<object>}
 */
export const sendVerificationSMS = async (phone, code) => {
  const message = `GERAS Dogrulama Kodu: ${code}

Bu kodu kimseyle paylasmayiniz.

Kod 5 dakika icin gecerlidir.`;

  return await sendSMS(phone, message);
};

/**
 * 6 haneli rastgele dogrulama kodu olustur
 * @returns {string}
 */
export const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Admin'e demo hesap bildirimi gonder
 * @param {object} demoData - Demo hesap bilgileri
 * @returns {Promise<object>}
 */
export const sendDemoAccountNotification = async (demoData) => {
  const { accountId, businessName, contactPerson, phone, email, demoExpiresAt } = demoData;

  const adminPhone = process.env.ADMIN_NOTIFICATION_PHONE || '905354676801';

  let expireStr = 'Belirtilmedi';
  if (demoExpiresAt) {
    const d = new Date(demoExpiresAt);
    expireStr = `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
  }

  const message = `YENI DEMO HESAP ACILDI!

ID      : #${accountId || '?'}
Isletme : ${businessName}
Yetkili : ${contactPerson || 'Yok'}
Tel     : ${phone || 'Yok'}
E-posta : ${email || 'Yok'}
Demo son: ${expireStr}

GERAS System`;

  return await sendSMS(adminPhone, message);
}; 