import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import prisma from '../lib/prisma.js'; // Merkezi instance kullan
import { checkPlanLimit } from '../utils/planLimitChecker.js';

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};


const createService = catchAsync(async (req, res, next) => {
  const { 
    serviceName,
    description,
    price,
    durationMinutes,
    isSessionBased,
    sessionCount,
    isActive
  } = req.body;
  
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!serviceName || !price) {
    return next(new AppError('Hizmet adı ve fiyat bilgisi zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const withinLimit = await checkPlanLimit(accountId, 'maxServices', next);
  if (!withinLimit) return;

  // Fiyat validasyonu
  const priceValue = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(priceValue) || priceValue < 0) {
    return next(new AppError('Geçersiz fiyat değeri', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  if (priceValue > 99999999.99) {
    return next(new AppError('Fiyat değeri çok büyük (maksimum: 99,999,999.99)', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const account = await prisma.accounts.findUnique({
    where: { id: accountId }
  });
  
  if (!account) {
    return next(new AppError('İşletme bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  const isSB = isSessionBased === true || isSessionBased === 'true';
  if (account.businessType === 'NON_SESSION_BASED' && isSB) {
    return next(new AppError('Seanssız işletme tipinde seanslı hizmet eklenemez', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const existingService = await prisma.services.findFirst({
    where: {
      accountId,
      serviceName
    }
  });
  
  if (existingService) {
    return next(new AppError('Bu isimde bir hizmet zaten mevcut', 400, ErrorCodes.DB_DUPLICATE_ENTRY));
  }
  
  if (isSB && (!sessionCount || sessionCount < 1)) {
    return next(new AppError('Seanslı hizmetler için seans sayısı belirtilmelidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const newService = await prisma.services.create({
    data: {
      accountId,
      serviceName,
      description,
      price: priceValue,
      durationMinutes: durationMinutes ? parseInt(durationMinutes) : null,
      isSessionBased: isSB,
      sessionCount: isSB ? parseInt(sessionCount) : 1,
      isActive: isActive !== false && isActive !== 'false'
    }
  });
  
  res.status(201).json({
    status: 'success',
    data: newService,
    message: 'Hizmet başarıyla oluşturuldu'
  });
});


const getAllServices = catchAsync(async (req, res, next) => {
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const { isActive, isSessionBased, search } = req.query;
  
  const activeFilter = isActive === undefined 
    ? true
    : isActive === 'true' || isActive === true;
  
  const whereClause = {
    accountId,
    isActive: activeFilter,
    ...((isSessionBased === 'true' || isSessionBased === 'false') && { 
      isSessionBased: isSessionBased === 'true' 
    }),
    ...(search && {
      OR: [
        { serviceName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    })
  };
  
  if (isActive === 'all') {
    delete whereClause.isActive;
  }
  
  const services = await prisma.services.findMany({
    where: whereClause,
    orderBy: { serviceName: 'asc' }
  });
  
  res.json({
    status: 'success',
    results: services.length,
    data: services
  });
});


const getServiceById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const service = await prisma.services.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    }
  });
  
  if (!service) {
    return next(new AppError('Hizmet bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  res.json({
    status: 'success',
    data: service
  });
});


const updateService = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;
  
  const { 
    serviceName,
    description,
    price,
    durationMinutes,
    isSessionBased,
    sessionCount,
    isActive
  } = req.body;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz hizmet ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  // Fiyat validasyonu
  if (price !== undefined) {
    const priceValue = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(priceValue) || priceValue < 0) {
      return next(new AppError('Geçersiz fiyat değeri', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    if (priceValue > 99999999.99) {
      return next(new AppError('Fiyat değeri çok büyük (maksimum: 99,999,999.99)', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  const account = await prisma.accounts.findUnique({
    where: { id: accountId }
  });
  
  if (!account) {
    return next(new AppError('İşletme bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  const service = await prisma.services.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    }
  });
  
  if (!service) {
    return next(new AppError('Hizmet bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  if (serviceName && serviceName !== service.serviceName) {
    const duplicateService = await prisma.services.findFirst({
      where: {
        accountId,
        serviceName,
        id: { not: parseInt(id) }
      }
    });
    
    if (duplicateService) {
      return next(new AppError('Bu isimde bir hizmet zaten mevcut', 400, ErrorCodes.DB_DUPLICATE_ENTRY));
    }
  }
  
  const isSessionBasedChanged = isSessionBased !== undefined;
  const isSB = isSessionBasedChanged 
    ? (isSessionBased === true || isSessionBased === 'true')
    : service.isSessionBased;
  
  if (account.businessType === 'NON_SESSION_BASED' && isSB) {
    return next(new AppError('Seanssız işletme tipinde seanslı hizmet oluşturulamaz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (isSB) {
    const hasValidSessionCount = sessionCount !== undefined 
      ? parseInt(sessionCount) > 0 
      : (service.sessionCount && service.sessionCount > 0);
      
    if (!hasValidSessionCount) {
      return next(new AppError('Seanslı hizmetler için seans sayısı belirtilmelidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  if (!service.isSessionBased && isSB && sessionCount === undefined) {
    return next(new AppError('Hizmeti seanslı yaparken seans sayısı belirtilmelidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  try {
    const updateData = {
      ...(serviceName && { serviceName }),
      ...(description !== undefined && { description }),
      ...(price !== undefined && { 
        price: typeof price === 'string' ? parseFloat(price) : price 
      }),
      ...(durationMinutes !== undefined && { 
        durationMinutes: durationMinutes ? parseInt(durationMinutes) : null 
      }),
      ...(isSessionBasedChanged && { isSessionBased: isSB }),
      ...(isSB && sessionCount !== undefined && { 
        sessionCount: parseInt(sessionCount) 
      }),
      ...(!isSB && { sessionCount: 1 }),
      ...(isActive !== undefined && { 
        isActive: isActive === true || isActive === 'true' 
      })
    };
    
    const updatedService = await prisma.services.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    
    res.json({
      status: 'success',
      data: updatedService,
      message: 'Hizmet başarıyla güncellendi'
    });
  } catch (error) {
    console.error('Güncelleme hatası:', error);
    return next(new AppError('Hizmet güncellenirken bir hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
});


const deleteService = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const service = await prisma.services.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    }
  });
  
  if (!service) {
    return next(new AppError('Hizmet bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  // Hizmet zaten pasifse
  if (!service.isActive) {
    return next(new AppError('Hizmet zaten pasif durumda', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  try {
    // Soft delete: Hizmeti sadece pasif hale getir
    const updatedService = await prisma.services.update({
      where: { id: parseInt(id) },
      data: { 
        isActive: false,
        updatedAt: new Date()
      }
    });
    
    // İlişkili verilerin durumunu kontrol et
    const relatedData = await prisma.sales.count({
      where: { serviceId: parseInt(id) }
    });
    
    const relatedAppointments = await prisma.appointments.count({
      where: { serviceId: parseInt(id) }
    });
    
    res.json({
      status: 'success',
      data: updatedService,
      message: 'Hizmet başarıyla pasif hale getirildi',
      info: {
        relatedSales: relatedData,
        relatedAppointments: relatedAppointments,
        note: 'Geçmiş kayıtlar korundu, sadece hizmet pasif hale getirildi'
      }
    });
    
  } catch (error) {
    console.error('Pasifleştirme hatası:', error);
    return next(new AppError('Hizmet pasifleştirilirken bir hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
});

export {
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService
}; 