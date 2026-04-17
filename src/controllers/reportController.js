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
          
        case 'last_2_months': {
          const l2m_now = new Date();
          // Geçen ayın 1'i → bu ayın son günü
          const last2MonthsStart = new Date(Date.UTC(
            l2m_now.getFullYear(),
            l2m_now.getMonth() - 1,
            1,
            0, 0, 0, 0
          ));
          const last2MonthsEnd = new Date(Date.UTC(
            l2m_now.getFullYear(),
            l2m_now.getMonth() + 1,
            0,
            23, 59, 59, 999
          ));
          dateFilter = { gte: last2MonthsStart, lte: last2MonthsEnd };
          periodLabel = 'Son 2 Ay';
          break;
        }

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

    expenses.forEach(expense => {
      const amount = parseFloat(expense.Amount);
      const paidAmount = parseFloat(expense.PaidAmount || 0);

      // Nakit bazlı muhasebe: gelir gibi gider de sadece ödeneni say
      totalExpenses += paidAmount;

      // Tip bazında grupla (general -> other mapping)
      if (expense.ExpenseType) {
        let expenseType = expense.ExpenseType;

        if (expenseType === 'general') {
          expenseType = 'other';
        }

        if (expenseType === 'staff' || expenseType === 'vendor' || expenseType === 'other') {
          expensesByType[expenseType] = (expensesByType[expenseType] || 0) + paidAmount;
        } else {
          expensesByType.other += paidAmount;
        }
      } else {
        expensesByType.other += paidAmount;
      }

      // Kategori bazında grupla
      const categoryName = expense.ExpenseCategories?.CategoryName || 'Kategorisiz';
      expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + paidAmount;

      // Ödeme durumu (referans için toplam tutar üzerinden)
      if (paidAmount >= amount) {
        expensesByPaymentStatus.paid += amount;
      } else if (paidAmount > 0) {
        expensesByPaymentStatus.partial += amount;
      } else {
        expensesByPaymentStatus.pending += amount;
      }
    });

    // ===================================================
    // 🛒 TOPLAM SATIŞ (Sales.totalAmount — fatura tutarı)
    // ===================================================

    const salesWhereClause = {
      accountId: accountId,
      isDeleted: false
    };

    if (Object.keys(dateFilter).length > 0) {
      salesWhereClause.saleDate = dateFilter;
    }

    const salesAggregate = await prisma.sales.aggregate({
      where: salesWhereClause,
      _sum: { totalAmount: true },
      _count: { id: true }
    });

    const totalSales = parseFloat(salesAggregate._sum.totalAmount || 0);
    const totalSalesCount = salesAggregate._count.id || 0;

    // ===================================================
    // 📊 HESAPLAMALAR VE SONUÇLAR
    // ===================================================

    // totalIncome = Toplam Tahsilat (kasaya giren)
    // totalSales  = Toplam Satış   (fatura tutarı)
    // Brüt Kar = Toplam Satış - Giderler
    // Net Kar  = Toplam Tahsilat - Giderler
    const grossProfit = totalSales - totalExpenses;
    const netProfit   = totalIncome - totalExpenses;
    const profitMargin = totalSales > 0 ? ((grossProfit / totalSales) * 100) : 0;

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
          // Yeni alanlar
          totalSales:      parseFloat(totalSales.toFixed(2)),      // Toplam Satış (fatura)
          totalCollection: parseFloat(totalIncome.toFixed(2)),     // Toplam Tahsilat (kasaya giren)
          totalExpenses:   parseFloat(totalExpenses.toFixed(2)),
          grossProfit:     parseFloat(grossProfit.toFixed(2)),     // Brüt Kar = Satış - Gider
          netProfit:       parseFloat(netProfit.toFixed(2)),       // Net Kar  = Tahsilat - Gider
          profitMargin:    parseFloat(profitMargin.toFixed(2)),
          // Geriye dönük uyumluluk
          totalIncome:     parseFloat(totalIncome.toFixed(2)),
          status: grossProfit >= 0 ? 'profit' : 'loss',
          formatted: {
            totalSales:      `${totalSales.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            totalCollection: `${totalIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            totalIncome:     `${totalIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            totalExpenses:   `${totalExpenses.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            grossProfit:     `${grossProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            netProfit:       `${netProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            profitMargin:    `%${profitMargin.toFixed(2)}`
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
        service: p.sale.service?.serviceName || (p.sale.isPackage ? 'Paket Satış' : 'Bilinmiyor')
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


// ─── Yardımcı: Müşteri sıcaklık derecesi ───────────────────────────────────
function getTemperature(purchaseCount, daysSinceLast) {
  if (purchaseCount === 0) return { key: 'COLD', label: 'Soğuk', color: '#6B7280' };
  if (daysSinceLast <= 30)  return { key: 'HOT',  label: 'Sıcak', color: '#EF4444' };
  if (daysSinceLast <= 90)  return { key: 'WARM', label: 'Ilık',  color: '#F59E0B' };
  if (daysSinceLast <= 180) return { key: 'COLD', label: 'Soğuk', color: '#6B7280' };
  return { key: 'LOST', label: 'Kayıp', color: '#374151' };
}

// ─── Yardımcı: Segment belirleme ────────────────────────────────────────────
function getSegment(loyaltyScore, purchaseCount, daysSinceLast) {
  if (purchaseCount === 0)   return { key: 'NEW',      label: 'Yeni Kayıt',    priority: 5 };
  if (daysSinceLast > 180)   return { key: 'LOST',     label: 'Kayıp Müşteri', priority: 1 };
  if (loyaltyScore >= 75)    return { key: 'VIP',      label: 'VIP',           priority: 6 };
  if (loyaltyScore >= 50)    return { key: 'LOYAL',    label: 'Sadık',         priority: 5 };
  if (daysSinceLast > 90)    return { key: 'AT_RISK',  label: 'Risk Altında',  priority: 2 };
  if (purchaseCount >= 2)    return { key: 'REGULAR',  label: 'Düzenli',       priority: 4 };
  return { key: 'OCCASIONAL', label: 'Ara Sıra',  priority: 3 };
}

// ─── Yardımcı: Cinsiyete göre selamlama ────────────────────────────────────
function getSalutation(gender, firstName) {
  if (gender === 'FEMALE') return `${firstName} Hanım`;
  if (gender === 'MALE')   return `${firstName} Bey`;
  return firstName;
}

// ─── Yardımcı: Kampanya önerisi ─────────────────────────────────────────────
function getCampaignRecommendation(segment, temperature, client, favoriteService, avgOrderValue, businessName) {
  const salut = getSalutation(client.gender, client.firstName);
  const svc   = favoriteService || null;
  const biz   = businessName || 'Salonumuz';

  // Her müşteri için farklı varyant seç (client.id'ye göre deterministik)
  function pick(arr) { return arr[client.id % arr.length]; }

  const campaigns = {

    VIP_HOT: {
      type: 'LOYALTY_REWARD',
      title: 'VIP Sadakat Ödülü',
      messages: [
        `Sayın ${salut},\n\n${biz} olarak sizinle yeniden iletişime geçmekten memnuniyet duyuyoruz. Her ziyaretinizde bize duyduğunuz güven ve sadakat bizim için büyük bir onurdur.\n\nDeğerli VIP müşterimiz olarak bu dönem size özel hazırladığımız ayrıcalıklı tekliften yararlanmak için lütfen bizi arayın veya randevunuzu oluşturun.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz} ailesinin en değerli üyeleri arasında yer aldığınız için sizlere özellikle teşekkür etmek istedik. ${svc ? `${svc} hizmetimizi` : 'Hizmetlerimizi'} tercih etmeye devam etmeniz bizim için büyük bir motivasyon kaynağıdır.\n\nBu ay size özel sunduğumuz sadakat teklifimizden haberdar etmek istedik. Randevunuzu oluşturmak için bizi arayabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz} ekibi olarak uzun süreli tercihleriniz ve güveniniz için minnettarız. Sizi ${svc ? `${svc} hizmetimizde` : 'önümüzdeki ziyaretinizde'} özel ayrıcalıklarla karşılamak istiyoruz.\n\nDetaylı bilgi için bizi arayabilir ya da doğrudan randevunuzu oluşturabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
      ],
      action: 'SEND_SMS',
      urgency: 'LOW',
      discountSuggestion: '%10-15 indirim veya ücretsiz ek hizmet',
    },

    VIP_WARM: {
      type: 'VIP_WINBACK',
      title: 'VIP Geri Dönüş',
      messages: [
        `Sayın ${salut},\n\n${biz} olarak bir süredir sizinle birlikte olamadık. Değerli VIP müşterimiz için bu dönem özel olarak hazırladığımız tekliften haberdar etmek istedik.\n\nSizi yeniden ağırlamaktan büyük onur duyarız. Randevunuzu oluşturmak veya teklif detayları için bizi arayabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${svc ? `${svc} bakımınızın` : 'Rutin bakımınızın'} zamanı gelmiş olabilir. ${biz} ekibi olarak VIP müşterilerimize sunduğumuz özel fiyat avantajlarıyla sizi bekliyoruz.\n\nRandevunuzu oluşturmak ya da bilgi almak için lütfen bizi arayın.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz} olarak yeni sezon hizmetlerimiz ve VIP müşterilerimize sunduğumuz özel ayrıcalıklar hakkında sizi bilgilendirmek istedik.\n\nBizimle iletişime geçmenizi ve uygun bir randevu ayarlamamıza imkân tanımanızı rica ederiz.\n\nSaygılarımızla,\n${biz}`,
      ],
      action: 'CALL_OR_SMS',
      urgency: 'MEDIUM',
      discountSuggestion: '%15-20 indirim',
    },

    LOYAL_HOT: {
      type: 'UPSELL',
      title: 'Premium Hizmet Teklifi',
      messages: [
        `Sayın ${salut},\n\n${svc ? `${svc} hizmetimizi` : 'Hizmetlerimizi'} düzenli olarak tercih ettiğiniz için ${biz} ekibi adına içtenlikle teşekkür ederiz.\n\nBu dönem size özel hazırladığımız premium bakım paketi hakkında bilgi vermek istedik. Sizi daha kapsamlı bir deneyimle ağırlamayı çok isteriz.\n\nDetaylar için bizi arayabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz}'deki düzenli ziyaretleriniz bizim için değerli. Sadık müşterilerimize özel olarak sunduğumuz yeni premium ${svc ? `${svc}` : 'hizmet'} paketimizi sizinle paylaşmak istedik.\n\nBu ayrıcalıktan yararlanmak için lütfen bizi arayın ya da randevunuzu oluşturun.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz} ekibi olarak sizi daha kapsamlı bir deneyimle karşılamak istiyoruz. Sadakatinizin bir karşılığı olarak size özel bir paket teklifi hazırladık.\n\nUygun gününüzde randevunuzu oluşturabilir veya bilgi almak için bizi arayabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
      ],
      action: 'SEND_SMS',
      urgency: 'LOW',
      discountSuggestion: 'Paket satış veya üst segment hizmet önerisi',
    },

    LOYAL_WARM: {
      type: 'RE_ENGAGEMENT',
      title: 'Geri Dönüş Teklifi',
      messages: [
        `Sayın ${salut},\n\n${biz} olarak bir süredir sizi aramadık; bu süreçte iyi olduğunuzu umuyoruz. ${svc ? `${svc} bakımınızın` : 'Rutin bakımınızın'} vakti gelmiş olabilir.\n\nSize özel hazırladığımız indirimli tekliften yararlanmak için bu hafta randevunuzu oluşturabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz} ekibi olarak sizi tekrar görmekten çok mutlu olacağız. Bu dönem sunduğumuz özel fırsatları sizinle paylaşmak istedik.\n\nBilgi almak ya da randevu oluşturmak için lütfen bizi arayın.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz}'i bir süre göremedik. Aylık rutin bakım randevunuz için sizi bekliyoruz. Bu döneme özel hazırladığımız fırsat teklifinden yararlanmak için bizimle iletişime geçebilirsiniz.\n\nSaygılarımızla,\n${biz}`,
      ],
      action: 'SEND_SMS',
      urgency: 'MEDIUM',
      discountSuggestion: '%10-15 indirim',
    },

    AT_RISK: {
      type: 'WIN_BACK',
      title: 'Geri Kazanma Kampanyası',
      messages: [
        `Sayın ${salut},\n\n${biz} ekibi olarak uzun süredir sizi göremediğimizin farkındayız. Memnuniyetiniz bizim için her şeyden önemlidir; varsa bir eksikliğimizi duymak isteriz.\n\nSizi yeniden ağırlamak için size özel bir teklif hazırladık. Bizi arayarak bu avantajdan yararlanabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz} ailesi olarak son ziyaretinizden bu yana sizi özledik. Bu dönem size özel hazırladığımız geri dönüş teklifimizi paylaşmak istedik.\n\nDetaylar için bizi aramanızı bekliyoruz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz} olarak hizmetlerimizi sürekli geliştiriyoruz. ${svc ? `${svc} alanındaki` : 'Sunduğumuz'} yenilikleri sizinle paylaşmak ve sizi tekrar aramızda görmek istiyoruz.\n\nSize özel bir teklifimiz hazır; lütfen bizi arayın.\n\nSaygılarımızla,\n${biz}`,
      ],
      action: 'CALL_OR_SMS',
      urgency: 'HIGH',
      discountSuggestion: '%20 indirim — aciliyet hissi yarat',
    },

    LOST: {
      type: 'AGGRESSIVE_WIN_BACK',
      title: 'Müşteri Geri Kazanma',
      messages: [
        `Sayın ${salut},\n\n${biz} ekibi olarak çok uzun süredir sizinle iletişime geçemediğimiz için üzgünüz. Sizi ne kadar özlediğimizi bilmenizi istedik.\n\nYeniden kapımızı açarsanız size özel %25 indirim ve ${avgOrderValue > 500 ? 'ücretsiz danışmanlık seansı' : 'sürpriz bir hediye'} sunmak istiyoruz. Bizi arayın, sizi en iyi şekilde karşılamaya hazırız.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz}'de sizi tekrar ağırlamak bizim için büyük bir mutluluk olacak. Uzun aradan sonra geri dönen değerli müşterilerimize sunduğumuz bu özel tekliften yararlanmak için lütfen bizi arayın.\n\nSizi bekliyoruz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz} ailesi olarak sizin yokluğunuzu hissettik. Bu özel geri dönüş teklifini yalnızca siz gibi değerli müşterilerimiz için sakladık.\n\nBize bir şans daha verirseniz sizi en iyi şekilde karşılamaya hazırız. Lütfen bizi arayın.\n\nSaygılarımızla,\n${biz}`,
      ],
      action: 'CALL_FIRST_THEN_SMS',
      urgency: 'VERY_HIGH',
      discountSuggestion: '%25-30 indirim + kişisel sürpriz',
    },

    REGULAR_HOT: {
      type: 'CROSS_SELL',
      title: 'Yeni Hizmet Tanıtımı',
      messages: [
        `Sayın ${salut},\n\n${biz} ekibi adına düzenli tercihleriniz için içtenlikle teşekkür ederiz. ${svc ? `${svc} hizmetimizin` : 'Mevcut hizmetlerimizin'} yanı sıra bu sezon yeni eklediğimiz hizmetlerimizi de denemenizi öneririz.\n\nİlk denemede size özel fiyat uygulayacağız. Randevunuzu oluşturmak için bizi arayabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz} olarak hizmet yelpazemizi genişlettik. Bu sezon eklediğimiz yeni bakım paketlerini sizinle paylaşmak istedik.\n\nÖzel tanıtım randevusu için bizi arayabilir ya da doğrudan randevunuzu oluşturabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${biz}'deki sadakatiniz bizim için çok teşvik edici. Bu dönem sunduğumuz ${svc ? `${svc} destekli ` : ''}yeni bakım paketini sizinle paylaşmak istedik.\n\nDetaylar için bizi arayabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
      ],
      action: 'SEND_SMS',
      urgency: 'LOW',
      discountSuggestion: 'Yeni hizmet için özel deneme fiyatı',
    },

    OCCASIONAL: {
      type: 'FREQUENCY_BOOST',
      title: 'Düzenli Ziyaret Teklifi',
      messages: [
        `Sayın ${salut},\n\n${biz} olarak sizi aramaktan mutluluk duyduk. Düzenli gelen müşterilerimize sunduğumuz sadakat indirim programından siz de yararlanmak ister misiniz?\n\nDetaylar için bizi arayabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\n${svc ? `${svc} bakımınızı` : 'Bakım rutininizi'} daha düzenli hale getirmenizi öneririz. ${biz} olarak aylık ziyaretlerde kümülatif indirim kazandıran sadakat programımızdan yararlanabilirsiniz.\n\nBilgi almak için bizi arayın.\n\nSaygılarımızla,\n${biz}`,
        `Sayın ${salut},\n\nBir sonraki ${svc ? `${svc}` : 'bakım'} randevunuzu planlamak için ${biz} ekibi hazır. Düzenli ziyaretlerinizde sunduğumuz özel avantajlardan yararlanmak için uygun tarihi birlikte belirleyelim.\n\nBizi arayabilirsiniz.\n\nSaygılarımızla,\n${biz}`,
      ],
      action: 'SEND_SMS',
      urgency: 'LOW',
      discountSuggestion: 'Sadakat programını tanıt, düzenli gelmeyi teşvik et',
    },
  };

  const key = segment.key === 'LOST'    ? 'LOST'
    : segment.key === 'AT_RISK'         ? 'AT_RISK'
    : segment.key === 'VIP' && temperature.key === 'HOT'   ? 'VIP_HOT'
    : segment.key === 'VIP'             ? 'VIP_WARM'
    : segment.key === 'LOYAL' && temperature.key === 'HOT' ? 'LOYAL_HOT'
    : segment.key === 'LOYAL'           ? 'LOYAL_WARM'
    : segment.key === 'REGULAR'         ? 'REGULAR_HOT'
    : 'OCCASIONAL';

  const chosen = campaigns[key] || campaigns['OCCASIONAL'];
  const { messages, ...rest } = chosen;
  return { ...rest, message: pick(messages) };
}

/**
 * 💎 MÜŞTERİ SADAKAT & SICAKLIK ANALİZİ
 *
 * Her müşteri için:
 * - Sıcaklık: HOT / WARM / COLD / LOST
 * - Segment:  VIP / LOYAL / REGULAR / AT_RISK / LOST / NEW
 * - Kişiselleştirilmiş kampanya önerisi
 * - En çok aldığı hizmet
 */
export const getCustomerLoyaltyReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { minPurchases, sortBy = 'loyaltyScore', temperature, segment } = req.query;

    const clients = await prisma.clients.findMany({
      where: { accountId, isActive: true },
      include: {
        account: { select: { businessName: true } },
        sales: {
          where: { isDeleted: false },
          include: {
            payments: { where: { status: 'COMPLETED' } },
            service: { select: { id: true, serviceName: true } }
          },
          orderBy: { saleDate: 'asc' }
        }
      }
    });

    const now = new Date();
    const loyaltyData = [];

    clients.forEach(client => {
      const purchaseCount = client.sales.length;

      // LTV — sadece COMPLETED ödemeler
      let totalSpent = 0;
      client.sales.forEach(sale => {
        sale.payments.forEach(p => {
          const a = parseFloat(p.amountPaid);
          if (!isNaN(a)) totalSpent += a;
        });
      });

      // En çok alınan hizmet
      const serviceCount = {};
      client.sales.forEach(sale => {
        const svcName = sale.service?.serviceName;
        if (svcName) serviceCount[svcName] = (serviceCount[svcName] || 0) + 1;
      });
      const favoriteService = Object.keys(serviceCount).sort((a, b) => serviceCount[b] - serviceCount[a])[0] || null;
      const lastService = purchaseCount > 0
        ? client.sales[client.sales.length - 1].service?.serviceName || null
        : null;

      // Tarihler
      const firstDate = purchaseCount > 0
        ? new Date(client.sales[0].saleDate)
        : new Date(client.createdAt);
      const lastDate = purchaseCount > 0
        ? new Date(client.sales[client.sales.length - 1].saleDate)
        : null;

      const customerAgeInDays = Math.floor((now - firstDate) / 86400000);
      const daysSinceLast = lastDate ? Math.floor((now - lastDate) / 86400000) : null;

      const averageOrderValue = purchaseCount > 0 ? totalSpent / purchaseCount : 0;
      const purchaseFrequencyDays = purchaseCount > 1
        ? Math.round(customerAgeInDays / (purchaseCount - 1))
        : null;

      // Sadakat skoru (0–100)
      let loyaltyScore = 0;
      loyaltyScore += Math.min(30, purchaseCount * 3);                          // Alışveriş sayısı
      loyaltyScore += Math.min(30, (totalSpent / 1000) * 2);                   // Harcama
      loyaltyScore += Math.min(20, (customerAgeInDays / 30) * 2);              // Müşteri yaşı
      if (daysSinceLast !== null) {
        if (daysSinceLast <= 30)       loyaltyScore += 20;
        else if (daysSinceLast <= 60)  loyaltyScore += 15;
        else if (daysSinceLast <= 90)  loyaltyScore += 10;
        else if (daysSinceLast <= 180) loyaltyScore += 5;
      }
      loyaltyScore = Math.min(100, loyaltyScore);

      const temp = getTemperature(purchaseCount, daysSinceLast ?? 9999);
      const seg  = getSegment(loyaltyScore, purchaseCount, daysSinceLast ?? 9999);
      const campaign = getCampaignRecommendation(seg, temp, client, favoriteService, averageOrderValue, client.account?.businessName);

      loyaltyData.push({
        clientId:   client.id,
        clientName: `${client.firstName} ${client.lastName}`,
        firstName:  client.firstName,
        phone:      client.phone,
        email:      client.email,
        gender:     client.gender,
        marketingConsent: client.marketingConsent,
        consentDate: client.consentDate ? client.consentDate.toISOString().split('T')[0] : null,

        // Isı & segment
        temperature:      temp,
        segment:          seg,
        loyaltyScore:     parseFloat(loyaltyScore.toFixed(1)),

        // Satın alma metrikleri
        purchaseCount,
        totalSpent:              parseFloat(totalSpent.toFixed(2)),
        averageOrderValue:       parseFloat(averageOrderValue.toFixed(2)),
        purchaseFrequencyDays,   // kaç günde bir geliyor (null = tek alışveriş)

        // Servis bilgisi
        favoriteService,
        lastService,

        // Tarihler
        firstPurchaseDate: firstDate.toISOString().split('T')[0],
        lastPurchaseDate:  lastDate ? lastDate.toISOString().split('T')[0] : null,
        daysSinceLastPurchase: daysSinceLast,
        customerAgeInDays,

        // Kampanya önerisi
        campaign,

        hasNoSales: purchaseCount === 0
      });
    });

    // Filtrele
    let result = loyaltyData;
    if (minPurchases) result = result.filter(c => c.purchaseCount >= parseInt(minPurchases));
    if (temperature)  result = result.filter(c => c.temperature.key === temperature.toUpperCase());
    if (segment)      result = result.filter(c => c.segment.key === segment.toUpperCase());

    // Sırala
    const sorters = {
      loyaltyScore:  (a, b) => b.loyaltyScore - a.loyaltyScore,
      ltv:           (a, b) => b.totalSpent - a.totalSpent,
      purchases:     (a, b) => b.purchaseCount - a.purchaseCount,
      last_purchase: (a, b) => (a.daysSinceLastPurchase ?? 9999) - (b.daysSinceLastPurchase ?? 9999),
      urgency:       (a, b) => b.segment.priority - a.segment.priority
    };
    result.sort(sorters[sortBy] || sorters.loyaltyScore);

    // Segment bazında sayılar (tüm müşteriler için)
    const byTemperature = { HOT: 0, WARM: 0, COLD: 0, LOST: 0 };
    const bySegment     = { VIP: 0, LOYAL: 0, REGULAR: 0, OCCASIONAL: 0, AT_RISK: 0, LOST: 0, NEW: 0 };
    loyaltyData.forEach(c => {
      byTemperature[c.temperature.key] = (byTemperature[c.temperature.key] || 0) + 1;
      bySegment[c.segment.key]         = (bySegment[c.segment.key] || 0) + 1;
    });

    const totalLTV = result.reduce((s, c) => s + c.totalSpent, 0);

    // Kampanya öncelik listesi — KVKK onaylı ve en az 2 satışı olan müşteriler
    const campaignList = [...loyaltyData]
      .filter(c => c.marketingConsent === true && c.purchaseCount >= 2)
      .sort((a, b) => b.segment.priority - a.segment.priority || (a.daysSinceLastPurchase ?? 0) - (b.daysSinceLastPurchase ?? 0))
      .slice(0, 50)
      .map(c => ({
        clientId:    c.clientId,
        clientName:  c.clientName,
        phone:       c.phone,
        consentDate: c.consentDate,
        temperature: c.temperature,
        segment:     c.segment,
        campaign:    c.campaign,
        daysSinceLastPurchase: c.daysSinceLastPurchase,
        favoriteService: c.favoriteService
      }));

    // Consent istatistikleri
    const consentStats = {
      total: loyaltyData.length,
      consented: loyaltyData.filter(c => c.marketingConsent).length,
      notConsented: loyaltyData.filter(c => !c.marketingConsent).length,
      campaignEligible: loyaltyData.filter(c => c.marketingConsent && c.purchaseCount >= 2).length
    };

    res.json({
      success: true,
      data: result,
      campaigns: campaignList,
      summary: {
        totalCustomers:    clients.length,
        filteredCount:     result.length,
        customersWithSales:   loyaltyData.filter(c => !c.hasNoSales).length,
        customersWithNoSales: loyaltyData.filter(c => c.hasNoSales).length,
        totalLTV:   parseFloat(totalLTV.toFixed(2)),
        averageLTV: result.length > 0 ? parseFloat((totalLTV / result.length).toFixed(2)) : 0,
        byTemperature,
        bySegment,
        consentStats,
        topCustomer: result.length > 0 ? result[0].clientName : null
      },
      meta: {
        sortedBy:   sortBy,
        filterTemperature: temperature || null,
        filterSegment:     segment || null,
        minPurchases:      minPurchases ? parseInt(minPurchases) : null
      }
    });

  } catch (error) {
    console.error('❌ Müşteri analiz raporu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Müşteri analiz raporu alınamadı',
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
        PaidAmount: true,
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
      // Nakit bazlı: sadece ödenmiş gider tutarını say
      groupedData[key].expenses += parseFloat(expense.PaidAmount || 0);
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

/**
 * 💸 BORÇ RAPORU
 * GET /api/reports/debt
 *
 * Ödenmemiş veya kısmen ödenmiş satışları müşteri bazında listeler.
 *
 * Query Params:
 * - sortBy: 'debt' (kalan borç) | 'date' (satış tarihi) — varsayılan: 'debt'
 * - minDebt: minimum kalan borç tutarı filtresi (varsayılan: 0.01)
 * - search: müşteri adı / telefon araması
 * - page, limit: sayfalama
 */
export const getDebtReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const {
      sortBy = 'debt',
      minDebt = 0.01,
      search
    } = req.query;

    const hasPageParam = req.query.page !== undefined;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Borçlu satışları çek: tüm satışlar + ödemeler
    const sales = await prisma.sales.findMany({
      where: {
        accountId,
        isDeleted: false,
        ...(search && {
          client: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName:  { contains: search, mode: 'insensitive' } },
              { phone:     { contains: search, mode: 'insensitive' } }
            ]
          }
        })
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true
          }
        },
        service: {
          select: { id: true, serviceName: true }
        },
        saleItems: {
          select: {
            service: { select: { id: true, serviceName: true } }
          }
        },
        payments: {
          select: {
            id: true,
            amountPaid: true,
            status: true,
            dueDate: true,
            installmentNumber: true,
            paymentDate: true
          },
          orderBy: { installmentNumber: 'asc' }
        }
      },
      orderBy: { saleDate: 'desc' }
    });

    // Borç hesapla ve filtrele
    const now        = new Date();
    const minDebtNum = parseFloat(minDebt);
    const debtSales  = [];

    for (const sale of sales) {
      const totalAmount = parseFloat(sale.totalAmount);

      const completedPayments = sale.payments.filter(p => p.status === 'COMPLETED');
      const pendingPayments   = sale.payments.filter(p => p.status === 'PENDING' && p.installmentNumber !== null);

      const totalPaid     = completedPayments.reduce((s, p) => s + parseFloat(p.amountPaid), 0);
      const remainingDebt = parseFloat((totalAmount - totalPaid).toFixed(2));

      if (remainingDebt < minDebtNum) continue;

      // displayServiceName
      let displayServiceName;
      if (!sale.isPackage) {
        displayServiceName = sale.service?.serviceName || 'Bilinmiyor';
      } else if (sale.saleItems?.length === 1) {
        displayServiceName = sale.saleItems[0].service?.serviceName || 'Paket Satış';
      } else if (sale.saleItems?.length > 1) {
        displayServiceName = `Paket (${sale.saleItems.length} hizmet)`;
      } else {
        displayServiceName = 'Paket Satış';
      }

      // Taksit detayları
      let installmentInfo = null;
      if (sale.isInstallment && pendingPayments.length > 0) {
        const overdue  = pendingPayments.filter(p => p.dueDate && new Date(p.dueDate) < now);
        const upcoming = pendingPayments.filter(p => p.dueDate && new Date(p.dueDate) >= now);
        const nextDue  = upcoming.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0] || null;

        installmentInfo = {
          installmentCount:   sale.installmentCount,
          paidCount:          completedPayments.filter(p => p.installmentNumber !== null).length,
          pendingCount:       pendingPayments.length,
          overdueCount:       overdue.length,
          overdueAmount:      parseFloat(overdue.reduce((s, p) => s + parseFloat(p.amountPaid), 0).toFixed(2)),
          nextDueDate:        nextDue?.dueDate || null,
          nextDueAmount:      nextDue ? parseFloat(parseFloat(nextDue.amountPaid).toFixed(2)) : null,
          pendingInstallments: pendingPayments.map(p => ({
            installmentNumber: p.installmentNumber,
            amount:   parseFloat(parseFloat(p.amountPaid).toFixed(2)),
            dueDate:  p.dueDate,
            isOverdue: p.dueDate ? new Date(p.dueDate) < now : false
          }))
        };
      }

      debtSales.push({
        saleId:            sale.id,
        saleDate:          sale.saleDate,
        isPackage:         sale.isPackage,
        isInstallment:     sale.isInstallment || false,
        installmentCount:  sale.installmentCount || null,
        displayServiceName,
        totalAmount,
        totalPaid:         parseFloat(totalPaid.toFixed(2)),
        remainingDebt,
        paymentRate:       totalAmount > 0
          ? parseFloat(((totalPaid / totalAmount) * 100).toFixed(1))
          : 0,
        installmentInfo,
        client: sale.client,
        notes:  sale.notes
      });
    }

    // Sıralama
    if (sortBy === 'debt') {
      debtSales.sort((a, b) => b.remainingDebt - a.remainingDebt);
    } else {
      debtSales.sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));
    }

    // Özet
    const totalDebt       = debtSales.reduce((s, r) => s + r.remainingDebt, 0);
    const totalSalesAmount = debtSales.reduce((s, r) => s + r.totalAmount,   0);
    const totalPaidAmount  = debtSales.reduce((s, r) => s + r.totalPaid,     0);

    // Müşteri bazında gruplama (özet için)
    const byClient = {};
    debtSales.forEach(s => {
      const cid = s.client.id;
      if (!byClient[cid]) {
        byClient[cid] = {
          clientId:   cid,
          clientName: `${s.client.firstName} ${s.client.lastName}`,
          phone:      s.client.phone,
          saleCount:  0,
          totalDebt:  0
        };
      }
      byClient[cid].saleCount++;
      byClient[cid].totalDebt = parseFloat((byClient[cid].totalDebt + s.remainingDebt).toFixed(2));
    });

    const clientSummary = Object.values(byClient)
      .sort((a, b) => b.totalDebt - a.totalDebt)
      .slice(0, 20); // En borçlu ilk 20 müşteri

    // Sayfalama — page parametresi yoksa tümünü döndür
    const total     = debtSales.length;
    const paginated = hasPageParam
      ? debtSales.slice(offset, offset + limit)
      : debtSales;

    res.json({
      success: true,
      data: paginated,
      summary: {
        totalDebtorCount: total,
        uniqueClients:    Object.keys(byClient).length,
        totalDebt:        parseFloat(totalDebt.toFixed(2)),
        totalSalesAmount: parseFloat(totalSalesAmount.toFixed(2)),
        totalPaidAmount:  parseFloat(totalPaidAmount.toFixed(2)),
        collectionRate:   totalSalesAmount > 0
          ? parseFloat(((totalPaidAmount / totalSalesAmount) * 100).toFixed(1))
          : 0,
        topDebtors: clientSummary
      },
      pagination: hasPageParam ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : {
        total,
        returned: paginated.length,
        hasPageParam: false
      },
      filter: {
        sortBy,
        minDebt: minDebtNum,
        search: search || null
      }
    });

  } catch (error) {
    console.error('❌ Borç raporu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Borç raporu alınamadı',
      error: error.message
    });
  }
};
