import prisma from '../lib/prisma.js';

export const createQuickAppointment = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { 
      firstName, 
      lastName, 
      phone, 
      email,
      serviceId,
      totalAmount,
      remainingSessions,
      staffId,
      appointmentDate,
      notes
    } = req.body;

    if (!firstName || !lastName || !serviceId || !staffId || !appointmentDate) {
      return res.status(400).json({
        success: false,
        message: 'Gerekli alanlar eksik: firstName, lastName, serviceId, staffId, appointmentDate'
      });
    }

    // 🇹🇷 Türkiye saati için tarih düzeltmesi
    const appointmentStart = new Date(appointmentDate);
    const now = new Date();
    
    // Konsol logları ile debug yapalım
    console.log('🕐 Gelen appointmentDate:', appointmentDate);
    console.log('🕐 Çevrilen appointmentStart:', appointmentStart.toISOString());
    console.log('🕐 Türkiye saati:', appointmentStart.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }));
    
    if (appointmentStart <= now) {
      return res.status(400).json({
        success: false,
        message: 'Geçmiş tarihe randevu oluşturulamaz'
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

    const staff = await prisma.staff.findFirst({
      where: {
        id: staffId,
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

    const serviceDuration = service.durationMinutes || 60;
    const appointmentEnd = new Date(appointmentStart.getTime() + (serviceDuration * 60000));
    const dayOfWeek = appointmentStart.getDay();

    console.log(`Hizmet: ${service.serviceName}, Süre: ${serviceDuration} dakika`);
    console.log(`Randevu: ${appointmentStart.toISOString()} - ${appointmentEnd.toISOString()}`);

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
        staffId: staffId,
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

    if (email) {
      const existingClient = await prisma.clients.findFirst({
        where: {
          email: email,
          accountId: accountId
        }
      });

      if (existingClient) {
        return res.status(400).json({
          success: false,
          message: 'Bu email adresi ile kayıtlı müşteri zaten var'
        });
      }
    }

    if (phone) {
      const existingClient = await prisma.clients.findFirst({
        where: {
          phone: phone,
          accountId: accountId
        }
      });

      if (existingClient) {
        return res.status(400).json({
          success: false,
          message: 'Bu telefon numarası ile kayıtlı müşteri zaten var'
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.clients.create({
        data: {
          accountId: accountId,
          firstName: firstName,
          lastName: lastName,
          phone: phone || null,
          email: email || null
        }
      });

      const finalTotalAmount = totalAmount || parseFloat(service.price);
      const finalSessions = remainingSessions || (service.isSessionBased ? service.sessionCount : 1);

      const sale = await tx.sales.create({
        data: {
          accountId: accountId,
          clientId: client.id,
          serviceId: serviceId,
          totalAmount: finalTotalAmount,
          remainingSessions: finalSessions
        }
      });

      const appointment = await tx.appointments.create({
        data: {
          accountId: accountId,
          customerName: `${firstName} ${lastName}`,
          clientId: client.id,
          serviceId: serviceId,
          staffId: staffId,
          saleId: sale.id,
          appointmentDate: new Date(appointmentDate).toISOString(),
          notes: notes || null
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

      return appointment;
    });

    res.status(201).json({
      success: true,
      message: 'Hızlı randevu başarıyla oluşturuldu',
      data: result
    });

  } catch (error) {
    console.error('Hızlı randevu oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Hızlı randevu oluşturulurken hata oluştu',
      error: error.message
    });
  }
};

export const createAppointment = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { 
      saleId,
      staffId,
      appointmentDate,
      notes
    } = req.body;

    if (!saleId || !staffId || !appointmentDate) {
      return res.status(400).json({
        success: false,
        message: 'Gerekli alanlar eksik: saleId, staffId, appointmentDate'
      });
    }

    const sale = await prisma.sales.findFirst({
      where: {
        id: saleId,
        accountId: accountId,
        isDeleted: false
      },
      include: {
        client: true,
        service: true
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Satış bulunamadı'
      });
    }

    const staff = await prisma.staff.findFirst({
      where: {
        id: staffId,
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

    // ✅ ÇAKIŞMA VE ÇALIŞMA SAATİ KONTROLÜ
    const appointmentStart = new Date(appointmentDate);
    
    // 🇹🇷 Debug logları
    console.log('📅 createAppointment - Gelen appointmentDate:', appointmentDate);
    console.log('📅 createAppointment - Çevrilen appointmentStart:', appointmentStart.toISOString());
    console.log('📅 createAppointment - Türkiye saati:', appointmentStart.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }));
    
    const serviceDuration = sale.service.durationMinutes || 60;
    const appointmentEnd = new Date(appointmentStart.getTime() + (serviceDuration * 60000));
    const dayOfWeek = appointmentStart.getDay();

    // Personelin o gün çalışıyor mu?
    const workingHour = staff.workingHours.find(wh => wh.dayOfWeek === dayOfWeek && wh.isWorking);
    if (!workingHour) {
      return res.status(400).json({
        success: false,
        message: 'Personel bu gün çalışmıyor'
      });
    }

    // Çalışma saatleri kontrolü
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

    // Çakışan randevu kontrolü
    const startOfDay = new Date(appointmentStart);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(appointmentStart);
    endOfDay.setHours(23, 59, 59, 999);

    const conflictingAppointments = await prisma.appointments.findMany({
      where: {
        staffId: staffId,
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

    const appointment = await prisma.appointments.create({
      data: {
        accountId: accountId,
        customerName: `${sale.client.firstName} ${sale.client.lastName}`,
        clientId: sale.clientId,
        serviceId: sale.serviceId,
        staffId: staffId,
        saleId: saleId,
        appointmentDate: new Date(appointmentDate).toISOString(),
        notes: notes || null
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
      message: 'Randevu başarıyla oluşturuldu',
      data: appointment
    });

  } catch (error) {
    console.error('Randevu oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu oluşturulurken hata oluştu',
      error: error.message
    });
  }
};

export const getAllAppointments = async (req, res) => {
  try {
    const { accountId } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { status, staffId, startDate, endDate } = req.query;

    let whereClause = {
      accountId: accountId
    };

    if (status) {
      whereClause.status = status;
    }

    if (staffId) {
      whereClause.staffId = parseInt(staffId);
    }

    if (startDate || endDate) {
      whereClause.appointmentDate = {};
      if (startDate) {
        whereClause.appointmentDate.gte = new Date(startDate).toISOString();
      }
      if (endDate) {
        whereClause.appointmentDate.lte = new Date(endDate).toISOString();
      }
    }

    const [appointments, total] = await Promise.all([
      prisma.appointments.findMany({
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
              durationMinutes: true
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
            select: {
              id: true,
              totalAmount: true,
              remainingSessions: true
            }
          }
        },
        orderBy: {
          appointmentDate: 'desc'
        },
        skip: offset,
        take: limit
      }),
      prisma.appointments.count({
        where: whereClause
      })
    ]);

    res.status(200).json({
      success: true,
      data: appointments,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Randevu listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevular listelenirken hata oluştu',
      error: error.message
    });
  }
};

export const updateAppointment = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { staffId, appointmentDate, status, notes } = req.body;

    const existingAppointment = await prisma.appointments.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId
      }
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        message: 'Randevu bulunamadı'
      });
    }

    if (staffId && staffId !== existingAppointment.staffId) {
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

    const updatedAppointment = await prisma.appointments.update({
      where: {
        id: parseInt(id)
      },
      data: {
        staffId: staffId || existingAppointment.staffId,
        appointmentDate: appointmentDate ? new Date(appointmentDate).toISOString() : existingAppointment.appointmentDate,
        status: status || existingAppointment.status,
        notes: notes !== undefined ? notes : existingAppointment.notes
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
            durationMinutes: true
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
          select: {
            id: true,
            totalAmount: true,
            remainingSessions: true
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Randevu başarıyla güncellendi',
      data: updatedAppointment
    });

  } catch (error) {
    console.error('Randevu güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu güncellenirken hata oluştu',
      error: error.message
    });
  }
};

export const deleteAppointment = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const existingAppointment = await prisma.appointments.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId
      }
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        message: 'Randevu bulunamadı'
      });
    }

    await prisma.appointments.delete({
      where: {
        id: parseInt(id)
      }
    });

    res.status(200).json({
      success: true,
      message: 'Randevu başarıyla silindi'
    });

  } catch (error) {
    console.error('Randevu silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu silinirken hata oluştu',
      error: error.message
    });
  }
};

export const getAppointmentById = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz randevu ID'
      });
    }

    console.log('getAppointmentById - Gelen ID:', id);
    console.log('getAppointmentById - AccountID:', accountId);

    const appointment = await prisma.appointments.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId
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
            durationMinutes: true,
            isSessionBased: true,
            sessionCount: true
          }
        },
        staff: {
          select: {
            id: true,
            fullName: true,
            role: true,
            phone: true,
            email: true
          }
        },
        sale: {
          select: {
            id: true,
            totalAmount: true,
            remainingSessions: true,
            saleDate: true
          }
        }
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Randevu bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      data: appointment
    });

  } catch (error) {
    console.error('Randevu detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu detayı alınırken hata oluştu',
      error: error.message
    });
  }
};

export const getAppointmentsByDate = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { date, startDate, endDate } = req.query;
    const { status, staffId } = req.query;

    if (!date && !startDate && !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Tarih bilgisi gerekli: date (tek tarih) veya startDate/endDate (tarih aralığı)'
      });
    }

    let whereClause = {
      accountId: accountId
    };

    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      
      whereClause.appointmentDate = {
        gte: startOfDay,
        lte: endOfDay
      };
    }
    else if (startDate || endDate) {
      whereClause.appointmentDate = {};
      if (startDate) {
        whereClause.appointmentDate.gte = new Date(startDate);
      }
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        whereClause.appointmentDate.lte = endDateObj;
      }
    }

    if (status) {
      whereClause.status = status;
    }

    if (staffId) {
      whereClause.staffId = parseInt(staffId);
    }

    const appointments = await prisma.appointments.findMany({
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
          select: {
            id: true,
            totalAmount: true,
            remainingSessions: true
          }
        }
      },
      orderBy: {
        appointmentDate: 'asc'
      }
    });

    const groupedAppointments = {};
    appointments.forEach(appointment => {
      const appointmentDate = appointment.appointmentDate.toISOString().split('T')[0];
      if (!groupedAppointments[appointmentDate]) {
        groupedAppointments[appointmentDate] = [];
      }
      groupedAppointments[appointmentDate].push(appointment);
    });

    res.status(200).json({
      success: true,
      data: {
        appointments: appointments,
        groupedByDate: groupedAppointments,
        total: appointments.length
      },
      message: `${appointments.length} randevu bulundu`
    });

  } catch (error) {
    console.error('Tarihe göre randevu listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevular listelenirken hata oluştu',
      error: error.message
    });
  }
};

export const getTodayAppointments = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { status, staffId } = req.query;

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    let whereClause = {
      accountId: accountId,
      appointmentDate: {
        gte: startOfDay,
        lte: endOfDay
      }
    };

    if (status) {
      whereClause.status = status;
    }

    if (staffId) {
      whereClause.staffId = parseInt(staffId);
    }

    const appointments = await prisma.appointments.findMany({
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
            durationMinutes: true
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
          select: {
            id: true,
            totalAmount: true,
            remainingSessions: true
          }
        }
      },
      orderBy: {
        appointmentDate: 'asc'
      }
    });

    const groupedByHour = {};
    appointments.forEach(appointment => {
      const hour = appointment.appointmentDate.getHours();
      const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
      if (!groupedByHour[timeSlot]) {
        groupedByHour[timeSlot] = [];
      }
      groupedByHour[timeSlot].push(appointment);
    });

    res.status(200).json({
      success: true,
      data: {
        appointments: appointments,
        groupedByHour: groupedByHour,
        total: appointments.length,
        date: today.toISOString().split('T')[0]
      },
      message: `Bugün ${appointments.length} randevu var`
    });

  } catch (error) {
    console.error('Bugünün randevuları listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bugünün randevuları listelenirken hata oluştu',
      error: error.message
    });
  }
};

export const getWeeklyAppointments = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { weekStart } = req.query;

    let startDate;
    if (weekStart) {
      startDate = new Date(weekStart);
    } else {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startDate = new Date(today.setDate(diff));
    }

    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    const appointments = await prisma.appointments.findMany({
      where: {
        accountId: accountId,
        appointmentDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        service: {
          select: {
            id: true,
            serviceName: true,
            durationMinutes: true
          }
        },
        staff: {
          select: {
            id: true,
            fullName: true
          }
        }
      },
      orderBy: {
        appointmentDate: 'asc'
      }
    });

    const weekDays = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const groupedByDay = {};
    
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayName = weekDays[currentDate.getDay()];
      
      groupedByDay[dateStr] = {
        dayName: dayName,
        appointments: [],
        count: 0
      };
    }

    appointments.forEach(appointment => {
      const appointmentDate = appointment.appointmentDate.toISOString().split('T')[0];
      if (groupedByDay[appointmentDate]) {
        groupedByDay[appointmentDate].appointments.push(appointment);
        groupedByDay[appointmentDate].count++;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        weekStart: startDate.toISOString().split('T')[0],
        weekEnd: endDate.toISOString().split('T')[0],
        appointments: appointments,
        groupedByDay: groupedByDay,
        total: appointments.length
      },
      message: `Bu hafta ${appointments.length} randevu var`
    });

  } catch (error) {
    console.error('Haftalık randevu özet hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Haftalık randevu özeti alınırken hata oluştu',
      error: error.message
    });
  }
};

export const checkStaffAvailability = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { staffId, date, serviceId } = req.query;

    if (!staffId || !date || !serviceId) {
      return res.status(400).json({
        success: false,
        message: 'staffId, date ve serviceId gerekli'
      });
    }

    const staff = await prisma.staff.findFirst({
      where: {
        id: parseInt(staffId),
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

    const service = await prisma.services.findFirst({
      where: {
        id: parseInt(serviceId),
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

    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();
    const now = new Date();
    const isToday = targetDate.toDateString() === now.toDateString();
    
    // Geçmiş tarih kontrolü
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const targetDateStart = new Date(targetDate);
    targetDateStart.setHours(0, 0, 0, 0);
    
    if (targetDateStart < todayStart) {
      return res.status(400).json({
        success: false,
        message: 'Geçmiş tarihe randevu alınamaz',
        data: {
          isWorking: false,
          availableSlots: [],
          message: 'Geçmiş tarihe randevu alınamaz'
        }
      });
    }

    const workingHour = staff.workingHours.find(wh => wh.dayOfWeek === dayOfWeek && wh.isWorking);

    if (!workingHour) {
      return res.status(200).json({
        success: true,
        data: {
          isWorking: false,
          availableSlots: [],
          message: 'Personel bu gün çalışmıyor'
        }
      });
    }

    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const existingAppointments = await prisma.appointments.findMany({
      where: {
        staffId: parseInt(staffId),
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
      },
      orderBy: {
        appointmentDate: 'asc'
      }
    });

    const workStart = new Date(workingHour.startTime);
    const workEnd = new Date(workingHour.endTime);
    
    const workStartHour = workStart.getHours();
    const workStartMinute = workStart.getMinutes();
    const workEndHour = workEnd.getHours();
    const workEndMinute = workEnd.getMinutes();

    const serviceDuration = service.durationMinutes || 60;

    const availableSlots = [];
    const busySlots = [];

    existingAppointments.forEach(appointment => {
      const appointmentStart = new Date(appointment.appointmentDate);
      const appointmentDuration = appointment.service.durationMinutes || 60;
      const appointmentEnd = new Date(appointmentStart.getTime() + (appointmentDuration * 60000));

      busySlots.push({
        start: appointmentStart,
        end: appointmentEnd,
        duration: appointmentDuration
      });
    });

    let slotInterval;
    if (serviceDuration <= 20) {
      slotInterval = 15;
    } else if (serviceDuration <= 45) {
      slotInterval = 30;
    } else {
      slotInterval = 30;
    }

    console.log(`Hizmet süresi: ${serviceDuration}dk, Slot interval: ${slotInterval}dk`);

    let currentTime = new Date(targetDate);
    currentTime.setHours(workStartHour, workStartMinute, 0, 0);

    const workEndTime = new Date(targetDate);
    workEndTime.setHours(workEndHour, workEndMinute, 0, 0);

    while (currentTime < workEndTime) {
      const slotEnd = new Date(currentTime.getTime() + (serviceDuration * 60000));
      
      if (slotEnd <= workEndTime) {
        // Geçmiş saat kontrolü - bugün ise şu anki saatten önce olan slotları atla
        if (isToday && currentTime <= now) {
          currentTime = new Date(currentTime.getTime() + (slotInterval * 60000));
          continue;
        }

        let isAvailable = true;
        
        for (const busySlot of busySlots) {
          if (
            (currentTime >= busySlot.start && currentTime < busySlot.end) ||
            (slotEnd > busySlot.start && slotEnd <= busySlot.end) ||
            (currentTime <= busySlot.start && slotEnd >= busySlot.end)
          ) {
            isAvailable = false;
            break;
          }
        }

        const timeSlot = {
          startTime: currentTime.toISOString(),
          endTime: slotEnd.toISOString(),
          startTimeFormatted: `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`,
          endTimeFormatted: `${slotEnd.getHours().toString().padStart(2, '0')}:${slotEnd.getMinutes().toString().padStart(2, '0')}`,
          isAvailable: isAvailable,
          duration: serviceDuration
        };

        if (isAvailable) {
          availableSlots.push(timeSlot);
        }
      }

      currentTime = new Date(currentTime.getTime() + (slotInterval * 60000));
    }

    res.status(200).json({
      success: true,
      data: {
        staffId: parseInt(staffId),
        staffName: staff.fullName,
        date: date,
        serviceName: service.serviceName,
        serviceDuration: serviceDuration,
        isWorking: true,
        workingHours: {
          start: `${workStartHour.toString().padStart(2, '0')}:${workStartMinute.toString().padStart(2, '0')}`,
          end: `${workEndHour.toString().padStart(2, '0')}:${workEndMinute.toString().padStart(2, '0')}`
        },
        existingAppointments: existingAppointments.map(app => ({
          id: app.id,
          startTime: app.appointmentDate.toISOString(),
          duration: app.service.durationMinutes,
          customerName: app.customerName
        })),
        availableSlots: availableSlots,
        totalAvailableSlots: availableSlots.length
      }
    });

  } catch (error) {
    console.error('Personel müsaitlik kontrolü hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Müsaitlik kontrolü yapılırken hata oluştu',
      error: error.message
    });
  }
};

export const validateAppointmentTime = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { staffId, appointmentDate, serviceId, excludeAppointmentId } = req.body;

    if (!staffId || !appointmentDate || !serviceId) {
      return res.status(400).json({
        success: false,
        message: 'staffId, appointmentDate ve serviceId gerekli'
      });
    }

    const appointmentStart = new Date(appointmentDate);
    const now = new Date();
    
    if (appointmentStart <= now) {
      return res.status(400).json({
        success: false,
        message: 'Geçmiş tarihe randevu oluşturulamaz',
        validation: {
          isValid: false,
          reason: 'PAST_DATE'
        }
      });
    }

    const service = await prisma.services.findFirst({
      where: {
        id: parseInt(serviceId),
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

    const serviceDuration = service.durationMinutes || 60;
    const appointmentEnd = new Date(appointmentStart.getTime() + (serviceDuration * 60000));

    console.log(`Doğrulama - Hizmet: ${service.serviceName}, Süre: ${serviceDuration} dakika`);
    console.log(`Doğrulama - Randevu: ${appointmentStart.toISOString()} - ${appointmentEnd.toISOString()}`);

    const dayOfWeek = appointmentStart.getDay();
    const staff = await prisma.staff.findFirst({
      where: {
        id: parseInt(staffId),
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

    const workingHour = staff.workingHours.find(wh => wh.dayOfWeek === dayOfWeek && wh.isWorking);

    if (!workingHour) {
      return res.status(400).json({
        success: false,
        message: 'Personel bu gün çalışmıyor',
        validation: {
          isValid: false,
          reason: 'NOT_WORKING_DAY'
        }
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
        message: 'Randevu çalışma saatleri dışında',
        validation: {
          isValid: false,
          reason: 'OUTSIDE_WORKING_HOURS',
          workingHours: {
            start: `${workStartHour.toString().padStart(2, '0')}:${workStartMinute.toString().padStart(2, '0')}`,
            end: `${workEndHour.toString().padStart(2, '0')}:${workEndMinute.toString().padStart(2, '0')}`
          }
        }
      });
    }

    const startOfDay = new Date(appointmentStart);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(appointmentStart);
    endOfDay.setHours(23, 59, 59, 999);

    let whereClause = {
      staffId: parseInt(staffId),
      appointmentDate: {
        gte: startOfDay,
        lte: endOfDay
      },
      status: {
        not: 'CANCELLED'
      }
    };

    // Güncelleme durumunda mevcut randevuyu hariç tut
    if (excludeAppointmentId) {
      whereClause.id = {
        not: parseInt(excludeAppointmentId)
      };
    }

    const conflictingAppointments = await prisma.appointments.findMany({
      where: whereClause,
      include: {
        service: {
          select: {
            durationMinutes: true
          }
        }
      }
    });

    // Çakışma kontrolü
    for (const existing of conflictingAppointments) {
      const existingStart = new Date(existing.appointmentDate);
      const existingDuration = existing.service.durationMinutes || 60;
      const existingEnd = new Date(existingStart.getTime() + (existingDuration * 60000));

      // Çakışma var mı?
      if (
        (appointmentStart >= existingStart && appointmentStart < existingEnd) ||
        (appointmentEnd > existingStart && appointmentEnd <= existingEnd) ||
        (appointmentStart <= existingStart && appointmentEnd >= existingEnd)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Bu saatte başka bir randevu var',
          validation: {
            isValid: false,
            reason: 'TIME_CONFLICT',
            conflictingAppointment: {
              id: existing.id,
              customerName: existing.customerName,
              startTime: existingStart.toISOString(),
              endTime: existingEnd.toISOString(),
              duration: existingDuration
            }
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Randevu saati uygun',
      validation: {
        isValid: true,
        appointmentStart: appointmentStart.toISOString(),
        appointmentEnd: appointmentEnd.toISOString(),
        duration: serviceDuration
      }
    });

  } catch (error) {
    console.error('Randevu doğrulama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu doğrulaması yapılırken hata oluştu',
      error: error.message
    });
  }
};

export const completeAppointment = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { notes, completedAt } = req.body;

    // Randevuyu bul
    const appointment = await prisma.appointments.findFirst({
      where: {
        id: parseInt(id),
        accountId: accountId
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
            sessionCount: true,
            durationMinutes: true
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

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Randevu bulunamadı'
      });
    }

    // Zaten tamamlanmış mı kontrol et
    if (appointment.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Bu randevu zaten tamamlanmış'
      });
    }

    // İptal edilmiş mi kontrol et
    if (appointment.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'İptal edilmiş randevu tamamlanamaz'
      });
    }

    let paymentWarning = null;
    let sessionInfo = null;
    let warnings = [];

    // Ödeme kontrolü (sadece uyarı)
    if (appointment.sale) {
      const totalPaid = appointment.sale.payments.reduce((sum, payment) => sum + parseFloat(payment.amountPaid), 0);
      const remainingPayment = parseFloat(appointment.sale.totalAmount) - totalPaid;
      
      if (remainingPayment > 0) {
        paymentWarning = {
          totalAmount: parseFloat(appointment.sale.totalAmount),
          totalPaid: totalPaid,
          remainingPayment: remainingPayment,
          message: `${remainingPayment.toFixed(2)} TL ödeme kaldı`
        };
        warnings.push('Ödeme tamamlanmamış');
      }
    }

    // Transaction ile randevu tamamla
    const result = await prisma.$transaction(async (tx) => {
      // 1. Randevu durumunu güncelle
      const updatedAppointment = await tx.appointments.update({
        where: {
          id: parseInt(id)
        },
        data: {
          status: 'COMPLETED',
          notes: notes || appointment.notes,
          updatedAt: new Date()
        }
      });

      let updatedSale = null;
      let createdSession = null;

      // 2. Eğer satış varsa ve seanslı paketse seans düşür + session oluştur
      if (appointment.sale && appointment.service.isSessionBased) {
        if (appointment.sale.remainingSessions > 0) {
          // Seans düşür
          updatedSale = await tx.sales.update({
            where: {
              id: appointment.sale.id
            },
            data: {
              remainingSessions: appointment.sale.remainingSessions - 1
            }
          });

          // Session oluştur
          createdSession = await tx.sessions.create({
            data: {
              saleId: appointment.sale.id,
              staffId: appointment.staffId,
              sessionDate: completedAt ? new Date(completedAt) : new Date(),
              status: 'COMPLETED',
              notes: notes || `${appointment.service.serviceName} tamamlandı`
            }
          });

          sessionInfo = {
            sessionCreated: true,
            sessionId: createdSession.id,
            remainingSessions: updatedSale.remainingSessions,
            isPackageCompleted: updatedSale.remainingSessions === 0
          };

          if (updatedSale.remainingSessions === 0) {
            warnings.push('Paket tamamlandı - tüm seanslar kullanıldı');
          }
        } else {
          warnings.push('Bu satışta kalan seans bulunamadı');
        }
      }

      return { updatedAppointment, updatedSale, createdSession };
    });

    // Final yanıt
    const response = {
      success: true,
      message: 'Randevu başarıyla tamamlandı',
      data: {
        appointment: {
          ...appointment,
          status: 'COMPLETED',
          notes: notes || appointment.notes,
          completedAt: completedAt || new Date().toISOString()
        }
      }
    };

    // Ödeme uyarısı varsa ekle
    if (paymentWarning) {
      response.data.paymentWarning = paymentWarning;
    }

    // Seans bilgisi varsa ekle
    if (sessionInfo) {
      response.data.sessionInfo = sessionInfo;
    }

    // Uyarılar varsa ekle
    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Randevu tamamlama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu tamamlanırken hata oluştu',
      error: error.message
    });
  }
}; 