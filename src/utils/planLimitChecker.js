import prisma from '../lib/prisma.js';
import AppError from './AppError.js';
import ErrorCodes from './errorCodes.js';

async function getPlanLimitError(accountId, limitKey) {
  const account = await prisma.accounts.findUnique({
    where: { id: accountId },
    select: { subscriptionPlan: true },
  });
  if (!account) return null;

  const plan = await prisma.plans.findFirst({
    where: { key: account.subscriptionPlan, isActive: true },
    select: { limits: true, name: true },
  });
  if (!plan) return null;

  const limits = plan.limits || {};
  const limitValue = limits[limitKey];
  if (limitValue === null || limitValue === undefined) return null;
  const maxAllowed = parseInt(limitValue);
  if (isNaN(maxAllowed)) return null;

  let currentCount = 0;
  if (limitKey === 'maxStaff') {
    currentCount = await prisma.staff.count({ where: { accountId, isActive: true } });
  } else if (limitKey === 'maxClients') {
    currentCount = await prisma.clients.count({ where: { accountId } });
  } else if (limitKey === 'maxServices') {
    currentCount = await prisma.services.count({ where: { accountId, isActive: true } });
  } else if (limitKey === 'maxAppointmentsPerMonth') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    currentCount = await prisma.appointments.count({
      where: { accountId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    });
  }

  if (limitKey === 'maxSmsCredits') {
    // 0 ise SMS tamamen kapalı, negatif veya null ise sınırsız
    if (maxAllowed === 0) {
      return new AppError(
        `${plan.name} planınızda SMS gönderimi aktif değil. Planınızı yükseltin.`,
        403,
        ErrorCodes.PLAN_LIMIT_EXCEEDED
      );
    }
    // Aylık SMS sayısını say (campaign sms log yoksa şimdilik geç)
    return null;
  }

  if (currentCount >= maxAllowed) {
    const labelMap = {
      maxStaff: 'personel',
      maxClients: 'müşteri',
      maxServices: 'hizmet',
      maxAppointmentsPerMonth: 'aylık randevu',
    };
    return new AppError(
      `${plan.name} planınızda maksimum ${maxAllowed} ${labelMap[limitKey] || limitKey} ekleyebilirsiniz. Planınızı yükseltin.`,
      403,
      ErrorCodes.PLAN_LIMIT_EXCEEDED
    );
  }
  return null;
}

export { getPlanLimitError };

/**
 * catchAsync kullanan controller'lar için.
 * Limit aşılmışsa next(error) çağırır ve false döner.
 * Limit aşılmamışsa true döner.
 */
export async function checkPlanLimit(accountId, limitKey, next) {
  const err = await getPlanLimitError(accountId, limitKey);
  if (err) {
    next(err);
    return false;
  }
  return true;
}
