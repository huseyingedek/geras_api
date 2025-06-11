import bcrypt from 'bcryptjs';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { assignResourcePermissionsToStaff } from '../utils/permissionUtils.js';
import prisma from '../lib/prisma.js'; // Merkezi instance kullan
import { addBasicPermissionsToAccount } from '../utils/permissionUtils.js';

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};


const createAccount = catchAsync(async (req, res, next) => {
  const { 
    businessName, 
    contactPerson, 
    email, 
    phone, 
    businessType, 
    subscriptionPlan,
    ownerUsername,
    ownerEmail,
    ownerPassword,
    ownerPhone
  } = req.body;
  
  if (!businessName) {
    return next(new AppError('İşletme adı gereklidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (!ownerUsername || !ownerEmail || !ownerPassword) {
    return next(new AppError('İşletme sahibi bilgileri eksik', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  
  if (email) {
    const existingAccount = await prisma.accounts.findUnique({
      where: { email }
    });
    
    if (existingAccount) {
      return next(new AppError('Bu email adresi zaten kullanılmaktadır', 400, ErrorCodes.DB_DUPLICATE_ENTRY));
    }
  }
  
  const existingUser = await prisma.user.findUnique({
    where: { email: ownerEmail }
  });
  
  if (existingUser) {
    return next(new AppError('Bu kullanıcı email adresi zaten kullanılmaktadır', 400, ErrorCodes.USER_ALREADY_EXISTS));
  }
  
  const result = await prisma.$transaction(async (tx) => {
    const newAccount = await tx.accounts.create({
      data: {
        businessName,
        contactPerson,
        email,
        phone,
        businessType: businessType || 'SESSION_BASED',
        subscriptionPlan,
        isActive: true,
      }
    });
    
    await addBasicPermissionsToAccount(newAccount.id, tx);
    
    const hashedPassword = await bcrypt.hash(ownerPassword, 12);
    
    const owner = await tx.user.create({
      data: {
        username: ownerUsername,
        email: ownerEmail,
        password: hashedPassword,
        phone: ownerPhone,
        role: 'OWNER',
        accountId: newAccount.id
      }
    });
    
    owner.password = undefined;
    
    return { account: newAccount, owner };
  }, {
    timeout: 30000,
  });
  
  res.status(201).json({
    status: 'success',
    data: {
      account: result.account,
      owner: result.owner
    },
    message: 'İşletme hesabı ve sahibi başarıyla oluşturuldu'
  });
});


const getAllAccounts = catchAsync(async (req, res) => {
  const accounts = await prisma.accounts.findMany({
    include: {
      _count: {
        select: {
          users: true,
          staff: true,
          clients: true,
          services: true
        }
      },
      users: {
        where: {
          role: 'OWNER'
        },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });
  
  res.json({
    status: 'success',
    results: accounts.length,
    data: accounts
  });
});


const getAccountById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  const account = await prisma.accounts.findUnique({
    where: { id: parseInt(id) },
    include: {
      users: {
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      },
      staff: true,
      _count: {
        select: {
          clients: true,
          services: true,
          appointments: true
        }
      }
    }
  });
  
  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  const owner = account.users.find(user => user.role === 'OWNER');
  
  res.json({
    status: 'success',
    data: {
      ...account,
      owner
    }
  });
});

const updateAccount = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { 
    businessName, 
    contactPerson, 
    email, 
    phone, 
    businessType, 
    subscriptionPlan,
    isActive 
  } = req.body;
  
  const account = await prisma.accounts.findUnique({
    where: { id: parseInt(id) }
  });
  
  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  const updatedAccount = await prisma.accounts.update({
    where: { id: parseInt(id) },
    data: {
      ...(businessName && { businessName }),
      ...(contactPerson && { contactPerson }),
      ...(email && { email }),
      ...(phone && { phone }),
      ...(businessType && { businessType }),
      ...(subscriptionPlan && { subscriptionPlan }),
      ...(isActive !== undefined && { isActive })
    }
  });
  
  res.json({
    status: 'success',
    data: updatedAccount,
    message: 'İşletme hesabı başarıyla güncellendi'
  });
});


const deleteAccount = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  const account = await prisma.accounts.findUnique({
    where: { id: parseInt(id) }
  });
  
  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  
  await prisma.accounts.update({
    where: { id: parseInt(id) },
    data: { isActive: false }
  });
  
  res.json({
    status: 'success',
    message: 'İşletme hesabı başarıyla deaktive edildi'
  });
});

const updateMyBusiness = catchAsync(async (req, res, next) => {
  const { accountId, role } = req.user;
  const { 
    businessName, 
    contactPerson, 
    email, 
    phone 
  } = req.body;

  if (!accountId) {
    return next(new AppError('İşletme bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // OWNER her şeyi değiştirebilir (businessType ve subscriptionPlan hariç)
  // EMPLOYEE sadece izni varsa değiştirebilir
  if (role === 'EMPLOYEE') {
    // Employee için permission kontrolü yapılacak
    const staff = await prisma.staff.findFirst({
      where: {
        userId: req.user.id,
        accountId: accountId
      }
    });

    if (!staff) {
      return next(new AppError('Personel kaydı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    // Business update permission kontrolü
    const permission = await prisma.permission.findFirst({
      where: {
        accountId: accountId,
        name: 'business_update',
        resource: 'business'
      }
    });

    if (permission) {
      const staffPermission = await prisma.staffPermission.findFirst({
        where: {
          staffId: staff.id,
          permissionId: permission.id,
          canEdit: true
        }
      });

      if (!staffPermission) {
        return next(new AppError('İşletme bilgilerini düzenleme yetkiniz yok', 403, ErrorCodes.GENERAL_FORBIDDEN));
      }
    } else {
      return next(new AppError('İşletme bilgilerini düzenleme yetkiniz yok', 403, ErrorCodes.GENERAL_FORBIDDEN));
    }
  } else if (role !== 'OWNER' && role !== 'ADMIN') {
    return next(new AppError('Bu işlemi yapmaya yetkiniz yok', 403, ErrorCodes.GENERAL_FORBIDDEN));
  }

  // Mevcut işletmeyi kontrol et
  const currentAccount = await prisma.accounts.findUnique({
    where: { id: accountId }
  });

  if (!currentAccount) {
    return next(new AppError('İşletme bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  // Email kontrolü (eğer değiştiriliyorsa)
  if (email && email !== currentAccount.email) {
    const existingAccount = await prisma.accounts.findFirst({
      where: {
        email: email,
        id: { not: accountId }
      }
    });

    if (existingAccount) {
      return next(new AppError('Bu email adresi başka bir işletme tarafından kullanılıyor', 400, ErrorCodes.DB_DUPLICATE_ENTRY));
    }
  }

  // Validasyonlar
  if (businessName && businessName.trim().length < 2) {
    return next(new AppError('İşletme adı en az 2 karakter olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (email && !email.includes('@')) {
    return next(new AppError('Geçerli bir email adresi giriniz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
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

  // İşletme bilgilerini güncelle (businessType ve subscriptionPlan HARİÇ)
  const updatedAccount = await prisma.accounts.update({
    where: { id: accountId },
    data: {
      ...(businessName && { businessName: businessName.trim() }),
      ...(contactPerson !== undefined && { contactPerson: contactPerson ? contactPerson.trim() : null }),
      ...(email && { email: email.trim().toLowerCase() }),
      ...(phone !== undefined && { phone: phone ? phone.trim() : null })
    }
  });

  res.status(200).json({
    status: 'success',
    data: updatedAccount,
    message: 'İşletme bilgileri başarıyla güncellendi'
  });
});

export {
  createAccount,
  getAllAccounts,
  getAccountById,
  updateAccount,
  deleteAccount,
  updateMyBusiness
}; 