import prisma from '../lib/prisma.js';

/**
 * 📊 GELİR-GİDER ÖZET RAPORU
 * 
 * İşletmenin finansal durumunu gösterir:
 * - Toplam Ciro (Gelir)
 * - Toplam Gider
 * - Net Kar/Zarar
 * - Kar Marjı %
 */
export const getIncomeExpenseSummary = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { period, startDate, endDate } = req.query;

    console.log('📊 Gelir-Gider Raporu İsteği:');
    console.log('- accountId:', accountId);
    console.log('- period:', period);
    console.log('- startDate:', startDate);
    console.log('- endDate:', endDate);
    console.log('- Request Query:', req.query);

    // Tarih filtresi oluştur
    let dateFilter = {};
    let periodLabel = '';

    // ÖNCE startDate ve endDate kontrol et (frontend'den gelen custom tarih)
    if (startDate && endDate) {
      // Custom tarih aralığı
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      dateFilter = {
        gte: start,
        lte: end
      };
      
      // Tarih aralığını Türkçe formatla
      const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      const startDay = start.getDate();
      const startMonth = monthNames[start.getMonth()];
      const endDay = end.getDate();
      const endMonth = monthNames[end.getMonth()];
      const endYear = end.getFullYear();
      
      // Aynı ay içindeyse: "5 - 12 Şub 2026"
      // Farklı aylardaysa: "28 Oca - 5 Şub 2026"
      if (start.getMonth() === end.getMonth()) {
        periodLabel = `${startDay} - ${endDay} ${endMonth} ${endYear}`;
      } else {
        periodLabel = `${startDay} ${startMonth} - ${endDay} ${endMonth} ${endYear}`;
      }
      
      console.log('🗓️ Custom Tarih Aralığı Kullanılıyor:');
      console.log('  - Başlangıç:', start.toISOString());
      console.log('  - Bitiş:', end.toISOString());
      console.log('  - Label:', periodLabel);
    } else {
      // Preset periyotlar
      const now = new Date();
      
      switch (period) {
        case 'today':
          // Bugünün başlangıcı ve sonu - UTC tarih olarak
          const todayNow = new Date();
          const todayStart = new Date(Date.UTC(
            todayNow.getUTCFullYear(),
            todayNow.getUTCMonth(),
            todayNow.getUTCDate(),
            0, 0, 0, 0
          ));
          const todayEnd = new Date(Date.UTC(
            todayNow.getUTCFullYear(),
            todayNow.getUTCMonth(),
            todayNow.getUTCDate(),
            23, 59, 59, 999
          ));
          
          console.log('🗓️ TODAY Hesaplama:');
          console.log('  - Bugün (now):', todayNow.toISOString());
          console.log('  - UTC Date:', todayNow.getUTCDate());
          console.log('  - UTC Month:', todayNow.getUTCMonth());
          console.log('  - UTC Year:', todayNow.getUTCFullYear());
          console.log('  - todayStart (ISO):', todayStart.toISOString());
          console.log('  - todayEnd (ISO):', todayEnd.toISOString());
          
          dateFilter = {
            gte: todayStart,
            lte: todayEnd
          };
          periodLabel = 'Bugün';
          break;
          
        case 'yesterday':
          // Dünün başlangıcı ve sonu - UTC tarih olarak
          const yesterdayNow = new Date();
          const yesterdayStart = new Date(Date.UTC(
            yesterdayNow.getUTCFullYear(),
            yesterdayNow.getUTCMonth(),
            yesterdayNow.getUTCDate() - 1,
            0, 0, 0, 0
          ));
          const yesterdayEnd = new Date(Date.UTC(
            yesterdayNow.getUTCFullYear(),
            yesterdayNow.getUTCMonth(),
            yesterdayNow.getUTCDate() - 1,
            23, 59, 59, 999
          ));
          
          dateFilter = {
            gte: yesterdayStart,
            lte: yesterdayEnd
          };
          periodLabel = 'Dün';
          break;
          
        case 'this_week':
          // Bu haftanın Pazartesi'si ve bugünün sonu - UTC olarak
          const weekNow = new Date();
          
          // UTC tarihine göre haftanın günü
          const weekDayOfWeek = weekNow.getUTCDay();
          const daysToMonday = weekDayOfWeek === 0 ? 6 : weekDayOfWeek - 1;
          
          const weekStartUTC = new Date(Date.UTC(
            weekNow.getUTCFullYear(),
            weekNow.getUTCMonth(),
            weekNow.getUTCDate() - daysToMonday,
            0, 0, 0, 0
          ));
          
          const weekEnd = new Date(Date.UTC(
            weekNow.getUTCFullYear(),
            weekNow.getUTCMonth(),
            weekNow.getUTCDate(),
            23, 59, 59, 999
          ));
          
          dateFilter = {
            gte: weekStartUTC,
            lte: weekEnd
          };
          periodLabel = 'Bu Hafta';
          break;
          
        case 'last_week':
          const lastWeekStart = new Date();
          const lastWeekDayOfWeek = lastWeekStart.getDay();
          const daysToLastMonday = lastWeekDayOfWeek === 0 ? 13 : lastWeekDayOfWeek + 6;
          lastWeekStart.setDate(lastWeekStart.getDate() - daysToLastMonday);
          lastWeekStart.setHours(0, 0, 0, 0);
          
          const lastWeekEnd = new Date(lastWeekStart);
          lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
          lastWeekEnd.setHours(23, 59, 59, 999);
          
          dateFilter = {
            gte: lastWeekStart,
            lte: lastWeekEnd
          };
          periodLabel = 'Geçen Hafta';
          break;
          
        case 'this_month':
          // UTC olarak ayın 1'ini oluştur
          const now_month = new Date();
          const monthStart = new Date(Date.UTC(
            now_month.getFullYear(),
            now_month.getMonth(),
            1,
            0, 0, 0, 0
          ));
          
          console.log('🗓️ THIS_MONTH Hesaplama:');
          console.log('  - Bugün (now):', now.toISOString());
          console.log('  - monthStart (ISO):', monthStart.toISOString());
          console.log('  - monthStart tarih:', monthStart.toISOString().split('T')[0]);
          
          dateFilter = {
            gte: monthStart,
            lte: now
          };
          periodLabel = 'Bu Ay';
          break;
          
        case 'last_month':
          // Geçen ayın ilk ve son günü (UTC)
          const lastMonth_now = new Date();
          const lastMonthStart = new Date(Date.UTC(
            lastMonth_now.getFullYear(),
            lastMonth_now.getMonth() - 1,
            1,
            0, 0, 0, 0
          ));
          
          const lastMonthEnd = new Date(Date.UTC(
            lastMonth_now.getFullYear(),
            lastMonth_now.getMonth(),
            0,
            23, 59, 59, 999
          ));
          
          dateFilter = {
            gte: lastMonthStart,
            lte: lastMonthEnd
          };
          periodLabel = 'Geçen Ay';
          break;
          
        case 'this_year':
          const yearStart = new Date(Date.UTC(now.getFullYear(), 0, 1, 0, 0, 0, 0));
          
          dateFilter = {
            gte: yearStart,
            lte: now
          };
          periodLabel = 'Bu Yıl';
          break;
          
        default:
          // Default: Bu ay
          const default_now = new Date();
          const defaultStart = new Date(Date.UTC(
            default_now.getFullYear(),
            default_now.getMonth(),
            1,
            0, 0, 0, 0
          ));
          
          dateFilter = {
            gte: defaultStart,
            lte: now
          };
          periodLabel = 'Bu Ay';
      }
    }

    console.log('📅 Tarih Filtresi:', dateFilter);

    // ===================================================
    // 💰 GELİRLER (INCOME) - Tamamlanan Ödemeler
    // ===================================================
    
    // NOT: COMPLETED durumundaki ödemeler kasaya GİRMİŞ gerçek gelirlerdir
    // Her satışta birden fazla ödeme olabilir (kısmi ödemeler)
    // PENDING durumundaki ödemeler henüz alınmamış, gelir sayılmaz
    
    const paymentsWhereClause = {
      status: 'COMPLETED', // Sadece tamamlanmış ödemeler (kasaya girmiş)
      sale: {
        accountId: accountId,
        isDeleted: false
      }
    };

    if (Object.keys(dateFilter).length > 0) {
      paymentsWhereClause.paymentDate = dateFilter;
    }

    console.log('💰 Gelir Analizi Başlıyor...');

    // Tüm tamamlanan ödemeleri çek
    const payments = await prisma.payments.findMany({
      where: paymentsWhereClause,
      include: {
        sale: {
          include: {
            client: {
              select: {
                firstName: true,
                lastName: true
              }
            },
            service: {
              select: {
                serviceName: true
              }
            }
          }
        }
      }
    });

    console.log(`- Toplam ${payments.length} COMPLETED ödeme bulundu`);

    // Gelir hesaplamaları
    let totalIncome = 0;
    const incomeByPaymentMethod = {
      CASH: 0,
      CREDIT_CARD: 0,
      TRANSFER: 0,
      OTHER: 0
    };

    payments.forEach(payment => {
      const amount = parseFloat(payment.amountPaid);
      totalIncome += amount;
      incomeByPaymentMethod[payment.paymentMethod] += amount;
    });

    console.log('📊 Gelir Yöntemi Dağılımı:');
    console.log('- Nakit:', incomeByPaymentMethod.CASH.toFixed(2), 'TL');
    console.log('- Kredi Kartı:', incomeByPaymentMethod.CREDIT_CARD.toFixed(2), 'TL');
    console.log('- Transfer:', incomeByPaymentMethod.TRANSFER.toFixed(2), 'TL');
    console.log('- Diğer:', incomeByPaymentMethod.OTHER.toFixed(2), 'TL');
    console.log('- TOPLAM GELİR:', totalIncome.toFixed(2), 'TL');
    console.log('---');

    // ===================================================
    // 💸 GİDERLER (EXPENSES)
    // ===================================================
    
    const expensesWhereClause = {
      AccountID: accountId
    };

    if (Object.keys(dateFilter).length > 0) {
      expensesWhereClause.ExpenseDate = dateFilter;
    }

    // Tüm giderleri çek
    const expenses = await prisma.expenses.findMany({
      where: expensesWhereClause,
      include: {
        ExpenseCategories: {
          select: {
            CategoryName: true
          }
        },
        Staff: {
          select: {
            fullName: true
          }
        },
        Vendors: {
          select: {
            VendorName: true
          }
        }
      }
    });

    // Gider hesaplamaları
    let totalExpenses = 0;
    const expensesByType = {
      staff: 0,
      vendor: 0,
      other: 0
    };
    const expensesByCategory = {};
    const expensesByPaymentStatus = {
      paid: 0,
      pending: 0,
      partial: 0
    };

    console.log('💸 Gider Analizi Başlıyor...');
    console.log(`- Toplam ${expenses.length} gider kaydı bulundu`);

    expenses.forEach(expense => {
      const amount = parseFloat(expense.Amount);
      const paidAmount = parseFloat(expense.PaidAmount || 0);
      
      totalExpenses += amount;
      
      // Tip bazında grupla (general -> other mapping)
      if (expense.ExpenseType) {
        let expenseType = expense.ExpenseType;
        
        // "general" tipini "other" kategorisine map et
        if (expenseType === 'general') {
          expenseType = 'other';
        }
        
        // staff, vendor, other kategorilerine ata
        if (expenseType === 'staff' || expenseType === 'vendor' || expenseType === 'other') {
          expensesByType[expenseType] = (expensesByType[expenseType] || 0) + amount;
        } else {
          // Tanımlanmamış tipler de "other"a gitsin
          expensesByType.other += amount;
        }
      } else {
        // ExpenseType null/undefined ise "other"a ata
        expensesByType.other += amount;
      }
      
      // Kategori bazında grupla
      const categoryName = expense.ExpenseCategories?.CategoryName || 'Kategorisiz';
      expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + amount;
      
      // Ödeme durumu
      if (paidAmount >= amount) {
        expensesByPaymentStatus.paid += amount;
      } else if (paidAmount > 0) {
        expensesByPaymentStatus.partial += amount;
      } else {
        expensesByPaymentStatus.pending += amount;
      }
    });

    console.log('📊 Gider Tipi Dağılımı:');
    console.log('- Staff:', expensesByType.staff.toFixed(2), 'TL');
    console.log('- Vendor:', expensesByType.vendor.toFixed(2), 'TL');
    console.log('- Other (general dahil):', expensesByType.other.toFixed(2), 'TL');
    console.log('- Toplam:', totalExpenses.toFixed(2), 'TL');

    // ===================================================
    // 📊 HESAPLAMALAR VE SONUÇLAR
    // ===================================================
    
    const netProfit = totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100) : 0;

    // Son 30 gün karşılaştırması için (trend analizi)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const previousPeriodPayments = await prisma.payments.aggregate({
      where: {
        status: 'COMPLETED',
        paymentDate: {
          gte: thirtyDaysAgo,
          lt: dateFilter.gte || new Date()
        },
        sale: {
          accountId: accountId,
          isDeleted: false
        }
      },
      _sum: {
        amountPaid: true
      }
    });

    const previousPeriodExpenses = await prisma.expenses.aggregate({
      where: {
        AccountID: accountId,
        ExpenseDate: {
          gte: thirtyDaysAgo,
          lt: dateFilter.gte || new Date()
        }
      },
      _sum: {
        Amount: true
      }
    });

    const previousIncome = parseFloat(previousPeriodPayments._sum.amountPaid || 0);
    const previousExpenses = parseFloat(previousPeriodExpenses._sum.Amount || 0);
    const previousProfit = previousIncome - previousExpenses;

    // Değişim yüzdeleri
    const incomeChange = previousIncome > 0 ? (((totalIncome - previousIncome) / previousIncome) * 100) : 0;
    const expenseChange = previousExpenses > 0 ? (((totalExpenses - previousExpenses) / previousExpenses) * 100) : 0;
    const profitChange = previousProfit !== 0 ? (((netProfit - previousProfit) / Math.abs(previousProfit)) * 100) : 0;

    // ===================================================
    // 📤 RESPONSE
    // ===================================================
    
    res.json({
      success: true,
      data: {
        // Özet
        summary: {
          totalIncome: parseFloat(totalIncome.toFixed(2)),
          totalExpenses: parseFloat(totalExpenses.toFixed(2)),
          netProfit: parseFloat(netProfit.toFixed(2)),
          profitMargin: parseFloat(profitMargin.toFixed(2)),
          status: netProfit >= 0 ? 'profit' : 'loss', // KAR mı ZARAR mı
          formatted: {
            totalIncome: `${totalIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            totalExpenses: `${totalExpenses.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            netProfit: `${netProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            profitMargin: `%${profitMargin.toFixed(2)}`
          }
        },

        // Gelir detayları
        income: {
          total: parseFloat(totalIncome.toFixed(2)),
          count: payments.length,
          byPaymentMethod: {
            cash: parseFloat(incomeByPaymentMethod.CASH.toFixed(2)),
            creditCard: parseFloat(incomeByPaymentMethod.CREDIT_CARD.toFixed(2)),
            transfer: parseFloat(incomeByPaymentMethod.TRANSFER.toFixed(2)),
            other: parseFloat(incomeByPaymentMethod.OTHER.toFixed(2))
          },
          formatted: {
            total: `${totalIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            cash: `${incomeByPaymentMethod.CASH.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            creditCard: `${incomeByPaymentMethod.CREDIT_CARD.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            transfer: `${incomeByPaymentMethod.TRANSFER.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            other: `${incomeByPaymentMethod.OTHER.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
          }
        },

        // Gider detayları
        expenses: {
          total: parseFloat(totalExpenses.toFixed(2)),
          count: expenses.length,
          byType: {
            staff: parseFloat((expensesByType.staff || 0).toFixed(2)),
            vendor: parseFloat((expensesByType.vendor || 0).toFixed(2)),
            other: parseFloat((expensesByType.other || 0).toFixed(2))
          },
          byCategory: Object.keys(expensesByCategory).reduce((acc, key) => {
            acc[key] = parseFloat(expensesByCategory[key].toFixed(2));
            return acc;
          }, {}),
          byPaymentStatus: {
            paid: parseFloat(expensesByPaymentStatus.paid.toFixed(2)),
            pending: parseFloat(expensesByPaymentStatus.pending.toFixed(2)),
            partial: parseFloat(expensesByPaymentStatus.partial.toFixed(2))
          },
          formatted: {
            total: `${totalExpenses.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            staff: `${(expensesByType.staff || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            vendor: `${(expensesByType.vendor || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            other: `${(expensesByType.other || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
          }
        },

        // Trend (önceki döneme göre değişim)
        trends: {
          income: {
            previous: parseFloat(previousIncome.toFixed(2)),
            current: parseFloat(totalIncome.toFixed(2)),
            change: parseFloat(incomeChange.toFixed(2)),
            direction: incomeChange >= 0 ? 'up' : 'down'
          },
          expenses: {
            previous: parseFloat(previousExpenses.toFixed(2)),
            current: parseFloat(totalExpenses.toFixed(2)),
            change: parseFloat(expenseChange.toFixed(2)),
            direction: expenseChange >= 0 ? 'up' : 'down'
          },
          profit: {
            previous: parseFloat(previousProfit.toFixed(2)),
            current: parseFloat(netProfit.toFixed(2)),
            change: parseFloat(profitChange.toFixed(2)),
            direction: profitChange >= 0 ? 'up' : 'down'
          }
        },

        // Periyot bilgisi
        period: {
          label: periodLabel,
          type: period || 'custom',
          startDate: dateFilter.gte?.toISOString().split('T')[0],
          endDate: dateFilter.lte?.toISOString().split('T')[0]
        },

        // Meta bilgiler
        meta: {
          generatedAt: new Date().toISOString(),
          currency: 'TRY'
        }
      }
    });

  } catch (error) {
    console.error('❌ Gelir-Gider raporu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Gelir-Gider raporu alınırken hata oluştu',
      error: error.message
    });
  }
};


/**
 * 🔍 DEBUG: ÖDEMELERİ KONTROL ET
 * Neden bazı ödemeler eksik diye kontrol için
 */
export const debugPayments = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
    }

    // TÜM ödemeleri çek (status fark etmeksizin)
    const allPayments = await prisma.payments.findMany({
      where: {
        paymentDate: dateFilter,
        sale: {
          accountId: accountId,
          isDeleted: false
        }
      },
      include: {
        sale: {
          include: {
            client: {
              select: {
                firstName: true,
                lastName: true
              }
            },
            service: {
              select: {
                serviceName: true
              }
            }
          }
        }
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });

    // Status'a göre grupla
    const byStatus = {
      COMPLETED: { count: 0, total: 0, payments: [] },
      PENDING: { count: 0, total: 0, payments: [] },
      FAILED: { count: 0, total: 0, payments: [] },
      REFUNDED: { count: 0, total: 0, payments: [] }
    };

    allPayments.forEach(p => {
      const amount = parseFloat(p.amountPaid);
      byStatus[p.status].count++;
      byStatus[p.status].total += amount;
      byStatus[p.status].payments.push({
        id: p.id,
        date: p.paymentDate,
        amount: amount,
        method: p.paymentMethod,
        client: `${p.sale.client.firstName} ${p.sale.client.lastName}`,
        service: p.sale.service.serviceName
      });
    });

    const grandTotal = allPayments.reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    res.json({
      success: true,
      data: {
        summary: {
          totalPayments: allPayments.length,
          grandTotal: parseFloat(grandTotal.toFixed(2))
        },
        byStatus: {
          COMPLETED: {
            count: byStatus.COMPLETED.count,
            total: parseFloat(byStatus.COMPLETED.total.toFixed(2)),
            payments: byStatus.COMPLETED.payments
          },
          PENDING: {
            count: byStatus.PENDING.count,
            total: parseFloat(byStatus.PENDING.total.toFixed(2)),
            payments: byStatus.PENDING.payments
          },
          FAILED: {
            count: byStatus.FAILED.count,
            total: parseFloat(byStatus.FAILED.total.toFixed(2)),
            payments: byStatus.FAILED.payments
          },
          REFUNDED: {
            count: byStatus.REFUNDED.count,
            total: parseFloat(byStatus.REFUNDED.total.toFixed(2)),
            payments: byStatus.REFUNDED.payments
          }
        },
        filter: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });

  } catch (error) {
    console.error('❌ Debug payments hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Debug payments hatası',
      error: error.message
    });
  }
};


/**
 * 💎 MÜŞTERİ SADAKAT RAPORU
 * 
 * Müşterilerin sadakat seviyelerini analiz eder:
 * - Müşteri Yaşam Boyu Değeri (LTV)
 * - Tekrar Gelme Oranı
 * - En Sadık Müşteriler
 * - Kayıp Müşteriler (Churn)
 */
export const getCustomerLoyaltyReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { minPurchases, sortBy = 'ltv' } = req.query;

    console.log('💎 Müşteri Sadakat Raporu İsteği:');
    console.log('- accountId:', accountId);

    // Tüm müşterileri ve satışlarını çek
    const clients = await prisma.clients.findMany({
      where: {
        accountId: accountId,
        isActive: true
      },
      include: {
        sales: {
          where: {
            isDeleted: false
          },
          include: {
            payments: {
              where: {
                status: 'COMPLETED'
              }
            }
          },
          orderBy: {
            saleDate: 'asc'
          }
        }
      }
    });

    console.log('👥 Toplam aktif müşteri:', clients.length);

    const now = new Date();
    const loyaltyData = [];

    clients.forEach(client => {
      // ✅ Satış yapmamış müşterileri de dahil et
      const purchaseCount = client.sales.length;
      
      // Toplam harcama (LTV) - Sadece COMPLETED ödemeler
      let totalSpent = 0;
      client.sales.forEach(sale => {
        const paidForSale = sale.payments.reduce((sum, p) => {
          const amount = parseFloat(p.amountPaid);
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0);
        totalSpent += paidForSale;
      });

      // İlk ve son satış tarihi (satış yoksa müşteri oluşturma tarihini kullan)
      const firstPurchaseDate = purchaseCount > 0 
        ? new Date(client.sales[0].saleDate) 
        : new Date(client.createdAt);
      const lastPurchaseDate = purchaseCount > 0 
        ? new Date(client.sales[client.sales.length - 1].saleDate)
        : new Date(client.createdAt);
      
      // Müşteri yaşı (gün)
      const customerAgeInDays = Math.floor((now - firstPurchaseDate) / (1000 * 60 * 60 * 24));
      
      // Son alışverişten bu yana geçen gün
      const daysSinceLastPurchase = Math.floor((now - lastPurchaseDate) / (1000 * 60 * 60 * 24));
      
      // Ortalama sipariş değeri
      const averageOrderValue = purchaseCount > 0 ? totalSpent / purchaseCount : 0;
      
      // Ortalama alışveriş sıklığı (gün)
      const averagePurchaseFrequency = purchaseCount > 1 
        ? customerAgeInDays / (purchaseCount - 1)
        : null;

      // Sadakat skoru hesapla (0-100)
      let loyaltyScore = 0;
      
      // 1. Satın alma sayısına göre puan (max 30)
      loyaltyScore += Math.min(30, purchaseCount * 3);
      
      // 2. Toplam harcamaya göre puan (max 30)
      loyaltyScore += Math.min(30, (totalSpent / 1000) * 2);
      
      // 3. Müşteri yaşına göre puan (max 20)
      loyaltyScore += Math.min(20, (customerAgeInDays / 30) * 2);
      
      // 4. Yakın zamanlı aktiviteye göre puan (max 20)
      if (daysSinceLastPurchase <= 30) {
        loyaltyScore += 20;
      } else if (daysSinceLastPurchase <= 60) {
        loyaltyScore += 15;
      } else if (daysSinceLastPurchase <= 90) {
        loyaltyScore += 10;
      } else if (daysSinceLastPurchase <= 180) {
        loyaltyScore += 5;
      }

      // Sadakat seviyesi
      let loyaltyLevel = 'Yeni Müşteri';
      if (loyaltyScore >= 80) loyaltyLevel = 'VIP';
      else if (loyaltyScore >= 60) loyaltyLevel = 'Sadık';
      else if (loyaltyScore >= 40) loyaltyLevel = 'Düzenli';
      else if (loyaltyScore >= 20) loyaltyLevel = 'Aktif';

      // Churn risk (kayıp riski)
      let churnRisk = 'Düşük';
      if (daysSinceLastPurchase > 180) churnRisk = 'Yüksek';
      else if (daysSinceLastPurchase > 90) churnRisk = 'Orta';

      loyaltyData.push({
        clientId: client.id,
        clientName: `${client.firstName} ${client.lastName}`,
        phone: client.phone,
        email: client.email,
        purchaseCount: purchaseCount,
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
        firstPurchaseDate: firstPurchaseDate.toISOString().split('T')[0],
        lastPurchaseDate: purchaseCount > 0 ? lastPurchaseDate.toISOString().split('T')[0] : null,
        customerAgeInDays: customerAgeInDays,
        daysSinceLastPurchase: purchaseCount > 0 ? daysSinceLastPurchase : null,
        averagePurchaseFrequency: averagePurchaseFrequency ? parseFloat(averagePurchaseFrequency.toFixed(1)) : null,
        loyaltyScore: parseFloat(loyaltyScore.toFixed(1)),
        loyaltyLevel: loyaltyLevel,
        churnRisk: churnRisk,
        hasNoSales: purchaseCount === 0 // ✅ Satış yapmamış müşteri işareti
      });
    });

    // Filtreleme (minPurchases varsa)
    let filteredData = loyaltyData;
    if (minPurchases) {
      filteredData = loyaltyData.filter(c => c.purchaseCount >= parseInt(minPurchases));
    }

    // Sıralama
    switch (sortBy) {
      case 'ltv':
        filteredData.sort((a, b) => b.totalSpent - a.totalSpent);
        break;
      case 'purchases':
        filteredData.sort((a, b) => b.purchaseCount - a.purchaseCount);
        break;
      case 'loyalty_score':
        filteredData.sort((a, b) => b.loyaltyScore - a.loyaltyScore);
        break;
      case 'last_purchase':
        filteredData.sort((a, b) => a.daysSinceLastPurchase - b.daysSinceLastPurchase);
        break;
      default:
        filteredData.sort((a, b) => b.totalSpent - a.totalSpent);
    }

    // Özet istatistikler
    const totalLTV = filteredData.reduce((sum, c) => sum + c.totalSpent, 0);
    const averageLTV = filteredData.length > 0 ? totalLTV / filteredData.length : 0;
    const totalPurchases = filteredData.reduce((sum, c) => sum + c.purchaseCount, 0);
    const averagePurchases = filteredData.length > 0 ? totalPurchases / filteredData.length : 0;

    // Seviye bazında grupla
    const byLevel = {
      VIP: filteredData.filter(c => c.loyaltyLevel === 'VIP').length,
      Sadık: filteredData.filter(c => c.loyaltyLevel === 'Sadık').length,
      Düzenli: filteredData.filter(c => c.loyaltyLevel === 'Düzenli').length,
      Aktif: filteredData.filter(c => c.loyaltyLevel === 'Aktif').length,
      'Yeni Müşteri': filteredData.filter(c => c.loyaltyLevel === 'Yeni Müşteri').length
    };

    // Churn risk bazında grupla
    const byChurnRisk = {
      Yüksek: filteredData.filter(c => c.churnRisk === 'Yüksek').length,
      Orta: filteredData.filter(c => c.churnRisk === 'Orta').length,
      Düşük: filteredData.filter(c => c.churnRisk === 'Düşük').length
    };

    // ✅ Satış yapmamış müşteri sayısı
    const customersWithNoSales = loyaltyData.filter(c => c.purchaseCount === 0).length;
    const customersWithSales = loyaltyData.filter(c => c.purchaseCount > 0).length;

    res.json({
      success: true,
      data: filteredData,
      summary: {
        totalCustomers: clients.length, // ✅ TÜM aktif müşteriler (259)
        totalActiveCustomers: filteredData.length, // Raporda gösterilen müşteriler
        customersWithSales: customersWithSales, // Satış yapmış müşteriler
        customersWithNoSales: customersWithNoSales, // Satış yapmamış müşteriler
        totalLTV: parseFloat(totalLTV.toFixed(2)),
        averageLTV: parseFloat(averageLTV.toFixed(2)),
        totalPurchases: totalPurchases,
        averagePurchases: parseFloat(averagePurchases.toFixed(1)),
        byLoyaltyLevel: byLevel,
        byChurnRisk: byChurnRisk,
        topCustomer: filteredData.length > 0 ? filteredData[0].clientName : null
      },
      meta: {
        sortedBy: sortBy,
        minPurchases: minPurchases ? parseInt(minPurchases) : null
      }
    });

  } catch (error) {
    console.error('❌ Müşteri sadakat raporu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Müşteri sadakat raporu alınamadı',
      error: error.message
    });
  }
};
export const getDetailedFinancialReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { period, startDate, endDate, groupBy = 'day' } = req.query;

    // Tarih filtresi (yukarıdaki ile aynı mantık)
    let dateFilter = {};
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
    } else {
      const now = new Date();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      dateFilter = { gte: monthStart, lte: now };
    }

    // Gelirler
    const payments = await prisma.payments.findMany({
      where: {
        status: 'COMPLETED',
        paymentDate: dateFilter,
        sale: {
          accountId: accountId,
          isDeleted: false
        }
      },
      select: {
        amountPaid: true,
        paymentDate: true,
        paymentMethod: true
      },
      orderBy: {
        paymentDate: 'asc'
      }
    });

    // Giderler
    const expenses = await prisma.expenses.findMany({
      where: {
        AccountID: accountId,
        ExpenseDate: dateFilter
      },
      select: {
        Amount: true,
        ExpenseDate: true,
        ExpenseType: true
      },
      orderBy: {
        ExpenseDate: 'asc'
      }
    });

    // Günlük/haftalık/aylık gruplama
    const groupedData = {};

    payments.forEach(payment => {
      const date = new Date(payment.paymentDate);
      let key;

      if (groupBy === 'day') {
        key = date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else if (groupBy === 'week') {
        const weekStart = new Date(date);
        const dayOfWeek = weekStart.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        weekStart.setDate(weekStart.getDate() - daysToMonday);
        key = weekStart.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!groupedData[key]) {
        groupedData[key] = { income: 0, expenses: 0, profit: 0 };
      }
      groupedData[key].income += parseFloat(payment.amountPaid);
    });

    expenses.forEach(expense => {
      const date = new Date(expense.ExpenseDate);
      let key;

      if (groupBy === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const weekStart = new Date(date);
        const dayOfWeek = weekStart.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        weekStart.setDate(weekStart.getDate() - daysToMonday);
        key = weekStart.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!groupedData[key]) {
        groupedData[key] = { income: 0, expenses: 0, profit: 0 };
      }
      groupedData[key].expenses += parseFloat(expense.Amount);
    });

    // Kar hesapla
    Object.keys(groupedData).forEach(key => {
      groupedData[key].profit = groupedData[key].income - groupedData[key].expenses;
    });

    // Array'e çevir ve sırala
    const timeline = Object.keys(groupedData)
      .sort()
      .map(date => ({
        date,
        income: parseFloat(groupedData[date].income.toFixed(2)),
        expenses: parseFloat(groupedData[date].expenses.toFixed(2)),
        profit: parseFloat(groupedData[date].profit.toFixed(2))
      }));

    res.json({
      success: true,
      data: {
        timeline,
        groupBy,
        period: {
          startDate: dateFilter.gte?.toISOString().split('T')[0],
          endDate: dateFilter.lte?.toISOString().split('T')[0]
        }
      }
    });

  } catch (error) {
    console.error('❌ Detaylı finansal rapor hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Detaylı finansal rapor alınırken hata oluştu',
      error: error.message
    });
  }
};
