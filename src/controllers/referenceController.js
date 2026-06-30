import prisma from '../lib/prisma.js';
import { resolveDateRange } from '../lib/dateRange.js';

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
    // Tarih filtresi — sadece tarih verildiyse uygula (yoksa tüm zamanlar).
    // Ortak çözümleyici ile yerel/Türkiye günü sınırı.
    let dateFilter = {};
    if (startDate && endDate) {
      const range = resolveDateRange({ startDate, endDate });
      dateFilter = { gte: range.gte, lte: range.lte };
    } else if (startDate) {
      const range = resolveDateRange({ startDate, endDate: startDate });
      dateFilter.gte = range.gte;
    } else if (endDate) {
      const range = resolveDateRange({ startDate: endDate, endDate });
      dateFilter.lte = range.lte;
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

    // Tarih aralığı — TÜM raporlarla ORTAK çözümleyici (yerel/Türkiye günü)
    const range = resolveDateRange({ period, startDate, endDate });
    const dateFilter = { gte: range.gte, lte: range.lte };
    const periodLabel = range.label;

    // İKİ AYRI ÖLÇÜ — birbirine karışmasın diye ayrı kaynaklardan hesaplanır:
    //  • SATIŞ metrikleri (Satış Tutarı / Adedi): SATIŞ TARİHİNE göre — dönemde YAPILAN satışlar.
    //  • KASA / TAHSİLAT metrikleri: ÖDEME TARİHİNE göre — dönemde kasaya GİREN para.
    // Böylece toplamlar Gelir-Gider raporundaki "Toplam Satış" ve "Toplam Tahsilat" ile birebir uyuşur.
    const dateApplied = Object.keys(dateFilter).length > 0;

    // 1) Dönemde YAPILAN satışlar (satış tarihine göre)
    const sales = await prisma.sales.findMany({
      where: {
        accountId: accountId,
        isDeleted: false,
        ...(dateApplied && { saleDate: dateFilter })
      },
      select: {
        id: true,
        totalAmount: true,
        reference_id: true,
        reference_sources: {
          select: { id: true, reference_type: true, reference_name: true }
        },
        payments: {
          where: { status: 'COMPLETED' },
          select: { amountPaid: true }
        }
      }
    });

    // 2) Dönemde kasaya GİREN tamamlanmış ödemeler (ödeme tarihine göre)
    const periodPayments = await prisma.payments.findMany({
      where: {
        status: 'COMPLETED',
        ...(dateApplied && { paymentDate: dateFilter }),
        sale: { accountId: accountId, isDeleted: false }
      },
      select: {
        amountPaid: true,
        sale: {
          select: {
            reference_id: true,
            reference_sources: {
              select: { id: true, reference_type: true, reference_name: true }
            }
          }
        }
      }
    });

    console.log('📊 Dönemde yapılan satış:', sales.length, '| Dönemde alınan ödeme:', periodPayments.length);

    // Referans bazında birleşik istatistik tablosu
    const referenceStats = {};
    const ensureRef = (refId, ref) => {
      if (!referenceStats[refId]) {
        referenceStats[refId] = {
          referenceId: refId,
          referenceName: ref?.reference_name || 'Bilinmiyor',
          referenceType: ref?.reference_type || 'unknown',
          saleCount: 0,
          totalSalesAmount: 0,
          _salesCollected: 0, // dönem satışlarından tahsil edilen (borç hesabı için)
          totalPaid: 0,       // KASA: ödeme tarihine göre dönemde giren para
          paymentCount: 0
        };
      }
      return referenceStats[refId];
    };

    // --- SATIŞ metrikleri (satış tarihine göre) ---
    let noRefSalesAmount = 0;
    let noRefSaleCount = 0;
    sales.forEach(sale => {
      const saleAmount = parseFloat(sale.totalAmount) || 0;
      const collected = sale.payments.reduce((s, p) => s + (parseFloat(p.amountPaid) || 0), 0);
      const refId = sale.reference_id;
      if (!refId) {
        noRefSalesAmount += saleAmount;
        noRefSaleCount += 1;
        return;
      }
      const r = ensureRef(refId, sale.reference_sources);
      r.saleCount += 1;
      r.totalSalesAmount += saleAmount;
      r._salesCollected += collected;
    });

    // --- KASA / TAHSİLAT metrikleri (ödeme tarihine göre) ---
    let noRefPaid = 0;
    let noRefPaymentCount = 0;
    periodPayments.forEach(p => {
      const amount = parseFloat(p.amountPaid) || 0;
      const refId = p.sale?.reference_id;
      if (!refId) {
        noRefPaid += amount;
        noRefPaymentCount += 1;
        return;
      }
      const r = ensureRef(refId, p.sale.reference_sources);
      r.totalPaid += amount;
      r.paymentCount += 1;
    });

    // Türetilmiş alanlar
    Object.values(referenceStats).forEach(ref => {
      ref.totalSalesAmount = parseFloat(ref.totalSalesAmount.toFixed(2));
      ref.totalPaid = parseFloat(ref.totalPaid.toFixed(2));
      ref.remainingDebt = parseFloat(Math.max(0, ref.totalSalesAmount - ref._salesCollected).toFixed(2));
      ref.averageOrderValue = ref.saleCount > 0
        ? parseFloat((ref.totalSalesAmount / ref.saleCount).toFixed(2))
        : 0;
      delete ref._salesCollected;
    });

    const result = Object.values(referenceStats).sort((a, b) => b.totalSalesAmount - a.totalSalesAmount);
    const totalPaid = parseFloat(result.reduce((s, r) => s + r.totalPaid, 0).toFixed(2)); // referanslı kasa
    const referralPaymentCount = result.reduce((s, r) => s + r.paymentCount, 0);
    const grandTotalPaid = parseFloat((totalPaid + noRefPaid).toFixed(2));
    const grandTotalSalesAmount = parseFloat((result.reduce((s, r) => s + r.totalSalesAmount, 0) + noRefSalesAmount).toFixed(2));

    const resultWithPercentages = result.map(ref => ({
      ...ref,
      revenuePercentage: grandTotalSalesAmount > 0
        ? parseFloat(((ref.totalSalesAmount / grandTotalSalesAmount) * 100).toFixed(2))
        : 0
    }));

    console.log('📊 Referanslı satış:', (grandTotalSalesAmount - noRefSalesAmount).toFixed(2), '| Referanslı kasa:', totalPaid.toFixed(2), '| Grand kasa:', grandTotalPaid.toFixed(2));

    res.json({
      success: true,
      data: resultWithPercentages,
      summary: {
        totalReferences: result.length,

        // Referanslı
        referralPaymentCount: referralPaymentCount,
        referralTotalSalesAmount: parseFloat(result.reduce((s, r) => s + r.totalSalesAmount, 0).toFixed(2)),
        referralTotalPaid: parseFloat(totalPaid.toFixed(2)),

        // Referanssız
        noReferencePaymentCount: noRefPaymentCount,
        noReferenceTotalSalesAmount: parseFloat(noRefSalesAmount.toFixed(2)),
        noReferenceTotalPaid: parseFloat(noRefPaid.toFixed(2)),

        // Genel toplam
        grandTotalSalesAmount: parseFloat(grandTotalSalesAmount.toFixed(2)),
        grandTotalPaid: parseFloat(grandTotalPaid.toFixed(2)),

        topReference: result.length > 0 ? result[0].referenceName : null
      },
      period: {
        label: periodLabel,
        type: range.type,
        startDate: range.startStr,
        endDate: range.endStr
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


