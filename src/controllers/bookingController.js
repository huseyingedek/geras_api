/**
 * bookingController.js
 * ─────────────────────────────────────────────────────────────
 * Public online randevu endpoint'leri — JWT auth GEREKMİYOR.
 * Mevcut hiçbir controller/route'a dokunulmamıştır.
 * ─────────────────────────────────────────────────────────────
 */

import prisma from '../lib/prisma.js';

// ── Yardımcılar ──────────────────────────────────────────────

/** Hata yanıtı */
const sendError = (res, status, message) =>
  res.status(status).json({ status: 'error', message });

/**
 * Bir tarih için o günün başlangıç ve bitiş DateTime'larını döndürür.
 * @param {string} dateStr  "YYYY-MM-DD"
 */
const dayBounds = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end:   new Date(y, m - 1, d, 23, 59, 59, 999),
  };
};

/**
 * WorkingHours kaydındaki Time alanından saat+dakika çıkar.
 * Prisma bunu tam bir DateTime olarak saklar (günü 1970-01-01 referans alır).
 */
const toHHMM = (dt) => ({
  h: dt.getHours(),
  m: dt.getMinutes(),
});

/**
 * 30-dakikalık slotları üretir.
 * @param {{h,m}} start  Başlangıç saati
 * @param {{h,m}} end    Bitiş saati
 * @returns {string[]}   ["09:00","09:30",...]
 */
const generateSlots = (start, end) => {
  const slots = [];
  let cur = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;
  while (cur < endMin) {
    const hh = String(Math.floor(cur / 60)).padStart(2, '0');
    const mm = String(cur % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
    cur += 30;
  }
  return slots;
};

// ── 1. Salon bilgisi ─────────────────────────────────────────
/**
 * GET /api/booking/:accountId/info
 * Salon adını ve açık olduğu günleri döndürür (public).
 */
export const getBookingInfo = async (req, res) => {
  try {
    const accountId = parseInt(req.params.accountId);
    if (isNaN(accountId)) return sendError(res, 400, 'Geçersiz salon ID');

    const account = await prisma.accounts.findUnique({
      where: { id: accountId, isActive: true },
      select: { id: true, businessName: true, phone: true },
    });

    if (!account) return sendError(res, 404, 'Salon bulunamadı');

    res.json({ status: 'success', data: account });
  } catch (err) {
    console.error('[booking/info]', err);
    sendError(res, 500, 'Sunucu hatası');
  }
};

// ── 2. Aktif hizmetler ───────────────────────────────────────
/**
 * GET /api/booking/:accountId/services
 * O salona ait aktif hizmetleri listeler.
 */
export const getBookingServices = async (req, res) => {
  try {
    const accountId = parseInt(req.params.accountId);
    if (isNaN(accountId)) return sendError(res, 400, 'Geçersiz salon ID');

    const services = await prisma.services.findMany({
      where: { accountId, isActive: true },
      select: {
        id: true,
        serviceName: true,
        description: true,
        price: true,
        durationMinutes: true,
        isSessionBased: true,
      },
      orderBy: { serviceName: 'asc' },
    });

    res.json({ status: 'success', data: services });
  } catch (err) {
    console.error('[booking/services]', err);
    sendError(res, 500, 'Sunucu hatası');
  }
};

// ── 3. Hizmeti yapan personeller ─────────────────────────────
/**
 * GET /api/booking/:accountId/staff?serviceId=X
 * Belirli bir hizmeti yapabilen aktif personelleri listeler.
 * Hizmet ataması yapılmamış personeller (muhasebeci, reklamcı vb.)
 * hiçbir zaman listelenmez.
 */
export const getBookingStaff = async (req, res) => {
  try {
    const accountId = parseInt(req.params.accountId);
    if (isNaN(accountId)) return sendError(res, 400, 'Geçersiz salon ID');

    const serviceId = req.query.serviceId ? parseInt(req.query.serviceId) : null;

    // Her zaman: en az 1 hizmet ataması olan personeller
    const whereClause = {
      accountId,
      isActive: true,
      staffServices: serviceId
        ? { some: { serviceId } }          // Bu hizmeti yapabilen
        : { some: {} },                    // Herhangi bir hizmet ataması olan
    };

    const staff = await prisma.staff.findMany({
      where: whereClause,
      select: {
        id: true,
        fullName: true,
        role: true,
        workingHours: {
          select: { dayOfWeek: true, isWorking: true },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    res.json({ status: 'success', data: staff });
  } catch (err) {
    console.error('[booking/staff]', err);
    sendError(res, 500, 'Sunucu hatası');
  }
};

// ── 4. Müsait slotlar ────────────────────────────────────────
/**
 * GET /api/booking/:accountId/slots?staffId=X&date=YYYY-MM-DD
 * Seçilen personelin o günkü müsait 30-dk slotlarını döndürür.
 */
export const getAvailableSlots = async (req, res) => {
  try {
    const accountId = parseInt(req.params.accountId);
    const staffId   = parseInt(req.query.staffId);
    const dateStr   = req.query.date; // "YYYY-MM-DD"

    if (isNaN(accountId) || isNaN(staffId))
      return sendError(res, 400, 'Geçersiz salon veya personel ID');

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
      return sendError(res, 400, 'Geçerli bir tarih girin (YYYY-MM-DD)');

    // Geçmiş tarih kontrolü
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateStr.split('-').map(Number);
    const selected = new Date(y, m - 1, d);
    if (selected < today) return sendError(res, 400, 'Geçmiş tarihe randevu alınamaz');

    // Personelin o hesaba ait olduğunu doğrula
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, accountId, isActive: true },
      include: { workingHours: true },
    });
    if (!staff) return sendError(res, 404, 'Personel bulunamadı');

    // Haftanın günü (0=Pazar, 1=Pazartesi, ..., 6=Cumartesi)
    const dow = selected.getDay();

    const wh = staff.workingHours.find((w) => w.dayOfWeek === dow && w.isWorking);
    if (!wh) {
      return res.json({
        status: 'success',
        data: [],
        message: 'Bu personel seçilen günde çalışmıyor',
      });
    }

    // Tüm olası slotlar
    const allSlots = generateSlots(toHHMM(wh.startTime), toHHMM(wh.endTime));

    // O günkü mevcut randevuları getir (PLANNED veya COMPLETED)
    const { start, end } = dayBounds(dateStr);
    const existing = await prisma.appointments.findMany({
      where: {
        staffId,
        accountId,
        appointmentDate: { gte: start, lte: end },
        status: { in: ['PLANNED', 'COMPLETED'] },
      },
      select: { appointmentDate: true },
    });

    // Dolu slot setini oluştur
    const occupied = new Set(
      existing.map((a) => {
        const h = String(a.appointmentDate.getHours()).padStart(2, '0');
        const mn = String(a.appointmentDate.getMinutes()).padStart(2, '0');
        return `${h}:${mn}`;
      })
    );

    // Bugünse geçmiş saatleri de çıkar
    const now = new Date();
    const isToday =
      now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d;

    const available = allSlots.filter((slot) => {
      if (occupied.has(slot)) return false;
      if (isToday) {
        const [sh, sm] = slot.split(':').map(Number);
        const slotMin = sh * 60 + sm;
        const nowMin  = now.getHours() * 60 + now.getMinutes() + 30; // 30 dk buffer
        if (slotMin < nowMin) return false;
      }
      return true;
    });

    res.json({ status: 'success', data: available, date: dateStr, staffId });
  } catch (err) {
    console.error('[booking/slots]', err);
    sendError(res, 500, 'Sunucu hatası');
  }
};

// ── 5. Randevu talebi oluştur ────────────────────────────────
/**
 * POST /api/booking/:accountId/request
 * Body: { staffId, serviceId, date, time, customerName, customerPhone }
 * Yeni bir Appointment PLANNED statüsünde oluşturur.
 */
export const createBookingRequest = async (req, res) => {
  try {
    const accountId = parseInt(req.params.accountId);
    if (isNaN(accountId)) return sendError(res, 400, 'Geçersiz salon ID');

    const { staffId, serviceId, date, time, customerName, customerPhone } =
      req.body;

    // Basit validasyon
    if (!staffId || !date || !time || !customerName || !customerPhone)
      return sendError(res, 400, 'Tüm alanlar zorunludur');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return sendError(res, 400, 'Geçersiz tarih formatı');

    if (!/^\d{2}:\d{2}$/.test(time))
      return sendError(res, 400, 'Geçersiz saat formatı');

    const phone = customerPhone.replace(/\D/g, '');
    if (phone.length < 10)
      return sendError(res, 400, 'Geçerli bir telefon numarası girin');

    // Personel ve hesap kontrolü
    const staff = await prisma.staff.findFirst({
      where: { id: parseInt(staffId), accountId, isActive: true },
      include: { workingHours: true },
    });
    if (!staff) return sendError(res, 404, 'Personel bulunamadı');

    // Hizmet kontrolü (opsiyonel — servis yoksa null geçilir)
    if (serviceId) {
      const service = await prisma.services.findFirst({
        where: { id: parseInt(serviceId), accountId, isActive: true },
      });
      if (!service) return sendError(res, 404, 'Hizmet bulunamadı');
    }

    // Tarih oluştur
    const [y, m, d]   = date.split('-').map(Number);
    const [hh, mm]    = time.split(':').map(Number);
    const appointmentDate = new Date(y, m - 1, d, hh, mm, 0);

    // Geçmiş tarih kontrolü
    if (appointmentDate < new Date())
      return sendError(res, 400, 'Geçmiş tarih/saate randevu alınamaz');

    // Slot dolu mu?
    const { start, end } = dayBounds(date);
    const conflict = await prisma.appointments.findFirst({
      where: {
        staffId: parseInt(staffId),
        accountId,
        appointmentDate,
        status: { in: ['PLANNED', 'COMPLETED'] },
      },
    });
    if (conflict) return sendError(res, 409, 'Bu saat dilimi dolu, lütfen başka bir saat seçin');

    // Mevcut müşteri var mı? (telefon numarasına göre eşleştir)
    let clientId = null;
    const existingClient = await prisma.clients.findFirst({
      where: { accountId, phone },
    });
    if (existingClient) {
      clientId = existingClient.id;
    }

    // Randevu oluştur
    const appointment = await prisma.appointments.create({
      data: {
        accountId,
        staffId:      parseInt(staffId),
        serviceId:    serviceId ? parseInt(serviceId) : null,
        clientId,
        customerName: customerName.trim(),
        appointmentDate,
        status: 'PLANNED',
        notes: `Online randevu — Tel: ${customerPhone}`,
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Randevunuz alındı! Salonumuz sizi onaylayacaktır.',
      data: {
        appointmentId: appointment.id,
        date,
        time,
        customerName: customerName.trim(),
      },
    });
  } catch (err) {
    console.error('[booking/request]', err);
    sendError(res, 500, 'Sunucu hatası');
  }
};
