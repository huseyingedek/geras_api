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

    const reference = await prisma.reference_sources.findFirst({
      where: {
        id: parseInt(id),
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

    const reference = await prisma.reference_sources.findFirst({
      where: {
        id: parseInt(id),
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
        id: parseInt(id)
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

    const reference = await prisma.reference_sources.findFirst({
      where: {
        id: parseInt(id),
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
        reference_id: parseInt(id)
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
        id: parseInt(id)
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

