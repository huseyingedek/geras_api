import prisma from '../lib/prisma.js';
import AppError from '../utils/AppError.js';
import { sendSMS } from '../utils/smsService.js';

/**
 * Tarih parse helper: "YYYY-MM-DD" gibi sadece tarih geldiğinde
 * new Date() midnight UTC üretir → Türkiye saatinde 03:00 görünür.
 * Çözüm: sadece tarih varsa o günün şu anki saatini kullan;
 * datetime string ise olduğu gibi parse et.
 */
const parseLocalDate = (dateStr) => {
  if (!dateStr) return new Date();
  // ISO datetime (T içeriyorsa) veya zaman bilgisi varsa direkt parse et
  if (dateStr.includes('T') || dateStr.includes(' ')) {
    return new Date(dateStr);
  }
  // Sadece "YYYY-MM-DD" → o günün şu anki saatiyle birleştir (UTC kayması olmaz)
  const now = new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), 0);
};

const calculatePrice = (service, quantity) => {
  const calculatedPrice = service.price * quantity;
  return parseFloat(calculatedPrice.toFixed(2));
};

// Tarih filtreleme helper fonksiyonları
const getDateRange = (period) => {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  switch (period) {
    case 'today':
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      return {
        startDate: today,
        endDate: todayEnd
      };
    
    case 'yesterday':
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);
      return {
        startDate: yesterday,
        endDate: yesterdayEnd
      };
    
    case 'thisWeek':
      const startOfWeek = new Date(today);
      const dayOfWeek = startOfWeek.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Pazartesi başlangıç
      startOfWeek.setDate(startOfWeek.getDate() + diff);
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6); // Pazar günü sonu
      endOfWeek.setHours(23, 59, 59, 999);
      
      return {
        startDate: startOfWeek,
        endDate: endOfWeek
      };
    
    case 'thisMonth':
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Ayın son günü
      endOfMonth.setHours(23, 59, 59, 999);
      
      return {
        startDate: startOfMonth,
        endDate: endOfMonth
      };
    
    default:
      return null;
  }
};

export const getAllSales = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { isDeleted, search, period, startDate, endDate, isPaid } = req.query;
    
    const hasPageParam = req.query.page !== undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = hasPageParam ? (parseInt(req.query.limit) || 50) : 999999;
    const offset = (page - 1) * limit;

    // 🔒 PERFORMANS KORUMASI: Milyonlarca kayıt olduğu için en az 1 filtre zorunlu
    const hasFilter = search || period || startDate || endDate || isDeleted || isPaid;
    
    if (!hasFilter) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          page,
          limit: hasPageParam ? limit : null,
          total: 0,
          totalPages: 0,
          hasPageParam
        },
        summary: {
          totalSalesAmount: 0,
          totalRevenue: 0,
          sessionBased: 0,
          activeSessions: 0
        },
        message: 'Lütfen arama veya filtreleme yapınız (milyonlarca kayıt için performans koruması)',
        filter: {
          isDeleted: null,
          search: null,
          period: null,
          startDate: null,
          endDate: null,
          isPaid: null
        }
      });
    }

    let whereClause = {
      accountId: accountId
    };

    if (isDeleted === 'true') {
      whereClause.isDeleted = true;
    } else if (isDeleted === 'all') {
    } else {
      whereClause.isDeleted = false;
    }

    // Tarih filtreleme
    let dateFilter = null;

    if (period && period !== 'custom') {
      // Hızlı tarih seçimleri (bugün, dün, bu hafta, bu ay)
      dateFilter = getDateRange(period);
    } else if (startDate || endDate) {
      // Özel tarih aralığı
      dateFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.startDate = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.endDate = end;
      }
    }

    // Tarih filtresini whereClause'a ekle
    if (dateFilter && (dateFilter.startDate || dateFilter.endDate)) {
      whereClause.saleDate = {};
      if (dateFilter.startDate) {
        whereClause.saleDate.gte = dateFilter.startDate;
      }
      if (dateFilter.endDate) {
        whereClause.saleDate.lte = dateFilter.endDate;
      }
    }

    // 🔍 Genişletilmiş arama: Müşteri adı + Telefon + Hizmet adı
    if (search && search.trim()) {
      const searchTerm = search.trim().toLowerCase();
      
      // OR koşulları: Müşteri, Telefon veya Hizmet
      const searchConditions = [];
      
      // 1. Müşteri adı araması
      searchConditions.push({
        client: {
          OR: [
            {
              firstName: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            },
            {
              lastName: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            },
            {
              phone: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            }
          ]
        }
      });
      
      // 2. Hizmet adı araması
      searchConditions.push({
        service: {
          serviceName: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        }
      });
      
      whereClause.OR = searchConditions;
    }

    // Satışları getir (isPaid filtresi için payments dahil)
    let sales = await prisma.sales.findMany({
      where: whereClause,
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
          select: {
            id: true,
            serviceName: true,
            price: true,
            isSessionBased: true,
            sessionCount: true
          }
        },
        payments: {
          where: {
            status: 'COMPLETED'
          },
          select: {
            id: true,
            paymentDate: true,
            amountPaid: true,
            paymentMethod: true,
            status: true
          }
        },
        sessions: {
          select: {
            id: true,
            sessionDate: true,
            status: true
          }
        },
        reference_sources: {
          select: {
            id: true,
            reference_type: true,
            reference_name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
      // Not: isPaid filtresi için pagination'ı sonra yapacağız
    });

    // 💰 isPaid filtresi (ödeme durumu kontrolü)
    if (isPaid === 'true' || isPaid === 'false') {
      sales = sales.filter(sale => {
        const totalPaid = sale.payments.reduce((sum, payment) => {
          return sum + parseFloat(payment.amountPaid);
        }, 0);
        const remainingPayment = parseFloat(sale.totalAmount) - totalPaid;
        
        if (isPaid === 'true') {
          return remainingPayment <= 0.01; // Tamamen ödendi (küçük tolerans)
        } else {
          return remainingPayment > 0.01; // Ödenmedi veya kısmi ödendi
        }
      });
    }

    // 📄 Pagination'ı filtrelenmiş sonuçlara uygula
    const totalSales = sales.length;
    const paginatedSales = hasPageParam ? sales.slice(offset, offset + limit) : sales;

    console.log('  - Toplam satış:', totalSales);
    console.log('  - Döndürülen satış:', paginatedSales.length);

    // 📊 Summary hesaplamaları (filtrelenmiş satışlar üzerinden)
    let totalSalesAmount = 0;
    let totalRevenue = 0;
    let sessionBased = 0;
    let activeSessions = 0;

    sales.forEach(sale => {
      // Toplam satış tutarı
      totalSalesAmount += parseFloat(sale.totalAmount);
      
      // Toplam gelir (tamamlanan ödemeler)
      const saleRevenue = sale.payments.reduce((sum, payment) => {
        return sum + parseFloat(payment.amountPaid);
      }, 0);
      totalRevenue += saleRevenue;
      
      // Seans bazlı satış sayısı
      if (sale.service.isSessionBased) {
        sessionBased += 1;
        
        // Aktif seans sayısı (kalan seans > 0)
        if (sale.remainingSessions > 0) {
          activeSessions += 1;
        }
      }
    });

    res.json({
      success: true,
      data: paginatedSales,
      pagination: hasPageParam ? {
        // Liste görünümünde normal pagination
        page,
        limit,
        total: totalSales,
        totalPages: Math.ceil(totalSales / limit),
        hasPageParam: true
      } : {
        // Dropdown görünümünde pagination yok
        total: totalSales,
        returned: paginatedSales.length,
        hasPageParam: false
      },
      summary: {
        totalSalesAmount: parseFloat(totalSalesAmount.toFixed(2)),
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        sessionBased: sessionBased,
        activeSessions: activeSessions
      },
      filter: {
        isDeleted: isDeleted || 'false',
        search: search || null,
        period: period || null,
        startDate: startDate || null,
        endDate: endDate || null,
        isPaid: isPaid || null
      },
      dateRange: dateFilter ? {
        startDate: dateFilter.startDate?.toISOString(),
        endDate: dateFilter.endDate?.toISOString()
      } : null
    });
  } catch (error) {
    console.error('Satışları listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Satışlar listelenemedi',
      error: error.message
    });
  }
};

export const createSale = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { 
      clientId, 
      serviceId, 
      requestedSessions,
      totalAmount,
      notes,
      saleDate,
      reference_id  // ✅ Referans ID eklendi
    } = req.body;

    const account = await prisma.accounts.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'İşletme bulunamadı'
      });
    }

    const service = await prisma.services.findFirst({
      where: {
        id: serviceId,
        accountId: accountId,
        isActive: true
      }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Hizmet bulunamadı'
      });
    }

    const client = await prisma.clients.findFirst({
      where: {
        id: clientId,
        accountId: accountId,
        isActive: true
      }
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri bulunamadı'
      });
    }

    // Satış tarihi - frontend'den gelen tarihi kullan veya şu anki zamanı al
    const finalSaleDate = saleDate ? new Date(saleDate) : new Date();
    
    if (finalSaleDate > new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Satış tarihi gelecek bir tarih olamaz'
      });
    }

    let finalPrice;
    let finalTotalAmount;
    let finalSessions;

    if (account.businessType === 'NON_SESSION_BASED') {
      finalSessions = 1;
      
      if (totalAmount !== undefined && totalAmount !== null) {
        finalPrice = totalAmount;
        finalTotalAmount = totalAmount;
      } else {
        finalPrice = service.price;
        finalTotalAmount = service.price;
      }

    } else {
      
      if (!requestedSessions || requestedSessions <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Seans/adet sayısı belirtilmelidir'
        });
      }

      finalSessions = requestedSessions;
      
      if (service.sessionCount > 1) {
        if (requestedSessions > service.sessionCount) {
          return res.status(400).json({
            success: false,
            message: `Bu hizmet maksimum ${service.sessionCount} seans olarak satılabilir`
          });
        }
        
        if (totalAmount !== undefined && totalAmount !== null) {
          finalPrice = totalAmount;
          finalTotalAmount = totalAmount;
        } else {
          finalPrice = service.price;
          finalTotalAmount = service.price;
        }

      } else {
        if (totalAmount !== undefined && totalAmount !== null) {
          finalPrice = totalAmount;
          finalTotalAmount = totalAmount;
        } else {
          finalPrice = calculatePrice(service, requestedSessions);
          finalTotalAmount = finalPrice;
        }
      }
    }

    const sale = await prisma.sales.create({
      data: {
        accountId: accountId,
        clientId: clientId,
        serviceId: serviceId,
        saleDate: finalSaleDate,
        totalAmount: finalTotalAmount,
        remainingSessions: finalSessions,
        notes: notes || null,
        reference_id: reference_id || null  // ✅ Referans eklendi (opsiyonel)
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
          select: {
            id: true,
            serviceName: true,
            price: true,
            isSessionBased: true,
            sessionCount: true
          }
        },
        reference_sources: {  // ✅ Referans bilgisini de getir
          select: {
            id: true,
            reference_type: true,
            reference_name: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Satış başarıyla oluşturuldu',
      data: sale
    });

  } catch (error) {
    console.error('Satış oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Satış oluşturulamadı',
      error: error.message
    });
  }
};

export const createSaleWithAppointment = async (req, res) => {
  try {
    const { accountId } = req.user;
    const {
      clientId,
      serviceId,
      requestedSessions,
      totalAmount,
      notes,
      saleDate,
      reference_id,
      appointment // { staffId, appointmentDate, notes }
    } = req.body;

    if (!clientId || !serviceId || !appointment?.staffId || !appointment?.appointmentDate) {
      return res.status(400).json({
        success: false,
        message: 'Gerekli alanlar eksik: clientId, serviceId, appointment.staffId, appointment.appointmentDate'
      });
    }

    const account = await prisma.accounts.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'İşletme bulunamadı'
      });
    }

    const service = await prisma.services.findFirst({
      where: {
        id: serviceId,
        accountId: accountId,
        isActive: true
      }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Hizmet bulunamadı'
      });
    }

    const client = await prisma.clients.findFirst({
      where: {
        id: clientId,
        accountId: accountId,
        isActive: true
      }
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri bulunamadı'
      });
    }

    const staff = await prisma.staff.findFirst({
      where: {
        id: appointment.staffId,
        accountId: accountId,
        isActive: true
      },
      include: {
        workingHours: true
      }
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Personel bulunamadı'
      });
    }

    // Satış tarihi - frontend'den gelen tarihi kullan veya şu anki zamanı al
    const finalSaleDate = saleDate ? new Date(saleDate) : new Date();
    
    if (finalSaleDate > new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Satış tarihi gelecek bir tarih olamaz'
      });
    }

    // Satış fiyatı / seans hesapları
    let finalPrice;
    let finalTotalAmount;
    let finalSessions;

    if (account.businessType === 'NON_SESSION_BASED') {
      finalSessions = 1;
      if (totalAmount !== undefined && totalAmount !== null) {
        finalPrice = totalAmount;
        finalTotalAmount = totalAmount;
      } else {
        finalPrice = service.price;
        finalTotalAmount = service.price;
      }
    } else {
      if (!requestedSessions || requestedSessions <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Seans/adet sayısı belirtilmelidir'
        });
      }

      finalSessions = requestedSessions;

      if (service.sessionCount > 1 && requestedSessions > service.sessionCount) {
        return res.status(400).json({
          success: false,
          message: `Bu hizmet maksimum ${service.sessionCount} seans olarak satılabilir`
        });
      }

      if (totalAmount !== undefined && totalAmount !== null) {
        finalPrice = totalAmount;
        finalTotalAmount = totalAmount;
      } else {
        finalPrice = service.sessionCount > 1
          ? service.price
          : calculatePrice(service, requestedSessions);
        finalTotalAmount = finalPrice;
      }
    }

    // Randevu tarih/saat validasyonu
    const appointmentStart = new Date(appointment.appointmentDate);
    const now = new Date();
    if (appointmentStart <= now) {
      return res.status(400).json({
        success: false,
        message: 'Geçmiş tarihe randevu oluşturulamaz'
      });
    }

    const serviceDuration = service.durationMinutes || 60;
    const appointmentEnd = new Date(appointmentStart.getTime() + (serviceDuration * 60000));
    const dayOfWeek = appointmentStart.getDay();

    const workingHour = staff.workingHours.find(wh => wh.dayOfWeek === dayOfWeek && wh.isWorking);
    if (!workingHour) {
      return res.status(400).json({
        success: false,
        message: 'Personel bu gün çalışmıyor'
      });
    }

    const workStart = new Date(workingHour.startTime);
    const workEnd = new Date(workingHour.endTime);
    const appointmentHour = appointmentStart.getHours();
    const appointmentMinute = appointmentStart.getMinutes();
    const endHour = appointmentEnd.getHours();
    const endMinute = appointmentEnd.getMinutes();
    const workStartHour = workStart.getHours();
    const workStartMinute = workStart.getMinutes();
    const workEndHour = workEnd.getHours();
    const workEndMinute = workEnd.getMinutes();

    const appointmentTimeInMinutes = appointmentHour * 60 + appointmentMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;
    const workStartInMinutes = workStartHour * 60 + workStartMinute;
    const workEndInMinutes = workEndHour * 60 + workEndMinute;

    if (appointmentTimeInMinutes < workStartInMinutes || endTimeInMinutes > workEndInMinutes) {
      return res.status(400).json({
        success: false,
        message: `Randevu çalışma saatleri dışında. Çalışma saatleri: ${workStartHour.toString().padStart(2, '0')}:${workStartMinute.toString().padStart(2, '0')} - ${workEndHour.toString().padStart(2, '0')}:${workEndMinute.toString().padStart(2, '0')}`
      });
    }

    const startOfDay = new Date(appointmentStart);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(appointmentStart);
    endOfDay.setHours(23, 59, 59, 999);

    const conflictingAppointments = await prisma.appointments.findMany({
      where: {
        staffId: appointment.staffId,
        appointmentDate: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: {
          not: 'CANCELLED'
        }
      },
      include: {
        service: {
          select: {
            durationMinutes: true
          }
        }
      }
    });

    for (const existing of conflictingAppointments) {
      const existingStart = new Date(existing.appointmentDate);
      const existingDuration = existing.service.durationMinutes || 60;
      const existingEnd = new Date(existingStart.getTime() + (existingDuration * 60000));

      if (
        (appointmentStart >= existingStart && appointmentStart < existingEnd) ||
        (appointmentEnd > existingStart && appointmentEnd <= existingEnd) ||
        (appointmentStart <= existingStart && appointmentEnd >= existingEnd)
      ) {
        return res.status(400).json({
          success: false,
          message: `Bu saatte çakışan randevu var: ${existingStart.getHours().toString().padStart(2, '0')}:${existingStart.getMinutes().toString().padStart(2, '0')} - ${existingEnd.getHours().toString().padStart(2, '0')}:${existingEnd.getMinutes().toString().padStart(2, '0')} (${existing.customerName})`
        });
      }
    }

    // Hatırlatma hesapla
    const reminderHours = account?.reminderHours ?? 24;
    const reminderTime = new Date(appointmentStart.getTime() - (reminderHours * 60 * 60 * 1000));
    const hoursUntilReminder = (reminderTime.getTime() - now.getTime()) / (60 * 60 * 1000);
    const shouldMarkAsSent = hoursUntilReminder <= 2;

    // Tek transaction ile satış + randevu oluştur
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sales.create({
        data: {
          accountId: accountId,
          clientId: clientId,
          serviceId: serviceId,
          saleDate: finalSaleDate,
          totalAmount: finalTotalAmount,
          remainingSessions: finalSessions,
          notes: notes || null,
          reference_id: reference_id || null
        }
      });

      const appointmentRecord = await tx.appointments.create({
        data: {
          accountId: accountId,
          customerName: `${client.firstName} ${client.lastName}`,
          clientId: clientId,
          serviceId: serviceId,
          staffId: appointment.staffId,
          saleId: sale.id,
          appointmentDate: appointmentStart.toISOString(),
          notes: appointment?.notes || null,
          reminderSentAt: shouldMarkAsSent ? new Date() : null
        }
      });

      return { sale, appointment: appointmentRecord };
    });

    const appointmentWithDetails = await prisma.appointments.findUnique({
      where: { id: result.appointment.id },
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
          select: {
            id: true,
            serviceName: true,
            price: true,
            durationMinutes: true,
            isSessionBased: true,
            sessionCount: true
          }
        },
        staff: {
          select: {
            id: true,
            fullName: true,
            role: true
          }
        },
        sale: {
          include: {
            payments: {
              where: {
                status: 'COMPLETED'
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Satış ve randevu başarıyla oluşturuldu',
      data: {
        sale: {
          ...result.sale,
          totalAmount: parseFloat(result.sale.totalAmount),
          remainingSessions: result.sale.remainingSessions
        },
        appointment: appointmentWithDetails
      }
    });

  } catch (error) {
    console.error('Satış + randevu oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Satış ve randevu oluşturulamadı',
      error: error.message
    });
  }
};

export const getSaleById = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const sale = await prisma.sales.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        isDeleted: false
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
          select: {
            id: true,
            serviceName: true,
            description: true,
            price: true,
            isSessionBased: true,
            sessionCount: true,
            durationMinutes: true
          }
        },
        payments: {
          orderBy: {
            paymentDate: 'desc'
          }
        },
        sessions: {
          orderBy: {
            sessionDate: 'desc'
          },
          include: {
            staff: {
              select: {
                id: true,
                fullName: true
              }
            }
          }
        },
        reference_sources: {
          select: {
            id: true,
            reference_type: true,
            reference_name: true,
            notes: true
          }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    const saleTotal = parseFloat(sale.totalAmount);

    const completedAmount = sale.payments
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    const pendingAmount = sale.payments
      .filter(p => p.status === 'PENDING')
      .reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    const pendingInstallmentAmount = sale.payments
      .filter(p => p.status === 'PENDING' && p.installmentNumber !== null)
      .reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    const remainingDebt = Math.max(0, saleTotal - completedAmount);

    res.json({
      success: true,
      data: {
        ...sale,
        paymentStatus: {
          totalAmount: saleTotal.toFixed(2),
          completedAmount: completedAmount.toFixed(2),
          pendingAmount: pendingAmount.toFixed(2),
          pendingInstallmentAmount: pendingInstallmentAmount.toFixed(2),
          remainingDebt: remainingDebt.toFixed(2),
          isPaid: remainingDebt <= 0,
          // Eski alan adları (geriye dönük uyumluluk)
          totalPaid: completedAmount.toFixed(2),
          remainingPayment: remainingDebt.toFixed(2)
        }
      }
    });
  } catch (error) {
    console.error('Satış detayı getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Satış detayı getirilemedi',
      error: error.message
    });
  }
};

export const updateSale = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { serviceId, totalAmount, remainingSessions, notes, reference_id } = req.body;  // ✅ reference_id eklendi

    const existingSale = await prisma.sales.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        isDeleted: false
      }
    });

    if (!existingSale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    // 🔒 2 GÜN SONRA GÜNCELLEME ENGELİ
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0);
    
    const saleDate = new Date(existingSale.saleDate);
    saleDate.setHours(0, 0, 0, 0);
    
    if (saleDate < twoDaysAgo) {
      return res.status(403).json({
        success: false,
        message: 'Bu satış 2 günden eski olduğu için güncellenemez',
        saleDate: existingSale.saleDate
      });
    }

    // Eğer serviceId güncelleniyorsa, hizmeti kontrol et
    if (serviceId && serviceId !== existingSale.serviceId) {
      const service = await prisma.services.findFirst({
        where: {
          id: serviceId,
          accountId: accountId,
          isActive: true
        }
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Hizmet bulunamadı'
        });
      }
    }

    // Eğer remainingSessions güncelleniyorsa, geçerli olup olmadığını kontrol et
    if (remainingSessions !== undefined && remainingSessions < 0) {
      return res.status(400).json({
        success: false,
        message: 'Kalan seans sayısı negatif olamaz'
      });
    }

    const updateData = {
      serviceId: serviceId || existingSale.serviceId,
      totalAmount: totalAmount || existingSale.totalAmount,
      remainingSessions: remainingSessions !== undefined ? remainingSessions : existingSale.remainingSessions,
      notes: notes !== undefined ? notes : existingSale.notes,
      reference_id: reference_id !== undefined ? reference_id : existingSale.reference_id  // ✅ Referans güncellenebilir
    };

    const updatedSale = await prisma.sales.update({
      where: {
        id: parseInt(id)
      },
      data: updateData,
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
          select: {
            id: true,
            serviceName: true,
            price: true,
            isSessionBased: true,
            sessionCount: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Satış başarıyla güncellendi',
      data: updatedSale
    });
  } catch (error) {
    console.error('Satış güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Satış güncellenemedi',
      error: error.message
    });
  }
};

export const deleteSale = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const existingSale = await prisma.sales.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        isDeleted: false
      }
    });

    if (!existingSale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    // 🔒 2 GÜN SONRA SİLME ENGELİ
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0);
    
    const saleDate = new Date(existingSale.saleDate);
    saleDate.setHours(0, 0, 0, 0);
    
    if (saleDate < twoDaysAgo) {
      return res.status(403).json({
        success: false,
        message: 'Bu satış 2 günden eski olduğu için silinemez',
        saleDate: existingSale.saleDate
      });
    }

    await prisma.sales.update({
      where: {
        id: parseInt(id)
      },
      data: {
        isDeleted: true
      }
    });

    res.json({
      success: true,
      message: 'Satış başarıyla silindi (soft delete)'
    });
  } catch (error) {
    console.error('Satış silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Satış silinemedi',
      error: error.message
    });
  }
};

export const hardDeleteSale = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const existingSale = await prisma.sales.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId
      }
    });

    if (!existingSale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    await prisma.sales.delete({
      where: {
        id: parseInt(id)
      }
    });

    res.json({
      success: true,
      message: 'Satış kalıcı olarak silindi (hard delete)'
    });
  } catch (error) {
    console.error('Satış kalıcı silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Satış kalıcı olarak silinemedi',
      error: error.message
    });
  }
};

export const getSalePayments = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const sale = await prisma.sales.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        isDeleted: false
      },
      include: {
        payments: {
          orderBy: [
            { installmentNumber: 'asc' },
            { paymentDate: 'desc' }
          ]
        }
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    const saleTotal = parseFloat(sale.totalAmount);

    const completedAmount = sale.payments
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    const pendingAmount = sale.payments
      .filter(p => p.status === 'PENDING')
      .reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    const remainingDebt = Math.max(0, saleTotal - completedAmount);

    res.json({
      success: true,
      data: sale.payments,
      summary: {
        totalAmount: saleTotal.toFixed(2),
        completedAmount: completedAmount.toFixed(2),
        pendingAmount: pendingAmount.toFixed(2),
        remainingDebt: remainingDebt.toFixed(2),
        isPaid: remainingDebt <= 0,
        isInstallment: sale.isInstallment,
        smsReminderEnabled: sale.smsReminderEnabled
      }
    });
  } catch (error) {
    console.error('Ödemeler getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Ödemeler getirilemedi',
      error: error.message
    });
  }
};

export const addPaymentToSale = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { amountPaid, paymentMethod, status, notes, paymentDate } = req.body;

    const sale = await prisma.sales.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        isDeleted: false
      },
      include: {
        payments: {
          where: {
            status: 'COMPLETED'
          }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    // ✅ 2 GÜNLÜK KISITLAMA KALDIRILDI - Ödemeler her zaman eklenebilir

    const totalPaid = sale.payments.reduce((sum, payment) => sum + parseFloat(payment.amountPaid), 0);
    const remainingAmount = parseFloat(sale.totalAmount) - totalPaid;

    if (status === 'COMPLETED' && amountPaid > remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Ödeme miktarı kalan borçtan (${remainingAmount.toFixed(2)}) fazla olamaz`
      });
    }

    // Ödeme tarihi - sadece tarih gelirse (YYYY-MM-DD) gece yarısı UTC olmaz
    const finalPaymentDate = parseLocalDate(paymentDate);

    const payment = await prisma.payments.create({
      data: {
        saleId: parseInt(id),
        amountPaid: amountPaid,
        paymentMethod: paymentMethod || 'CASH',
        status: status || 'COMPLETED',
        notes: notes,
        paymentDate: finalPaymentDate
      }
    });

    res.status(201).json({
      success: true,
      message: 'Ödeme başarıyla eklendi',
      data: payment
    });
  } catch (error) {
    console.error('Ödeme ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Ödeme eklenemedi',
      error: error.message
    });
  }
};

export const getSaleSessions = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const sale = await prisma.sales.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        isDeleted: false
      },
      include: {
        sessions: {
          orderBy: {
            sessionDate: 'desc'
          },
          include: {
            staff: {
              select: {
                id: true,
                fullName: true
              }
            }
          }
        },
        service: {
          select: {
            isSessionBased: true
          }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    res.json({
      success: true,
      data: {
        sessions: sale.sessions,
        remainingSessions: sale.remainingSessions,
        isSessionBased: sale.service.isSessionBased
      }
    });
  } catch (error) {
    console.error('Seanslar getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Seanslar getirilemedi',
      error: error.message
    });
  }
};

export const createSession = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { sessionDate, staffId, notes } = req.body;

    const sale = await prisma.sales.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        isDeleted: false
      },
      include: {
        service: true
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    if (!sale.service.isSessionBased) {
      return res.status(400).json({
        success: false,
        message: 'Bu hizmet seans tabanlı değil'
      });
    }

    if (sale.remainingSessions <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Kalan seans hakkı bulunmuyor'
      });
    }

    if (staffId) {
      const staff = await prisma.staff.findFirst({
        where: {
          id: staffId,
          accountId: accountId,
          isActive: true
        }
      });

      if (!staff) {
        return res.status(404).json({
          success: false,
          message: 'Personel bulunamadı'
        });
      }
    }

    const result = await prisma.$transaction(async (prisma) => {
      const session = await prisma.sessions.create({
        data: {
          saleId: parseInt(id),
          sessionDate: sessionDate ? new Date(sessionDate) : new Date(),
          staffId: staffId || null,
          notes: notes,
          status: 'COMPLETED'
        },
        include: {
          staff: {
            select: {
              id: true,
              fullName: true
            }
          }
        }
      });

      const updatedSale = await prisma.sales.update({
        where: {
          id: parseInt(id)
        },
        data: {
          remainingSessions: sale.remainingSessions - 1
        }
      });

      return { session, updatedSale };
    });

    res.status(201).json({
      success: true,
      message: 'Seans başarıyla tamamlandı',
      data: {
        session: result.session,
        remainingSessions: result.updatedSale.remainingSessions,
        isCompleted: result.updatedSale.remainingSessions === 0
      }
    });
  } catch (error) {
    console.error('Seans tamamlama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Seans tamamlanamadı',
      error: error.message
    });
  }
};

export const addSessionsToSale = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { additionalSessions, additionalAmount } = req.body;

    const sale = await prisma.sales.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId,
        isDeleted: false
      },
      include: {
        service: true
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    if (!additionalSessions || additionalSessions <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Geçerli bir seans/adet sayısı belirtiniz'
      });
    }

    if (!additionalAmount || additionalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Ek seans/adet için fiyat belirtilmelidir'
      });
    }

    const updatedSale = await prisma.sales.update({
      where: {
        id: parseInt(id)
      },
      data: {
        totalAmount: parseFloat(sale.totalAmount) + additionalAmount,
        remainingSessions: sale.remainingSessions + additionalSessions
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        service: {
          select: {
            id: true,
            serviceName: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: `${additionalSessions} ${sale.service.isSessionBased ? 'seans' : 'adet'} başarıyla eklendi`,
      data: updatedSale
    });
  } catch (error) {
    console.error('Ek seans ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Ek seans eklenemedi',
      error: error.message
    });
  }
};

export const getAllPayments = async (req, res) => {
  try {
    const { accountId } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { paymentMethod, status, period, startDate, endDate, search } = req.query;

    let whereClause = {
      sale: {
        accountId: accountId,
        isDeleted: false
      }
    };

    if (paymentMethod) {
      whereClause.paymentMethod = paymentMethod;
    }

    if (status) {
      whereClause.status = status;
    }

    // Tarih filtreleme (ödemeler için)
    let dateFilter = null;

    if (period && period !== 'custom') {
      // Hızlı tarih seçimleri (bugün, dün, bu hafta, bu ay)
      dateFilter = getDateRange(period);
    } else if (startDate || endDate) {
      // Özel tarih aralığı
      dateFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.startDate = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.endDate = end;
      }
    }

    // Tarih filtresini whereClause'a ekle (paymentDate için)
    if (dateFilter && (dateFilter.startDate || dateFilter.endDate)) {
      whereClause.paymentDate = {};
      if (dateFilter.startDate) {
        whereClause.paymentDate.gte = dateFilter.startDate;
      }
      if (dateFilter.endDate) {
        whereClause.paymentDate.lte = dateFilter.endDate;
      }
    }

    // Müşteri adı ve hizmet adıyla arama özelliği
    if (search && search.trim()) {
      const searchTerm = search.trim().toLowerCase();
      whereClause.sale = {
        ...whereClause.sale,
        OR: [
          // Müşteri adı araması
          {
            client: {
              OR: [
                {
                  firstName: {
                    contains: searchTerm,
                    mode: 'insensitive'
                  }
                },
                {
                  lastName: {
                    contains: searchTerm,
                    mode: 'insensitive'
                  }
                },
                // Tam isim araması için (ad + soyad birleşimi)
                {
                  AND: [
                    {
                      OR: [
                        { firstName: { contains: searchTerm.split(' ')[0] || '', mode: 'insensitive' } },
                        { lastName: { contains: searchTerm.split(' ')[0] || '', mode: 'insensitive' } }
                      ]
                    },
                    searchTerm.split(' ').length > 1 ? {
                      OR: [
                        { firstName: { contains: searchTerm.split(' ')[1] || '', mode: 'insensitive' } },
                        { lastName: { contains: searchTerm.split(' ')[1] || '', mode: 'insensitive' } }
                      ]
                    } : {}
                  ]
                }
              ]
            }
          },
          // Hizmet adı araması
          {
            service: {
              serviceName: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            }
          }
        ]
      };
    }

    const payments = await prisma.payments.findMany({
      where: whereClause,
      include: {
        sale: {
          select: {
            id: true,
            saleDate: true,
            totalAmount: true,
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
              select: {
                id: true,
                serviceName: true,
                price: true
              }
            }
          }
        }
      },
      orderBy: {
        paymentDate: 'desc'
      },
      skip: offset,
      take: limit
    });

    const totalPayments = await prisma.payments.count({
      where: whereClause
    });

    const totalAmountResult = await prisma.payments.aggregate({
      where: {
        ...whereClause,
        status: 'COMPLETED'
      },
      _sum: {
        amountPaid: true
      }
    });

    const statusSummary = await prisma.payments.groupBy({
      by: ['status'],
      where: whereClause,
      _count: {
        id: true
      },
      _sum: {
        amountPaid: true
      }
    });

    // Bugünkü ödemeleri hesapla
    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const todayPaymentsCount = await prisma.payments.count({
      where: {
        paymentDate: {
          gte: todayStart,
          lte: todayEnd
        },
        sale: {
          accountId: accountId,
          isDeleted: false
        }
      }
    });

    res.json({
      success: true,
      data: payments,
      pagination: {
        page,
        limit,
        total: totalPayments,
        totalPages: Math.ceil(totalPayments / limit)
      },
      summary: {
        totalAmount: totalAmountResult._sum.amountPaid || 0,  // Sadece COMPLETED ödemeler
        totalPayments: totalPayments,
        todayPayments: todayPaymentsCount,  // Bugünkü ödeme sayısı
        statusSummary: statusSummary
      },
      filter: {
        paymentMethod: paymentMethod || 'all',
        status: status || 'all',
        period: period || null,
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null
      },
      dateRange: dateFilter ? {
        startDate: dateFilter.startDate?.toISOString(),
        endDate: dateFilter.endDate?.toISOString()
      } : null
    });
  } catch (error) {
    console.error('Ödemeler listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Ödemeler listelenemedi',
      error: error.message
    });
  }
};

export const updatePaymentStatus = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { paymentId } = req.params;
    const { status, notes, paymentDate } = req.body;

    const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz ödeme durumu. Geçerli değerler: PENDING, COMPLETED, FAILED, REFUNDED'
      });
    }

    // Ödemenin varlığını ve yetkiyi kontrol et
    const payment = await prisma.payments.findFirst({
      where: {
        id: parseInt(paymentId),
        sale: {
          accountId: accountId,
          isDeleted: false
        }
      },
      include: {
        sale: {
          select: {
            id: true,
            totalAmount: true,
            client: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Ödeme bulunamadı'
      });
    }

    // ✅ 2 GÜNLÜK KISITLAMA KALDIRILDI - Ödemeler her zaman güncellenebilir

    // Güncelleme verilerini hazırla
    const updateData = {
      status: status,
      notes: notes || payment.notes,
      updatedAt: new Date()
    };

    // Eğer paymentDate verilmişse güncelle (sadece tarih gelirse UTC kayması olmaz)
    if (paymentDate) {
      updateData.paymentDate = parseLocalDate(paymentDate);
    }

    // Ödeme durumunu güncelle
    const updatedPayment = await prisma.payments.update({
      where: {
        id: parseInt(paymentId)
      },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Ödeme durumu başarıyla güncellendi',
      data: updatedPayment
    });
  } catch (error) {
    console.error('Ödeme durumu güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Ödeme durumu güncellenemedi',
      error: error.message
    });
  }
};

export const getPaymentById = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { paymentId } = req.params;

    const payment = await prisma.payments.findFirst({
      where: {
        id: parseInt(paymentId),
        sale: {
          accountId: accountId,
          isDeleted: false
        }
      },
      include: {
        sale: {
          select: {
            id: true,
            saleDate: true,
            totalAmount: true,
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
              select: {
                id: true,
                serviceName: true,
                price: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Ödeme bulunamadı'
      });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Ödeme detayı getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Ödeme detayı getirilemedi',
      error: error.message
    });
  }
};

// ──────────────────────────────────────────────
//  TAKSİT SİSTEMİ
// ──────────────────────────────────────────────

/**
 * POST /api/sales/:id/installments
 * Bir satış için taksit planı oluşturur.
 * Body: { installments: [{amount, dueDate}, ...], smsReminderEnabled: true/false }
 * Validasyon: taksit tutarları toplamı ≤ sale.totalAmount
 */
export const createInstallmentPlan = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { installments, smsReminderEnabled = true } = req.body;

    if (!Array.isArray(installments) || installments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'En az 1 taksit belirtilmelidir'
      });
    }

    // Satışı doğrula
    const sale = await prisma.sales.findFirst({
      where: { id: parseInt(id), accountId, isDeleted: false },
      include: {
        client: { select: { firstName: true, lastName: true, phone: true, gender: true } },
        service: { select: { serviceName: true } },
        payments: true
      }
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Satış bulunamadı' });
    }

    // Zaten taksit planı var mı?
    if (sale.isInstallment && sale.payments.some(p => p.installmentNumber !== null)) {
      return res.status(400).json({
        success: false,
        message: 'Bu satış için zaten taksit planı mevcut. Mevcut taksitleri güncelleyin.'
      });
    }

    // Taksit tutarlarını doğrula
    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i];
      if (!inst.amount || parseFloat(inst.amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: `${i + 1}. taksit tutarı geçersiz`
        });
      }
      if (!inst.dueDate) {
        return res.status(400).json({
          success: false,
          message: `${i + 1}. taksit için vade tarihi zorunludur`
        });
      }
    }

    const totalInstallmentAmount = installments.reduce(
      (sum, inst) => sum + parseFloat(inst.amount), 0
    );
    const saleTotal = parseFloat(sale.totalAmount);

    if (Math.round(totalInstallmentAmount * 100) > Math.round(saleTotal * 100)) {
      return res.status(400).json({
        success: false,
        message: `Taksit toplamı (${totalInstallmentAmount.toFixed(2)} ₺) satış tutarından (${saleTotal.toFixed(2)} ₺) fazla olamaz`
      });
    }

    // Varsa mevcut ödemeleri sil, yeni taksit planı oluştur (transaction)
    const result = await prisma.$transaction(async (tx) => {
      // Önceki PENDING taksitleri sil
      await tx.payments.deleteMany({
        where: { saleId: parseInt(id), status: 'PENDING', installmentNumber: { not: null } }
      });

      // Satışı taksitli olarak güncelle
      await tx.sales.update({
        where: { id: parseInt(id) },
        data: {
          isInstallment: true,
          installmentCount: installments.length,
          smsReminderEnabled: Boolean(smsReminderEnabled)
        }
      });

      // Taksitleri oluştur
      const createdPayments = [];
      for (let i = 0; i < installments.length; i++) {
        const inst = installments[i];
        const parsedDueDate = parseLocalDate(inst.dueDate);
        const payment = await tx.payments.create({
          data: {
            saleId: parseInt(id),
            amountPaid: parseFloat(inst.amount),
            paymentMethod: inst.paymentMethod || 'CASH',
            status: 'PENDING',
            dueDate: parsedDueDate,
            installmentNumber: i + 1,
            notes: inst.notes || null,
            paymentDate: parsedDueDate
          }
        });
        createdPayments.push(payment);
      }

      return createdPayments;
    });

    // SMS bilgilendirmesi: taksit planı oluşturulduğunda müşteriye bilgi gönder (opsiyonel)
    let smsSent = false;
    if (smsReminderEnabled && sale.client.phone) {
      try {
        const clientName = `${sale.client.firstName} ${sale.client.lastName}`;
        const serviceName = sale.service.serviceName;
        const installmentLines = result
          .map(p => `  ${p.installmentNumber}. Taksit: ${parseFloat(p.amountPaid).toFixed(2)} TL — Vade: ${new Date(p.dueDate).toLocaleDateString('tr-TR')}`)
          .join('\n');

        const message =
          `Sayin ${clientName},\n` +
          `${serviceName} icin ${installments.length} taksitli odeme planınız olusturulmustur.\n\n` +
          `${installmentLines}\n\n` +
          `Toplam: ${totalInstallmentAmount.toFixed(2)} TL\n` +
          `GERAS Salon Sistemi`;

        const smsResult = await sendSMS(sale.client.phone, message);
        smsSent = smsResult?.success === true;
      } catch (smsErr) {
        console.error('Taksit planı SMS gönderilemedi:', smsErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Taksit planı başarıyla oluşturuldu',
      data: {
        saleId: parseInt(id),
        installmentCount: installments.length,
        totalAmount: totalInstallmentAmount,
        smsReminderEnabled: Boolean(smsReminderEnabled),
        smsSent,
        installments: result
      }
    });
  } catch (error) {
    console.error('Taksit planı oluşturma hatası:', error);
    res.status(500).json({ success: false, message: 'Taksit planı oluşturulamadı', error: error.message });
  }
};

/**
 * PATCH /api/sales/payments/:paymentId/installment
 * Bekleyen bir taksitin tutarını ve/veya vade tarihini günceller.
 * Body: { amount, dueDate, notes }
 * Validasyon: toplam taksit tutarı satış tutarını geçemez
 */
export const updateInstallment = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { paymentId } = req.params;
    const { amount, dueDate, notes } = req.body;

    if (!amount && !dueDate && notes === undefined) {
      return res.status(400).json({ success: false, message: 'Güncellenecek alan belirtilmedi (amount, dueDate, notes)' });
    }

    const payment = await prisma.payments.findFirst({
      where: {
        id: parseInt(paymentId),
        installmentNumber: { not: null },
        sale: { accountId, isDeleted: false }
      },
      include: {
        sale: {
          include: {
            payments: { where: { installmentNumber: { not: null } } }
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Taksit bulunamadı' });
    }

    if (payment.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Sadece bekleyen (PENDING) taksitler güncellenebilir'
      });
    }

    // Tutar değişiyorsa toplam kontrol et
    if (amount !== undefined) {
      const newAmount = parseFloat(amount);
      if (newAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Taksit tutarı 0\'dan büyük olmalıdır' });
      }

      const otherInstallmentsTotal = payment.sale.payments
        .filter(p => p.id !== payment.id)
        .reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

      const saleTotal = parseFloat(payment.sale.totalAmount);

      if (Math.round((otherInstallmentsTotal + newAmount) * 100) > Math.round(saleTotal * 100)) {
        const maxAllowed = (saleTotal - otherInstallmentsTotal).toFixed(2);
        return res.status(400).json({
          success: false,
          message: `Bu taksit için maksimum tutar: ${maxAllowed} ₺ (Satış toplam: ${saleTotal.toFixed(2)} ₺)`
        });
      }
    }

    const updateData = {};
    if (amount !== undefined) {
      updateData.amountPaid = parseFloat(amount);
      updateData.paymentDate = dueDate ? parseLocalDate(dueDate) : payment.dueDate;
    }
    if (dueDate !== undefined) {
      updateData.dueDate = parseLocalDate(dueDate);
      if (!amount) updateData.paymentDate = parseLocalDate(dueDate);
    }
    if (notes !== undefined) updateData.notes = notes;

    const updated = await prisma.payments.update({
      where: { id: parseInt(paymentId) },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Taksit güncellendi',
      data: updated
    });
  } catch (error) {
    console.error('Taksit güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Taksit güncellenemedi', error: error.message });
  }
};

/**
 * PATCH /api/sales/:id/sms-reminder
 * Satış için SMS hatırlatma ayarını aç/kapat.
 * Body: { smsReminderEnabled: true/false }
 */
export const toggleInstallmentSmsReminder = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { smsReminderEnabled } = req.body;

    if (typeof smsReminderEnabled !== 'boolean' && smsReminderEnabled !== 'true' && smsReminderEnabled !== 'false') {
      return res.status(400).json({ success: false, message: 'smsReminderEnabled true veya false olmalıdır' });
    }

    const sale = await prisma.sales.findFirst({
      where: { id: parseInt(id), accountId, isDeleted: false }
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Satış bulunamadı' });
    }

    const enabled = smsReminderEnabled === true || smsReminderEnabled === 'true';

    await prisma.sales.update({
      where: { id: parseInt(id) },
      data: { smsReminderEnabled: enabled }
    });

    res.json({
      success: true,
      message: `SMS hatırlatma ${enabled ? 'açıldı' : 'kapatıldı'}`,
      data: { saleId: parseInt(id), smsReminderEnabled: enabled }
    });
  } catch (error) {
    console.error('SMS hatırlatma güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Güncelleme yapılamadı', error: error.message });
  }
};

/**
 * GET /api/sales/:id/installments
 * Satışın taksit planını getirir.
 */
export const getInstallmentPlan = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const sale = await prisma.sales.findFirst({
      where: { id: parseInt(id), accountId, isDeleted: false },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, serviceName: true } },
        payments: {
          where: { installmentNumber: { not: null } },
          orderBy: { installmentNumber: 'asc' }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Satış bulunamadı' });
    }

    if (!sale.isInstallment || sale.payments.length === 0) {
      return res.status(404).json({ success: false, message: 'Bu satışa ait taksit planı bulunamadı' });
    }

    const totalPaid = sale.payments
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    const totalRemaining = sale.payments
      .filter(p => p.status === 'PENDING')
      .reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    res.json({
      success: true,
      data: {
        saleId: sale.id,
        saleDate: sale.saleDate,
        totalAmount: parseFloat(sale.totalAmount),
        isInstallment: sale.isInstallment,
        installmentCount: sale.installmentCount,
        smsReminderEnabled: sale.smsReminderEnabled,
        client: sale.client,
        service: sale.service,
        summary: {
          totalPaid,
          totalRemaining,
          paidCount: sale.payments.filter(p => p.status === 'COMPLETED').length,
          pendingCount: sale.payments.filter(p => p.status === 'PENDING').length
        },
        installments: sale.payments
      }
    });
  } catch (error) {
    console.error('Taksit planı getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Taksit planı getirilemedi', error: error.message });
  }
};

/**
 * GET /api/sales/installments/pending
 * Hesabın vadesi yaklaşan/geçmiş bekleyen taksitlerini listeler.
 * Query: days (kaç gün içindeki vadeler, varsayılan 7)
 */
export const getPendingInstallments = async (req, res) => {
  try {
    const { accountId } = req.user;
    const days = parseInt(req.query.days) || 7;

    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + days);
    futureDate.setHours(23, 59, 59, 999);

    const pendingPayments = await prisma.payments.findMany({
      where: {
        status: 'PENDING',
        installmentNumber: { not: null },
        dueDate: { lte: futureDate },
        sale: { accountId, isDeleted: false }
      },
      include: {
        sale: {
          select: {
            id: true,
            totalAmount: true,
            smsReminderEnabled: true,
            client: { select: { id: true, firstName: true, lastName: true, phone: true } },
            service: { select: { serviceName: true } }
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    const enriched = pendingPayments.map(p => ({
      ...p,
      isOverdue: new Date(p.dueDate) < now,
      daysUntilDue: Math.ceil((new Date(p.dueDate) - now) / (1000 * 60 * 60 * 24))
    }));

    res.json({
      success: true,
      data: enriched,
      summary: {
        total: enriched.length,
        overdue: enriched.filter(p => p.isOverdue).length,
        upcoming: enriched.filter(p => !p.isOverdue).length
      }
    });
  } catch (error) {
    console.error('Bekleyen taksitler hatası:', error);
    res.status(500).json({ success: false, message: 'Bekleyen taksitler getirilemedi', error: error.message });
  }
};