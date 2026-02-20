import { randomUUID } from 'crypto';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import prisma from '../lib/prisma.js';
import { checkPlanLimit } from '../utils/planLimitChecker.js';
import { sendSMS } from '../utils/smsService.js';

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};


const VALID_GENDERS = ['MALE', 'FEMALE', 'UNISEX'];

const createClient = catchAsync(async (req, res, next) => {
  const { firstName, lastName, phone, email, gender, birthDate, initialNote, marketingConsent } = req.body;
  const accountId = req.user.accountId;
  const userId = req.user.id;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!firstName || !lastName) {
    return next(new AppError('Ad ve soyad bilgileri zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const withinLimit = await checkPlanLimit(accountId, 'maxClients', next);
  if (!withinLimit) return;

  if (!gender) {
    return next(new AppError('Cinsiyet alanı zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (!VALID_GENDERS.includes(gender)) {
    return next(new AppError('Cinsiyet MALE, FEMALE veya UNISEX olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  let parsedBirthDate = null;
  if (birthDate) {
    parsedBirthDate = new Date(birthDate);
    if (isNaN(parsedBirthDate.getTime())) {
      return next(new AppError('Geçersiz doğum tarihi formatı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }

  // Telefon numarası validation
  if (phone && phone !== null) {
    const phoneRegex = /^[0-9\s\-\+\(\)]+$/;
    const cleanPhone = phone.replace(/\s/g, '');
    
    if (!phoneRegex.test(phone)) {
      return next(new AppError('Telefon numarası sadece rakam, boşluk, tire, artı ve parantez içerebilir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return next(new AppError('Telefon numarası 10-15 rakam arasında olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }

  if (email) {
    const existingClientWithEmail = await prisma.clients.findFirst({
      where: {
        accountId,
        email,
        isActive: true,
        NOT: { email: null }
      }
    });
    
    if (existingClientWithEmail) {
      return next(new AppError('Bu e-posta adresi başka bir müşteri tarafından kullanılıyor', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  if (phone) {
    const existingClientWithPhone = await prisma.clients.findFirst({
      where: {
        accountId,
        phone,
        isActive: true,
        NOT: { phone: null }
      }
    });
    
    if (existingClientWithPhone) {
      return next(new AppError('Bu telefon numarası başka bir müşteri tarafından kullanılıyor', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  // ✨ YENİ: initialNote validation
  if (initialNote && initialNote.trim().length > 5000) {
    return next(new AppError('Not metni en fazla 5000 karakter olabilir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // ✨ YENİ: Eğer not varsa, staff bilgisini al
  let staffId = null;
  if (initialNote && initialNote.trim()) {
    console.log('📝 Not ekleme işlemi başlıyor...');
    console.log('  - userId:', userId);
    console.log('  - accountId:', accountId);
    
    const staff = await prisma.staff.findFirst({
      where: {
        userId: parseInt(userId),
        accountId: parseInt(accountId)
      }
    });

    console.log('  - Staff bulundu mu:', staff ? 'EVET' : 'HAYIR');
    
    if (!staff) {
      // Staff kaydı yoksa kullanıcıya bilgi ver
      console.warn(`⚠️ User ${userId} için staff kaydı bulunamadı, not eklenemedi`);
      return next(new AppError('Not eklemek için önce personel kaydınız oluşturulmalı. Lütfen yöneticinizle iletişime geçin.', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    } else {
      staffId = staff.id;
      console.log('  - staffId:', staffId);
    }
  }
  
  // marketingConsent: true gönderilirse SMS akışı tetiklenir, direkt true yazılmaz (KVKK)
  const consentRequested = marketingConsent === true || marketingConsent === 'true';

  // Transaction: Müşteri + Not (varsa) — her zaman marketingConsent: false ile başlar
  const result = await prisma.$transaction(async (tx) => {
    const newClient = await tx.clients.create({
      data: {
        accountId,
        firstName,
        lastName,
        phone,
        email,
        gender,
        ...(parsedBirthDate && { birthDate: parsedBirthDate }),
        marketingConsent: false,
        consentDate: null
      }
    });

    // Not varsa ve staff bulunduysa ekle
    let createdNote = null;
    if (initialNote && initialNote.trim() && staffId) {
      createdNote = await tx.clientNotes.create({
        data: {
          accountId: accountId,
          clientId: newClient.id,
          staffId: staffId,
          noteText: initialNote.trim()
        },
        include: {
          staff: { select: { id: true, fullName: true, role: true } }
        }
      });
    }

    return { newClient, createdNote };
  });

  // Transaction bittikten sonra — SMS yan etkisi (KVKK onay akışı)
  let consentSmsSent = false;
  let consentSmsError = null;

  if (consentRequested && phone) {
    try {
      const token    = randomUUID();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 saat

      await prisma.clients.update({
        where: { id: result.newClient.id },
        data: {
          consentToken: token,
          consentRequestedAt: new Date(),
          consentTokenExpiresAt: expiresAt
        }
      });

      const account = await prisma.accounts.findUnique({
        where: { id: accountId },
        select: { businessName: true }
      });
      const businessName = account?.businessName || 'Salonumuz';
      const consentUrl   = `${process.env.FRONTEND_URL || 'https://app.geras.com'}/consent/${token}`;

      const message = `Sayin ${firstName}, ${businessName} size ozel kampanya ve firsatlardan haberdar olmak icin pazarlama izninizi istemektedir.\n\nOnay icin: ${consentUrl}\n\nBu baglanti 48 saat gecerlidir. Istemiyorsaniz dikkate almayiniz.`;

      const smsResult  = await sendSMS(phone, message);
      consentSmsSent   = smsResult.success;
    } catch (err) {
      // SMS hatası müşteri kaydını engellemez — sadece loglanır
      consentSmsError = err.message;
      console.error('⚠️ Onay SMS\'i gönderilemedi:', err.message);
    }
  } else if (consentRequested && !phone) {
    consentSmsError = 'Telefon numarası olmadığı için onay SMS\'i gönderilemedi';
  }

  const baseMessage = result.createdNote
    ? 'Müşteri ve not başarıyla oluşturuldu'
    : 'Müşteri başarıyla oluşturuldu';

  res.status(201).json({
    status: 'success',
    data: {
      client: result.newClient,
      note: result.createdNote
    },
    ...(consentRequested && {
      consentSms: {
        requested: true,
        sent: consentSmsSent,
        ...(consentSmsError && { error: consentSmsError }),
        note: 'Müşteri, SMS\'teki linke tıklayıp onayladığında marketingConsent aktif olacak'
      }
    }),
    message: consentRequested
      ? (consentSmsSent
          ? `${baseMessage}. KVKK onay SMS'i gönderildi.`
          : `${baseMessage}. Onay SMS'i gönderilemedi${consentSmsError ? ': ' + consentSmsError : ''}.`)
      : baseMessage
  });
});


const getAllClients = catchAsync(async (req, res, next) => {
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const { search, isActive } = req.query;
  
  const activeFilter = isActive === undefined 
    ? true
    : isActive === 'true' || isActive === true;
  
  const whereClause = {
    accountId,
    isActive: activeFilter,
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ]
    })
  };
  
  if (isActive === 'all') {
    delete whereClause.isActive;
  }
  
  const clients = await prisma.clients.findMany({
    where: whereClause,
    include: {
      _count: {
        select: {
          appointments: true,
          sales: true
        }
      }
    },
    orderBy: { firstName: 'asc' }
  });
  
  res.json({
    status: 'success',
    results: clients.length,
    data: clients
  });
});


const getClientById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz müşteri ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const client = await prisma.clients.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    },
    include: {
      appointments: {
        include: {
          service: true,
          staff: true
        },
        orderBy: { appointmentDate: 'desc' }
      },
      sales: {
        include: {
          service: true,
          sessions: {
            include: {
              staff: true
            },
            orderBy: { sessionDate: 'desc' }
          },
          payments: {
            orderBy: { paymentDate: 'desc' }
          }
        },
        orderBy: { saleDate: 'desc' }
      }
    }
  });
  
  if (!client) {
    return next(new AppError('Müşteri bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  res.json({
    status: 'success',
    data: client
  });
});


const updateClient = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { firstName, lastName, phone, email, gender, birthDate, isActive, marketingConsent } = req.body;
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz müşteri ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const client = await prisma.clients.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    }
  });
  
  if (!client) {
    return next(new AppError('Müşteri bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  // Telefon numarası validation (eğer güncelleme yapılıyorsa)
  if (phone && phone !== null) {
    const phoneRegex = /^[0-9\s\-\+\(\)]+$/;
    const cleanPhone = phone.replace(/\s/g, '');
    
    if (!phoneRegex.test(phone)) {
      return next(new AppError('Telefon numarası sadece rakam, boşluk, tire, artı ve parantez içerebilir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return next(new AppError('Telefon numarası 10-15 rakam arasında olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  if (email && email !== client.email) {
    const existingClientWithEmail = await prisma.clients.findFirst({
      where: {
        accountId,
        email,
        isActive: true,
        NOT: { 
          id: parseInt(id),
          email: null
        }
      }
    });
    
    if (existingClientWithEmail) {
      return next(new AppError('Bu e-posta adresi başka bir müşteri tarafından kullanılıyor', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  if (phone && phone !== client.phone) {
    const existingClientWithPhone = await prisma.clients.findFirst({
      where: {
        accountId,
        phone,
        isActive: true,
        NOT: { 
          id: parseInt(id),
          phone: null
        }
      }
    });
    
    if (existingClientWithPhone) {
      return next(new AppError('Bu telefon numarası başka bir müşteri tarafından kullanılıyor', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }

  if (gender !== undefined && !VALID_GENDERS.includes(gender)) {
    return next(new AppError('Cinsiyet MALE, FEMALE veya UNISEX olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  let parsedBirthDate;
  if (birthDate !== undefined) {
    if (birthDate === null || birthDate === '') {
      parsedBirthDate = null;
    } else {
      parsedBirthDate = new Date(birthDate);
      if (isNaN(parsedBirthDate.getTime())) {
        return next(new AppError('Geçersiz doğum tarihi formatı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
      }
    }
  }

  // Consent değişikliği — KVKK: true gelirse SMS tetikle, false gelirse direkt geri al
  let consentData = {};
  let consentRequested = false;

  if (marketingConsent !== undefined) {
    const isTrue = marketingConsent === true || marketingConsent === 'true';
    if (isTrue) {
      // Onay vermek SMS akışıyla yapılır — DB'ye false bırak, SMS tetikle
      consentRequested = true;
      // consentData boş kalır (mevcut değer korunur / değiştirilmez)
    } else {
      // Onay geri alma: direkt false yaz
      consentData.marketingConsent = false;
      consentData.consentDate = null;
    }
  }

  const updatedClient = await prisma.clients.update({
    where: { id: parseInt(id) },
    data: {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(gender !== undefined && { gender }),
      ...(birthDate !== undefined && { birthDate: parsedBirthDate }),
      ...(isActive !== undefined && { isActive: isActive === true || isActive === 'true' }),
      ...consentData
    }
  });

  // SMS akışı tetikle (update'ten sonra, yan etki)
  let consentSmsSent = false;
  let consentSmsError = null;

  if (consentRequested) {
    const clientPhone = updatedClient.phone;
    if (clientPhone) {
      try {
        const token     = randomUUID();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

        await prisma.clients.update({
          where: { id: parseInt(id) },
          data: {
            consentToken: token,
            consentRequestedAt: new Date(),
            consentTokenExpiresAt: expiresAt
          }
        });

        const account = await prisma.accounts.findUnique({
          where: { id: accountId },
          select: { businessName: true }
        });
        const businessName = account?.businessName || 'Salonumuz';
        const consentUrl   = `${process.env.FRONTEND_URL || 'https://app.geras.com'}/consent/${token}`;

        const message = `Sayin ${updatedClient.firstName}, ${businessName} size ozel kampanya ve firsatlardan haberdar olmak icin pazarlama izninizi istemektedir.\n\nOnay icin: ${consentUrl}\n\nBu baglanti 48 saat gecerlidir. Istemiyorsaniz dikkate almayiniz.`;

        const smsResult = await sendSMS(clientPhone, message);
        consentSmsSent  = smsResult.success;
      } catch (err) {
        consentSmsError = err.message;
        console.error('⚠️ Güncelleme sonrası onay SMS\'i gönderilemedi:', err.message);
      }
    } else {
      consentSmsError = 'Telefon numarası olmadığı için onay SMS\'i gönderilemedi';
    }
  }

  res.json({
    status: 'success',
    data: updatedClient,
    ...(consentRequested && {
      consentSms: {
        requested: true,
        sent: consentSmsSent,
        ...(consentSmsError && { error: consentSmsError }),
        note: 'Müşteri, SMS\'teki linke tıklayıp onayladığında marketingConsent aktif olacak'
      }
    }),
    message: consentRequested
      ? (consentSmsSent
          ? 'Müşteri güncellendi. KVKK onay SMS\'i gönderildi.'
          : `Müşteri güncellendi. Onay SMS\'i gönderilemedi${consentSmsError ? ': ' + consentSmsError : ''}.`)
      : 'Müşteri başarıyla güncellendi'
  });
});


const deleteClient = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz müşteri ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const client = await prisma.clients.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    }
  });
  
  if (!client) {
    return next(new AppError('Müşteri bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  await prisma.clients.update({
    where: { id: parseInt(id) },
    data: { isActive: false }
  });
  
  res.json({
    status: 'success',
    message: 'Müşteri başarıyla devre dışı bırakıldı'
  });
});


const hardDeleteClient = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz müşteri ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const client = await prisma.clients.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    },
    include: {
      appointments: true,
      sales: {
        include: {
          sessions: true,
          payments: true
        }
      }
    }
  });
  
  if (!client) {
    return next(new AppError('Müşteri bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  try {
    await prisma.$transaction(async (tx) => {
      for (const sale of client.sales) {
        if (sale.sessions.length > 0) {
          await tx.sessions.deleteMany({
            where: { saleId: sale.id }
          });
        }
        
        if (sale.payments.length > 0) {
          await tx.payments.deleteMany({
            where: { saleId: sale.id }
          });
        }
      }
      
      if (client.sales.length > 0) {
        await tx.sales.deleteMany({
          where: { clientId: parseInt(id) }
        });
      }
      
      if (client.appointments.length > 0) {
        await tx.appointments.deleteMany({
          where: { clientId: parseInt(id) }
        });
      }
      
      await tx.clients.delete({
        where: { id: parseInt(id) }
      });
    });
    
    res.json({
      status: 'success',
      message: `Müşteri ve tüm ilişkili verileri tamamen silindi. Silinen veriler: ${client.appointments.length} randevu, ${client.sales.length} satış.`
    });
  } catch (error) {
    console.error('Hard delete hatası:', error);
    return next(new AppError('Müşteri silinirken bir hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
});

// Tekil müşteri pazarlama onayı geri alma (KVKK: yalnızca false kabul edilir)
const updateClientConsent = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { marketingConsent } = req.body;
  const accountId = req.user.accountId;

  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz müşteri ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  if (marketingConsent === undefined || marketingConsent === null) {
    return next(new AppError('marketingConsent alanı zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // KVKK: Personel tarafından onay verilemez; yalnızca onay geri alınabilir.
  const isTrue = marketingConsent === true || marketingConsent === 'true';
  if (isTrue) {
    return next(new AppError(
      'Pazarlama onayı personel tarafından verilemez. KVKK gereği onay yalnızca müşterinin kendi SMS linkini onaylamasıyla alınabilir. Onay talep etmek için POST /api/clients/:id/consent/request kullanın.',
      400,
      ErrorCodes.GENERAL_VALIDATION_ERROR
    ));
  }

  const client = await prisma.clients.findFirst({ where: { id: parseInt(id), accountId } });
  if (!client) return next(new AppError('Müşteri bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));

  const updated = await prisma.clients.update({
    where: { id: parseInt(id) },
    data: { marketingConsent: false, consentDate: null },
    select: { id: true, firstName: true, lastName: true, marketingConsent: true, consentDate: true }
  });

  res.json({
    status: 'success',
    data: updated,
    message: 'Pazarlama onayı geri alındı'
  });
});

// Toplu pazarlama onayı geri alma (KVKK: toplu onay verme yasak, yalnızca false kabul edilir)
const bulkUpdateConsent = catchAsync(async (req, res, next) => {
  const { clientIds, marketingConsent } = req.body;
  const accountId = req.user.accountId;

  if (!Array.isArray(clientIds) || clientIds.length === 0) {
    return next(new AppError('clientIds dizisi zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  if (marketingConsent === undefined || marketingConsent === null) {
    return next(new AppError('marketingConsent alanı zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // KVKK: Toplu onay verme yasaktır. Onay yalnızca müşterinin kendi SMS linkine tıklamasıyla alınabilir.
  const isTrue = marketingConsent === true || marketingConsent === 'true';
  if (isTrue) {
    return next(new AppError(
      'Toplu pazarlama onayı verilemez. KVKK gereği onay yalnızca müşterinin kendi SMS linkini onaylamasıyla alınabilir. Onay almak için POST /api/clients/:id/consent/request kullanın.',
      400,
      ErrorCodes.GENERAL_VALIDATION_ERROR
    ));
  }

  const result = await prisma.clients.updateMany({
    where: {
      id: { in: clientIds.map(Number) },
      accountId
    },
    data: {
      marketingConsent: false,
      consentDate: null
    }
  });

  res.json({
    status: 'success',
    updatedCount: result.count,
    message: `${result.count} müşterinin pazarlama onayı geri alındı`
  });
});

// KVKK: Müşteriye SMS ile onay talebi gönder
const requestConsentViaSMS = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;

  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz müşteri ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const client = await prisma.clients.findFirst({
    where: { id: parseInt(id), accountId, isActive: true },
    include: { account: { select: { businessName: true } } }
  });
  if (!client) return next(new AppError('Müşteri bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));

  if (!client.phone) {
    return next(new AppError('Müşterinin telefon numarası kayıtlı değil', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (client.marketingConsent) {
    return next(new AppError('Müşteri zaten pazarlama onayı vermiş', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // Aktif token varsa ve süresi dolmadıysa tekrar gönderme (spam önleme)
  if (client.consentToken && client.consentTokenExpiresAt && client.consentTokenExpiresAt > new Date()) {
    const minutesLeft = Math.ceil((client.consentTokenExpiresAt - new Date()) / 60000);
    return next(new AppError(`Onay SMS'i zaten gönderildi. ${minutesLeft} dakika sonra tekrar gönderebilirsiniz.`, 429, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 saat

  await prisma.clients.update({
    where: { id: parseInt(id) },
    data: {
      consentToken: token,
      consentRequestedAt: new Date(),
      consentTokenExpiresAt: expiresAt
    }
  });

  const businessName = client.account?.businessName || 'Salonumuz';
  const consentUrl = `${process.env.FRONTEND_URL || 'https://app.geras.com'}/consent/${token}`;

  const message = `Sayin ${client.firstName},

${businessName} size ozel kampanya ve firsatlardan haberdar olmak icin pazarlama izninizi istemektedir.

Onay icin: ${consentUrl}

Bu baglanti 48 saat gecerlidir. Istemiyorsaniz dikkate almayiniz.`;

  const smsResult = await sendSMS(client.phone, message);

  res.json({
    status: 'success',
    message: 'Onay SMS\'i gönderildi',
    smsDelivered: smsResult.success,
    expiresAt: expiresAt.toISOString(),
    ...(process.env.NODE_ENV === 'development' && { devToken: token })
  });
});

// KVKK PUBLIC: Token ile müşteri bilgisi getir (onay sayfası için, auth yok)
const getConsentPage = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  if (!token) return next(new AppError('Geçersiz token', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));

  const client = await prisma.clients.findFirst({
    where: { consentToken: token },
    include: { account: { select: { businessName: true } } }
  });

  if (!client) return next(new AppError('Geçersiz veya süresi dolmuş onay bağlantısı', 404, ErrorCodes.GENERAL_NOT_FOUND));

  if (client.consentTokenExpiresAt && client.consentTokenExpiresAt < new Date()) {
    return next(new AppError('Bu onay bağlantısının süresi dolmuştur. Lütfen salonunuzla iletişime geçin.', 410, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (client.marketingConsent) {
    return res.json({
      status: 'already_consented',
      message: 'Pazarlama onayınız zaten kayıtlıdır.',
      businessName: client.account?.businessName
    });
  }

  res.json({
    status: 'pending',
    firstName: client.firstName,
    businessName: client.account?.businessName || 'Salonumuz',
    expiresAt: client.consentTokenExpiresAt?.toISOString()
  });
});

// KVKK PUBLIC: Müşteri onaylar (auth yok)
const approveConsent = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  if (!token) return next(new AppError('Geçersiz token', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));

  const client = await prisma.clients.findFirst({
    where: { consentToken: token },
    include: { account: { select: { businessName: true } } }
  });

  if (!client) return next(new AppError('Geçersiz veya süresi dolmuş onay bağlantısı', 404, ErrorCodes.GENERAL_NOT_FOUND));

  if (client.consentTokenExpiresAt && client.consentTokenExpiresAt < new Date()) {
    return next(new AppError('Bu onay bağlantısının süresi dolmuştur.', 410, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (client.marketingConsent) {
    return res.json({
      status: 'success',
      message: 'Pazarlama onayınız zaten kayıtlıdır.',
      businessName: client.account?.businessName
    });
  }

  await prisma.clients.update({
    where: { id: client.id },
    data: {
      marketingConsent: true,
      consentDate: new Date(),
      consentToken: null,
      consentRequestedAt: null,
      consentTokenExpiresAt: null
    }
  });

  // Onay teşekkür SMS'i gönder
  if (client.phone) {
    const businessName = client.account?.businessName || 'Salonumuz';
    const approveMessage = `Sayin ${client.firstName}, pazarlama mesajlarimiza izin verdiginiz icin tesekkur ederiz. Size ozel kampanya ve firsatlardan ilk siz haberdar olacaksiniz. ${businessName} ekibi.`;
    await sendSMS(client.phone, approveMessage);
  }

  res.json({
    status: 'success',
    message: `${client.account?.businessName || 'Salonumuz'} tarafından gönderilecek kampanya ve fırsatlara onay verdiniz. Teşekkürler!`
  });
});

// KVKK PUBLIC: Müşteri reddeder (auth yok)
const declineConsent = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  if (!token) return next(new AppError('Geçersiz token', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));

  const client = await prisma.clients.findFirst({
    where: { consentToken: token },
    include: { account: { select: { businessName: true } } }
  });

  if (!client) return next(new AppError('Geçersiz veya süresi dolmuş onay bağlantısı', 404, ErrorCodes.GENERAL_NOT_FOUND));

  // Token'ı temizle, onay verme
  await prisma.clients.update({
    where: { id: client.id },
    data: {
      marketingConsent: false,
      consentDate: null,
      consentToken: null,
      consentRequestedAt: null,
      consentTokenExpiresAt: null
    }
  });

  // Ret onayı SMS'i gönder
  if (client.phone) {
    const businessName = client.account?.businessName || 'Salonumuz';
    const declineMessage = `Sayin ${client.firstName}, pazarlama mesajlarina iliskin izin talebimizi reddettiniz. Tercihiniz kaydedildi. Ilerleyen donemde fikriniz degisirse bizi aramaniz yeterlidir. ${businessName} ekibi.`;
    await sendSMS(client.phone, declineMessage);
  }

  res.json({
    status: 'success',
    message: 'Pazarlama izni talebini reddettiniz. Tercihleriniz kaydedildi.'
  });
});

export {
  createClient,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  hardDeleteClient,
  updateClientConsent,
  bulkUpdateConsent,
  requestConsentViaSMS,
  getConsentPage,
  approveConsent,
  declineConsent
}; 