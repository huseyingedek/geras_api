import bcrypt from 'bcryptjs';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import prisma from '../lib/prisma.js'; // Merkezi instance kullan
import { assignResourcePermissionsToStaff } from '../utils/permissionUtils.js';
import { checkPlanLimit } from '../utils/planLimitChecker.js';

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

const createStaff = catchAsync(async (req, res, next) => {
  const {
    fullName,
    role,
    phone,
    email,
    isActive,
    username,
    password,
    workingHours,
    permissions,
    monthlySalary,
  } = req.body;
  
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!fullName) {
    return next(new AppError('Personel adı zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const withinLimit = await checkPlanLimit(accountId, 'maxStaff', next);
  if (!withinLimit) return;

  if (email) {
    const existingStaffWithEmail = await prisma.staff.findFirst({
      where: {
        accountId,
        email,
        NOT: { email: null }
      }
    });
    
    if (existingStaffWithEmail) {
      return next(new AppError('Bu e-posta adresi başka bir personel tarafından kullanılıyor', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  if (phone) {
    const existingStaffWithPhone = await prisma.staff.findFirst({
      where: {
        accountId,
        phone,
        NOT: { phone: null }
      }
    });
    
    if (existingStaffWithPhone) {
      return next(new AppError('Bu telefon numarası başka bir personel tarafından kullanılıyor', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  if (username && password) {
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        OR: [
          { username },
          { email }
        ]
      }
    });
    
    if (existingUser) {
      return next(new AppError('Bu kullanıcı adı veya email zaten kullanılıyor', 400, ErrorCodes.USER_ALREADY_EXISTS));
    }
  }
  
  const result = await prisma.$transaction(async (tx) => {
    let userId = null;
    
    if (username && password && email) {
      const hashedPassword = await bcrypt.hash(password, 12);
      
      const newUser = await tx.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          phone,
          role: 'EMPLOYEE',
          accountId
        }
      });
      
      userId = newUser.id;
    }
    
    const newStaff = await tx.staff.create({
      data: {
        accountId,
        fullName,
        role,
        phone,
        email,
        isActive: isActive !== false,
        userId: userId,
        ...(commissionRate !== undefined && commissionRate !== null && { commissionRate: parseFloat(commissionRate) }),
        ...(monthlySalary !== undefined && monthlySalary !== null && monthlySalary !== '' && { monthlySalary: parseFloat(monthlySalary) }),
      }
    });
    
    if (workingHours && Array.isArray(workingHours) && workingHours.length > 0) {
      for (const hours of workingHours) {
        await tx.workingHours.create({
          data: {
            staffId: newStaff.id,
            dayOfWeek: hours.dayOfWeek,
            startTime: new Date(hours.startTime),
            endTime: new Date(hours.endTime),
            isWorking: hours.isWorking !== false
          }
        });
      }
    }
    
    if (permissions && typeof permissions === 'object') {
      for (const resource in permissions) {
        if (permissions.hasOwnProperty(resource)) {
          const existingPermissions = await tx.permission.findMany({
            where: {
              accountId,
              resource
            }
          });
          
          if (existingPermissions.length === 0) {
            const permissions = [
              { name: `${resource}_view`, description: `${resource} görüntüleme`, resource },
              { name: `${resource}_create`, description: `${resource} ekleme`, resource },
              { name: `${resource}_update`, description: `${resource} güncelleme`, resource },
              { name: `${resource}_delete`, description: `${resource} silme`, resource }
            ];
            
            for (const perm of permissions) {
              await tx.permission.create({
                data: {
                  accountId,
                  name: perm.name,
                  description: perm.description,
                  resource: perm.resource
                }
              });
            }
            
          }
          try {
            await assignResourcePermissionsToStaff(
              newStaff.id, 
              accountId, 
              resource, 
              permissions[resource],
              tx
            );
          } catch (error) {
            console.error(`${resource} için izin atama hatası:`, error);
            // Permission validation hatası ise işlemi durdur
            if (error.message.includes('görüntüleme izni olmadan')) {
              throw new AppError(error.message, 400, ErrorCodes.GENERAL_VALIDATION_ERROR);
            }
            throw error;
          }
        }
      }
    }
    
    return { newStaff, userId };
  }, {
    timeout: 30000,
  });
  
  const staffWithDetails = await prisma.staff.findUnique({
    where: { id: result.newStaff.id },
    include: {
      workingHours: true,
      staffPermissions: {
        include: {
          permission: true
        }
      },
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          role: true
        }
      }
    }
  });
  
  res.status(201).json({
    status: 'success',
    data: staffWithDetails,
    message: 'Personel başarıyla oluşturuldu'
  });
});

const getAllStaff = catchAsync(async (req, res, next) => {
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const { isActive, search } = req.query;
  
  const activeFilter = isActive === undefined 
    ? true
    : isActive === 'true' || isActive === true;
  
  const whereClause = {
    accountId,
    isActive: activeFilter,
    ...(search && {
      OR: [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { role: { contains: search, mode: 'insensitive' } }
      ]
    })
  };
  
  if (isActive === 'all') {
    delete whereClause.isActive;
  }
  
  const staff = await prisma.staff.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true
        }
      },
      workingHours: true,
      staffPermissions: {
        include: {
          permission: true
        }
      }
    },
    orderBy: { fullName: 'asc' }
  });
  
  const formattedStaff = staff.map(s => {
    const formattedPermissions = {};
    
    if (s.staffPermissions && s.staffPermissions.length > 0) {
      s.staffPermissions.forEach(sp => {
        const resource = sp.permission.resource;
        
        if (!formattedPermissions[resource]) {
          formattedPermissions[resource] = {
            canView: false,
            canCreate: false,
            canEdit: false,
            canDelete: false
          };
        }
        
        if (sp.permission.name.endsWith('_view')) formattedPermissions[resource].canView = sp.canView;
        if (sp.permission.name.endsWith('_create')) formattedPermissions[resource].canCreate = sp.canCreate;
        if (sp.permission.name.endsWith('_update')) formattedPermissions[resource].canEdit = sp.canEdit;
        if (sp.permission.name.endsWith('_delete')) formattedPermissions[resource].canDelete = sp.canDelete;
      });
    }
    
    return {
      ...s,
      staffPermissions: undefined,
      permissions: formattedPermissions
    };
  });
  
  res.json({
    status: 'success',
    results: formattedStaff.length,
    data: formattedStaff
  });
});

const getStaffById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz personel ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const staff = await prisma.staff.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    },
    include: {
      workingHours: true,
      staffPermissions: {
        include: {
          permission: true
        }
      },
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          role: true
        }
      }
    }
  });
  
  if (!staff) {
    return next(new AppError('Personel bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  const formattedPermissions = {};
  
  staff.staffPermissions.forEach(sp => {
    const resource = sp.permission.resource;
    
    if (!formattedPermissions[resource]) {
      formattedPermissions[resource] = {
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false
      };
    }
    
    if (sp.permission.name.endsWith('_view')) formattedPermissions[resource].canView = sp.canView;
    if (sp.permission.name.endsWith('_create')) formattedPermissions[resource].canCreate = sp.canCreate;
    if (sp.permission.name.endsWith('_update')) formattedPermissions[resource].canEdit = sp.canEdit;
    if (sp.permission.name.endsWith('_delete')) formattedPermissions[resource].canDelete = sp.canDelete;
  });
  
  const staffResponse = {
    ...staff,
    staffPermissions: undefined,
    permissions: formattedPermissions
  };
  
  res.json({
    status: 'success',
    data: staffResponse
  });
});

const updateStaff = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const {
    fullName,
    role,
    phone,
    email,
    isActive,
    commissionRate,
    monthlySalary,
    workingHours,
    permissions
  } = req.body;
  
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz personel ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const staff = await prisma.staff.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    },
    include: {
      user: true,
      workingHours: true
    }
  });
  
  if (!staff) {
    return next(new AppError('Personel bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  if (email && email !== staff.email) {
    const existingStaffWithEmail = await prisma.staff.findFirst({
      where: {
        accountId,
        email,
        NOT: { 
          id: parseInt(id),
          email: null
        }
      }
    });
    
    if (existingStaffWithEmail) {
      return next(new AppError('Bu e-posta adresi başka bir personel tarafından kullanılıyor', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  if (phone && phone !== staff.phone) {
    const existingStaffWithPhone = await prisma.staff.findFirst({
      where: {
        accountId,
        phone,
        NOT: { 
          id: parseInt(id),
          phone: null
        }
      }
    });
    
    if (existingStaffWithPhone) {
      return next(new AppError('Bu telefon numarası başka bir personel tarafından kullanılıyor', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  
  try {
    const result = await prisma.$transaction(async (tx) => {
      const updatedStaff = await tx.staff.update({
        where: { id: parseInt(id) },
        data: {
          ...(fullName && { fullName }),
          ...(role && { role }),
          ...(phone && { phone }),
          ...(email && { email }),
          ...(isActive !== undefined && { isActive: isActive === true || isActive === 'true' }),
          ...(commissionRate !== undefined && commissionRate !== null && { commissionRate: parseFloat(commissionRate) }),
          ...(monthlySalary !== undefined && monthlySalary !== null && monthlySalary !== '' && { monthlySalary: parseFloat(monthlySalary) }),
        }
      });

      if (staff.userId && staff.user) {
        await tx.user.update({
          where: { id: staff.userId },
          data: {
            ...(phone && { phone }),
            ...(email && { email })
          }
        });
      }
      
      if (workingHours && Array.isArray(workingHours)) {
        await tx.workingHours.deleteMany({
          where: { staffId: parseInt(id) }
        });
        
        for (const hours of workingHours) {
          await tx.workingHours.create({
            data: {
              staffId: parseInt(id),
              dayOfWeek: hours.dayOfWeek,
              startTime: new Date(hours.startTime),
              endTime: new Date(hours.endTime),
              isWorking: hours.isWorking !== false
            }
          });
        }
      }
      
      // İzinleri güncelle (eğer permissions parametresi gönderildiyse)
      if (permissions && typeof permissions === 'object') {
        for (const resource in permissions) {
          if (permissions.hasOwnProperty(resource)) {
            try {
              await assignResourcePermissionsToStaff(
                parseInt(id), 
                accountId, 
                resource, 
                permissions[resource],
                tx
              );
            } catch (error) {
              console.error(`${resource} için izin güncelleme hatası:`, error);
              // Permission validation hatası ise işlemi durdur
              if (error.message.includes('görüntüleme izni olmadan')) {
                throw new AppError(error.message, 400, ErrorCodes.GENERAL_VALIDATION_ERROR);
              }
              throw error;
            }
          }
        }
      }
      
      return updatedStaff;
    });
    
    const updatedStaffWithDetails = await prisma.staff.findUnique({
      where: { id: parseInt(id) },
      include: {
        workingHours: true,
        staffPermissions: {
          include: {
            permission: true
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            role: true
          }
        }
      }
    });
    
    // İzinleri formatla
    const formattedPermissions = {};
    
    if (updatedStaffWithDetails.staffPermissions) {
      updatedStaffWithDetails.staffPermissions.forEach(sp => {
        const resource = sp.permission.resource;
        
        if (!formattedPermissions[resource]) {
          formattedPermissions[resource] = {
            canView: false,
            canCreate: false,
            canEdit: false,
            canDelete: false
          };
        }
        
        if (sp.permission.name.endsWith('_view')) formattedPermissions[resource].canView = sp.canView;
        if (sp.permission.name.endsWith('_create')) formattedPermissions[resource].canCreate = sp.canCreate;
        if (sp.permission.name.endsWith('_update')) formattedPermissions[resource].canEdit = sp.canEdit;
        if (sp.permission.name.endsWith('_delete')) formattedPermissions[resource].canDelete = sp.canDelete;
      });
    }
    
    const staffResponse = {
      ...updatedStaffWithDetails,
      staffPermissions: undefined,
      permissions: formattedPermissions
    };
    
    res.json({
      status: 'success',
      data: staffResponse,
      message: 'Personel başarıyla güncellendi'
    });
  } catch (error) {
    console.error('Personel güncelleme hatası:', error);
    return next(new AppError('Personel güncellenirken bir hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
});

const deleteStaff = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz personel ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const staff = await prisma.staff.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    },
    include: {
      user: true
    }
  });
  
  if (!staff) {
    return next(new AppError('Personel bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  try {
    await prisma.$transaction(async (tx) => {
      await tx.staff.delete({
        where: { id: parseInt(id) }
      });
      
      if (staff.userId && staff.user) {
        await tx.user.delete({
          where: { id: staff.userId }
        });
      }
    });
    
    res.json({
      status: 'success',
      message: 'Personel başarıyla silindi'
    });
  } catch (error) {
    console.error('Personel silme hatası:', error);
    return next(new AppError('Personel silinirken bir hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
});

const updateStaffPermissions = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { permissions } = req.body;
  
  const accountId = req.user.accountId;
  
  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!id || isNaN(parseInt(id))) {
    return next(new AppError('Geçersiz personel ID', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!permissions || typeof permissions !== 'object') {
    return next(new AppError('Geçersiz izin bilgileri', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  const staff = await prisma.staff.findFirst({
    where: { 
      id: parseInt(id),
      accountId 
    }
  });
  
  if (!staff) {
    return next(new AppError('Personel bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  try {
    for (const resource in permissions) {
      if (permissions.hasOwnProperty(resource)) {
        try {
          await assignResourcePermissionsToStaff(
            parseInt(id), 
            accountId, 
            resource, 
            permissions[resource]
          );
        } catch (error) {
          // Permission validation hatası ise özel mesaj döndür
          if (error.message.includes('görüntüleme izni olmadan')) {
            return next(new AppError(error.message, 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
          }
          throw error;
        }
      }
    }
    
    const updatedPermissions = await prisma.staffPermission.findMany({
      where: { staffId: parseInt(id) },
      include: {
        permission: true
      }
    });
    
    const formattedPermissions = {};
    
    updatedPermissions.forEach(sp => {
      const resource = sp.permission.resource;
      
      if (!formattedPermissions[resource]) {
        formattedPermissions[resource] = {
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false
        };
      }
      
      if (sp.permission.name.endsWith('_view')) formattedPermissions[resource].canView = sp.canView;
      if (sp.permission.name.endsWith('_create')) formattedPermissions[resource].canCreate = sp.canCreate;
      if (sp.permission.name.endsWith('_update')) formattedPermissions[resource].canEdit = sp.canEdit;
      if (sp.permission.name.endsWith('_delete')) formattedPermissions[resource].canDelete = sp.canDelete;
    });
    
    res.json({
      status: 'success',
      data: { permissions: formattedPermissions },
      message: 'Personel izinleri başarıyla güncellendi'
    });
  } catch (error) {
    console.error('İzin güncelleme hatası:', error);
    return next(new AppError('İzinler güncellenirken bir hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
});

// Tüm izinleri listeleme (personele izin atarken kullanmak için)
const getAllPermissions = async (req, res) => {
  try {
    const { accountId } = req.user;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'İşletme bilgisi bulunamadı'
      });
    }

    const permissions = await prisma.permission.findMany({
      where: {
        accountId: accountId
      },
      orderBy: [
        { resource: 'asc' },
        { name: 'asc' }
      ]
    });

    // İzinleri modüllere göre grupla
    const groupedPermissions = {};
    
    permissions.forEach(permission => {
      const resource = permission.resource;
      
      if (!groupedPermissions[resource]) {
        groupedPermissions[resource] = {
          moduleName: getModuleName(resource),
          permissions: []
        };
      }
      
      groupedPermissions[resource].permissions.push({
        id: permission.id,
        name: permission.name,
        description: permission.description,
        action: getActionFromPermissionName(permission.name)
      });
    });

    res.json({
      status: 'success',
      data: {
        permissions: groupedPermissions,
        totalModules: Object.keys(groupedPermissions).length,
        totalPermissions: permissions.length
      }
    });
  } catch (error) {
    console.error('İzinler listelenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'İzinler listelenirken bir hata oluştu'
    });
  }
};

// Yardımcı fonksiyonlar
const getModuleName = (resource) => {
  const moduleNames = {
    'clients': 'Müşteriler',
    'services': 'Hizmetler',
    'staff': 'Personel',
    'sales': 'Satışlar',
    'appointments': 'Randevular',
    'payments': 'Ödemeler',
    'sessions': 'Seanslar',
    'reports': 'Raporlar',
    'settings': 'Ayarlar',
    'admin': 'Yönetim'
  };
  
  return moduleNames[resource] || resource;
};

const getActionFromPermissionName = (permissionName) => {
  if (permissionName.endsWith('_view')) return 'view';
  if (permissionName.endsWith('_create')) return 'create';
  if (permissionName.endsWith('_update')) return 'update';
  if (permissionName.endsWith('_delete')) return 'delete';
  return 'unknown';
};

// 📊 KOMİSYON RAPORU
export const getCommissionReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { period, startDate, endDate, staffId } = req.query;

    // Tarih aralığı hesapla
    let dateFilter = {};
    const now = new Date();

    if (period && period !== 'custom') {
      const periodMap = {
        today: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0), lte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) },
        thisWeek: (() => { const d = new Date(now); d.setDate(d.getDate() - d.getDay() + 1); d.setHours(0,0,0,0); const e = new Date(d); e.setDate(e.getDate() + 6); e.setHours(23,59,59,999); return { gte: d, lte: e }; })(),
        thisMonth: { gte: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0), lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) },
        lastMonth: { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0), lte: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) },
      };
      dateFilter = periodMap[period] || {};
    } else if (startDate || endDate) {
      if (startDate) { const [y, m, d] = startDate.split('-').map(Number); dateFilter.gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); }
      if (endDate)   { const [y, m, d] = endDate.split('-').map(Number);   dateFilter.lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59)); }
    } else {
      // Varsayılan: bu ay
      dateFilter = { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
    }

    // Personelleri ve komisyon oranlarını getir
    const staffWhere = { accountId, isActive: true };
    if (staffId) staffWhere.id = parseInt(staffId);

    const staffList = await prisma.staff.findMany({
      where: staffWhere,
      select: { id: true, fullName: true, role: true, phone: true, commissionRate: true }
    });

    // Her personel için yaptığı satışları ve tahsil edilen ödemeleri getir
    const result = await Promise.all(staffList.map(async (staff) => {
      const sales = await prisma.sales.findMany({
        where: {
          accountId,
          staffId: staff.id,
          isDeleted: false,
          saleDate: Object.keys(dateFilter).length > 0 ? dateFilter : undefined
        },
        include: {
          payments: {
            where: { status: 'COMPLETED' }
          },
          service: { select: { serviceName: true } },
          client: { select: { firstName: true, lastName: true } }
        }
      });

      // Prim tabanı: satış tutarı (satış yapıldığında hak kazanılır)
      let totalCollected = 0;
      let totalSaleAmount = 0;
      sales.forEach(sale => {
        totalSaleAmount += parseFloat(sale.totalAmount);
        sale.payments.forEach(p => {
          totalCollected += parseFloat(p.amountPaid);
        });
      });

      const rate = parseFloat(staff.commissionRate || 0);
      const commissionEarned = (totalSaleAmount * rate) / 100;

      return {
        staffId: staff.id,
        staffName: staff.fullName,
        staffRole: staff.role,
        staffPhone: staff.phone,
        commissionRate: rate,
        saleCount: sales.length,
        totalSaleAmount: parseFloat(totalSaleAmount.toFixed(2)),
        totalCollected: parseFloat(totalCollected.toFixed(2)),
        commissionEarned: parseFloat(commissionEarned.toFixed(2)),
        sales: sales.map(s => ({
          saleId: s.id,
          saleDate: s.saleDate,
          clientName: `${s.client.firstName} ${s.client.lastName}`,
          serviceName: s.service?.serviceName || 'Paket Satış',
          totalAmount: parseFloat(s.totalAmount),
          collected: parseFloat(s.payments.reduce((sum, p) => sum + parseFloat(p.amountPaid), 0).toFixed(2))
        }))
      };
    }));

    const summary = {
      totalStaff: result.length,
      totalSales: result.reduce((s, r) => s + r.saleCount, 0),
      totalSaleAmount: parseFloat(result.reduce((s, r) => s + r.totalSaleAmount, 0).toFixed(2)),
      totalCollected: parseFloat(result.reduce((s, r) => s + r.totalCollected, 0).toFixed(2)),
      totalCommission: parseFloat(result.reduce((s, r) => s + r.commissionEarned, 0).toFixed(2)),
    };

    res.json({
      success: true,
      data: result.sort((a, b) => b.commissionEarned - a.commissionEarned),
      summary,
      filter: { period: period || null, startDate: startDate || null, endDate: endDate || null }
    });

  } catch (error) {
    console.error('Komisyon raporu hatası:', error);
    res.status(500).json({ success: false, message: 'Komisyon raporu alınamadı', error: error.message });
  }
};

// ── Personel-Hizmet Matrix (tek çağrıda tüm atamalar) ────────

/**
 * GET /api/staff/services-matrix
 * Tüm aktif personelin service ID listelerini döndürür.
 * { staffId: 1, serviceIds: [2, 5, 8] }[]
 */
const getServicesMatrix = catchAsync(async (req, res) => {
  const accountId = req.user.accountId;

  const rows = await prisma.staffServices.findMany({
    where: { staff: { accountId, isActive: true } },
    select: { staffId: true, serviceId: true },
  });

  // staffId bazında grupla
  const map = {};
  for (const row of rows) {
    if (!map[row.staffId]) map[row.staffId] = [];
    map[row.staffId].push(row.serviceId);
  }

  const result = Object.entries(map).map(([staffId, serviceIds]) => ({
    staffId: Number(staffId),
    serviceIds,
  }));

  res.json({ status: 'success', data: result });
});

// ── Personel Hizmet Ataması (StaffServices) ──────────────────

/**
 * GET /api/staff/:id/services
 * Bir personele atanmış hizmetleri listeler.
 */
const getStaffServices = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const accountId = req.user.accountId;

  const staff = await prisma.staff.findFirst({
    where: { id: parseInt(id), accountId },
  });
  if (!staff) return next(new AppError('Personel bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));

  const staffServices = await prisma.staffServices.findMany({
    where: { staffId: parseInt(id) },
    include: {
      service: {
        select: { id: true, serviceName: true, price: true, durationMinutes: true, isActive: true },
      },
    },
    orderBy: { service: { serviceName: 'asc' } },
  });

  res.json({
    status: 'success',
    data: staffServices.map((ss) => ss.service),
  });
});

/**
 * PUT /api/staff/:id/services
 * Bir personele atanacak hizmetleri günceller (tam liste replace).
 * Body: { serviceIds: [1, 3, 7] }
 */
const updateStaffServices = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { serviceIds } = req.body;
  const accountId = req.user.accountId;

  if (!Array.isArray(serviceIds))
    return next(new AppError('serviceIds dizi olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));

  const staff = await prisma.staff.findFirst({
    where: { id: parseInt(id), accountId },
  });
  if (!staff) return next(new AppError('Personel bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));

  // Gelen hizmet ID'lerinin bu hesaba ait olduğunu doğrula
  const validServices = await prisma.services.findMany({
    where: { id: { in: serviceIds.map(Number) }, accountId, isActive: true },
    select: { id: true },
  });
  const validIds = validServices.map((s) => s.id);

  // Transaction: mevcut atamaları sil, yenilerini ekle
  await prisma.$transaction(async (tx) => {
    await tx.staffServices.deleteMany({ where: { staffId: parseInt(id) } });
    if (validIds.length > 0) {
      await tx.staffServices.createMany({
        data: validIds.map((serviceId) => ({
          staffId: parseInt(id),
          serviceId,
        })),
        skipDuplicates: true,
      });
    }
  });

  res.json({
    status: 'success',
    message: `Personele ${validIds.length} hizmet atandı`,
    data: { assignedServiceIds: validIds },
  });
});

export {
  createStaff,
  getAllStaff,
  getStaffById,
  updateStaff,
  deleteStaff,
  updateStaffPermissions,
  getAllPermissions,
  getServicesMatrix,
  getStaffServices,
  updateStaffServices,
}; 