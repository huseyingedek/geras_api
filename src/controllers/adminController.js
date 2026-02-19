import bcrypt from 'bcryptjs';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import { assignResourcePermissionsToStaff } from '../utils/permissionUtils.js';
import prisma from '../lib/prisma.js';
import { addBasicPermissionsToAccount } from '../utils/permissionUtils.js';
import { SUBSCRIPTION_PLANS, PLAN_COLORS, PLAN_ICONS } from '../../subscriptionPlans.js';

const VALID_PLANS = ['DEMO', 'STARTER', 'PROFESSIONAL', 'PREMIUM'];

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
  
  // 🎯 Paket validasyonu (admin normal hesap oluştururken)
  if (subscriptionPlan && !['STARTER', 'PROFESSIONAL', 'PREMIUM'].includes(subscriptionPlan)) {
    return next(new AppError('Geçerli bir paket seçiniz (STARTER, PROFESSIONAL, PREMIUM)', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
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
        subscriptionPlan: subscriptionPlan || 'PROFESSIONAL', // Varsayılan PROFESSIONAL
        isActive: true,
        smsEnabled: true, // SMS servisi varsayılan açık
        reminderEnabled: true, // Hatırlatma varsayılan açık
        reminderHours: 24 // 1 gün önceden varsayılan
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
    isActive,
    // Owner kullanıcı bilgileri
    ownerUsername,
    ownerEmail,
    ownerPassword,
    ownerPhone
  } = req.body;
  
  const account = await prisma.accounts.findUnique({
    where: { id: parseInt(id) },
    include: {
      users: {
        where: { role: 'OWNER' },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true
        }
      }
    }
  });
  
  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  // Owner kullanıcıyı bul
  const owner = account.users.find(user => user);
  
  // Email kontrolü - işletme email'i
  if (email && email !== account.email) {
    const existingAccount = await prisma.accounts.findFirst({
      where: {
        email: email,
        id: { not: parseInt(id) }
      }
    });
    
    if (existingAccount) {
      return next(new AppError('Bu işletme email adresi başka bir hesap tarafından kullanılıyor', 400, ErrorCodes.DB_DUPLICATE_ENTRY));
    }
  }

  // Owner email kontrolü
  if (ownerEmail && owner && ownerEmail !== owner.email) {
    const existingUser = await prisma.user.findFirst({
      where: {
        email: ownerEmail,
        id: { not: owner.id }
      }
    });
    
    if (existingUser) {
      return next(new AppError('Bu kullanıcı email adresi başka bir kullanıcı tarafından kullanılıyor', 400, ErrorCodes.USER_ALREADY_EXISTS));
    }
  }

  // Validasyonlar
  if (businessName && businessName.trim().length < 2) {
    return next(new AppError('İşletme adı en az 2 karakter olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (email && !email.includes('@')) {
    return next(new AppError('Geçerli bir işletme email adresi giriniz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (ownerEmail && !ownerEmail.includes('@')) {
    return next(new AppError('Geçerli bir kullanıcı email adresi giriniz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (ownerUsername && ownerUsername.trim().length < 3) {
    return next(new AppError('Kullanıcı adı en az 3 karakter olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (ownerPassword && ownerPassword.length < 6) {
    return next(new AppError('Şifre en az 6 karakter olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // 🎯 Paket validasyonu
  if (subscriptionPlan && !['STARTER', 'PROFESSIONAL', 'PREMIUM', 'DEMO'].includes(subscriptionPlan)) {
    return next(new AppError('Geçerli bir paket seçiniz (STARTER, PROFESSIONAL, PREMIUM)', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  // Telefon numarası validasyonu
  const validatePhone = (phoneNumber, fieldName) => {
    if (phoneNumber && phoneNumber !== null) {
      const phoneRegex = /^[0-9\s\-\+\(\)]+$/;
      const cleanPhone = phoneNumber.replace(/\s/g, '');
      
      if (!phoneRegex.test(phoneNumber)) {
        return next(new AppError(`${fieldName} sadece rakam, boşluk, tire, artı ve parantez içerebilir`, 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
      }
      
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        return next(new AppError(`${fieldName} 10-15 rakam arasında olmalıdır`, 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
      }
    }
  };

  validatePhone(phone, 'İşletme telefon numarası');
  validatePhone(ownerPhone, 'Kullanıcı telefon numarası');

  // Transaction ile güncelleme
  const result = await prisma.$transaction(async (tx) => {
    // İşletme bilgilerini güncelle
    const updatedAccount = await tx.accounts.update({
      where: { id: parseInt(id) },
      data: {
        ...(businessName && { businessName: businessName.trim() }),
        ...(contactPerson !== undefined && { contactPerson: contactPerson ? contactPerson.trim() : null }),
        ...(email && { email: email.trim().toLowerCase() }),
        ...(phone !== undefined && { phone: phone ? phone.trim() : null }),
        ...(businessType && { businessType }),
        ...(subscriptionPlan !== undefined && { subscriptionPlan }),
        ...(isActive !== undefined && { isActive })
      }
    });

    let updatedOwner = null;

    // Owner kullanıcı bilgilerini güncelle (eğer owner varsa ve güncellenecek bilgi varsa)
    if (owner && (ownerUsername || ownerEmail || ownerPassword || ownerPhone !== undefined)) {
      const ownerUpdateData = {};
      
      if (ownerUsername) ownerUpdateData.username = ownerUsername.trim();
      if (ownerEmail) ownerUpdateData.email = ownerEmail.trim().toLowerCase();
      if (ownerPhone !== undefined) ownerUpdateData.phone = ownerPhone ? ownerPhone.trim() : null;
      
      // Şifre varsa hash'le
      if (ownerPassword) {
        ownerUpdateData.password = await bcrypt.hash(ownerPassword, 12);
      }

      if (Object.keys(ownerUpdateData).length > 0) {
        updatedOwner = await tx.user.update({
          where: { id: owner.id },
          data: ownerUpdateData,
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            role: true,
            createdAt: true,
            updatedAt: true
          }
        });
      }
    }

    return { account: updatedAccount, owner: updatedOwner };
  });
  
  res.json({
    status: 'success',
    data: {
      account: result.account,
      ...(result.owner && { owner: result.owner })
    },
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

// 📊 İŞLETME DETAYLI BİLGİLERİ (Admin Paneli için)
const getAccountDetails = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  // İşletmeyi temel bilgilerle çek
  const account = await prisma.accounts.findUnique({
    where: { id: parseInt(id) },
    include: {
      _count: {
        select: {
          users: true,
          staff: true,
          clients: true,
          services: true,
          sales: true,
          appointments: true
        }
      },
      // Aktif personeller (yeni önce)
      staff: {
        where: {
          isActive: true
        },
        select: {
          id: true,
          fullName: true,
          role: true,
          phone: true,
          isActive: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  });
  
  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  // İstatistikler için paralel hesaplamalar
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalRevenue, completedAppointments, activeClients] = await Promise.all([
    // 1. Toplam gelir (COMPLETED ödemeler)
    prisma.payments.aggregate({
      where: {
        sale: {
          accountId: parseInt(id),
          isDeleted: false
        },
        status: 'COMPLETED'
      },
      _sum: {
        amountPaid: true
      }
    }),
    
    // 2. Tamamlanan randevular
    prisma.appointments.count({
      where: {
        accountId: parseInt(id),
        status: 'COMPLETED'
      }
    }),
    
    // 3. Aktif müşteriler (son 30 günde işlem yapan)
    prisma.clients.count({
      where: {
        accountId: parseInt(id),
        isActive: true,
        OR: [
          {
            appointments: {
              some: {
                appointmentDate: {
                  gte: thirtyDaysAgo
                }
              }
            }
          },
          {
            sales: {
              some: {
                saleDate: {
                  gte: thirtyDaysAgo
                },
                isDeleted: false
              }
            }
          }
        ]
      }
    })
  ]);

  // Response formatla
  const response = {
    id: account.id,
    businessName: account.businessName,
    contactPerson: account.contactPerson,
    email: account.email,
    phone: account.phone,
    businessType: account.businessType,
    subscriptionPlan: account.subscriptionPlan,
    isActive: account.isActive,
    smsEnabled: account.smsEnabled,
    reminderEnabled: account.reminderEnabled,
    reminderHours: account.reminderHours,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    _count: account._count,
    stats: {
      totalRevenue: parseFloat(totalRevenue._sum.amountPaid || 0),
      totalAppointments: account._count.appointments,
      activeClients: activeClients,
      completedAppointments: completedAppointments
    },
    staff: account.staff
  };

  res.json({
    status: 'success',
    data: response
  });
});

// 🎯 DEMO HESAPLARI LİSTELE — Süresi dolmuş olanlar (Admin için)
const getPendingDemoAccounts = catchAsync(async (req, res, next) => {
  // Süresi dolmuş (EXPIRED veya eski PENDING_APPROVAL) demo hesapları getir
  const pendingDemos = await prisma.accounts.findMany({
    where: {
      isDemoAccount: true,
      demoStatus: { in: ['EXPIRED', 'PENDING_APPROVAL'] }
    },
    include: {
      users: {
        where: {
          role: 'OWNER'
        },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          createdAt: true
        }
      },
      _count: {
        select: {
          users: true,
          staff: true,
          clients: true,
          services: true,
          appointments: true,
          sales: true
        }
      }
    },
    orderBy: {
      demoExpiresAt: 'asc' // Süresi dolmak üzere olanlar önce
    }
  });

  res.json({
    status: 'success',
    results: pendingDemos.length,
    data: pendingDemos
  });
});

// 🎯 TÜM DEMO HESAPLARI LİSTELE (Admin için - filtreleme ile)
const getAllDemoAccounts = catchAsync(async (req, res, next) => {
  const { demoStatus } = req.query;

  const whereClause = {
    isDemoAccount: true
  };

  if (demoStatus) {
    whereClause.demoStatus = demoStatus;
  }

  const demoAccounts = await prisma.accounts.findMany({
    where: whereClause,
    include: {
      users: {
        where: {
          role: 'OWNER'
        },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          createdAt: true
        }
      },
      _count: {
        select: {
          users: true,
          staff: true,
          clients: true,
          services: true,
          appointments: true,
          sales: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  res.json({
    status: 'success',
    results: demoAccounts.length,
    data: demoAccounts
  });
});

// 🎯 DEMO HESAP ONAYLAMA — Planı belirleyip aktifleştir (Admin)
const approveDemoAccount = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { subscriptionPlan, billingCycle, subscriptionStartDate, subscriptionEndDate } = req.body;

  if (!subscriptionPlan || !['STARTER', 'PROFESSIONAL', 'PREMIUM'].includes(subscriptionPlan)) {
    return next(new AppError('Geçerli bir paket seçiniz: STARTER, PROFESSIONAL, PREMIUM', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const account = await prisma.accounts.findUnique({ where: { id: parseInt(id) } });

  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  if (!account.isDemoAccount) {
    return next(new AppError('Bu hesap demo hesabı değil', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const updateData = {
    subscriptionPlan,
    isDemoAccount: false,
    demoStatus: 'APPROVED',
    demoExpiresAt: null,
    isActive: true,
    subscriptionStatus: 'ACTIVE',
    ...(billingCycle && { billingCycle }),
    ...(subscriptionStartDate && { subscriptionStartDate: new Date(subscriptionStartDate) }),
    ...(subscriptionEndDate && { subscriptionEndDate: new Date(subscriptionEndDate) })
  };

  const updatedAccount = await prisma.accounts.update({
    where: { id: parseInt(id) },
    data: updateData,
    select: {
      id: true,
      businessName: true,
      subscriptionPlan: true,
      billingCycle: true,
      subscriptionStartDate: true,
      subscriptionEndDate: true,
      subscriptionStatus: true,
      isDemoAccount: true,
      demoStatus: true,
      isActive: true
    }
  });

  res.json({
    status: 'success',
    data: updatedAccount,
    message: `Hesap aktifleştirildi — ${subscriptionPlan} paketine geçildi`
  });
});

// 🎯 DEMO HESAP REDDETME/KISITLAMA (Admin)
const rejectDemoAccount = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;

  const account = await prisma.accounts.findUnique({
    where: { id: parseInt(id) }
  });

  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  if (!account.isDemoAccount) {
    return next(new AppError('Bu hesap demo hesabı değil', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const updatedAccount = await prisma.accounts.update({
    where: { id: parseInt(id) },
    data: {
      demoStatus: 'RESTRICTED',
      isActive: false
    },
    select: {
      id: true,
      businessName: true,
      isDemoAccount: true,
      demoStatus: true,
      isActive: true
    }
  });

  res.json({
    status: 'success',
    data: updatedAccount,
    message: 'Demo hesap askıya alındı'
  });
});

// 📋 TÜM HESAPLAR — PLAN DETAYLARIYLA (Admin abonelik paneli)
const getAllAccountsWithPlans = catchAsync(async (req, res, next) => {
  const { plan, isActive } = req.query;

  const whereClause = {};
  if (plan) whereClause.subscriptionPlan = plan;
  if (isActive !== undefined) whereClause.isActive = isActive === 'true';

  // DB'den planları ve hesapları paralel çek
  const [dbPlans, accounts] = await Promise.all([
    prisma.plans.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.accounts.findMany({
      where: whereClause,
      select: {
        id: true,
        businessName: true,
        contactPerson: true,
        email: true,
        phone: true,
        subscriptionPlan: true,
        billingCycle: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
        subscriptionStatus: true,
        isActive: true,
        isDemoAccount: true,
        demoStatus: true,
        demoExpiresAt: true,
        businessType: true,
        createdAt: true,
        _count: {
          select: { staff: true, clients: true, services: true, appointments: true }
        },
        users: {
          where: { role: 'OWNER' },
          select: { id: true, username: true, email: true, phone: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // Plan map — key → plan detayı
  const planMap = dbPlans.reduce((acc, p) => {
    acc[p.key] = p;
    return acc;
  }, {});

  const enriched = accounts.map(account => {
    const planKey = account.subscriptionPlan || 'PROFESSIONAL';
    const planDetails = planMap[planKey];

    let demoInfo = null;
    if (account.isDemoAccount && account.demoExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(account.demoExpiresAt);
      const remainingMs = expiresAt - now;
      demoInfo = {
        demoStatus: account.demoStatus,
        demoExpiresAt: account.demoExpiresAt,
        remainingHours: Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60))),
        isExpired: now > expiresAt
      };
    }

    return {
      id: account.id,
      businessName: account.businessName,
      contactPerson: account.contactPerson,
      email: account.email,
      phone: account.phone,
      isActive: account.isActive,
      businessType: account.businessType,
      createdAt: account.createdAt,
      billingCycle: account.billingCycle,
      subscriptionStartDate: account.subscriptionStartDate,
      subscriptionEndDate: account.subscriptionEndDate,
      subscriptionStatus: account.subscriptionStatus,
      owner: account.users[0] || null,
      counts: account._count,
      subscription: {
        key: planKey,
        name: planDetails?.name || planKey,
        displayName: planDetails?.displayName || planKey,
        price: planDetails ? parseFloat(planDetails.price) : null,
        yearlyPrice: planDetails?.yearlyPrice ? parseFloat(planDetails.yearlyPrice) : null,
        currency: planDetails?.currency || 'TRY',
        color: planDetails?.color || '#999',
        icon: planDetails?.icon || '📦',
        isDemoAccount: account.isDemoAccount,
        demo: demoInfo
      }
    };
  });

  // Plan bazında özet istatistik (DB'deki tüm planlar, hesap sayısı 0 olsa bile gelir)
  const summary = dbPlans.reduce((acc, p) => {
    acc[p.key] = {
      count: enriched.filter(a => a.subscription.key === p.key).length,
      name: p.name,
      displayName: p.displayName,
      price: parseFloat(p.price),
      yearlyPrice: p.yearlyPrice ? parseFloat(p.yearlyPrice) : null,
      currency: p.currency,
      icon: p.icon,
      color: p.color,
      isActive: p.isActive,
      isDemo: p.isDemo
    };
    return acc;
  }, {});

  res.json({
    status: 'success',
    results: enriched.length,
    summary,
    data: enriched
  });
});

// ⏱️ DEMO SÜRESİNİ GÜNCELLE (Admin)
const updateDemoExpiry = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { durationDays, expiresAt } = req.body;

  if (durationDays === undefined && !expiresAt) {
    return next(new AppError('durationDays (gün sayısı) veya expiresAt (tarih) gönderilmelidir', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (durationDays !== undefined) {
    const days = parseInt(durationDays);
    if (isNaN(days) || days < 1 || days > 365) {
      return next(new AppError('durationDays 1 ile 365 arasında olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }

  const account = await prisma.accounts.findUnique({
    where: { id: parseInt(id) }
  });

  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  if (!account.isDemoAccount) {
    return next(new AppError('Bu hesap demo hesabı değil', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  let newExpiresAt;

  if (durationDays !== undefined) {
    newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + parseInt(durationDays));
  } else {
    newExpiresAt = new Date(expiresAt);
    if (isNaN(newExpiresAt.getTime())) {
      return next(new AppError('Geçersiz tarih formatı. ISO 8601 formatı kullanın (örn: 2026-03-01T00:00:00.000Z)', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
    if (newExpiresAt <= new Date()) {
      return next(new AppError('Bitiş tarihi gelecekte olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }

  const updatedAccount = await prisma.accounts.update({
    where: { id: parseInt(id) },
    data: {
      demoExpiresAt: newExpiresAt
    },
    select: {
      id: true,
      businessName: true,
      isDemoAccount: true,
      demoStatus: true,
      demoExpiresAt: true,
      isActive: true
    }
  });

  const now = new Date();
  const remainingMs = newExpiresAt - now;
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));

  res.json({
    status: 'success',
    data: {
      account: updatedAccount,
      remainingHours,
      remainingDays: Math.floor(remainingHours / 24)
    },
    message: `Demo süresi güncellendi — ${Math.floor(remainingHours / 24)} gün ${remainingHours % 24} saat kaldı`
  });
});

// 📋 ABONELİK AYARLARINI GÜNCELLE (plan + dönem + durum)
const updateSubscriptionSettings = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const {
    subscriptionPlan,
    billingCycle,
    subscriptionStartDate,
    subscriptionEndDate,
    subscriptionStatus
  } = req.body;

  const VALID_BILLING_CYCLES = ['MONTHLY', 'YEARLY'];
  const VALID_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED'];

  if (subscriptionPlan) {
    const planExists = await prisma.plans.findUnique({ where: { key: subscriptionPlan } });
    if (!planExists) {
      const allPlans = await prisma.plans.findMany({ select: { key: true } });
      return next(new AppError(`Geçersiz plan. Mevcut planlar: ${allPlans.map(p => p.key).join(', ')}`, 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  if (billingCycle && !VALID_BILLING_CYCLES.includes(billingCycle)) {
    return next(new AppError('billingCycle MONTHLY veya YEARLY olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  if (subscriptionStatus && !VALID_STATUSES.includes(subscriptionStatus)) {
    return next(new AppError(`Geçerli durumlar: ${VALID_STATUSES.join(', ')}`, 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  let parsedStartDate, parsedEndDate;
  if (subscriptionStartDate) {
    parsedStartDate = new Date(subscriptionStartDate);
    if (isNaN(parsedStartDate.getTime())) {
      return next(new AppError('Geçersiz subscriptionStartDate formatı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }
  if (subscriptionEndDate) {
    parsedEndDate = new Date(subscriptionEndDate);
    if (isNaN(parsedEndDate.getTime())) {
      return next(new AppError('Geçersiz subscriptionEndDate formatı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }
  }

  const account = await prisma.accounts.findUnique({ where: { id: parseInt(id) } });
  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  const previousPlan = account.subscriptionPlan;

  const updateData = {
    ...(subscriptionPlan && { subscriptionPlan }),
    ...(billingCycle && { billingCycle }),
    ...(parsedStartDate && { subscriptionStartDate: parsedStartDate }),
    ...(parsedEndDate && { subscriptionEndDate: parsedEndDate }),
    ...(subscriptionStatus && { subscriptionStatus }),
    // Demo hesap ücretli pakete geçince demo kısıtlarını kaldır
    ...(subscriptionPlan && subscriptionPlan !== 'DEMO' && account.isDemoAccount && {
      isDemoAccount: false,
      demoStatus: 'APPROVED',
      demoExpiresAt: null,
      isActive: true
    })
  };

  const updatedAccount = await prisma.accounts.update({
    where: { id: parseInt(id) },
    data: updateData,
    select: {
      id: true,
      businessName: true,
      subscriptionPlan: true,
      billingCycle: true,
      subscriptionStartDate: true,
      subscriptionEndDate: true,
      subscriptionStatus: true,
      isDemoAccount: true,
      isActive: true
    }
  });

  // Kalan gün hesapla
  let remainingDays = null;
  if (updatedAccount.subscriptionEndDate) {
    const diff = new Date(updatedAccount.subscriptionEndDate) - new Date();
    remainingDays = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  res.json({
    status: 'success',
    data: {
      account: updatedAccount,
      remainingDays,
      planDetails: SUBSCRIPTION_PLANS[updatedAccount.subscriptionPlan] || null
    },
    message: subscriptionPlan && subscriptionPlan !== previousPlan
      ? `Plan ${previousPlan} → ${subscriptionPlan} olarak güncellendi`
      : 'Abonelik ayarları güncellendi'
  });
});

// 💳 MANUEL ÖDEME KAYDI EKLE — Tek ödeme veya taksitli (Admin)
const addSubscriptionPayment = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const {
    totalAmount,
    billingCycle,
    periodStart,
    periodEnd,
    paymentMethod = 'CASH',
    notes,
    // Tek ödeme için
    paidAt,
    // Taksitli ödeme için
    installments
  } = req.body;

  const VALID_METHODS = ['CASH', 'IYZICO', 'BANK_TRANSFER', 'OTHER'];
  const VALID_CYCLES = ['MONTHLY', 'YEARLY'];

  if (!totalAmount) {
    return next(new AppError('totalAmount zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  const parsedTotal = parseFloat(totalAmount);
  if (isNaN(parsedTotal) || parsedTotal <= 0) {
    return next(new AppError('Geçerli bir tutar giriniz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  if (!VALID_METHODS.includes(paymentMethod)) {
    return next(new AppError(`Geçerli ödeme yöntemleri: ${VALID_METHODS.join(', ')}`, 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  if (billingCycle && !VALID_CYCLES.includes(billingCycle)) {
    return next(new AppError('billingCycle MONTHLY veya YEARLY olmalıdır', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const parsedPeriodStart = periodStart ? new Date(periodStart) : null;
  const parsedPeriodEnd = periodEnd ? new Date(periodEnd) : null;
  if (parsedPeriodStart && isNaN(parsedPeriodStart.getTime())) {
    return next(new AppError('Geçersiz periodStart tarihi', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }
  if (parsedPeriodEnd && isNaN(parsedPeriodEnd.getTime())) {
    return next(new AppError('Geçersiz periodEnd tarihi', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const account = await prisma.accounts.findUnique({ where: { id: parseInt(id) } });
  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  const result = await prisma.$transaction(async (tx) => {
    let createdPayments = [];

    if (installments && Array.isArray(installments) && installments.length > 1) {
      // ─── TAKSİTLİ ÖDEME ───────────────────────────────────────────────────
      // installments: [{ amount, dueDate, paymentMethod?, paidAt?, status? }, ...]
      const totalInstallments = installments.length;

      for (let i = 0; i < installments.length; i++) {
        const inst = installments[i];
        const instAmount = parseFloat(inst.amount);
        if (isNaN(instAmount) || instAmount <= 0) {
          throw new AppError(`${i + 1}. taksit tutarı geçersiz`, 400, ErrorCodes.GENERAL_VALIDATION_ERROR);
        }

        // Sadece açıkça "PAID" gönderilmişse ödendi say, default PENDING
        const instStatus = inst.status === 'PAID' ? 'PAID' : 'PENDING';
        const instMethod = inst.paymentMethod || paymentMethod;

        const payment = await tx.subscriptionPayment.create({
          data: {
            accountId: parseInt(id),
            plan: account.subscriptionPlan || 'PROFESSIONAL',
            billingCycle: billingCycle || null,
            totalAmount: parsedTotal,
            installmentAmount: instAmount,
            currency: 'TRY',
            paymentMethod: VALID_METHODS.includes(instMethod) ? instMethod : 'CASH',
            periodStart: parsedPeriodStart,
            periodEnd: parsedPeriodEnd,
            installmentNumber: i + 1,
            totalInstallments,
            dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
            paidAt: instStatus === 'PAID' ? (inst.paidAt ? new Date(inst.paidAt) : new Date()) : null,
            status: instStatus,
            notes: notes || null
          }
        });
        createdPayments.push(payment);
      }
    } else {
      // ─── TEK ÖDEME ────────────────────────────────────────────────────────
      const payment = await tx.subscriptionPayment.create({
        data: {
          accountId: parseInt(id),
          plan: account.subscriptionPlan || 'PROFESSIONAL',
          billingCycle: billingCycle || null,
          totalAmount: parsedTotal,
          installmentAmount: parsedTotal,
          currency: 'TRY',
          paymentMethod,
          periodStart: parsedPeriodStart,
          periodEnd: parsedPeriodEnd,
          installmentNumber: 1,
          totalInstallments: 1,
          dueDate: parsedPeriodEnd,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          status: 'PAID',
          notes: notes || null
        }
      });
      createdPayments.push(payment);
    }

    // Abonelik bitiş tarihi güncelle (eğer periodEnd verilmişse)
    let updatedAccount = null;
    if (parsedPeriodEnd) {
      updatedAccount = await tx.accounts.update({
        where: { id: parseInt(id) },
        data: {
          subscriptionEndDate: parsedPeriodEnd,
          subscriptionStartDate: account.subscriptionStartDate || parsedPeriodStart || new Date(),
          billingCycle: billingCycle || account.billingCycle,
          subscriptionStatus: 'ACTIVE',
          isActive: true
        },
        select: {
          id: true,
          businessName: true,
          subscriptionPlan: true,
          billingCycle: true,
          subscriptionStartDate: true,
          subscriptionEndDate: true,
          subscriptionStatus: true,
          isActive: true
        }
      });
    }

    return { payments: createdPayments, account: updatedAccount };
  });

  const remainingDays = parsedPeriodEnd
    ? Math.max(0, Math.floor((parsedPeriodEnd - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  const paidCount = result.payments.filter(p => p.status === 'PAID').length;
  const pendingCount = result.payments.filter(p => p.status === 'PENDING').length;

  res.status(201).json({
    status: 'success',
    data: {
      payments: result.payments,
      account: result.account,
      summary: {
        totalInstallments: result.payments.length,
        paidInstallments: paidCount,
        pendingInstallments: pendingCount,
        totalAmount: parsedTotal,
        remainingDays
      }
    },
    message: result.payments.length > 1
      ? `${result.payments.length} taksit kaydedildi (${paidCount} ödendi, ${pendingCount} bekliyor)`
      : `Ödeme kaydedildi — ${parsedPeriodEnd ? parsedPeriodEnd.toLocaleDateString('tr-TR') + ' tarihine kadar aktif' : 'kaydedildi'}`
  });
});

// 💳 TAKSİT ÖDEMEK (Admin — bekleyen taksiti ödenmiş işaretle)
const markInstallmentPaid = catchAsync(async (req, res, next) => {
  const { id, paymentId } = req.params;
  const { paymentMethod = 'CASH', paidAt } = req.body;

  const VALID_METHODS = ['CASH', 'IYZICO', 'BANK_TRANSFER', 'OTHER'];
  if (!VALID_METHODS.includes(paymentMethod)) {
    return next(new AppError(`Geçerli ödeme yöntemleri: ${VALID_METHODS.join(', ')}`, 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const payment = await prisma.subscriptionPayment.findFirst({
    where: { id: parseInt(paymentId), accountId: parseInt(id) }
  });

  if (!payment) {
    return next(new AppError('Ödeme kaydı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }
  if (payment.status === 'PAID') {
    return next(new AppError('Bu taksit zaten ödenmiş', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const updated = await prisma.subscriptionPayment.update({
    where: { id: parseInt(paymentId) },
    data: {
      status: 'PAID',
      paymentMethod,
      paidAt: paidAt ? new Date(paidAt) : new Date()
    }
  });

  res.json({
    status: 'success',
    data: updated,
    message: `${payment.installmentNumber}. taksit ödendi`
  });
});

// 📜 ÖDEME GEÇMİŞİ (Admin)
const getSubscriptionHistory = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const account = await prisma.accounts.findUnique({
    where: { id: parseInt(id) },
    select: {
      id: true,
      businessName: true,
      subscriptionPlan: true,
      billingCycle: true,
      subscriptionStartDate: true,
      subscriptionEndDate: true,
      subscriptionStatus: true,
      isDemoAccount: true,
      demoStatus: true,
      demoExpiresAt: true,
      isActive: true
    }
  });

  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  const payments = await prisma.subscriptionPayment.findMany({
    where: { accountId: parseInt(id) },
    orderBy: { createdAt: 'desc' }
  });

  const paidPayments = payments.filter(p => p.status === 'PAID');
  const pendingPayments = payments.filter(p => p.status === 'PENDING');
  const overduePayments = payments.filter(p => p.status === 'OVERDUE');
  const totalPaid = paidPayments.reduce((sum, p) => sum + parseFloat(p.installmentAmount || 0), 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + parseFloat(p.installmentAmount || 0), 0);

  let remainingDays = null;
  let isExpired = false;
  if (account.subscriptionEndDate) {
    const diff = new Date(account.subscriptionEndDate) - new Date();
    remainingDays = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    isExpired = diff < 0;
  }

  // Plan detayını DB'den çek
  const planDetails = account.subscriptionPlan
    ? await prisma.plans.findUnique({ where: { key: account.subscriptionPlan } })
    : null;

  res.json({
    status: 'success',
    data: {
      account: {
        ...account,
        remainingDays,
        isExpired,
        planDetails: planDetails ? {
          key: planDetails.key,
          name: planDetails.name,
          price: parseFloat(planDetails.price),
          yearlyPrice: planDetails.yearlyPrice ? parseFloat(planDetails.yearlyPrice) : null,
          color: planDetails.color,
          icon: planDetails.icon
        } : null
      },
      payments,
      summary: {
        totalPayments: payments.length,
        paidCount: paidPayments.length,
        pendingCount: pendingPayments.length,
        overdueCount: overduePayments.length,
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        totalPending: parseFloat(totalPending.toFixed(2)),
        currency: 'TRY'
      }
    }
  });
});

// 🔄 BİR HESABIN PLANINI DEĞİŞTİR (Admin)
const changeAccountPlan = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { subscriptionPlan } = req.body;

  if (!subscriptionPlan) {
    return next(new AppError('subscriptionPlan alanı zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  if (!VALID_PLANS.includes(subscriptionPlan)) {
    return next(new AppError(`Geçerli planlar: ${VALID_PLANS.join(', ')}`, 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
  }

  const account = await prisma.accounts.findUnique({
    where: { id: parseInt(id) }
  });

  if (!account) {
    return next(new AppError('İşletme hesabı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
  }

  const previousPlan = account.subscriptionPlan;

  const updatedAccount = await prisma.accounts.update({
    where: { id: parseInt(id) },
    data: {
      subscriptionPlan,
      // Demo hesap STARTER/PROFESSIONAL/PREMIUM'a geçince demo kısıtlarını kaldır
      ...(account.isDemoAccount && subscriptionPlan !== 'DEMO' && {
        isDemoAccount: false,
        demoStatus: 'APPROVED',
        demoExpiresAt: null,
        isActive: true
      })
    },
    select: {
      id: true,
      businessName: true,
      subscriptionPlan: true,
      isDemoAccount: true,
      demoStatus: true,
      isActive: true
    }
  });

  res.json({
    status: 'success',
    data: {
      account: updatedAccount,
      planDetails: SUBSCRIPTION_PLANS[subscriptionPlan]
    },
    message: `Plan ${previousPlan} → ${subscriptionPlan} olarak güncellendi`
  });
});

export {
  createAccount,
  getAllAccounts,
  getAccountById,
  updateAccount,
  deleteAccount,
  updateMyBusiness,
  getAccountDetails,
  getAllAccountsWithPlans,
  changeAccountPlan,
  updateSubscriptionSettings,
  addSubscriptionPayment,
  markInstallmentPaid,
  getSubscriptionHistory,
  updateDemoExpiry,
  // 🎯 DEMO YÖNETİMİ
  getPendingDemoAccounts,
  getAllDemoAccounts,
  approveDemoAccount,
  rejectDemoAccount
}; 