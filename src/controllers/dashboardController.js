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
            accountId: accountId
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
            accountId: accountId
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
    console.log('=== AYLIK ÖDEMELER DEBUG ===');
    console.log('Dönem:', monthStart.toISOString().split('T')[0], '-', todayEnd.toISOString().split('T')[0]);
    console.log('Toplam ödeme sayısı:', monthlyPayments.length);
    
    monthlyPayments.forEach((payment, index) => {
      console.log(`${index + 1}. Ödeme:`, {
        id: payment.id,
        miktar: parseFloat(payment.amountPaid),
        tarih: payment.paymentDate.toISOString().split('T')[0],
        saleId: payment.saleId,
        client: `${payment.sale.client.firstName} ${payment.sale.client.lastName}`
      });
      monthlyRevenue += parseFloat(payment.amountPaid);
    });
    console.log('Hesaplanan aylık toplam:', monthlyRevenue);

    // Bugünkü gelir hesapla
    let todayRevenue = 0;
    console.log('=== BUGÜNKÜ ÖDEMELER DEBUG ===');
    console.log('Bugün:', todayStart.toISOString().split('T')[0], '-', todayEnd.toISOString().split('T')[0]);
    console.log('Bugünkü ödeme sayısı:', todayPayments.length);
    
    todayPayments.forEach((payment, index) => {
      console.log(`${index + 1}. Bugünkü ödeme:`, {
        id: payment.id,
        miktar: parseFloat(payment.amountPaid),
        tarih: payment.paymentDate.toISOString().split('T')[0],
        saleId: payment.saleId,
        client: `${payment.sale.client.firstName} ${payment.sale.client.lastName}`
      });
      todayRevenue += parseFloat(payment.amountPaid);
    });
    console.log('Hesaplanan bugünkü toplam:', todayRevenue);

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