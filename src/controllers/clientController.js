import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import prisma from '../lib/prisma.js'; // Merkezi instance kullan
import { checkPlanLimit } from '../utils/planLimitChecker.js';

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};


const VALID_GENDERS = ['MALE', 'FEMALE', 'UNISEX'];

const createClient = catchAsync(async (req, res, next) => {
  const { firstName, lastName, phone, email, gender, birthDate, initialNote } = req.body;
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
  
  // Transaction: Müşteri + Not (varsa)
  const result = await prisma.$transaction(async (tx) => {
    // 1. Müşteriyi oluştur
    const newClient = await tx.clients.create({
      data: {
        accountId,
        firstName,
        lastName,
        phone,
        email,
        gender,
        ...(parsedBirthDate && { birthDate: parsedBirthDate })
      }
    });

    // 2. Not varsa ve staff bulunduysa, notu ekle
    let createdNote = null;
    if (initialNote && initialNote.trim() && staffId) {
      console.log('✅ Not ekleniyor...');
      createdNote = await tx.clientNotes.create({
        data: {
          accountId: accountId,
          clientId: newClient.id,
          staffId: staffId,
          noteText: initialNote.trim()
        },
        include: {
          staff: {
            select: {
              id: true,
              fullName: true,
              role: true
            }
          }
        }
      });
      console.log('✅ Not başarıyla eklendi, ID:', createdNote.id);
    }

    return { newClient, createdNote };
  });
  
  res.status(201).json({
    status: 'success',
    data: {
      client: result.newClient,
      note: result.createdNote // Not eklendiyse döner, yoksa null
    },
    message: result.createdNote 
      ? 'Müşteri ve not başarıyla oluşturuldu' 
      : 'Müşteri başarıyla oluşturuldu'
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
  const { firstName, lastName, phone, email, gender, birthDate, isActive } = req.body;
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

  const updatedClient = await prisma.clients.update({
    where: { id: parseInt(id) },
    data: {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(gender !== undefined && { gender }),
      ...(birthDate !== undefined && { birthDate: parsedBirthDate }),
      ...(isActive !== undefined && { isActive: isActive === true || isActive === 'true' })
    }
  });
  
  res.json({
    status: 'success',
    data: updatedClient,
    message: 'Müşteri başarıyla güncellendi'
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

export {
  createClient,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  hardDeleteClient
}; 