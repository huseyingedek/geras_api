import { PrismaClient } from '@prisma/client';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';

const prisma = new PrismaClient();

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};


const createClient = catchAsync(async (req, res, next) => {
  const { firstName, lastName, phone, email } = req.body;
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!firstName || !lastName) {
    return next(new AppError('Ad ve soyad bilgileri zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
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
  
  const newClient = await prisma.clients.create({
    data: {
      accountId,
      firstName,
      lastName,
      phone,
      email
    }
  });
  
  res.status(201).json({
    status: 'success',
    data: newClient,
    message: 'Müşteri başarıyla oluşturuldu'
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
  const { firstName, lastName, phone, email, isActive } = req.body;
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
  
  const updatedClient = await prisma.clients.update({
    where: { id: parseInt(id) },
    data: {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
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