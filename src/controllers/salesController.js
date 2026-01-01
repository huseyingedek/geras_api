import prisma from '../lib/prisma.js';
import AppError from '../utils/AppError.js';

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { isDeleted, search, period, startDate, endDate } = req.query;

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

    // Müşteri ismiyle arama özelliği
    if (search && search.trim()) {
      const searchTerm = search.trim().toLowerCase();
      whereClause.client = {
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
      };
    }

    const sales = await prisma.sales.findMany({
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
          select: {
            id: true,
            paymentDate: true,
            amountPaid: true,
            paymentMethod: true
          }
        },
        sessions: {
          select: {
            id: true,
            sessionDate: true,
            status: true
          }
        },
        reference_sources: {  // ✅ Referans bilgisi eklendi
          select: {
            id: true,
            reference_type: true,
            reference_name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: offset,
      take: limit
    });

    // Toplam sayı ve summary bilgilerini paralel olarak getir
    const [totalSales, summaryData] = await Promise.all([
      // Toplam kayıt sayısı
      prisma.sales.count({
        where: whereClause
      }),
      
      // Summary için tüm satışları getir (pagination olmadan)
      prisma.sales.findMany({
        where: whereClause,
        select: {
          totalAmount: true,
          remainingSessions: true,
          service: {
            select: {
              isSessionBased: true
            }
          },
          payments: {
            where: {
              status: 'COMPLETED'
            },
            select: {
              amountPaid: true
            }
          }
        }
      })
    ]);

    // Summary hesaplamaları
    let totalSalesAmount = 0;
    let totalRevenue = 0;
    let sessionBased = 0;
    let activeSessions = 0;

    summaryData.forEach(sale => {
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
      data: sales,
      pagination: {
        page,
        limit,
        total: totalSales,
        totalPages: Math.ceil(totalSales / limit)
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
        endDate: endDate || null
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

    const totalPaid = sale.payments
      .filter(payment => payment.status === 'COMPLETED')
      .reduce((sum, payment) => sum + parseFloat(payment.amountPaid), 0);
    const remainingPayment = parseFloat(sale.totalAmount) - totalPaid;

    res.json({
      success: true,
      data: {
        ...sale,
        paymentStatus: {
          totalPaid: totalPaid.toFixed(2),
          remainingPayment: remainingPayment.toFixed(2),
          isPaid: remainingPayment <= 0
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
          orderBy: {
            paymentDate: 'desc'
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
      data: sale.payments
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

    const totalPaid = sale.payments.reduce((sum, payment) => sum + parseFloat(payment.amountPaid), 0);
    const remainingAmount = parseFloat(sale.totalAmount) - totalPaid;

    if (status === 'COMPLETED' && amountPaid > remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Ödeme miktarı kalan borçtan (${remainingAmount.toFixed(2)}) fazla olamaz`
      });
    }

    // Ödeme tarihi - eğer verilmezse şu anki tarih
    const finalPaymentDate = paymentDate ? new Date(paymentDate) : new Date();

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

    // Güncelleme verilerini hazırla
    const updateData = {
      status: status,
      notes: notes || payment.notes,
      updatedAt: new Date()
    };

    // Eğer paymentDate verilmişse güncelle
    if (paymentDate) {
      updateData.paymentDate = new Date(paymentDate);
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