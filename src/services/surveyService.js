import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import { sendSMS, prepareSurveySMS } from '../utils/smsService.js';

const APP_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://app.gerasonline.com';

/**
 * Randevu tamamlandığında müşteri için anket kaydı oluştur ve SMS gönder.
 * Sadece account.surveyEnabled=true ve müşterinin telefonu varsa çalışır.
 *
 * @param {object} params
 * @param {number} params.appointmentId
 * @param {number} params.accountId
 * @param {number|null} params.clientId
 * @param {string} params.customerName
 * @param {string|null} params.phone        - Müşteri telefonu
 * @param {string} params.businessName
 * @returns {Promise<object|null>}          - Oluşturulan review kaydı veya null
 */
export const createSurveyForAppointment = async ({
  appointmentId,
  accountId,
  clientId,
  customerName,
  phone,
  businessName
}) => {
  try {
    // Daha önce bu randevu için anket oluşturulmuş mu?
    const existing = await prisma.appointmentReview.findUnique({
      where: { appointmentId }
    });
    if (existing) {
      console.log(`ℹ️  Survey zaten var: appointmentId=${appointmentId}`);
      return existing;
    }

    const token = randomUUID();
    const surveyUrl = `${APP_URL}/survey/${token}`;

    // DB'ye kaydet
    const review = await prisma.appointmentReview.create({
      data: {
        appointmentId,
        accountId,
        clientId: clientId || null,
        token
      }
    });

    // SMS gönder (telefon yoksa sadece token oluştur, SMS atma)
    if (phone) {
      const message = prepareSurveySMS({ customerName, businessName, surveyUrl });
      const smsResult = await sendSMS(phone, message);

      if (smsResult.success) {
        await prisma.appointmentReview.update({
          where: { id: review.id },
          data: { smsSentAt: new Date() }
        });
        console.log(`✅ Survey SMS gönderildi: appointmentId=${appointmentId}, phone=${phone}`);
      } else {
        console.warn(`⚠️  Survey SMS gönderilemedi: ${smsResult.error}`);
      }
    } else {
      console.log(`ℹ️  Survey token oluşturuldu ama telefon yok, SMS atlanıyor: appointmentId=${appointmentId}`);
    }

    return review;
  } catch (error) {
    // Survey hatası ana işlemi bloke etmesin
    console.error('❌ Survey oluşturma hatası:', error.message);
    return null;
  }
};
