import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import prisma from '../lib/prisma.js';

// ─── YARDIMCI ────────────────────────────────────────────────────────────────

// DB'den plan getir, yoksa fallback
const getPlanFromDB = async (planKey) => {
  const plan = await prisma.plans.findUnique({ where: { key: planKey } });
  if (plan) return plan;

  // Fallback: bilinmeyen plan key'i için minimal değerler
  return {
    key: planKey,
    name: planKey,
    displayName: planKey,
    price: 0,
    yearlyPrice: null,
    currency: 'TRY',
    color: '#95a5a6',
    icon: '📦',
    popular: false,
    isDemo: false,
    trialDays: null,
    features: {},
    limits: { maxStaff: null, maxClients: null, maxAppointmentsPerMonth: null, maxServices: null }
  };
};

// Sıradaki üst planı bul
const getNextPlan = async (currentKey) => {
  const plans = await prisma.plans.findMany({
    where: { isActive: true, isDemo: false },
    orderBy: { sortOrder: 'asc' }
  });

  const idx = plans.findIndex(p => p.key === currentKey);
  if (idx === -1 || idx === plans.length - 1) return null;
  return plans[idx + 1];
};

// ─── CONTROLLER'LAR ──────────────────────────────────────────────────────────

const getSubscription = async (req, res, next) => {
  try {
    const { accountId } = req.user;

    if (!accountId) {
      return next(new AppError('Hesap bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    const account = await prisma.accounts.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        businessName: true,
        subscriptionPlan: true,
        billingCycle: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
        subscriptionStatus: true,
        isDemoAccount: true,
        demoStatus: true,
        demoExpiresAt: true,
        isActive: true,
        createdAt: true
      }
    });

    if (!account) {
      return next(new AppError('Hesap bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    const planKey = account.subscriptionPlan || 'PROFESSIONAL';
    const [planDetails, nextPlan] = await Promise.all([
      getPlanFromDB(planKey),
      getNextPlan(planKey)
    ]);

    const limits = planDetails.limits || {};

    // Gerçek kullanım istatistikleri
    const [staffCount, clientCount, serviceCount, appointmentCount] = await Promise.all([
      prisma.staff.count({ where: { accountId, isActive: true } }),
      prisma.clients.count({ where: { accountId, isActive: true } }),
      prisma.services.count({ where: { accountId, isActive: true } }),
      prisma.appointments.count({
        where: {
          accountId,
          appointmentDate: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      })
    ]);

    const usage = {
      staff: {
        current: staffCount,
        limit: limits.maxStaff ?? null,
        isUnlimited: limits.maxStaff == null
      },
      clients: {
        current: clientCount,
        limit: limits.maxClients ?? null,
        isUnlimited: limits.maxClients == null
      },
      services: {
        current: serviceCount,
        limit: limits.maxServices ?? null,
        isUnlimited: limits.maxServices == null
      },
      appointmentsThisMonth: {
        current: appointmentCount,
        limit: limits.maxAppointmentsPerMonth ?? null,
        isUnlimited: limits.maxAppointmentsPerMonth == null
      }
    };

    // Demo bilgisi
    let demoInfo = null;
    if (account.isDemoAccount) {
      const now = new Date();
      const expiresAt = account.demoExpiresAt ? new Date(account.demoExpiresAt) : null;
      const remainingMs = expiresAt ? expiresAt - now : null;
      const remainingHours = remainingMs ? Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60))) : 0;

      demoInfo = {
        isDemoAccount: true,
        demoStatus: account.demoStatus,
        demoExpiresAt: account.demoExpiresAt,
        trialDays: planDetails.trialDays || 30,
        remainingHours,
        remainingDays: Math.floor(remainingHours / 24),
        isExpired: expiresAt ? now > expiresAt : false
      };
    }

    // Abonelik kalan gün
    let remainingDays = null;
    let isSubscriptionExpired = false;
    if (account.subscriptionEndDate) {
      const diff = new Date(account.subscriptionEndDate) - new Date();
      remainingDays = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
      isSubscriptionExpired = diff < 0;
    }

    // billingCycle label
    const billingCycleLabel =
      account.billingCycle === 'YEARLY' ? 'Yıllık' :
      account.billingCycle === 'MONTHLY' ? 'Aylık' : null;

    res.status(200).json({
      status: 'success',
      data: {
        currentPlan: {
          key: planKey,
          name: planDetails.name,
          displayName: planDetails.displayName,
          price: parseFloat(planDetails.price),
          yearlyPrice: planDetails.yearlyPrice ? parseFloat(planDetails.yearlyPrice) : null,
          currency: planDetails.currency || 'TRY',
          duration: billingCycleLabel || 'Aylık',
          color: planDetails.color,
          icon: planDetails.icon,
          popular: planDetails.popular || false,
          isDemo: planDetails.isDemo || false
        },
        billing: {
          billingCycle: account.billingCycle || null,
          billingCycleLabel,
          subscriptionStartDate: account.subscriptionStartDate || null,
          subscriptionEndDate: account.subscriptionEndDate || null,
          subscriptionStatus: account.subscriptionStatus || 'ACTIVE',
          remainingDays,
          isExpired: isSubscriptionExpired
        },
        features: planDetails.features || {},
        limits,
        usage,
        demo: demoInfo,
        suggestedUpgrade: nextPlan
          ? {
              key: nextPlan.key,
              name: nextPlan.name,
              displayName: nextPlan.displayName,
              price: parseFloat(nextPlan.price),
              yearlyPrice: nextPlan.yearlyPrice ? parseFloat(nextPlan.yearlyPrice) : null,
              icon: nextPlan.icon,
              color: nextPlan.color
            }
          : null
      }
    });
  } catch (error) {
    next(error);
  }
};

const completeOnboarding = async (req, res, next) => {
  try {
    const { accountId } = req.user;

    if (!accountId) {
      return next(new AppError('Hesap bilgisi bulunamadı', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    const account = await prisma.accounts.findUnique({ where: { id: accountId } });

    if (!account) {
      return next(new AppError('Hesap bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    if (account.isOnboardingCompleted) {
      return res.status(200).json({
        status: 'success',
        message: 'Onboarding zaten tamamlanmış',
        data: { isOnboardingCompleted: true }
      });
    }

    await prisma.accounts.update({
      where: { id: accountId },
      data: { isOnboardingCompleted: true }
    });

    res.status(200).json({
      status: 'success',
      message: 'Onboarding başarıyla tamamlandı',
      data: { isOnboardingCompleted: true }
    });
  } catch (error) {
    next(error);
  }
};

export { getSubscription, completeOnboarding };
