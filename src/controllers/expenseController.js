import prisma from '../lib/prisma.js';

// 📊 Tarih filtreleme helper fonksiyonu — tüm periyotlar desteklenir
// ✅ TIMEZONE FIX: UTC kullanarak tarih oluştur (Prisma uyumlu)
const getDateRange = (period) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const utcStart = (yr, mo, dy) => new Date(Date.UTC(yr, mo, dy, 0, 0, 0, 0));
  const utcEnd   = (yr, mo, dy) => new Date(Date.UTC(yr, mo, dy, 23, 59, 59, 999));

  switch (period) {
    case 'today':
      return { startDate: utcStart(y, m, d), endDate: utcEnd(y, m, d) };

    case 'yesterday': {
      const yest = new Date(y, m, d - 1);
      return { startDate: utcStart(yest.getFullYear(), yest.getMonth(), yest.getDate()),
               endDate:   utcEnd  (yest.getFullYear(), yest.getMonth(), yest.getDate()) };
    }

    case 'thisWeek': {
      const dow = now.getDay();
      const diff = dow === 0 ? -6 : 1 - dow; // Pazartesi
      const ws = new Date(y, m, d + diff);
      const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
      return { startDate: utcStart(ws.getFullYear(), ws.getMonth(), ws.getDate()),
               endDate:   utcEnd  (we.getFullYear(), we.getMonth(), we.getDate()) };
    }

    case 'lastWeek': {
      const dow = now.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const thisWs = new Date(y, m, d + diff);
      const lws = new Date(thisWs.getFullYear(), thisWs.getMonth(), thisWs.getDate() - 7);
      const lwe = new Date(lws.getFullYear(), lws.getMonth(), lws.getDate() + 6);
      return { startDate: utcStart(lws.getFullYear(), lws.getMonth(), lws.getDate()),
               endDate:   utcEnd  (lwe.getFullYear(), lwe.getMonth(), lwe.getDate()) };
    }

    case 'thisMonth': {
      const lastDay = new Date(y, m + 1, 0).getDate();
      return { startDate: utcStart(y, m, 1), endDate: utcEnd(y, m, lastDay) };
    }

    case 'lastMonth': {
      const lm = new Date(y, m - 1, 1);
      const lastDayLm = new Date(lm.getFullYear(), lm.getMonth() + 1, 0).getDate();
      return { startDate: utcStart(lm.getFullYear(), lm.getMonth(), 1),
               endDate:   utcEnd  (lm.getFullYear(), lm.getMonth(), lastDayLm) };
    }

    case 'last2Months': {
      const twoMoAgo = new Date(y, m - 1, 1); // geçen ayın 1'i
      const lastDay  = new Date(y, m + 1, 0).getDate(); // bu ayın son günü
      return { startDate: utcStart(twoMoAgo.getFullYear(), twoMoAgo.getMonth(), 1),
               endDate:   utcEnd  (y, m, lastDay) };
    }

    default:
      return null;
  }
};

// 📊 TÜM GİDERLERİ LİSTELE
export const getAllExpenses = async (req, res) => {
  try {
    const { accountId } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const { period, startDate, endDate, categoryId, paymentStatus, expenseType, search, filterBy } = req.query;

    // filterBy: 'expenseDate' (varsayılan) | 'paymentDate'
    // expenseDate → giderin oluşturulduğu ay (tahakkuk)
    // paymentDate → paranın cebinizden çıktığı gün (nakit akış)
    const useDateField = filterBy === 'paymentDate' ? 'PaymentDate' : 'ExpenseDate';

    let whereClause = { AccountID: accountId };

    // --- Tarih filtreleme ---
    let dateFilter = null;

    if (period && period !== 'custom') {
      dateFilter = getDateRange(period);
    } else if (startDate || endDate) {
      dateFilter = {};
      if (startDate) {
        const [yr, mo, dy] = startDate.split('-').map(Number);
        dateFilter.startDate = new Date(Date.UTC(yr, mo - 1, dy, 0, 0, 0, 0));
      }
      if (endDate) {
        const [yr, mo, dy] = endDate.split('-').map(Number);
        dateFilter.endDate = new Date(Date.UTC(yr, mo - 1, dy, 23, 59, 59, 999));
      }
    }

    if (dateFilter && (dateFilter.startDate || dateFilter.endDate)) {
      whereClause[useDateField] = {};
      if (dateFilter.startDate) whereClause[useDateField].gte = dateFilter.startDate;
      if (dateFilter.endDate)   whereClause[useDateField].lte = dateFilter.endDate;

      // Ödeme tarihi filtresinde NULL olan kayıtları dışla
      if (useDateField === 'PaymentDate') {
        whereClause.PaymentDate = { ...whereClause.PaymentDate, not: null };
      }
    }

    // Kategori filtresi
    if (categoryId) {
      whereClause.CategoryID = parseInt(categoryId);
    }

    // Ödeme durumu filtresi
    if (paymentStatus) {
      whereClause.PaymentStatus = paymentStatus;
    }

    // Gider tipi filtresi
    if (expenseType) {
      whereClause.ExpenseType = expenseType;
    }

    // Giderleri getir
    const [expenses, totalCount] = await Promise.all([
      prisma.expenses.findMany({
        where: whereClause,
        include: {
          ExpenseCategories: {
            select: {
              CategoryID: true,
              CategoryName: true,
              Description: true
            }
          },
          Staff: {
            select: {
              id: true,
              fullName: true,
              role: true
            }
          },
          Vendors: {
            select: {
              VendorID: true,
              VendorName: true,
              ContactPerson: true,
              Phone: true
            }
          }
        },
        orderBy: {
          ExpenseDate: 'desc'
        },
        skip: offset,
        take: limit
      }),
      prisma.expenses.count({
        where: whereClause
      })
    ]);

    // Özet bilgileri hesapla
    const summary = await prisma.expenses.aggregate({
      where: whereClause,
      _sum: {
        Amount: true,
        PaidAmount: true
      },
      _count: true
    });

    const totalAmount = parseFloat(summary._sum.Amount || 0);
    const totalPaid = parseFloat(summary._sum.PaidAmount || 0);
    const totalUnpaid = totalAmount - totalPaid;

    // Sales controller ile uyumlu response formatı
    res.json({
      success: true,
      data: expenses,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      summary: {
        totalExpenses: summary._count,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        totalUnpaid: parseFloat(totalUnpaid.toFixed(2))
      },
      filter: {
        period: period || null,
        startDate: startDate || null,
        endDate: endDate || null,
        categoryId: categoryId || null,
        paymentStatus: paymentStatus || null,
        expenseType: expenseType || null,
        filterBy: useDateField === 'PaymentDate' ? 'paymentDate' : 'expenseDate'
      },
      dateRange: dateFilter ? {
        startDate: dateFilter.startDate?.toISOString(),
        endDate: dateFilter.endDate?.toISOString()
      } : null
    });

  } catch (error) {
    console.error('Gider listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Giderler listelenemedi',
      error: error.message
    });
  }
};

// ➕ YENİ GİDER EKLE
export const createExpense = async (req, res) => {
  try {
    const { accountId } = req.user;
    const {
      categoryId,
      expenseDate,
      amount,
      currencyCode,
      description,
      expenseType,
      staffId,
      vendorId,
      paymentStatus,
      paidAmount,
      paymentDate
    } = req.body;

    // Validasyon
    if (!categoryId || !amount || !expenseType) {
      return res.status(400).json({
        success: false,
        message: 'Gerekli alanlar: categoryId, amount, expenseType'
      });
    }

    // ✅ ExpenseType validation - Database constraint'e uygun
    const validExpenseTypes = ['staff', 'vendor', 'general'];
    
    // DEBUG: expenseType'ı logla
    console.log('🔍 DEBUG - expenseType:', expenseType);
    console.log('🔍 DEBUG - typeof:', typeof expenseType);
    console.log('🔍 DEBUG - includes check:', validExpenseTypes.includes(expenseType));
    
    if (!validExpenseTypes.includes(expenseType)) {
      return res.status(400).json({
        success: false,
        message: `expenseType sadece şunlardan biri olabilir: ${validExpenseTypes.join(', ')}`,
        debug: {
          received: expenseType,
          type: typeof expenseType,
          valid: validExpenseTypes
        }
      });
    }

    // ✅ Staff ise staffId zorunlu
    if (expenseType === 'staff' && !staffId) {
      return res.status(400).json({
        success: false,
        message: 'Personel ödemesi için staffId gerekli'
      });
    }

    // ✅ Vendor ise vendorId zorunlu
    if (expenseType === 'vendor' && !vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Tedarikçi ödemesi için vendorId gerekli'
      });
    }

    // Kategori kontrolü
    const category = await prisma.expenseCategories.findFirst({
      where: {
        CategoryID: categoryId,
        AccountID: accountId,
        IsActive: true
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı veya aktif değil'
      });
    }

    // ✅ TIMEZONE FIX: UTC tarih oluşturma (Prisma uyumlu)
    let expenseDateObj;
    if (expenseDate) {
      const [year, month, day] = expenseDate.split('-').map(Number);
      expenseDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      const now = new Date();
      expenseDateObj = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
    }

    let paymentDateObj = null;
    if (paymentDate) {
      const [year, month, day] = paymentDate.split('-').map(Number);
      paymentDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    // Gider oluştur
    const expense = await prisma.expenses.create({
      data: {
        AccountID: accountId,
        CategoryID: categoryId,
        ExpenseDate: expenseDateObj,
        Amount: parseFloat(amount),
        CurrencyCode: currencyCode || 'TRY',
        Description: description || null,
        ExpenseType: expenseType,
        StaffID: staffId || null,
        VendorID: vendorId || null,
        PaymentStatus: paymentStatus || 'pending',
        PaidAmount: paidAmount ? parseFloat(paidAmount) : 0,
        PaymentDate: paymentDateObj
      },
      include: {
        ExpenseCategories: true,
        Staff: {
          select: {
            id: true,
            fullName: true
          }
        },
        Vendors: {
          select: {
            VendorID: true,
            VendorName: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Gider başarıyla eklendi',
      data: expense
    });

  } catch (error) {
    console.error('Gider ekleme hatası:', error);
    
    // Prisma constraint hatalarını yakala
    if (error.code === 'P2003') {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz kategori, personel veya tedarikçi ID'
      });
    }
    
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Bu gider zaten kayıtlı'
      });
    }
    
    // PostgreSQL constraint hatası
    if (error.message.includes('Expenses_ExpenseType_check')) {
      return res.status(400).json({
        success: false,
        message: 'expenseType sadece "staff", "vendor" veya "general" olabilir'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Gider eklenemedi',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Sunucu hatası'
    });
  }
};

// 📝 GİDER GÜNCELLE
export const updateExpense = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const updateData = req.body;

    // Gider kontrolü
    const expense = await prisma.expenses.findFirst({
      where: {
        ExpenseID: parseInt(id),
        AccountID: accountId
      }
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Gider bulunamadı'
      });
    }

    // ✅ TIMEZONE FIX: UTC tarih güncelleme (Prisma uyumlu)
    let expenseDateObj = expense.ExpenseDate;
    if (updateData.expenseDate) {
      const [year, month, day] = updateData.expenseDate.split('-').map(Number);
      expenseDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    let paymentDateObj = expense.PaymentDate;
    if (updateData.paymentDate) {
      const [year, month, day] = updateData.paymentDate.split('-').map(Number);
      paymentDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    // Güncelle
    const updatedExpense = await prisma.expenses.update({
      where: {
        ExpenseID: parseInt(id)
      },
      data: {
        CategoryID: updateData.categoryId || expense.CategoryID,
        ExpenseDate: expenseDateObj,
        Amount: updateData.amount ? parseFloat(updateData.amount) : expense.Amount,
        CurrencyCode: updateData.currencyCode || expense.CurrencyCode,
        Description: updateData.description !== undefined ? updateData.description : expense.Description,
        ExpenseType: updateData.expenseType || expense.ExpenseType,
        StaffID: updateData.staffId !== undefined ? updateData.staffId : expense.StaffID,
        VendorID: updateData.vendorId !== undefined ? updateData.vendorId : expense.VendorID,
        PaymentStatus: updateData.paymentStatus || expense.PaymentStatus,
        PaidAmount: updateData.paidAmount !== undefined ? parseFloat(updateData.paidAmount) : expense.PaidAmount,
        PaymentDate: paymentDateObj
      },
      include: {
        ExpenseCategories: true,
        Staff: true,
        Vendors: true
      }
    });

    res.json({
      success: true,
      message: 'Gider başarıyla güncellendi',
      data: updatedExpense
    });

  } catch (error) {
    console.error('Gider güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Gider güncellenemedi',
      error: error.message
    });
  }
};

// 🗑️ GİDER SİL
export const deleteExpense = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    // Gider kontrolü
    const expense = await prisma.expenses.findFirst({
      where: {
        ExpenseID: parseInt(id),
        AccountID: accountId
      }
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Gider bulunamadı'
      });
    }

    // Sil
    await prisma.expenses.delete({
      where: {
        ExpenseID: parseInt(id)
      }
    });

    res.json({
      success: true,
      message: 'Gider başarıyla silindi'
    });

  } catch (error) {
    console.error('Gider silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Gider silinemedi',
      error: error.message
    });
  }
};

// 📂 TÜM KATEGORİLERİ LİSTELE
export const getAllCategories = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { expenseType } = req.query; // 'staff' | 'vendor' | 'general' | undefined

    const categories = await prisma.expenseCategories.findMany({
      where: {
        AccountID: accountId,
        IsActive: true,
        // expenseType verilmişse: o tipe ait VEYA herkese açık (null) kategorileri getir
        ...(expenseType && {
          OR: [
            { ApplicableType: expenseType },
            { ApplicableType: null },
          ],
        }),
      },
      include: {
        _count: {
          select: {
            Expenses: true
          }
        }
      },
      orderBy: {
        CategoryName: 'asc'
      }
    });

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Kategori listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kategoriler listelenemedi',
      error: error.message
    });
  }
};

// ➕ YENİ KATEGORİ EKLE
export const createCategory = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { categoryName, description, applicableType } = req.body;

    if (!categoryName) {
      return res.status(400).json({
        success: false,
        message: 'Kategori adı gerekli'
      });
    }

    const category = await prisma.expenseCategories.create({
      data: {
        AccountID: accountId,
        CategoryName: categoryName,
        Description: description || null,
        ApplicableType: applicableType || null,
      }
    });

    res.status(201).json({
      success: true,
      message: 'Kategori başarıyla eklendi',
      data: category
    });

  } catch (error) {
    console.error('Kategori ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori eklenemedi',
      error: error.message
    });
  }
};

// 📄 TEK KATEGORİ DETAY
export const getCategoryById = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const category = await prisma.expenseCategories.findFirst({
      where: {
        CategoryID: parseInt(id),
        AccountID: accountId
      },
      include: {
        _count: {
          select: {
            Expenses: true
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }

    res.json({
      success: true,
      data: category
    });

  } catch (error) {
    console.error('Kategori detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori bilgisi alınamadı',
      error: error.message
    });
  }
};

// 📝 KATEGORİ GÜNCELLE
export const updateCategory = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { categoryName, description, isActive, applicableType } = req.body;

    const category = await prisma.expenseCategories.findFirst({
      where: {
        CategoryID: parseInt(id),
        AccountID: accountId
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }

    const updatedCategory = await prisma.expenseCategories.update({
      where: {
        CategoryID: parseInt(id)
      },
      data: {
        ...(categoryName && { CategoryName: categoryName }),
        ...(description !== undefined && { Description: description }),
        ...(isActive !== undefined && { IsActive: isActive }),
        ...(applicableType !== undefined && { ApplicableType: applicableType || null }),
      }
    });

    res.json({
      success: true,
      message: 'Kategori başarıyla güncellendi',
      data: updatedCategory
    });

  } catch (error) {
    console.error('Kategori güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori güncellenemedi',
      error: error.message
    });
  }
};

// 🗑️ KATEGORİ SİL
export const deleteCategory = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const category = await prisma.expenseCategories.findFirst({
      where: {
        CategoryID: parseInt(id),
        AccountID: accountId
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }

    // Kategoriye bağlı gider var mı kontrol et
    const expenseCount = await prisma.expenses.count({
      where: {
        CategoryID: parseInt(id)
      }
    });

    if (expenseCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Bu kategoriye bağlı ${expenseCount} adet gider var. Önce giderleri silmelisiniz.`
      });
    }

    await prisma.expenseCategories.delete({
      where: {
        CategoryID: parseInt(id)
      }
    });

    res.json({
      success: true,
      message: 'Kategori başarıyla silindi'
    });

  } catch (error) {
    console.error('Kategori silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori silinemedi',
      error: error.message
    });
  }
};

// 🏢 TÜM TEDARİKÇİLERİ LİSTELE
export const getAllVendors = async (req, res) => {
  try {
    const { accountId } = req.user;

    const vendors = await prisma.vendors.findMany({
      where: {
        AccountID: accountId
      },
      include: {
        _count: {
          select: {
            Expenses: true
          }
        }
      },
      orderBy: {
        VendorName: 'asc'
      }
    });

    res.json({
      success: true,
      data: vendors
    });

  } catch (error) {
    console.error('Tedarikçi listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Tedarikçiler listelenemedi',
      error: error.message
    });
  }
};

// ➕ YENİ TEDARİKÇİ EKLE
export const createVendor = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { vendorName, contactPerson, phone, email, address } = req.body;

    if (!vendorName) {
      return res.status(400).json({
        success: false,
        message: 'Tedarikçi adı gerekli'
      });
    }

    const vendor = await prisma.vendors.create({
      data: {
        AccountID: accountId,
        VendorName: vendorName,
        ContactPerson: contactPerson || null,
        Phone: phone || null,
        Email: email || null,
        Address: address || null
      }
    });

    res.status(201).json({
      success: true,
      message: 'Tedarikçi başarıyla eklendi',
      data: vendor
    });

  } catch (error) {
    console.error('Tedarikçi ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Tedarikçi eklenemedi',
      error: error.message
    });
  }
};

// 📄 TEK TEDARİKÇİ DETAY
export const getVendorById = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const vendor = await prisma.vendors.findFirst({
      where: {
        VendorID: parseInt(id),
        AccountID: accountId
      },
      include: {
        _count: {
          select: {
            Expenses: true
          }
        }
      }
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Tedarikçi bulunamadı'
      });
    }

    res.json({
      success: true,
      data: vendor
    });

  } catch (error) {
    console.error('Tedarikçi detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Tedarikçi bilgisi alınamadı',
      error: error.message
    });
  }
};

// 📝 TEDARİKÇİ GÜNCELLE
export const updateVendor = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { vendorName, contactPerson, phone, email, address } = req.body;

    const vendor = await prisma.vendors.findFirst({
      where: {
        VendorID: parseInt(id),
        AccountID: accountId
      }
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Tedarikçi bulunamadı'
      });
    }

    const updatedVendor = await prisma.vendors.update({
      where: {
        VendorID: parseInt(id)
      },
      data: {
        ...(vendorName && { VendorName: vendorName }),
        ...(contactPerson !== undefined && { ContactPerson: contactPerson }),
        ...(phone !== undefined && { Phone: phone }),
        ...(email !== undefined && { Email: email }),
        ...(address !== undefined && { Address: address })
      }
    });

    res.json({
      success: true,
      message: 'Tedarikçi başarıyla güncellendi',
      data: updatedVendor
    });

  } catch (error) {
    console.error('Tedarikçi güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Tedarikçi güncellenemedi',
      error: error.message
    });
  }
};

// 🗑️ TEDARİKÇİ SİL
export const deleteVendor = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const vendor = await prisma.vendors.findFirst({
      where: {
        VendorID: parseInt(id),
        AccountID: accountId
      }
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Tedarikçi bulunamadı'
      });
    }

    // Tedarikçiye bağlı gider var mı kontrol et
    const expenseCount = await prisma.expenses.count({
      where: {
        VendorID: parseInt(id)
      }
    });

    if (expenseCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Bu tedarikçiye bağlı ${expenseCount} adet gider var. Önce giderleri silmelisiniz.`
      });
    }

    await prisma.vendors.delete({
      where: {
        VendorID: parseInt(id)
      }
    });

    res.json({
      success: true,
      message: 'Tedarikçi başarıyla silindi'
    });

  } catch (error) {
    console.error('Tedarikçi silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Tedarikçi silinemedi',
      error: error.message
    });
  }
};

// 📊 RAPOR: PERSONEL BAZLI GİDERLER
export const getStaffExpenseReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { period, startDate, endDate } = req.query;

    // ✅ TIMEZONE FIX: UTC tarih filtresi (Prisma uyumlu)
    let dateFilter = {};
    
    if (period && period !== 'custom') {
      const range = getDateRange(period);
      if (range) {
        dateFilter = {
          gte: range.startDate,
          lte: range.endDate
        };
      }
    } else if (startDate || endDate) {
      if (startDate) {
        // "2025-01-01" -> UTC Date object
        const [year, month, day] = startDate.split('-').map(Number);
        const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        dateFilter.gte = start;
      }
      if (endDate) {
        // "2025-01-31" -> UTC Date object (gün sonu)
        const [year, month, day] = endDate.split('-').map(Number);
        const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        dateFilter.lte = end;
      }
    }

    // WHERE clause
    const whereClause = {
      AccountID: accountId,
      ExpenseType: 'staff', // Sadece personel giderleri
      ...(Object.keys(dateFilter).length > 0 && { ExpenseDate: dateFilter })
    };

    // Personel bazlı giderleri grupla
    const staffExpenses = await prisma.expenses.groupBy({
      by: ['StaffID'],
      where: whereClause,
      _sum: {
        Amount: true,
        PaidAmount: true
      },
      _count: {
        ExpenseID: true
      }
    });

    // Staff bilgilerini çek
    const staffIds = staffExpenses.map(e => e.StaffID).filter(id => id !== null);
    const staffDetails = await prisma.staff.findMany({
      where: {
        id: { in: staffIds },
        accountId: accountId
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        phone: true
      }
    });

    // Staff bilgileriyle birleştir
    const result = staffExpenses.map(expense => {
      const staff = staffDetails.find(s => s.id === expense.StaffID);
      const totalAmount = parseFloat(expense._sum.Amount || 0);
      const totalPaid = parseFloat(expense._sum.PaidAmount || 0);
      
      return {
        staffId: expense.StaffID,
        staffName: staff?.fullName || 'Bilinmiyor',
        staffRole: staff?.role || null,
        staffPhone: staff?.phone || null,
        totalExpense: totalAmount,
        totalPaid: totalPaid,
        totalUnpaid: totalAmount - totalPaid,
        expenseCount: expense._count.ExpenseID
      };
    });

    // Toplam özet
    const totalExpense = result.reduce((sum, item) => sum + item.totalExpense, 0);
    const totalPaid = result.reduce((sum, item) => sum + item.totalPaid, 0);

    res.json({
      success: true,
      data: result.sort((a, b) => b.totalExpense - a.totalExpense), // En yüksek gider önce
      summary: {
        totalStaff: result.length,
        totalExpense: parseFloat(totalExpense.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        totalUnpaid: parseFloat((totalExpense - totalPaid).toFixed(2))
      },
      filter: {
        period: period || null,
        startDate: startDate || null,
        endDate: endDate || null
      }
    });

  } catch (error) {
    console.error('Personel gider raporu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Personel gider raporu alınamadı',
      error: error.message
    });
  }
};

// 📊 RAPOR: GENEL GİDERLER (Kategori bazlı)
export const getGeneralExpenseReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { period, startDate, endDate, paymentStatus } = req.query;

    let dateFilter = {};

    if (period && period !== 'custom') {
      const range = getDateRange(period);
      if (range) {
        dateFilter = {
          gte: range.startDate,
          lte: range.endDate
        };
      }
    } else if (startDate || endDate) {
      if (startDate) {
        const [year, month, day] = startDate.split('-').map(Number);
        dateFilter.gte = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      }
      if (endDate) {
        const [year, month, day] = endDate.split('-').map(Number);
        dateFilter.lte = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      }
    }

    // "Tüm Giderler" — ExpenseType filtresi YOK, tüm türler dahil
    const whereClause = {
      AccountID: accountId,
      ...(Object.keys(dateFilter).length > 0 && { ExpenseDate: dateFilter }),
      ...(paymentStatus && { PaymentStatus: paymentStatus })
    };

    // Kategori bazlı grupla
    const categoryExpenses = await prisma.expenses.groupBy({
      by: ['CategoryID'],
      where: whereClause,
      _sum: {
        Amount: true,
        PaidAmount: true
      },
      _count: {
        ExpenseID: true
      }
    });

    const categoryIds = categoryExpenses.map(e => e.CategoryID).filter(id => id !== null);
    const categoryDetails = await prisma.expenseCategories.findMany({
      where: {
        CategoryID: { in: categoryIds },
        AccountID: accountId
      },
      select: {
        CategoryID: true,
        CategoryName: true,
        Description: true
      }
    });

    // Son gider kayıtlarını da çek (her kategoriden)
    const recentExpenses = await prisma.expenses.findMany({
      where: whereClause,
      select: {
        ExpenseID: true,
        CategoryID: true,
        ExpenseDate: true,
        Amount: true,
        PaidAmount: true,
        Description: true,
        PaymentStatus: true
      },
      orderBy: { ExpenseDate: 'desc' },
      take: 100
    });

    const result = categoryExpenses.map(expense => {
      const category = categoryDetails.find(c => c.CategoryID === expense.CategoryID);
      const totalAmount = parseFloat(expense._sum.Amount || 0);
      const totalPaid = parseFloat(expense._sum.PaidAmount || 0);
      const expenses = recentExpenses
        .filter(e => e.CategoryID === expense.CategoryID)
        .map(e => ({
          expenseId: e.ExpenseID,
          date: e.ExpenseDate,
          amount: parseFloat(e.Amount),
          paidAmount: parseFloat(e.PaidAmount || 0),
          description: e.Description,
          paymentStatus: e.PaymentStatus
        }));

      return {
        categoryId: expense.CategoryID,
        categoryName: category?.CategoryName || 'Kategori Yok',
        categoryDescription: category?.Description || null,
        totalExpense: totalAmount,
        totalPaid: totalPaid,
        totalUnpaid: totalAmount - totalPaid,
        expenseCount: expense._count.ExpenseID,
        expenses
      };
    });

    const totalExpense = result.reduce((sum, item) => sum + item.totalExpense, 0);
    const totalPaid = result.reduce((sum, item) => sum + item.totalPaid, 0);

    res.json({
      success: true,
      data: result.sort((a, b) => b.totalExpense - a.totalExpense),
      summary: {
        totalCategories: result.length,
        totalExpense: parseFloat(totalExpense.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        totalUnpaid: parseFloat((totalExpense - totalPaid).toFixed(2))
      },
      filter: {
        period: period || null,
        startDate: startDate || null,
        endDate: endDate || null,
        paymentStatus: paymentStatus || null
      }
    });

  } catch (error) {
    console.error('Genel gider raporu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Genel gider raporu alınamadı',
      error: error.message
    });
  }
};

// 📊 RAPOR: TEDARİKÇİ BAZLI GİDERLER
export const getVendorExpenseReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { period, startDate, endDate, paymentStatus } = req.query;

    // ✅ TIMEZONE FIX: UTC tarih filtresi (Prisma uyumlu)
    let dateFilter = {};
    
    if (period && period !== 'custom') {
      const range = getDateRange(period);
      if (range) {
        dateFilter = {
          gte: range.startDate,
          lte: range.endDate
        };
      }
    } else if (startDate || endDate) {
      if (startDate) {
        // "2025-01-01" -> UTC Date object
        const [year, month, day] = startDate.split('-').map(Number);
        const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        dateFilter.gte = start;
      }
      if (endDate) {
        // "2025-01-31" -> UTC Date object (gün sonu)
        const [year, month, day] = endDate.split('-').map(Number);
        const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        dateFilter.lte = end;
      }
    }

    // WHERE clause
    const whereClause = {
      AccountID: accountId,
      ExpenseType: 'vendor', // Sadece tedarikçi giderleri
      ...(Object.keys(dateFilter).length > 0 && { ExpenseDate: dateFilter }),
      ...(paymentStatus && { PaymentStatus: paymentStatus })
    };

    // Tedarikçi bazlı giderleri grupla
    const vendorExpenses = await prisma.expenses.groupBy({
      by: ['VendorID'],
      where: whereClause,
      _sum: {
        Amount: true,
        PaidAmount: true
      },
      _count: {
        ExpenseID: true
      }
    });

    // Vendor bilgilerini çek
    const vendorIds = vendorExpenses.map(e => e.VendorID).filter(id => id !== null);
    const vendorDetails = await prisma.vendors.findMany({
      where: {
        VendorID: { in: vendorIds },
        AccountID: accountId
      },
      select: {
        VendorID: true,
        VendorName: true,
        ContactPerson: true,
        Phone: true,
        Email: true
      }
    });

    // Vendor bilgileriyle birleştir
    const result = vendorExpenses.map(expense => {
      const vendor = vendorDetails.find(v => v.VendorID === expense.VendorID);
      const totalAmount = parseFloat(expense._sum.Amount || 0);
      const totalPaid = parseFloat(expense._sum.PaidAmount || 0);
      
      return {
        vendorId: expense.VendorID,
        vendorName: vendor?.VendorName || 'Bilinmiyor',
        contactPerson: vendor?.ContactPerson || null,
        phone: vendor?.Phone || null,
        email: vendor?.Email || null,
        totalExpense: totalAmount,
        totalPaid: totalPaid,
        totalUnpaid: totalAmount - totalPaid,
        expenseCount: expense._count.ExpenseID
      };
    });

    // Toplam özet
    const totalExpense = result.reduce((sum, item) => sum + item.totalExpense, 0);
    const totalPaid = result.reduce((sum, item) => sum + item.totalPaid, 0);

    res.json({
      success: true,
      data: result.sort((a, b) => b.totalExpense - a.totalExpense), // En yüksek gider önce
      summary: {
        totalVendors: result.length,
        totalExpense: parseFloat(totalExpense.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        totalUnpaid: parseFloat((totalExpense - totalPaid).toFixed(2))
      },
      filter: {
        period: period || null,
        startDate: startDate || null,
        endDate: endDate || null,
        paymentStatus: paymentStatus || null
      }
    });

  } catch (error) {
    console.error('Tedarikçi gider raporu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Tedarikçi gider raporu alınamadı',
      error: error.message
    });
  }
};

