import prisma from '../lib/prisma.js';
import { sendSMS, prepareAppointmentSMS, prepareAppointmentCancelSMS } from '../utils/smsService.js';

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
      notes,
      saleDate
    } = req.body;

    if (!firstName || !lastName || !serviceId || !staffId || !appointmentDate) {
      return res.status(400).json({
        success: false,
        message: 'Gerekli alanlar eksik: firstName, lastName, serviceId, staffId, appointmentDate'
      });
    }

    const appointmentStart = new Date(appointmentDate);
    const now = new Date();

    
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

      const finalSaleDate = saleDate ? new Date(saleDate) : new Date();
      
      if (finalSaleDate > new Date()) {
        throw new Error('Satış tarihi gelecek bir tarih olamaz');
      }

      const sale = await tx.sales.create({
        data: {
          accountId: accountId,
          clientId: client.id,
          serviceId: serviceId,
          saleDate: finalSaleDate,
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
        }
      });

      return { appointment, client, service, staff, sale };
    }, {
      timeout: 15000, // 15 saniye timeout
      maxWait: 8000   // 8 saniye bekleme
    });

    // Transaction sonrası detayları al (include ile)
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

    // ✅ SMS BİLDİRİMİ GÖNDER (telefon numarası varsa)
    if (phone) {
      try {
        const account = await prisma.accounts.findUnique({
          where: { id: accountId },
          select: { businessName: true }
        });

        const smsData = {
          customerName: `${firstName} ${lastName}`,
          serviceName: service.serviceName,
          appointmentDate: appointmentDate,
          staffName: staff.fullName,
          businessName: account?.businessName || 'Bizim Işletme'
        };

        const smsMessage = prepareAppointmentSMS(smsData);
        const smsResult = await sendSMS(phone, smsMessage);

        if (!smsResult.success) {
          console.error('❌ SMS gönderme hatası:', smsResult.error);
        }
      } catch (smsError) {
        console.error('❌ SMS gönderme işlemi hatası:', smsError);
        // SMS hatası randevu oluşturma işlemini engellemez
      }
    }

    res.status(201).json({
      success: true,
      message: 'Hızlı randevu başarıyla oluşturuldu',
      data: appointmentWithDetails
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

    // ✅ SEANS SAYISI KONTROLÜ
    if (sale.remainingSessions <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu satışın kalan seansı yoktur. Randevu oluşturulamaz.'
      });
    }

    // ✅ MEVCUT RANDEVU SAYISI KONTROLÜ
    const existingAppointments = await prisma.appointments.count({
      where: {
        saleId: saleId,
        status: {
          not: 'CANCELLED'
        }
      }
    });

    if (existingAppointments >= sale.remainingSessions) {
      return res.status(400).json({
        success: false,
        message: `Bu satış için maksimum ${sale.remainingSessions} randevu oluşturulabilir. Mevcut randevu sayısı: ${existingAppointments}`
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

    // ✅ RANDEVU OLUŞTUR (SEANS AZALTMADAN)
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

    // ✅ SMS BİLDİRİMİ GÖNDER (telefon numarası varsa)
    if (appointment.client?.phone) {
      try {
        const account = await prisma.accounts.findUnique({
          where: { id: accountId },
          select: { businessName: true }
        });

        const smsData = {
          customerName: `${appointment.client.firstName} ${appointment.client.lastName}`,
          serviceName: appointment.service.serviceName,
          appointmentDate: appointmentDate,
          staffName: appointment.staff.fullName,
          businessName: account?.businessName || 'Bizim Işletme'
        };

        const smsMessage = prepareAppointmentSMS(smsData);
        const smsResult = await sendSMS(appointment.client.phone, smsMessage);

        if (!smsResult.success) {
          console.error('❌ SMS gönderme hatası:', smsResult.error);
        }
      } catch (smsError) {
        console.error('❌ SMS gönderme işlemi hatası:', smsError);
        // SMS hatası randevu oluşturma işlemini engellemez
      }
    }

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
      },
      include: {
        sale: {
          include: {
            service: {
              select: {
                isSessionBased: true
              }
            }
          }
        }
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

    // ✅ DURUM DEĞİŞİKLİĞİ KONTROLÜ VE SEANS YÖNETİMİ
    const oldStatus = existingAppointment.status;
    const newStatus = status || existingAppointment.status;
    
    let sessionChanges = null;
    
    // Durum değişikliği var mı?
    if (status && oldStatus !== newStatus) {
      // Tüm hizmetlerde seans yönetimi yap (session-based kontrolü kaldırıldı)
      if (existingAppointment.sale) {
        
        // COMPLETED → PLANNED/CANCELLED: Seansı geri yükle
        if (oldStatus === 'COMPLETED' && (newStatus === 'PLANNED' || newStatus === 'CANCELLED')) {
          sessionChanges = {
            type: 'restore',
            message: 'Seans geri yüklendi'
          };
        }
        // PLANNED/CANCELLED → COMPLETED: Seansı azalt
        else if ((oldStatus === 'PLANNED' || oldStatus === 'CANCELLED') && newStatus === 'COMPLETED') {
          // Seans kontrolü yap
          if (existingAppointment.sale.remainingSessions <= 0) {
            return res.status(400).json({
              success: false,
              message: 'Bu satışın kalan seansı yoktur. Randevu tamamlanamaz.'
            });
          }
          sessionChanges = {
            type: 'decrease',
            message: 'Seans azaltıldı'
          };
        }
      }
    }

    // ✅ TRANSACTION İLE GÜNCELLEME
    const result = await prisma.$transaction(async (tx) => {
      // 1. Randevuyu güncelle
      const updatedAppointment = await tx.appointments.update({
        where: {
          id: parseInt(id)
        },
        data: {
          staffId: staffId || existingAppointment.staffId,
          appointmentDate: appointmentDate ? new Date(appointmentDate).toISOString() : existingAppointment.appointmentDate,
          status: newStatus,
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

      // 2. Seans değişikliklerini uygula
      if (sessionChanges) {
        if (sessionChanges.type === 'restore') {
          // Seansı geri yükle
          await tx.sales.update({
            where: { id: existingAppointment.sale.id },
            data: { 
              remainingSessions: existingAppointment.sale.remainingSessions + 1 
            }
          });
          
          // İlgili session kaydını sil (sadece session-based hizmetler için)
          if (existingAppointment.sale.service.isSessionBased) {
            await tx.sessions.deleteMany({
              where: {
                saleId: existingAppointment.sale.id,
                staffId: existingAppointment.staffId,
                status: 'COMPLETED'
              }
            });
          }
          
        } else if (sessionChanges.type === 'decrease') {
          // Seansı azalt
          await tx.sales.update({
            where: { id: existingAppointment.sale.id },
            data: { 
              remainingSessions: existingAppointment.sale.remainingSessions - 1 
            }
          });
          
          // Session kaydı oluştur (sadece session-based hizmetler için)
          if (existingAppointment.sale.service.isSessionBased) {
            await tx.sessions.create({
              data: {
                saleId: existingAppointment.sale.id,
                staffId: existingAppointment.staffId,
                sessionDate: new Date(),
                status: 'COMPLETED',
                notes: `${existingAppointment.service?.serviceName || 'Hizmet'} tamamlandı`
              }
            });
          }
        }
      }

      return updatedAppointment;
    });

    // ✅ RANDEVU İPTAL EDİLDİĞİNDE SMS BİLDİRİMİ GÖNDER
    if (newStatus === 'CANCELLED' && oldStatus !== 'CANCELLED' && result.client?.phone) {
      try {
        const account = await prisma.accounts.findUnique({
          where: { id: accountId },
          select: { businessName: true }
        });

        const smsData = {
          customerName: `${result.client.firstName} ${result.client.lastName}`,
          serviceName: result.service.serviceName,
          appointmentDate: result.appointmentDate,
          businessName: account?.businessName || 'Bizim Işletme'
        };

        const smsMessage = prepareAppointmentCancelSMS(smsData);
        const smsResult = await sendSMS(result.client.phone, smsMessage);

                  if (!smsResult.success) {
            console.error('❌ Randevu iptal SMS hatası:', smsResult.error);
          }
      } catch (smsError) {
        console.error('❌ SMS gönderme işlemi hatası:', smsError);
        // SMS hatası güncelleme işlemini engellemez
      }
    }

    // Response hazırla
    const response = {
      success: true,
      message: 'Randevu başarıyla güncellendi',
      data: result
    };

    // Seans değişikliği varsa bilgi ekle
    if (sessionChanges) {
      response.sessionInfo = {
        changed: true,
        type: sessionChanges.type,
        message: sessionChanges.message
      };
    }

    res.status(200).json(response);

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
      },
      include: {
        sale: {
          include: {
            service: {
              select: {
                isSessionBased: true,
                serviceName: true
              }
            }
          }
        }
      }
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        message: 'Randevu bulunamadı'
      });
    }

    // ✅ TAMAMLANMIŞ RANDEVU SİLİNİRSE SEANSI GERİ YÜKLE
    let sessionRestored = false;
    
    if (existingAppointment.status === 'COMPLETED' && existingAppointment.sale) {
      
      await prisma.$transaction(async (tx) => {
        // 1. Randevuyu sil
        await tx.appointments.delete({
          where: {
            id: parseInt(id)
          }
        });

        // 2. Seansı geri yükle
        await tx.sales.update({
          where: { id: existingAppointment.sale.id },
          data: { 
            remainingSessions: existingAppointment.sale.remainingSessions + 1 
          }
        });

        // 3. İlgili session kaydını sil (sadece session-based hizmetler için)
        if (existingAppointment.sale.service.isSessionBased) {
          await tx.sessions.deleteMany({
            where: {
              saleId: existingAppointment.sale.id,
              staffId: existingAppointment.staffId,
              status: 'COMPLETED'
            }
          });
        }
      });

      sessionRestored = true;
    } else {
      // Normal silme işlemi
      await prisma.appointments.delete({
        where: {
          id: parseInt(id)
        }
      });
    }

    if ((existingAppointment.status === 'PLANNED' || existingAppointment.status === 'COMPLETED')) {
      const clientInfo = await prisma.clients.findUnique({
        where: { id: existingAppointment.clientId },
        select: {
          firstName: true,
          lastName: true,
          phone: true
        }
      });

      const serviceInfo = await prisma.services.findUnique({
        where: { id: existingAppointment.serviceId },
        select: {
          serviceName: true
        }
      });

      if (clientInfo?.phone) {
        try {
          const account = await prisma.accounts.findUnique({
            where: { id: accountId },
            select: { businessName: true }
          });

          const smsData = {
            customerName: `${clientInfo.firstName} ${clientInfo.lastName}`,
            serviceName: serviceInfo?.serviceName || 'Hizmet',
            appointmentDate: existingAppointment.appointmentDate,
            businessName: account?.businessName || 'Bizim Işletme'
          };

          const smsMessage = prepareAppointmentCancelSMS(smsData);
          const smsResult = await sendSMS(clientInfo.phone, smsMessage);

          if (!smsResult.success) {
            console.error('❌ Randevu silme SMS hatası:', smsResult.error);
          }
        } catch (smsError) {
          console.error('❌ SMS gönderme işlemi hatası:', smsError);
        }
      }
    }

    const response = {
      success: true,
      message: 'Randevu başarıyla silindi'
    };

    if (sessionRestored) {
      response.sessionInfo = {
        restored: true,
        message: 'Tamamlanmış randevu silindiği için seans geri yüklendi'
      };
    }

    res.status(200).json(response);

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

      // 2. Eğer satış varsa seans düşür + session oluştur (session-based kontrolü kaldırıldı)
      if (appointment.sale) {
        
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

          // Session oluştur (sadece session-based hizmetler için)
          if (appointment.service.isSessionBased) {
            createdSession = await tx.sessions.create({
              data: {
                saleId: appointment.sale.id,
                staffId: appointment.staffId,
                sessionDate: completedAt ? new Date(completedAt) : new Date(),
                status: 'COMPLETED',
                notes: notes || `${appointment.service.serviceName} tamamlandı`
              }
            });
          }

          sessionInfo = {
            sessionCreated: !!createdSession,
            sessionId: createdSession?.id,
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

    if (paymentWarning) {
      response.data.paymentWarning = paymentWarning;
    }

    if (sessionInfo) {
      response.data.sessionInfo = sessionInfo;
    }

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