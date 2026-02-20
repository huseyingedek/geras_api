import prisma from '../lib/prisma.js';

// 📊 TÜM REFERANS KAYNAKLARINI LİSTELE
export const getAllReferences = async (req, res) => {
  try {
    const { accountId } = req.user;

    const references = await prisma.reference_sources.findMany({
      where: {
        accountid: accountId
      },
      include: {
        _count: {
          select: {
            Sales: true
          }
        }
      },
      orderBy: {
        reference_name: 'asc'
      }
    });

    res.json({
      success: true,
      data: references
    });

  } catch (error) {
    console.error('Referans kaynakları listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Referans kaynakları listelenemedi',
      error: error.message
    });
  }
};

// 📄 TEK REFERANS KAYNAĞI DETAY
export const getReferenceById = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const parsedId = parseInt(id);
    if (!id || isNaN(parsedId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz referans ID' });
    }

    const reference = await prisma.reference_sources.findFirst({
      where: {
        id: parsedId,
        accountid: accountId
      },
      include: {
        _count: {
          select: {
            Sales: true
          }
        }
      }
    });

    if (!reference) {
      return res.status(404).json({
        success: false,
        message: 'Referans kaynağı bulunamadı'
      });
    }

    res.json({
      success: true,
      data: reference
    });

  } catch (error) {
    console.error('Referans kaynağı detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Referans kaynağı bilgisi alınamadı',
      error: error.message
    });
  }
};

// ➕ YENİ REFERANS KAYNAĞI EKLE
export const createReference = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { reference_type, reference_name, notes } = req.body;

    // Validation - Sadece boş olmadığını kontrol et
    if (!reference_type || reference_type.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Referans tipi gerekli'
      });
    }

    // ✅ İŞLETME İSTEDİĞİ GİBİ reference_type girebilir!
    // Önerilen kategoriler (opsiyonel):
    // - 'social_media', 'friend_referral', 'google_ads', 
    // - 'website', 'walk_in', 'returning_customer', 'other'
    // Ama zorunlu değil!

    const reference = await prisma.reference_sources.create({
      data: {
        accountid: accountId,
        reference_type: reference_type,
        reference_name: reference_name || null,
        notes: notes || null
      }
    });

    res.status(201).json({
      success: true,
      message: 'Referans kaynağı başarıyla eklendi',
      data: reference
    });

  } catch (error) {
    console.error('Referans kaynağı ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Referans kaynağı eklenemedi',
      error: error.message
    });
  }
};

// 📝 REFERANS KAYNAĞI GÜNCELLE
export const updateReference = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;
    const { reference_type, reference_name, notes } = req.body;

    const parsedId = parseInt(id);
    if (!id || isNaN(parsedId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz referans ID' });
    }

    const reference = await prisma.reference_sources.findFirst({
      where: {
        id: parsedId,
        accountid: accountId
      }
    });

    if (!reference) {
      return res.status(404).json({
        success: false,
        message: 'Referans kaynağı bulunamadı'
      });
    }

    const updatedReference = await prisma.reference_sources.update({
      where: {
        id: parsedId
      },
      data: {
        ...(reference_type && { reference_type: reference_type }),
        ...(reference_name !== undefined && { reference_name: reference_name }),
        ...(notes !== undefined && { notes: notes })
      }
    });

    res.json({
      success: true,
      message: 'Referans kaynağı başarıyla güncellendi',
      data: updatedReference
    });

  } catch (error) {
    console.error('Referans kaynağı güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Referans kaynağı güncellenemedi',
      error: error.message
    });
  }
};

// 🗑️ REFERANS KAYNAĞI SİL
export const deleteReference = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { id } = req.params;

    const parsedId = parseInt(id);
    if (!id || isNaN(parsedId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz referans ID' });
    }

    const reference = await prisma.reference_sources.findFirst({
      where: {
        id: parsedId,
        accountid: accountId
      }
    });

    if (!reference) {
      return res.status(404).json({
        success: false,
        message: 'Referans kaynağı bulunamadı'
      });
    }

    // Bu referansa bağlı satış var mı kontrol et
    const salesCount = await prisma.sales.count({
      where: {
        reference_id: parsedId
      }
    });

    if (salesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Bu referans kaynağına bağlı ${salesCount} adet satış var. Önce satışları düzenlemelisiniz.`
      });
    }

    await prisma.reference_sources.delete({
      where: {
        id: parsedId
      }
    });

    res.json({
      success: true,
      message: 'Referans kaynağı başarıyla silindi'
    });

  } catch (error) {
    console.error('Referans kaynağı silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Referans kaynağı silinemedi',
      error: error.message
    });
  }
};

// 📊 REFERANS KAYNAKLARINA GÖRE İSTATİSTİK
export const getReferenceStats = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { period, startDate, endDate } = req.query;

    // Tarih filtresi
    let dateFilter = {};
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
    }

    // Referans kaynaklarına göre müşteri sayısı (satış değil!)
    const stats = await prisma.sales.groupBy({
      by: ['reference_id'],
      where: {
        accountId: accountId,
        isDeleted: false,
        reference_id: { not: null }, // Sadece referansı olan satışlar
        ...(Object.keys(dateFilter).length > 0 && { saleDate: dateFilter })
      },
      _count: {
        id: true
      }
    });

    // Referans bilgilerini çek
    const referenceIds = stats.map(s => s.reference_id).filter(id => id !== null);
    const references = await prisma.reference_sources.findMany({
      where: {
        id: { in: referenceIds }
      }
    });

    // Birleştir - Sadece müşteri sayısı
    const result = stats.map(stat => {
      const ref = references.find(r => r.id === stat.reference_id);
      return {
        referenceId: stat.reference_id,
        referenceName: ref?.reference_name || 'Bilinmiyor',
        referenceType: ref?.reference_type || 'unknown',
        customerCount: stat._count.id  // Sadece sayı
      };
    });

    // Toplam sadece referans ve müşteri sayısı
    const totalCustomers = result.reduce((sum, item) => sum + item.customerCount, 0);

    res.json({
      success: true,
      data: result.sort((a, b) => b.customerCount - a.customerCount), // En çok müşterisi olan önce
      summary: {
        totalReferences: result.length,
        totalCustomers: totalCustomers
      }
    });

  } catch (error) {
    console.error('Referans istatistik hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Referans istatistikleri alınamadı',
      error: error.message
    });
  }
};

// 📈 REFERANS PERFORMANS RAPORU (GELİŞMİŞ)
export const getReferencePerformanceReport = async (req, res) => {
  try {
    const { accountId } = req.user;
    const { period, startDate, endDate } = req.query;

    console.log('📊 Referans Raporu İsteği:');
    console.log('- accountId:', accountId);
    console.log('- period:', period);
    console.log('- startDate:', startDate);
    console.log('- endDate:', endDate);

    // Tarih filtresi oluştur
    let dateFilter = {};
    let periodLabel = '';

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
      
      const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      const startDay = start.getDate();
      const startMonth = monthNames[start.getMonth()];
      const endDay = end.getDate();
      const endMonth = monthNames[end.getMonth()];
      const endYear = end.getFullYear();
      
      if (start.getMonth() === end.getMonth()) {
        periodLabel = `${startDay} - ${endDay} ${endMonth} ${endYear}`;
      } else {
        periodLabel = `${startDay} ${startMonth} - ${endDay} ${endMonth} ${endYear}`;
      }
    } else {
      const now = new Date();
      
      switch (period) {
        case 'this_month':
          const monthStart = new Date(Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            1,
            0, 0, 0, 0
          ));
          dateFilter = { gte: monthStart, lte: now };
          periodLabel = 'Bu Ay';
          break;
          
        case 'last_month':
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
          dateFilter = { gte: lastMonthStart, lte: lastMonthEnd };
          periodLabel = 'Geçen Ay';
          break;
          
        case 'this_year':
          const yearStart = new Date(Date.UTC(now.getFullYear(), 0, 1, 0, 0, 0, 0));
          dateFilter = { gte: yearStart, lte: now };
          periodLabel = 'Bu Yıl';
          break;
          
        default:
          // Default: Bu ay
          const defaultStart = new Date(Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            1,
            0, 0, 0, 0
          ));
          dateFilter = { gte: defaultStart, lte: now };
          periodLabel = 'Bu Ay';
      }
    }

    // Gelir-Gider raporuyla aynı mantık: ÖDEME TARİHİNE göre filtrele
    // Tüm ödemeleri çekip JS tarafında referanslı/referanssız ayır
    const allPayments = await prisma.payments.findMany({
      where: {
        status: 'COMPLETED',
        ...(Object.keys(dateFilter).length > 0 && { paymentDate: dateFilter }),
        sale: {
          accountId: accountId,
          isDeleted: false
        }
      },
      include: {
        sale: {
          select: {
            id: true,
            reference_id: true,
            reference_sources: {
              select: { id: true, reference_type: true, reference_name: true }
            }
          }
        }
      }
    });

    console.log('📊 Toplam COMPLETED ödeme sayısı (dönem):', allPayments.length);

    // JS tarafında ayır
    const referenceStats = {};
    let totalPaid = 0;
    let noRefPaid = 0;
    let noRefPaymentCount = 0;

    allPayments.forEach(payment => {
      const sale = payment.sale;
      const paidAmount = parseFloat(payment.amountPaid);
      const refId = sale.reference_id;

      if (!refId) {
        // Referanssız
        noRefPaid += paidAmount;
        noRefPaymentCount++;
        return;
      }

      // Referanslı
      const ref = sale.reference_sources;
      if (!referenceStats[refId]) {
        referenceStats[refId] = {
          referenceId: refId,
          referenceName: ref?.reference_name || 'Bilinmiyor',
          referenceType: ref?.reference_type || 'unknown',
          paymentCount: 0,
          saleCount: 0,
          totalPaid: 0,
          _saleIds: new Set()
        };
      }

      referenceStats[refId].paymentCount++;
      referenceStats[refId]._saleIds.add(sale.id); // tekrar sayımı önle
      referenceStats[refId].totalPaid += paidAmount;
      totalPaid += paidAmount;
    });

    // saleCount ve averageOrderValue hesapla, _saleIds temizle
    Object.values(referenceStats).forEach(ref => {
      ref.saleCount = ref._saleIds.size;
      ref.averageOrderValue = ref.saleCount > 0
        ? parseFloat((ref.totalPaid / ref.saleCount).toFixed(2))
        : 0;
      ref.totalPaid = parseFloat(ref.totalPaid.toFixed(2));
      delete ref._saleIds;
    });

    const result = Object.values(referenceStats).sort((a, b) => b.totalPaid - a.totalPaid);
    const grandTotalPaid = totalPaid + noRefPaid;

    const resultWithPercentages = result.map(ref => ({
      ...ref,
      revenuePercentage: grandTotalPaid > 0
        ? parseFloat(((ref.totalPaid / grandTotalPaid) * 100).toFixed(2))
        : 0
    }));

    console.log('📊 Referanslı toplam:', totalPaid.toFixed(2));
    console.log('📊 Referanssız toplam:', noRefPaid.toFixed(2));
    console.log('📊 Grand total:', grandTotalPaid.toFixed(2));

    res.json({
      success: true,
      data: resultWithPercentages,
      summary: {
        totalReferences: result.length,

        // Referanslı ödemeler
        referralPaymentCount: allPayments.length - noRefPaymentCount,
        referralTotalPaid: parseFloat(totalPaid.toFixed(2)),

        // Referanssız ödemeler
        noReferencePaymentCount: noRefPaymentCount,
        noReferenceTotalPaid: parseFloat(noRefPaid.toFixed(2)),

        // Genel toplam — gelir-gider raporundaki totalIncome ile eşleşir
        grandTotalPaid: parseFloat(grandTotalPaid.toFixed(2)),

        topReference: result.length > 0 ? result[0].referenceName : null
      },
      period: {
        label: periodLabel,
        type: period || 'custom',
        startDate: dateFilter.gte?.toISOString().split('T')[0],
        endDate: dateFilter.lte?.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('❌ Referans performans raporu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Referans performans raporu alınamadı',
      error: error.message
    });
  }
};


