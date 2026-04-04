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
    const { isDeleted, search, period, startDate, endDate, isPaid, clientId } = req.query;
    
    const hasPageParam = req.query.page !== undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = hasPageParam ? (parseInt(req.query.limit) || 50) : 999999;
    const offset = (page - 1) * limit;

    // 🔒 PERFORMANS KORUMASI: Milyonlarca kayıt olduğu için en az 1 filtre zorunlu
    const hasFilter = search || period || startDate || endDate || isDeleted || isPaid || clientId;
    
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

    // Müşteri bazlı filtreleme (randevu formu satış seçimi için)
    if (clientId) {
      whereClause.clientId = parseInt(clientId);
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
      
      // 2. Tek hizmetli satışlarda hizmet adı araması
      searchConditions.push({
        service: {
          serviceName: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        }
      });

      // 3. Paket satışlarda hizmet adı araması (saleItems üzerinden)
      searchConditions.push({
        saleItems: {
          some: {
            service: {
              serviceName: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            }
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
        staff: {
          select: {
            id: true,
            fullName: true,
            role: true
          }
        },
        reference_sources: {
          select: {
            id: true,
            reference_type: true,
            reference_name: true
          }
        },
        saleItems: {
          select: {
            id: true,
            serviceId: true,
            sessionCount: true,
            remainingSessions: true,
            unitPrice: true,
            notes: true,
            service: {
              select: {
                id: true,
                serviceName: true,
                price: true,
                isSessionBased: true,
                sessionCount: true,
                durationMinutes: true
              }
            }
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
      
      // Seans bazlı satış sayısı (paket satışlarda service null olabilir)
      if (sale.isPackage || sale.service?.isSessionBased) {
        sessionBased += 1;
        if (sale.remainingSessions > 0) {
          activeSessions += 1;
        }
      }
    });

    // Her satış için frontend kolaylığı: displayServiceName
    const enrichedSales = paginatedSales.map(sale => {
      let displayServiceName = null;
      if (!sale.isPackage) {
        displayServiceName = sale.service?.serviceName || null;
      } else if (sale.saleItems?.length === 1) {
        displayServiceName = sale.saleItems[0].service?.serviceName || 'Paket Satış';
      } else if (sale.saleItems?.length > 1) {
        displayServiceName = `Paket (${sale.saleItems.length} hizmet)`;
      } else {
        displayServiceName = 'Paket Satış';
      }
      return { ...sale, displayServiceName };
    });

    res.json({
      success: true,
      data: enrichedSales,
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
        returned: enrichedSales.length,
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
      reference_id,
      staffId
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

    if (account.businessType === 'NON_SESSION_BASED' || !service.isSessionBased) {
      finalSessions = 1;
      
      if (totalAmount !== undefined && totalAmount !== null) {
        finalPrice = totalAmount;
        finalTotalAmount = totalAmount;
      } else {
        finalPrice = service.price;
        finalTotalAmount = service.price;
      }

    } else {
      // Seans bazlı hizmet — requestedSessions gelmemişse servis default seans sayısını kullan
      const defaultSessions = (service.sessionCount && service.sessionCount > 0) ? service.sessionCount : 1;
      finalSessions = (requestedSessions && requestedSessions > 0) ? requestedSessions : defaultSessions;
      
      if (service.sessionCount > 1) {
        if (finalSessions > service.sessionCount) {
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
        staffId: staffId ? parseInt(staffId) : null,
        isPackage: false,
        saleDate: finalSaleDate,
        totalAmount: finalTotalAmount,
        remainingSessions: finalSessions,
        notes: notes || null,
        reference_id: reference_id || null
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
        staff: {
          select: {
            id: true,
            fullName: true,
            role: true
          }
        },
        reference_sources: {
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

    if (account.businessType === 'NON_SESSION_BASED' || !service.isSessionBased) {
      finalSessions = 1;
      if (totalAmount !== undefined && totalAmount !== null) {
        finalPrice = totalAmount;
        finalTotalAmount = totalAmount;
      } else {
        finalPrice = service.price;
        finalTotalAmount = service.price;
      }
    } else {
      // Seans bazlı hizmet — requestedSessions gelmemişse servis default seans sayısını kullan
      const defaultSessions = (service.sessionCount && service.sessionCount > 0) ? service.sessionCount : 1;
      finalSessions = (requestedSessions && requestedSessions > 0) ? requestedSessions : defaultSessions;

      if (service.sessionCount > 1 && finalSessions > service.sessionCount) {
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
          : calculatePrice(service, finalSessions);
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
          staffId: appointment.staffId ? parseInt(appointment.staffId) : null,
          isPackage: false,
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
        staff: {
          select: {
            id: true,
            fullName: true,
            role: true
          }
        },
        reference_sources: {
          select: {
            id: true,
            reference_type: true,
            reference_name: true,
            notes: true
          }
        },
        saleItems: {
          include: {
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
            sessions: {
              orderBy: { sessionDate: 'desc' },
              include: {
                staff: { select: { id: true, fullName: true } }
              }
            }
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

    // Frontend kolaylığı: displayServiceName
    let displayServiceName = null;
    if (!sale.isPackage) {
      displayServiceName = sale.service?.serviceName || null;
    } else if (sale.saleItems?.length === 1) {
      displayServiceName = sale.saleItems[0].service?.serviceName || 'Paket Satış';
    } else if (sale.saleItems?.length > 1) {
      displayServiceName = `Paket (${sale.saleItems.length} hizmet)`;
    } else {
      displayServiceName = 'Paket Satış';
    }

    res.json({
      success: true,
      data: {
        ...sale,
        displayServiceName,
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

    // 🔒 GÜNCELLEME YAŞI ENGELİ
    // Paket satışlar 7 gün, tekil satışlar 2 gün içinde güncellenebilir
    const limitDays = existingSale.isPackage ? 7 : 2;
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - limitDays);
    limitDate.setHours(0, 0, 0, 0);

    const saleDate = new Date(existingSale.saleDate);
    saleDate.setHours(0, 0, 0, 0);

    if (saleDate < limitDate) {
      return res.status(403).json({
        success: false,
        message: `Bu satış ${limitDays} günden eski olduğu için güncellenemez`,
        saleDate: existingSale.saleDate
      });
    }

    // Paket satışta serviceId değiştirilemez
    if (existingSale.isPackage && serviceId) {
      return res.status(400).json({
        success: false,
        message: 'Paket satışlarda hizmet değiştirilemez. Kalem düzenlemek için PATCH /api/sales/items/:itemId kullanın.'
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
      serviceId: existingSale.isPackage ? null : (serviceId || existingSale.serviceId),
      totalAmount: totalAmount || existingSale.totalAmount,
      remainingSessions: remainingSessions !== undefined ? remainingSessions : existingSale.remainingSessions,
      notes: notes !== undefined ? notes : existingSale.notes,
      reference_id: reference_id !== undefined ? reference_id : existingSale.reference_id
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
        isSessionBased: sale.isPackage ? true : (sale.service?.isSessionBased ?? false)
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

    if (sale.isPackage) {
      return res.status(400).json({
        success: false,
        message: 'Paket satışlarda seans kullanmak için /api/sales/items/:itemId/use-session endpoint\'ini kullanın.'
      });
    }

    if (!sale.service?.isSessionBased) {
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
      message: `${additionalSessions} ${sale.isPackage || sale.service?.isSessionBased ? 'seans' : 'adet'} başarıyla eklendi`,
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

    const rawPayments = await prisma.payments.findMany({
      where: whereClause,
      include: {
        sale: {
          select: {
            id: true,
            saleDate: true,
            totalAmount: true,
            isPackage: true,
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
            },
            saleItems: {
              select: {
                id: true,
                serviceId: true,
                sessionCount: true,
                remainingSessions: true,
                unitPrice: true,
                service: {
                  select: {
                    id: true,
                    serviceName: true
                  }
                }
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

    const payments = rawPayments.map(p => {
      if (!p.sale) return p;
      let displayServiceName = p.sale.service?.serviceName || null;
      if (!displayServiceName && p.sale.isPackage && p.sale.saleItems?.length > 0) {
        displayServiceName = p.sale.saleItems.map(i => i.service?.serviceName).filter(Boolean).join(', ') || 'Paket Satış';
      }
      return { ...p, sale: { ...p.sale, displayServiceName } };
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
            isPackage: true,
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
            },
            saleItems: {
              select: {
                id: true,
                serviceId: true,
                sessionCount: true,
                remainingSessions: true,
                unitPrice: true,
                service: {
                  select: {
                    id: true,
                    serviceName: true
                  }
                }
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

    let displayServiceName = payment.sale?.service?.serviceName || null;
    if (!displayServiceName && payment.sale?.isPackage && payment.sale?.saleItems?.length > 0) {
      displayServiceName = payment.sale.saleItems.map(i => i.service?.serviceName).filter(Boolean).join(', ') || 'Paket Satış';
    }
    const paymentWithDisplay = payment.sale
      ? { ...payment, sale: { ...payment.sale, displayServiceName } }
      : payment;

    res.json({
      success: true,
      data: paymentWithDisplay
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
        const serviceName = sale.service?.serviceName || 'Paket Satış';
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

// ============================================================
// PAKET SATIŞ (ÇOKLU HİZMET)
// ============================================================

/**
 * POST /api/sales/package
 * Birden fazla hizmet içeren paket satış oluştur.
 *
 * Body:
 * {
 *   clientId: number,
 *   saleDate?: string,
 *   notes?: string,
 *   referenceId?: number,
 *   isInstallment?: boolean,
 *   installmentCount?: number,
 *   items: [
 *     { serviceId: number, sessionCount: number, unitPrice: number, notes?: string }
 *   ],
 *   payments?: [
 *     { paymentMethod: string, amountPaid: number, paymentDate?: string, dueDate?: string, installmentNumber?: number }
 *   ]
 * }
 */
export const createPackageSale = async (req, res) => {
  try {
    const { accountId } = req.user;
    const {
      clientId,
      staffId,
      saleDate,
      notes,
      referenceId,
      isInstallment = false,
      installmentCount,
      items,
      payments = []
    } = req.body;

    // Validasyon
    if (!clientId) {
      return res.status(400).json({ success: false, message: 'Müşteri seçilmelidir.' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'En az bir hizmet eklemelisiniz.' });
    }

    // Her item'ı doğrula
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.serviceId) {
        return res.status(400).json({ success: false, message: `${i + 1}. hizmet için serviceId gereklidir.` });
      }
      if (!item.unitPrice && item.unitPrice !== 0) {
        return res.status(400).json({ success: false, message: `${i + 1}. hizmet için birim fiyat gereklidir.` });
      }
      if (!item.sessionCount || item.sessionCount < 1) {
        return res.status(400).json({ success: false, message: `${i + 1}. hizmet için seans sayısı en az 1 olmalıdır.` });
      }
    }

    // Müşteri kontrolü
    const client = await prisma.clients.findFirst({
      where: { id: parseInt(clientId), accountId, isActive: true }
    });
    if (!client) {
      return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });
    }

    // Hizmet kontrolü (hepsi aynı işletmeye ait mi)
    const serviceIds = [...new Set(items.map(i => parseInt(i.serviceId)))];
    const services = await prisma.services.findMany({
      where: { id: { in: serviceIds }, accountId, isActive: true }
    });
    if (services.length !== serviceIds.length) {
      return res.status(404).json({ success: false, message: 'Bir veya daha fazla hizmet bulunamadı.' });
    }

    // Toplam tutarı hesapla (unitPrice = o hizmet için toplam fiyat, seans sayısıyla çarpılmaz)
    const totalAmount = items.reduce((sum, item) => {
      return sum + parseFloat(item.unitPrice);
    }, 0);

    // Toplam kalan seanslar (seanssız hizmetler 1 sayılır)
    const totalRemainingSessions = items.reduce((sum, item) => {
      return sum + parseInt(item.sessionCount);
    }, 0);

    const parsedSaleDate = parseLocalDate(saleDate);

    // Transaction ile satış + kalemleri + ödemeleri oluştur
    const result = await prisma.$transaction(async (tx) => {
      // Ana satış kaydı (isPackage: true, serviceId: null)
      const sale = await tx.sales.create({
        data: {
          accountId,
          clientId:           parseInt(clientId),
          serviceId:          null,
          staffId:            staffId ? parseInt(staffId) : null,
          isPackage:          true,
          saleDate:           parsedSaleDate,
          totalAmount:        totalAmount,
          remainingSessions:  totalRemainingSessions,
          notes:              notes || null,
          reference_id:       referenceId ? parseInt(referenceId) : null,
          isInstallment:      isInstallment,
          installmentCount:   installmentCount ? parseInt(installmentCount) : null,
          smsReminderEnabled: true
        }
      });

      // SaleItems oluştur
      const createdItems = await Promise.all(
        items.map(item =>
          tx.saleItems.create({
            data: {
              saleId:            sale.id,
              serviceId:         parseInt(item.serviceId),
              sessionCount:      parseInt(item.sessionCount),
              remainingSessions: parseInt(item.sessionCount),
              unitPrice:         parseFloat(item.unitPrice),
              notes:             item.notes || null
            }
          })
        )
      );

      // Ödemeler oluştur
      let createdPayments = [];
      if (payments.length > 0) {
        createdPayments = await Promise.all(
          payments.map(p =>
            tx.payments.create({
              data: {
                saleId:            sale.id,
                paymentMethod:     p.paymentMethod || 'CASH',
                amountPaid:        parseFloat(p.amountPaid),
                status:            'COMPLETED',
                paymentDate:       p.paymentDate ? new Date(p.paymentDate) : new Date(),
                dueDate:           p.dueDate ? new Date(p.dueDate) : null,
                installmentNumber: p.installmentNumber || null,
                notes:             p.notes || null
              }
            })
          )
        );
      }

      return { sale, items: createdItems, payments: createdPayments };
    });

    // Detaylı response için tekrar çek
    const fullSale = await prisma.sales.findUnique({
      where: { id: result.sale.id },
      include: {
        client:    { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        saleItems: {
          include: {
            service: { select: { id: true, serviceName: true, isSessionBased: true, durationMinutes: true } }
          }
        },
        payments: {
          where: { status: 'COMPLETED' },
          select: { id: true, amountPaid: true, paymentMethod: true, paymentDate: true }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Paket satış başarıyla oluşturuldu.',
      data: {
        ...fullSale,
        totalRemainingSessions,
        paidAmount:     result.payments.reduce((s, p) => s + parseFloat(p.amountPaid), 0),
        remainingAmount: totalAmount - result.payments.reduce((s, p) => s + parseFloat(p.amountPaid), 0)
      }
    });
  } catch (error) {
    console.error('Paket satış oluşturma hatası:', error);
    res.status(500).json({ success: false, message: 'Paket satış oluşturulamadı.', error: error.message });
  }
};

/**
 * GET /api/sales/:id/items
 * Bir satışın kalemlerini getir (tek veya paket satış için)
 */
export const getSaleItems = async (req, res) => {
  try {
    const { accountId } = req.user;
    const saleId = parseInt(req.params.id);

    const sale = await prisma.sales.findFirst({
      where: { id: saleId, accountId, isDeleted: false },
      include: {
        service: {
          select: { id: true, serviceName: true, isSessionBased: true, sessionCount: true, price: true, durationMinutes: true }
        },
        saleItems: {
          include: {
            service: { select: { id: true, serviceName: true, isSessionBased: true, sessionCount: true, price: true, durationMinutes: true } },
            sessions: {
              orderBy: { sessionDate: 'desc' },
              select: { id: true, sessionDate: true, status: true, notes: true, staff: { select: { id: true, fullName: true } } }
            }
          }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Satış bulunamadı.' });
    }

    // Tek hizmetli satış için geriye dönük uyumlu yanıt
    if (!sale.isPackage) {
      return res.json({
        success: true,
        data: {
          isPackage: false,
          service:   sale.service,
          remainingSessions: sale.remainingSessions,
          items: []
        }
      });
    }

    // Paket satış için items listesi
    const totalRemaining = sale.saleItems.reduce((s, i) => s + i.remainingSessions, 0);
    const totalSessions  = sale.saleItems.reduce((s, i) => s + i.sessionCount, 0);

    res.json({
      success: true,
      data: {
        isPackage:          true,
        totalRemainingSessions: totalRemaining,
        totalSessionCount:      totalSessions,
        items: sale.saleItems.map(item => ({
          id:                item.id,
          serviceId:         item.serviceId,
          serviceName:       item.service.serviceName,
          isSessionBased:    item.service.isSessionBased,
          durationMinutes:   item.service.durationMinutes,
          sessionCount:      item.sessionCount,
          remainingSessions: item.remainingSessions,
          unitPrice:         item.unitPrice,
          notes:             item.notes,
          usedSessions:      item.sessionCount - item.remainingSessions,
          sessions:          item.sessions
        }))
      }
    });
  } catch (error) {
    console.error('Satış kalemleri hatası:', error);
    res.status(500).json({ success: false, message: 'Satış kalemleri getirilemedi.', error: error.message });
  }
};

/**
 * PATCH /api/sales/items/:itemId/use-session
 * Belirli bir SaleItem'da seans kullan (remainingSessions--)
 * Body: { staffId?, sessionDate?, notes? }
 */
export const useSaleItemSession = async (req, res) => {
  try {
    const { accountId } = req.user;
    const itemId = parseInt(req.params.itemId);
    const { staffId, sessionDate, notes } = req.body;

    // Item'ı bul ve satışın bu işletmeye ait olduğunu doğrula
    const item = await prisma.saleItems.findFirst({
      where: { id: itemId, sale: { accountId, isDeleted: false } },
      include: {
        sale:    { select: { id: true, clientId: true, accountId: true } },
        service: { select: { serviceName: true } }
      }
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Satış kalemi bulunamadı.' });
    }
    if (item.remainingSessions <= 0) {
      return res.status(400).json({
        success: false,
        message: `${item.service.serviceName} için kalan seans yok.`
      });
    }

    // Transaction: session oluştur + remainingSessions azalt + Sales.remainingSessions azalt
    const result = await prisma.$transaction(async (tx) => {
      // Session kaydı oluştur
      const session = await tx.sessions.create({
        data: {
          saleId:      item.sale.id,
          saleItemId:  item.id,
          staffId:     staffId ? parseInt(staffId) : null,
          sessionDate: sessionDate ? new Date(sessionDate) : new Date(),
          status:      'SCHEDULED',
          notes:       notes || null
        }
      });

      // SaleItem remainingSessions--
      const updatedItem = await tx.saleItems.update({
        where: { id: item.id },
        data:  { remainingSessions: item.remainingSessions - 1 }
      });

      // Sales.remainingSessions-- (toplam sayacı güncelle)
      await tx.sales.update({
        where: { id: item.sale.id },
        data:  { remainingSessions: { decrement: 1 } }
      });

      return { session, updatedItem };
    });

    res.json({
      success: true,
      message: 'Seans kullanıldı.',
      data: {
        session:           result.session,
        remainingSessions: result.updatedItem.remainingSessions,
        serviceName:       item.service.serviceName
      }
    });
  } catch (error) {
    console.error('Seans kullanım hatası:', error);
    res.status(500).json({ success: false, message: 'Seans kullanılamadı.', error: error.message });
  }
};

// ============================================================
// PAKET KALEM YÖNETİMİ
// ============================================================

/**
 * PATCH /api/sales/items/:itemId
 * Paketteki bir kalemin fiyatını veya seans sayısını düzenle.
 * Body: { unitPrice?, sessionCount?, notes? }
 * - sessionCount artırılabilir, kullanılan seansın altına düşürülemez.
 * - Değişiklik Sales.totalAmount ve Sales.remainingSessions'a yansır.
 */
export const updateSaleItem = async (req, res) => {
  try {
    const { accountId } = req.user;
    const itemId = parseInt(req.params.itemId);
    const { unitPrice, sessionCount, notes } = req.body;

    if (unitPrice === undefined && sessionCount === undefined && notes === undefined) {
      return res.status(400).json({ success: false, message: 'Güncellenecek alan belirtilmelidir (unitPrice, sessionCount, notes).' });
    }

    const item = await prisma.saleItems.findFirst({
      where: { id: itemId, sale: { accountId, isDeleted: false } },
      include: {
        sale: {
          include: {
            saleItems: { select: { id: true, unitPrice: true, sessionCount: true, remainingSessions: true } }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Satış kalemi bulunamadı.' });
    }

    const usedSessions = item.sessionCount - item.remainingSessions;

    // sessionCount, kullanılmış seans sayısının altına düşürülemez
    if (sessionCount !== undefined) {
      if (parseInt(sessionCount) < 1) {
        return res.status(400).json({ success: false, message: 'Seans sayısı en az 1 olmalıdır.' });
      }
      if (parseInt(sessionCount) < usedSessions) {
        return res.status(400).json({
          success: false,
          message: `Bu kalemde ${usedSessions} seans kullanılmış. Seans sayısı bunun altına düşürülemez.`
        });
      }
    }

    const newSessionCount = sessionCount !== undefined ? parseInt(sessionCount) : item.sessionCount;
    const newUnitPrice    = unitPrice    !== undefined ? parseFloat(unitPrice)   : parseFloat(item.unitPrice);
    const newRemaining    = newSessionCount - usedSessions;

    const result = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.saleItems.update({
        where: { id: itemId },
        data: {
          sessionCount:      newSessionCount,
          remainingSessions: newRemaining,
          unitPrice:         newUnitPrice,
          notes:             notes !== undefined ? notes : item.notes
        },
        include: { service: { select: { id: true, serviceName: true } } }
      });

      // Sales.totalAmount ve remainingSessions'ı tüm itemlardan yeniden hesapla
      const allItems = item.sale.saleItems.map(i =>
        i.id === itemId
          ? { unitPrice: newUnitPrice, sessionCount: newSessionCount, remainingSessions: newRemaining }
          : { unitPrice: parseFloat(i.unitPrice), sessionCount: i.sessionCount, remainingSessions: i.remainingSessions }
      );

      const newTotal     = allItems.reduce((s, i) => s + i.unitPrice, 0);
      const newTotalRem  = allItems.reduce((s, i) => s + i.remainingSessions, 0);

      await tx.sales.update({
        where: { id: item.sale.id },
        data: { totalAmount: newTotal, remainingSessions: newTotalRem }
      });

      return updatedItem;
    });

    res.json({
      success: true,
      message: 'Kalem başarıyla güncellendi.',
      data: { ...result, usedSessions, remainingSessions: newRemaining }
    });
  } catch (error) {
    console.error('Kalem güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Kalem güncellenemedi.', error: error.message });
  }
};

/**
 * POST /api/sales/:id/items
 * Mevcut paket satışa yeni hizmet kalemi ekle.
 * Body: { serviceId, sessionCount, unitPrice, notes? }
 */
export const addSaleItem = async (req, res) => {
  try {
    const { accountId } = req.user;
    const saleId = parseInt(req.params.id);
    const { serviceId, sessionCount, unitPrice, notes } = req.body;

    if (!serviceId || !sessionCount || unitPrice === undefined) {
      return res.status(400).json({ success: false, message: 'serviceId, sessionCount ve unitPrice zorunludur.' });
    }

    const sale = await prisma.sales.findFirst({
      where: { id: saleId, accountId, isDeleted: false }
    });
    if (!sale) return res.status(404).json({ success: false, message: 'Satış bulunamadı.' });
    if (!sale.isPackage) {
      return res.status(400).json({ success: false, message: 'Bu satış bir paket satış değil. Kalem eklenemiyor.' });
    }

    const service = await prisma.services.findFirst({
      where: { id: parseInt(serviceId), accountId, isActive: true }
    });
    if (!service) return res.status(404).json({ success: false, message: 'Hizmet bulunamadı.' });

    const parsedSessions = parseInt(sessionCount);
    const parsedPrice    = parseFloat(unitPrice);

    const result = await prisma.$transaction(async (tx) => {
      const newItem = await tx.saleItems.create({
        data: {
          saleId,
          serviceId:         parseInt(serviceId),
          sessionCount:      parsedSessions,
          remainingSessions: parsedSessions,
          unitPrice:         parsedPrice,
          notes:             notes || null
        },
        include: { service: { select: { id: true, serviceName: true, isSessionBased: true, durationMinutes: true } } }
      });

      // Sales.totalAmount ve remainingSessions güncelle
      await tx.sales.update({
        where: { id: saleId },
        data: {
          totalAmount:       { increment: parsedPrice },
          remainingSessions: { increment: parsedSessions }
        }
      });

      return newItem;
    });

    res.status(201).json({
      success: true,
      message: 'Hizmet pakete eklendi.',
      data: result
    });
  } catch (error) {
    console.error('Kalem ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Kalem eklenemedi.', error: error.message });
  }
};

/**
 * DELETE /api/sales/:id/items/:itemId
 * Paketten hizmet kalemi çıkar.
 * Kullanılmış seansı olan kalem silinemez.
 */
export const removeSaleItem = async (req, res) => {
  try {
    const { accountId } = req.user;
    const saleId = parseInt(req.params.id);
    const itemId = parseInt(req.params.itemId);

    const item = await prisma.saleItems.findFirst({
      where: { id: itemId, saleId, sale: { accountId, isDeleted: false } },
      include: {
        sale:     { include: { saleItems: { select: { id: true } } } },
        service:  { select: { serviceName: true } },
        sessions: { select: { id: true } }
      }
    });

    if (!item) return res.status(404).json({ success: false, message: 'Kalem bulunamadı.' });

    const usedSessions = item.sessionCount - item.remainingSessions;
    if (usedSessions > 0) {
      return res.status(400).json({
        success: false,
        message: `${item.service.serviceName} için ${usedSessions} seans kullanılmış. Kullanılmış seansı olan kalem silinemez.`
      });
    }

    // Pakette en az 1 kalem kalmalı
    if (item.sale.saleItems.length <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Pakette en az 1 hizmet olmalıdır. Tüm paketi silmek için satış silme işlemini kullanın.'
      });
    }

    await prisma.$transaction(async (tx) => {
      // Kaleme bağlı henüz kullanılmamış seansları temizle (varsa)
      await tx.sessions.deleteMany({ where: { saleItemId: itemId } });

      await tx.saleItems.delete({ where: { id: itemId } });

      // Sales.totalAmount ve remainingSessions güncelle
      await tx.sales.update({
        where: { id: saleId },
        data: {
          totalAmount:       { decrement: parseFloat(item.unitPrice) },
          remainingSessions: { decrement: item.remainingSessions }
        }
      });
    });

    res.json({
      success: true,
      message: `${item.service.serviceName} paketten çıkarıldı.`
    });
  } catch (error) {
    console.error('Kalem silme hatası:', error);
    res.status(500).json({ success: false, message: 'Kalem silinemedi.', error: error.message });
  }
};