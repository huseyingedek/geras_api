import prisma from '../lib/prisma.js';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';

// ─── YARDIMCI ────────────────────────────────────────────────────────────────

const formatPlan = (plan) => ({
  id: plan.id,
  key: plan.key,
  name: plan.name,
  displayName: plan.displayName,
  price: parseFloat(plan.price),
  yearlyPrice: plan.yearlyPrice ? parseFloat(plan.yearlyPrice) : null,
  currency: plan.currency,
  color: plan.color,
  icon: plan.icon,
  popular: plan.popular,
  isActive: plan.isActive,
  isDemo: plan.isDemo,
  trialDays: plan.trialDays,
  sortOrder: plan.sortOrder,
  features: plan.features,
  limits: plan.limits,
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt
});

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

// GET /api/plans — Aktif planları listele (fiyatlandırma sayfası için)
export const getPublicPlans = async (req, res, next) => {
  try {
    const plans = await prisma.plans.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    res.json({
      status: 'success',
      data: plans.map(formatPlan)
    });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN ───────────────────────────────────────────────────────────────────

// GET /api/admin/plans — Tüm planları listele (aktif + pasif)
export const getAllPlans = async (req, res, next) => {
  try {
    const plans = await prisma.plans.findMany({
      orderBy: { sortOrder: 'asc' }
    });

    // Her plan için kaç hesap kullanıyor sayısını ekle
    const plansWithUsage = await Promise.all(
      plans.map(async (plan) => {
        const accountCount = await prisma.accounts.count({
          where: { subscriptionPlan: plan.key }
        });
        return { ...formatPlan(plan), accountCount };
      })
    );

    res.json({
      status: 'success',
      results: plansWithUsage.length,
      data: plansWithUsage
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/plans/:id — Tek plan detayı
export const getPlanById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await prisma.plans.findUnique({
      where: { id: parseInt(id) }
    });

    if (!plan) {
      return next(new AppError('Plan bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    const accountCount = await prisma.accounts.count({
      where: { subscriptionPlan: plan.key }
    });

    res.json({
      status: 'success',
      data: { ...formatPlan(plan), accountCount }
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/plans — Yeni plan oluştur
export const createPlan = async (req, res, next) => {
  try {
    const {
      key,
      name,
      displayName,
      price,
      yearlyPrice,
      currency = 'TRY',
      color,
      icon,
      popular = false,
      isActive = true,
      isDemo = false,
      trialDays,
      sortOrder = 0,
      features = {},
      limits = {}
    } = req.body;

    if (!key || !name || !displayName || price === undefined) {
      return next(new AppError('key, name, displayName ve price zorunludur', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // features → [{label, enabled}] array formatı zorunlu
    const parsedFeatures = typeof features === 'string' ? JSON.parse(features) : features;
    if (!Array.isArray(parsedFeatures)) {
      return next(new AppError('features bir dizi olmalıdır: [{label: "...", enabled: true}]', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    // key büyük harf, sadece harf ve alt çizgi
    const normalizedKey = String(key).toUpperCase().replace(/[^A-Z0-9_]/g, '_');

    const existing = await prisma.plans.findUnique({ where: { key: normalizedKey } });
    if (existing) {
      return next(new AppError(`"${normalizedKey}" key'i zaten kullanımda`, 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    const plan = await prisma.plans.create({
      data: {
        key: normalizedKey,
        name,
        displayName,
        price: parseFloat(price),
        yearlyPrice: yearlyPrice !== undefined ? parseFloat(yearlyPrice) : null,
        currency,
        color: color || null,
        icon: icon || null,
        popular: Boolean(popular),
        isActive: Boolean(isActive),
        isDemo: Boolean(isDemo),
        trialDays: trialDays ? parseInt(trialDays) : null,
        sortOrder: parseInt(sortOrder),
        features: parsedFeatures,
        limits: typeof limits === 'string' ? JSON.parse(limits) : limits
      }
    });

    res.status(201).json({
      status: 'success',
      data: formatPlan(plan),
      message: `"${plan.name}" planı oluşturuldu`
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/plans/:id — Planı güncelle
export const updatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      displayName,
      price,
      yearlyPrice,
      currency,
      color,
      icon,
      popular,
      isActive,
      isDemo,
      trialDays,
      sortOrder,
      features,
      limits
    } = req.body;

    const plan = await prisma.plans.findUnique({ where: { id: parseInt(id) } });
    if (!plan) {
      return next(new AppError('Plan bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    const updateData = {
      ...(name !== undefined && { name }),
      ...(displayName !== undefined && { displayName }),
      ...(price !== undefined && { price: parseFloat(price) }),
      ...(yearlyPrice !== undefined && { yearlyPrice: yearlyPrice === null ? null : parseFloat(yearlyPrice) }),
      ...(currency !== undefined && { currency }),
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
      ...(popular !== undefined && { popular: Boolean(popular) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(isDemo !== undefined && { isDemo: Boolean(isDemo) }),
      ...(trialDays !== undefined && { trialDays: trialDays === null ? null : parseInt(trialDays) }),
      ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) }),
      ...(features !== undefined && { features: typeof features === 'string' ? JSON.parse(features) : features }),
      ...(limits !== undefined && { limits: typeof limits === 'string' ? JSON.parse(limits) : limits })
    };

    const updated = await prisma.plans.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({
      status: 'success',
      data: formatPlan(updated),
      message: `"${updated.name}" planı güncellendi`
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/admin/plans/:id — Planı sil (kullanan hesap yoksa)
export const deletePlan = async (req, res, next) => {
  try {
    const { id } = req.params;

    const plan = await prisma.plans.findUnique({ where: { id: parseInt(id) } });
    if (!plan) {
      return next(new AppError('Plan bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    const accountCount = await prisma.accounts.count({
      where: { subscriptionPlan: plan.key }
    });

    if (accountCount > 0) {
      return next(new AppError(
        `Bu plan ${accountCount} hesap tarafından kullanılıyor. Silmek için önce hesapları başka plana taşıyın.`,
        400,
        ErrorCodes.GENERAL_VALIDATION_ERROR
      ));
    }

    await prisma.plans.delete({ where: { id: parseInt(id) } });

    res.json({
      status: 'success',
      message: `"${plan.name}" planı silindi`
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/admin/plans/:id/toggle — Planı aktif/pasif yap
export const togglePlanStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const plan = await prisma.plans.findUnique({ where: { id: parseInt(id) } });
    if (!plan) {
      return next(new AppError('Plan bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    const updated = await prisma.plans.update({
      where: { id: parseInt(id) },
      data: { isActive: !plan.isActive }
    });

    res.json({
      status: 'success',
      data: formatPlan(updated),
      message: `"${updated.name}" planı ${updated.isActive ? 'aktif edildi' : 'pasife alındı'}`
    });
  } catch (error) {
    next(error);
  }
};
