import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';
import prisma from '../lib/prisma.js';
import {
  SUBSCRIPTION_PLANS,
  PLAN_COLORS,
  PLAN_ICONS,
  suggestUpgrade
} from '../../subscriptionPlans.js';

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
    const planDetails = SUBSCRIPTION_PLANS[planKey] || SUBSCRIPTION_PLANS['PROFESSIONAL'];

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
        limit: planDetails.limits.maxStaff,
        isUnlimited: planDetails.limits.maxStaff === null
      },
      clients: {
        current: clientCount,
        limit: planDetails.limits.maxClients,
        isUnlimited: planDetails.limits.maxClients === null
      },
      services: {
        current: serviceCount,
        limit: planDetails.limits.maxServices,
        isUnlimited: planDetails.limits.maxServices === null
      },
      appointmentsThisMonth: {
        current: appointmentCount,
        limit: planDetails.limits.maxAppointmentsPerMonth,
        isUnlimited: planDetails.limits.maxAppointmentsPerMonth === null
      }
    };

    // Demo hesap bilgisi
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
        remainingHours,
        isExpired: expiresAt ? now > expiresAt : false
      };
    }

    const suggestedUpgrade = suggestUpgrade(planKey);

    // Kalan gün hesapla
    let remainingDays = null;
    let isSubscriptionExpired = false;
    if (account.subscriptionEndDate) {
      const diff = new Date(account.subscriptionEndDate) - new Date();
      remainingDays = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
      isSubscriptionExpired = diff < 0;
    }

    res.status(200).json({
      status: 'success',
      data: {
        currentPlan: {
          key: planKey,
          name: planDetails.name,
          displayName: planDetails.displayName,
          price: planDetails.price,
          currency: planDetails.currency || 'TRY',
          duration: account.billingCycle === 'YEARLY' ? 'Yıllık' : account.billingCycle === 'MONTHLY' ? 'Aylık' : planDetails.duration,
          color: PLAN_COLORS[planKey],
          icon: PLAN_ICONS[planKey],
          popular: planDetails.popular || false
        },
        billing: {
          billingCycle: account.billingCycle || null,
          billingCycleLabel: account.billingCycle === 'YEARLY' ? 'Yıllık' : account.billingCycle === 'MONTHLY' ? 'Aylık' : null,
          subscriptionStartDate: account.subscriptionStartDate || null,
          subscriptionEndDate: account.subscriptionEndDate || null,
          subscriptionStatus: account.subscriptionStatus || 'ACTIVE',
          remainingDays,
          isExpired: isSubscriptionExpired
        },
        features: planDetails.features,
        limits: planDetails.limits,
        usage,
        demo: demoInfo,
        suggestedUpgrade: suggestedUpgrade
          ? {
              key: suggestedUpgrade,
              name: SUBSCRIPTION_PLANS[suggestedUpgrade].name,
              displayName: SUBSCRIPTION_PLANS[suggestedUpgrade].displayName,
              price: SUBSCRIPTION_PLANS[suggestedUpgrade].price,
              icon: PLAN_ICONS[suggestedUpgrade]
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

    const account = await prisma.accounts.findUnique({
      where: { id: accountId }
    });

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
