import prisma from '../lib/prisma.js';

export const getDashboardStats = async (req, res) => {
  try {
    const { accountId } = req.user;

    // Türkiye saati için (+03:00) tarih hesaplamaları
    const now = new Date();
    const turkeyOffset = 3 * 60; // +03:00 dakika cinsinden
    const localOffset = now.getTimezoneOffset(); // Yerel saat dilimi farkı
    const turkeyTime = new Date(now.getTime() + (turkeyOffset + localOffset) * 60000);

    // Bugünün başlangıç ve bitişi (Türkiye saati)
    const todayStart = new Date(turkeyTime);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(turkeyTime);
    todayEnd.setHours(23, 59, 59, 999);

    // Bu haftanın başlangıcı (Pazartesi)
    const weekStart = new Date(turkeyTime);
    const dayOfWeek = weekStart.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(weekStart.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);

    // Bu ayın başlangıcı
    const monthStart = new Date(turkeyTime);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Paralel olarak tüm verileri çek
    const [
      todayAppointments,
      totalClients,
      todayNewClients,
      monthlyPayments,
      todayPayments,
      todayCompleted,
      weekCompleted,
      monthCompleted
    ] = await Promise.all([
      // 1. Bugünkü randevular (duruma göre gruplanmış)
      prisma.appointments.groupBy({
        by: ['status'],
        where: {
          accountId: accountId,
          appointmentDate: {
            gte: todayStart,
            lte: todayEnd
          }
        },
        _count: {
          _all: true
        }
      }),

      // 2. Toplam müşteri sayısı
      prisma.clients.count({
        where: {
          accountId: accountId,
          isActive: true
        }
      }),

      // 3. Bugün eklenen müşteriler
      prisma.clients.count({
        where: {
          accountId: accountId,
          createdAt: {
            gte: todayStart,
            lte: todayEnd
          }
        }
      }),

      // 4. Bu ayki tamamlanan ödemeler (gerçek kazanç)
      prisma.payments.findMany({
        where: {
          status: 'COMPLETED',
          paymentDate: {
            gte: monthStart,
            lte: todayEnd
          },
          sale: {
            accountId: accountId,
            isDeleted: false
          }
        },
        include: {
          sale: {
            select: {
              id: true,
              accountId: true,
              client: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      }),

      // 5. Bugünkü tamamlanan ödemeler (bugünkü kazanç)
      prisma.payments.findMany({
        where: {
          status: 'COMPLETED',
          paymentDate: {
            gte: todayStart,
            lte: todayEnd
          },
          sale: {
            accountId: accountId,
            isDeleted: false
          }
        },
        include: {
          sale: {
            select: {
              id: true,
              accountId: true,
              client: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      }),

      // 6. Bugün tamamlanan randevular
      prisma.appointments.count({
        where: {
          accountId: accountId,
          status: 'COMPLETED',
          appointmentDate: {
            gte: todayStart,
            lte: todayEnd
          }
        }
      }),

      // 7. Bu hafta tamamlanan randevular
      prisma.appointments.count({
        where: {
          accountId: accountId,
          status: 'COMPLETED',
          appointmentDate: {
            gte: weekStart,
            lte: todayEnd
          }
        }
      }),

      // 8. Bu ay tamamlanan randevular
      prisma.appointments.count({
        where: {
          accountId: accountId,
          status: 'COMPLETED',
          appointmentDate: {
            gte: monthStart,
            lte: todayEnd
          }
        }
      })
    ]);

    // Bugünkü randevu istatistiklerini işle
    const todayStats = {
      total: 0,
      planned: 0,
      completed: 0,
      cancelled: 0
    };

    todayAppointments.forEach(stat => {
      todayStats.total += stat._count._all;
      if (stat.status === 'PLANNED') {
        todayStats.planned = stat._count._all;
      } else if (stat.status === 'COMPLETED') {
        todayStats.completed = stat._count._all;
      } else if (stat.status === 'CANCELLED') {
        todayStats.cancelled = stat._count._all;
      }
    });

    // Aylık gelir hesapla
    let monthlyRevenue = 0;
    monthlyPayments.forEach((payment, index) => {
      const amount = parseFloat(payment.amountPaid);
      monthlyRevenue += amount;
    });

    // Bugünkü gelir hesapla
    let todayRevenue = 0;
    todayPayments.forEach((payment, index) => {
      todayRevenue += parseFloat(payment.amountPaid);
    });

    // Yanıt formatı
    const dashboardStats = {
      success: true,
      data: {
        todayAppointments: {
          total: todayStats.total,
          planned: todayStats.planned,
          completed: todayStats.completed,
          cancelled: todayStats.cancelled
        },
        todayClients: {
          total: totalClients,
          newToday: todayNewClients
        },
        todayRevenue: {
          amount: todayRevenue,
          currency: "TRY",
          formatted: `${todayRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
          paymentsCount: todayPayments.length
        },
        monthlyRevenue: {
          amount: monthlyRevenue,
          currency: "TRY",
          formatted: `${monthlyRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
          paymentsCount: monthlyPayments.length
        },
        completedAppointments: {
          today: todayCompleted,
          thisWeek: weekCompleted,
          thisMonth: monthCompleted
        },
        timezone: "+03:00",
        lastUpdated: turkeyTime.toISOString(),
        period: {
          today: todayStart.toISOString().split('T')[0],
          weekStart: weekStart.toISOString().split('T')[0],
          monthStart: monthStart.toISOString().split('T')[0]
        }
      }
    };

    res.status(200).json(dashboardStats);

  } catch (error) {
    console.error('Dashboard istatistikleri hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Dashboard istatistikleri alınırken hata oluştu',
      error: error.message
    });
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const { accountId } = req.user;
    
    // Basit özet istatistikler
    const [
      totalAppointments,
      totalClients,
      totalServices,
      totalStaff
    ] = await Promise.all([
      prisma.appointments.count({
        where: { accountId: accountId }
      }),
      prisma.clients.count({
        where: { accountId: accountId, isActive: true }
      }),
      prisma.services.count({
        where: { accountId: accountId, isActive: true }
      }),
      prisma.staff.count({
        where: { accountId: accountId, isActive: true }
      })
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalAppointments,
        totalClients,
        totalServices,
        totalStaff
      }
    });

  } catch (error) {
    console.error('Dashboard özet hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Dashboard özeti alınırken hata oluştu',
      error: error.message
    });
  }
};


// Hizmet Bazlı Satış Raporu
export const getServiceSalesReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { period, startDate, endDate } = req.query;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'İşletme bilgisi bulunamadı'
      });
    }

    let dateFilter = {};
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      dateFilter = {
        gte: start,
        lte: end
      };
    } else if (period) {
      const now = new Date();
      
      switch (period) {
        case 'day':
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);
          
          dateFilter = {
            gte: today,
            lte: todayEnd
          };
          break;
          
        case 'week':
          const weekStart = new Date();
          weekStart.setDate(now.getDate() - 7);
          weekStart.setHours(0, 0, 0, 0);
          
          dateFilter = {
            gte: weekStart,
            lte: now
          };
          break;
          
        case 'month':
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          
          dateFilter = {
            gte: monthStart,
            lte: now
          };
          break;
          
        default:
          // Default olarak bu ay
          const defaultStart = new Date();
          defaultStart.setDate(1);
          defaultStart.setHours(0, 0, 0, 0);
          
          dateFilter = {
            gte: defaultStart,
            lte: now
          };
      }
    }

    // İki ayrı sorgu: Satışlar ve Ödemeler
    const salesWhereClause = {
      accountId: accountId,
      isDeleted: false
    };
    
    const paymentsWhereClause = {
      status: 'COMPLETED',
      sale: {
        accountId: accountId,
        isDeleted: false
      }
    };

    // Tarih filtresi varsa SATIŞ tarihine uygula (satışlar için)
    if (Object.keys(dateFilter).length > 0) {
      salesWhereClause.saleDate = dateFilter;
    }

    // Tarih filtresi varsa ÖDEME tarihine uygula (ödemeler için)  
    if (Object.keys(dateFilter).length > 0) {
      paymentsWhereClause.paymentDate = dateFilter;
    }

    // Paralel sorgular
    const [sales, payments] = await Promise.all([
      // 1. Tarih aralığında yapılan satışlar
      prisma.sales.findMany({
        where: salesWhereClause,
        include: {
          service: { select: { id: true, serviceName: true } },
          saleItems: {
            select: {
              serviceId: true,
              unitPrice: true,
              service: { select: { id: true, serviceName: true } }
            }
          }
        }
      }),
      
      // 2. Tarih aralığında alınan ödemeler
      prisma.payments.findMany({
        where: paymentsWhereClause,
        include: {
          sale: {
            include: {
              service: { select: { id: true, serviceName: true } },
              saleItems: {
                select: {
                  serviceId: true,
                  unitPrice: true,
                  service: { select: { id: true, serviceName: true } }
                }
              }
            }
          }
        }
      })
    ]);

    // Hizmet bazlı gruplama ve hesaplama
    const serviceStats = {};
    let totalCashReceived = 0; // Kasaya giren gerçek para (COMPLETED ödemeler)
    let totalCount = 0;
    let totalInvoiced = 0;     // Fatura tutarı (ödenmemiş borçlar dahil)

    // 1. Önce satışları işle (fatura tutarı için)
    sales.forEach(sale => {
      const saleAmount = parseFloat(sale.totalAmount);

      if (sale.isPackage && sale.saleItems?.length > 0) {
        // Paket satış: her kalemi ayrı hizmet olarak say
        sale.saleItems.forEach(item => {
          const serviceId = item.serviceId;
          const serviceName = item.service?.serviceName || 'Paket Hizmet';
          const itemShare = saleAmount / sale.saleItems.length;
          if (!serviceStats[serviceId]) {
            serviceStats[serviceId] = { serviceId, serviceName, count: 0, invoicedAmount: 0, paidAmount: 0 };
          }
          serviceStats[serviceId].count += 1;
          serviceStats[serviceId].invoicedAmount += itemShare;
        });
      } else {
        const serviceId = sale.serviceId || 'unknown';
        const serviceName = sale.service?.serviceName || 'Bilinmeyen Hizmet';
        if (!serviceStats[serviceId]) {
          serviceStats[serviceId] = { serviceId, serviceName, count: 0, invoicedAmount: 0, paidAmount: 0 };
        }
        serviceStats[serviceId].count += 1;
        serviceStats[serviceId].invoicedAmount += saleAmount;
      }

      totalInvoiced += saleAmount;
      totalCount += 1;
    });

    // 2. Ödemeleri işle — sadece COMPLETED (kasaya giren gerçek para)
    payments.forEach(payment => {
      const sale = payment.sale;
      const paidAmount = parseFloat(payment.amountPaid);

      if (sale.isPackage && sale.saleItems?.length > 0) {
        // Paket satış: ödemeyi eşit böl
        const perItemPaid = paidAmount / sale.saleItems.length;
        sale.saleItems.forEach(item => {
          const serviceId = item.serviceId;
          const serviceName = item.service?.serviceName || 'Paket Hizmet';
          if (!serviceStats[serviceId]) {
            serviceStats[serviceId] = { serviceId, serviceName, count: 0, invoicedAmount: 0, paidAmount: 0 };
          }
          serviceStats[serviceId].paidAmount += perItemPaid;
        });
      } else {
        const serviceId = sale.serviceId || 'unknown';
        const serviceName = sale.service?.serviceName || 'Bilinmeyen Hizmet';
        if (!serviceStats[serviceId]) {
          serviceStats[serviceId] = { serviceId, serviceName, count: 0, invoicedAmount: 0, paidAmount: 0 };
        }
        serviceStats[serviceId].paidAmount += paidAmount;
      }

      totalCashReceived += paidAmount;
    });

    // Sonuçları array'e çevir ve sırala (en çok tahsilat yapılan önce)
    const servicesArray = Object.values(serviceStats).sort((a, b) => b.paidAmount - a.paidAmount);

    // Alacak (borç) hesapla = fatura - ödenen
    let remainingDebt = 0;
    servicesArray.forEach(service => {
      if (service.invoicedAmount > 0) {
        const debt = service.invoicedAmount - service.paidAmount;
        if (debt > 0) remainingDebt += debt;
      }
    });

    res.json({
      status: 'success',
      data: {
        services: servicesArray,
        summary: {
          totalInvoiced: parseFloat(totalInvoiced.toFixed(2)),       // Fatura tutarı
          totalCashReceived: parseFloat(totalCashReceived.toFixed(2)), // Kasaya giren
          // Geriye dönük uyumluluk için eski alan adları da gönder
          totalRevenue: parseFloat(totalInvoiced.toFixed(2)),
          totalPaidAmount: parseFloat(totalCashReceived.toFixed(2)),
          totalCount: totalCount,
          remainingDebt: parseFloat(remainingDebt.toFixed(2))
        },
        period: {
          type: period || 'custom',
          startDate: dateFilter.gte?.toISOString().split('T')[0],
          endDate: dateFilter.lte?.toISOString().split('T')[0]
        }
      }
    });

  } catch (error) {
    console.error('Hizmet satış raporu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Hizmet satış raporu alınırken hata oluştu',
      error: error.message
    });
  }
}; 