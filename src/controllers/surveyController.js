import prisma from '../lib/prisma.js';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';

/**
 * GET /api/survey/:token  (public — auth yok)
 * Anket formunu doldurmak için gerekli bilgileri döner.
 */
export const getSurvey = async (req, res, next) => {
  try {
    const { token } = req.params;

    const review = await prisma.appointmentReview.findUnique({
      where: { token },
      include: {
        appointment: {
          select: {
            customerName: true,
            appointmentDate: true,
            service: { select: { serviceName: true } }
          }
        },
        account: {
          select: { businessName: true }
        }
      }
    });

    if (!review) {
      return next(new AppError('Anket bulunamadı veya süresi dolmuş', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    if (review.submittedAt) {
      return res.status(200).json({
        success: true,
        data: {
          alreadySubmitted: true,
          businessName: review.account.businessName
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        alreadySubmitted: false,
        businessName: review.account.businessName,
        customerName: review.appointment.customerName,
        serviceName: review.appointment.service?.serviceName || null,
        appointmentDate: review.appointment.appointmentDate
      }
    });
  } catch (error) {
    console.error('getSurvey hatası:', error);
    next(new AppError('Anket yüklenirken hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
};

/**
 * POST /api/survey/:token  (public — auth yok)
 * Müşterinin değerlendirmesini kaydeder.
 * Body: { rating: 1-5, comment?: string }
 */
export const submitSurvey = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return next(new AppError('Geçerli bir puan giriniz (1-5)', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    const review = await prisma.appointmentReview.findUnique({ where: { token } });

    if (!review) {
      return next(new AppError('Anket bulunamadı veya süresi dolmuş', 404, ErrorCodes.GENERAL_NOT_FOUND));
    }

    if (review.submittedAt) {
      return res.status(409).json({
        success: false,
        message: 'Bu anket daha önce doldurulmuş'
      });
    }

    await prisma.appointmentReview.update({
      where: { token },
      data: {
        rating: parseInt(rating),
        comment: comment?.trim() || null,
        submittedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Değerlendirmeniz için teşekkür ederiz!'
    });
  } catch (error) {
    console.error('submitSurvey hatası:', error);
    next(new AppError('Değerlendirme kaydedilirken hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
};

/**
 * GET /api/reviews  (authenticated)
 * Salona ait tüm değerlendirmeleri döner.
 * Query: ?page=1&limit=20&rating=5
 */
export const getReviews = async (req, res, next) => {
  try {
    const { accountId } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const ratingFilter = req.query.rating ? parseInt(req.query.rating) : undefined;
    const skip = (page - 1) * limit;

    const where = {
      accountId,
      submittedAt: { not: null }, // Sadece doldurulmuş olanlar
      ...(ratingFilter && { rating: ratingFilter })
    };

    const [reviews, total] = await Promise.all([
      prisma.appointmentReview.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
        include: {
          appointment: {
            select: {
              customerName: true,
              appointmentDate: true,
              service: { select: { serviceName: true } },
              staff: { select: { fullName: true } }
            }
          }
        }
      }),
      prisma.appointmentReview.count({ where })
    ]);

    // İstatistikler
    const stats = await prisma.appointmentReview.aggregate({
      where: { accountId, submittedAt: { not: null } },
      _avg: { rating: true },
      _count: { rating: true }
    });

    // Puan dağılımı
    const distribution = await prisma.appointmentReview.groupBy({
      by: ['rating'],
      where: { accountId, submittedAt: { not: null } },
      _count: { rating: true },
      orderBy: { rating: 'desc' }
    });

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        stats: {
          averageRating: stats._avg.rating ? parseFloat(stats._avg.rating.toFixed(1)) : null,
          totalReviews: stats._count.rating,
          distribution: distribution.reduce((acc, d) => {
            acc[d.rating] = d._count.rating;
            return acc;
          }, {})
        }
      }
    });
  } catch (error) {
    console.error('getReviews hatası:', error);
    next(new AppError('Değerlendirmeler yüklenirken hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
};
