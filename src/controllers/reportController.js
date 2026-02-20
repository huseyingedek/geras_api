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
        `Sayın ${salut}, ${biz} olarak sizi her ziyaretinizde ağırlamaktan büyük mutluluk duyuyoruz. Değerli VIP müşterimiz olarak bu ay size özel bir sürpriz hazırladık; bir sonraki randevunuzda sizi bekliyoruz.`,
        `Sayın ${salut}, ${biz} ailesinin en değerli üyelerinden biri olduğunuz için size teşekkür etmek istedik. ${svc ? `${svc} hizmetinizdeki` : 'Her'} sadakatinizin karşılığı olarak sizi özel bir teklifle ağırlamak istiyoruz; uygun gününüzü bize bildirin.`,
        `Sayın ${salut}, uzun süreli tercihleriniz ve güveniniz bizim için çok değerli. ${biz} ekibi olarak sizi ${svc ? `${svc} konusunda` : 'gelecek ziyaretinizde'} özel avantajlarla karşılamaya hazırız; randevunuzu oluşturun.`,
      ],
      action: 'SEND_SMS',
      urgency: 'LOW',
      discountSuggestion: '%10-15 indirim veya ücretsiz ek hizmet',
    },

    VIP_WARM: {
      type: 'VIP_WINBACK',
      title: 'VIP Geri Dönüş',
      messages: [
        `Sayın ${salut}, ${biz} olarak bir süredir sizi göremedik ve özledik. Değerli VIP müşterimize özel hazırladığımız tekliften yararlanmak için lütfen bizi arayın; sizi yeniden ağırlamaktan onur duyarız.`,
        `Sayın ${salut}, ${svc ? `${svc} bakımınızın` : 'Rutin bakımınızın'} vakti gelmiş olabilir. ${biz} ekibi olarak sizi VIP özel fiyatlarımızla bekliyoruz; randevunuzu oluşturun ya da bizi arayın.`,
        `Sayın ${salut}, VIP müşterilerimize sunduğumuz yeni sezon ayrıcalıklarını sizinle paylaşmak istedik. ${biz} olarak uygun bir zamanda sizi görmekten memnuniyet duyarız; bizi aramanızı bekliyoruz.`,
      ],
      action: 'CALL_OR_SMS',
      urgency: 'MEDIUM',
      discountSuggestion: '%15-20 indirim',
    },

    LOYAL_HOT: {
      type: 'UPSELL',
      title: 'Premium Hizmet Teklifi',
      messages: [
        `Sayın ${salut}, ${svc ? `${svc} hizmetimizi` : 'hizmetlerimizi'} düzenli olarak tercih ettiğiniz için ${biz} ekibi adına teşekkür ederiz. Bu dönem size özel hazırladığımız premium bakım paketini tanıtmak isteriz; detaylar için bizi arayın.`,
        `Sayın ${salut}, sadakatiniz bizim için çok değerli. ${biz} olarak size daha kapsamlı bir deneyim yaşatmak istiyoruz. Yeni premium ${svc ? `${svc}` : 'hizmet'} paketimiz hakkında bilgi almak için bizi arayabilirsiniz.`,
        `Sayın ${salut}, ${biz}'deki düzenli ziyaretleriniz takdire şayan. Bu ayrıcalıklı müşteri ilişkimizi ileriye taşımak için size özel bir paket teklifi hazırladık; uygun gününüzde görüşelim.`,
      ],
      action: 'SEND_SMS',
      urgency: 'LOW',
      discountSuggestion: 'Paket satış veya üst segment hizmet önerisi',
    },

    LOYAL_WARM: {
      type: 'RE_ENGAGEMENT',
      title: 'Geri Dönüş Teklifi',
      messages: [
        `Sayın ${salut}, bir süredir ${biz}'i ziyaret etmediniz. ${svc ? `${svc} bakımınızın` : 'Rutin bakımınızın'} vakti gelmiş olabilir; size özel indirimle bu haftaya randevu ayarlamak ister misiniz?`,
        `Sayın ${salut}, ${biz} ekibi olarak sizi tekrar görmek bizi mutlu edecek. ${svc ? `${svc}` : 'Hizmetlerimiz'} konusunda bu dönem sunduğumuz özel fırsatları sizinle paylaşmak istiyoruz; bizi arayın.`,
        `Sayın ${salut}, aylık rutin bakımınız için ${biz}'i tercih etmenizi öneririz. Bu döneme özel hazırladığımız fırsat teklifimizden yararlanmak için lütfen bizi arayın ya da randevunuzu oluşturun.`,
      ],
      action: 'SEND_SMS',
      urgency: 'MEDIUM',
      discountSuggestion: '%10-15 indirim',
    },

    AT_RISK: {
      type: 'WIN_BACK',
      title: 'Geri Kazanma Kampanyası',
      messages: [
        `Sayın ${salut}, ${biz} olarak uzun süredir sizi göremedik. Memnuniyetiniz bizim için en öncelikli konudur; varsa bir eksikliğimizi duymak isteriz. Sizi yeniden ağırlamak için özel bir teklifimiz mevcut, bizi arayın.`,
        `Sayın ${salut}, geçen ziyaretinizden bu yana uzun zaman geçti. ${biz} ekibi sizden haber bekliyordu. Bu dönem size özel hazırladığımız geri dönüş teklifimizden yararlanmak için bizi arayın.`,
        `Sayın ${salut}, ${svc ? `${svc} konusunda` : 'hizmetlerimiz konusunda'} farklı bir deneyim arayışında olabilirsiniz. ${biz} olarak hizmetlerimizi yeniledik ve sizi tekrar davet etmek istiyoruz; size özel bir teklifimiz var.`,
      ],
      action: 'CALL_OR_SMS',
      urgency: 'HIGH',
      discountSuggestion: '%20 indirim — aciliyet hissi yarat',
    },

    LOST: {
      type: 'AGGRESSIVE_WIN_BACK',
      title: 'Müşteri Geri Kazanma',
      messages: [
        `Sayın ${salut}, çok uzun süredir görüşemiyoruz. ${biz} ekibi olarak sizi ne kadar özlediğimizi bilmenizi istedik. Yeniden kapımızı açarsanız size %25 özel indirim ve ${avgOrderValue > 500 ? 'ücretsiz danışmanlık seansı' : 'özel bir sürpriz hediye'} sunmak istiyoruz.`,
        `Sayın ${salut}, ${biz}'de sizi tekrar ağırlamak için özel bir teklifimiz var. Uzun aradan sonra geri dönen değerli müşterilerimize sunduğumuz bu özel fırsattan yararlanmak için lütfen bizi arayın.`,
        `Sayın ${salut}, ${biz} ailesi olarak sizin yokluğunuzu hissettik. Bu özel geri dönüş teklifimizi sizin için sakladık; bizi bir şans daha verirseniz sizi en iyi şekilde karşılamaya hazırız.`,
      ],
      action: 'CALL_FIRST_THEN_SMS',
      urgency: 'VERY_HIGH',
      discountSuggestion: '%25-30 indirim + kişisel sürpriz',
    },

    REGULAR_HOT: {
      type: 'CROSS_SELL',
      title: 'Yeni Hizmet Tanıtımı',
      messages: [
        `Sayın ${salut}, düzenli tercihleriniz için ${biz} ekibi adına teşekkür ederiz. ${svc ? `${svc} dışında` : 'Bu dönem'} yeni eklediğimiz hizmetlerimizi de denemenizi öneririz; ilk denemede size özel fiyat uygulayacağız.`,
        `Sayın ${salut}, ${biz} olarak hizmet yelpazemizi genişlettik. ${svc ? `${svc}` : 'Mevcut hizmetlerimizin'} yanına bu sezon yeni paketler ekledik; sizin için özel bir tanıtım randevusu ayarlayalım mı?`,
        `Sayın ${salut}, ${biz}'deki sadakatiniz bizim için teşvik edici. Bu dönem yeni sunduğumuz ${svc ? `${svc} destekli` : ''} bakım paketini sizinle paylaşmak istiyoruz; detaylar için bizi arayın.`,
      ],
      action: 'SEND_SMS',
      urgency: 'LOW',
      discountSuggestion: 'Yeni hizmet için özel deneme fiyatı',
    },

    OCCASIONAL: {
      type: 'FREQUENCY_BOOST',
      title: 'Düzenli Ziyaret Teklifi',
      messages: [
        `Sayın ${salut}, sizi görmek her zaman mutluluk veriyor. ${biz} olarak düzenli gelen müşterilerimize sunduğumuz özel indirim programından siz de yararlanmak ister misiniz? Detaylar için bizi arayın.`,
        `Sayın ${salut}, ${svc ? `${svc} bakımınızı` : 'Bakım rutininizi'} daha düzenli hale getirmenizi öneririz. ${biz} olarak aylık ziyaretlerde kümülatif indirim kazandıran sadakat programımızdan yararlanabilirsiniz; bizi arayın.`,
        `Sayın ${salut}, bir sonraki ${svc ? `${svc}` : 'bakım'} randevunuzu ne zaman planlamak istersiniz? ${biz} ekibi olarak sizi özel avantajlarımızla karşılamaya hazırız; uygun tarihi birlikte belirleyelim.`,
      ],
      action: 'SEND_SMS',
      urgency: 'LOW',
      discountSuggestion: 'Sadakat programını tanıt, düzenli gelmeyi teşvik et',
    },

    NEW: {
      type: 'WELCOME_OFFER',
      title: 'Hoş Geldiniz Teklifi',
      messages: [
        `Sayın ${salut}, ${biz} ailesine hoş geldiniz. İlk hizmet deneyiminizi özel kılmak istiyoruz. Yeni müşterilerimize sunduğumuz özel karşılama indiriminizden yararlanmak için randevunuzu bugün oluşturun.`,
        `Sayın ${salut}, sizi ${biz} ailemizde görmekten mutluluk duyduk. İlk ziyaretinizi unutulmaz kılmak için size özel bir karşılama teklifi hazırladık; detaylar için lütfen bizi arayın.`,
        `Sayın ${salut}, ${biz}'e hoş geldiniz. İlk randevunuzda en iyi hizmeti sunmak bizim önceliğimiz. Yeni üye indiriminizi kullanmak için bizi arayın ya da randevunuzu oluşturun.`,
      ],
      action: 'SEND_SMS',
      urgency: 'MEDIUM',
      discountSuggestion: '%15 ilk ziyaret indirimi',
    },
  };

  const key = segment.key === 'LOST'    ? 'LOST'
    : segment.key === 'NEW'             ? 'NEW'
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

    // Kampanya öncelik listesi — sadece pazarlama onayı verilmiş müşteriler
    const campaignList = [...loyaltyData]
      .filter(c => c.marketingConsent === true)
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
      notConsented: loyaltyData.filter(c => !c.marketingConsent).length
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
