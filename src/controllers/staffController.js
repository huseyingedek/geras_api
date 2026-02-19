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
    permissions
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
          ...(isActive !== undefined && { isActive: isActive === true || isActive === 'true' })
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

export {
  createStaff,
  getAllStaff,
  getStaffById,
  updateStaff,
  deleteStaff,
  updateStaffPermissions,
  getAllPermissions
}; 