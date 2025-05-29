import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const calculatePrice = (service, quantity) => {
  const calculatedPrice = service.price * quantity;
  return parseFloat(calculatedPrice.toFixed(2));
};

export const getAllSales = async (req, res) => {
  try {
    const { accountId } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { isDeleted } = req.query;

    let whereClause = {
      accountId: accountId
    };

    if (isDeleted === 'true') {
      whereClause.isDeleted = true;
    } else if (isDeleted === 'all') {
    } else {
      whereClause.isDeleted = false;
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
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: offset,
      take: limit
    });

    const totalSales = await prisma.sales.count({
      where: whereClause
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
      filter: {
        isDeleted: isDeleted || 'false'
      }
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
      notes 
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
        totalAmount: finalTotalAmount,
        remainingSessions: finalSessions
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
    const { serviceId, totalAmount, remainingSessions, notes } = req.body;

    console.log('Güncelleme isteği:', { serviceId, totalAmount, remainingSessions, notes });

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

    console.log('Mevcut satış:', { 
      clientId: existingSale.clientId, 
      serviceId: existingSale.serviceId, 
      totalAmount: existingSale.totalAmount,
      remainingSessions: existingSale.remainingSessions 
    });

    // Eğer serviceId güncelleniyorsa, hizmeti kontrol et
    if (serviceId && serviceId !== existingSale.serviceId) {
      console.log('Service ID güncelleniyor:', serviceId);
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
      console.log('Yeni service bulundu:', service.serviceName);
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
      remainingSessions: remainingSessions !== undefined ? remainingSessions : existingSale.remainingSessions
    };

    console.log('Güncellenecek data:', updateData);

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
    const { amountPaid, paymentMethod, status, notes } = req.body;

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

    const payment = await prisma.payments.create({
      data: {
        saleId: parseInt(id),
        amountPaid: amountPaid,
        paymentMethod: paymentMethod || 'CASH',
        status: status || 'COMPLETED',
        notes: notes
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
    const { paymentMethod, status, startDate, endDate } = req.query;

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

    if (startDate || endDate) {
      whereClause.paymentDate = {};
      if (startDate) {
        whereClause.paymentDate.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.paymentDate.lte = new Date(endDate);
      }
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
      where: {
        sale: {
          accountId: accountId,
          isDeleted: false
        }
      },
      _count: {
        id: true
      },
      _sum: {
        amountPaid: true
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
        statusSummary: statusSummary
      },
      filters: {
        paymentMethod: paymentMethod || 'all',
        status: status || 'all',
        startDate: startDate || null,
        endDate: endDate || null
      }
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
    const { status, notes } = req.body;

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

    // Ödeme durumunu güncelle
    const updatedPayment = await prisma.payments.update({
      where: {
        id: parseInt(paymentId)
      },
      data: {
        status: status,
        notes: notes || payment.notes,
        updatedAt: new Date()
      }
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