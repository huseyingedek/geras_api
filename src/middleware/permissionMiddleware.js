import prisma from '../lib/prisma.js';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';

/**
 * Belirli bir kaynak için belirli bir izni kontrol eder
 * @param {string} resource - Kaynak adı (ör: 'services')
 * @param {string} action - İşlem (view, create, update, delete)
 */
const checkPermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      if (req.user.role === 'ADMIN') {
        return next();
      }

      if (req.user.role === 'OWNER') {
        return next();
      }

      if (req.user.role === 'EMPLOYEE') {
        const staff = await prisma.staff.findFirst({
          where: {
            userId: req.user.id
          }
        });

        if (!staff) {
          return next(new AppError('Personel kaydı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
        }

        const permissionName = `${resource}_${action}`;
        
        const permission = await prisma.permission.findFirst({
          where: {
            accountId: req.user.accountId,
            name: permissionName,
            resource
          }
        });

        if (!permission) {
          return next(new AppError('İzin tanımı bulunamadı', 404, ErrorCodes.GENERAL_NOT_FOUND));
        }

        const staffPermission = await prisma.staffPermission.findFirst({
          where: {
            staffId: staff.id,
            permissionId: permission.id
          }
        });

        if (!staffPermission) {
          return next(new AppError('Bu işlem için yetkiniz bulunmamaktadır', 403, ErrorCodes.GENERAL_FORBIDDEN));
        }

        let hasPermission = false;

        switch (action) {
          case 'view':
            hasPermission = staffPermission.canView;
            break;
          case 'create':
            hasPermission = staffPermission.canCreate;
            break;
          case 'update':
            hasPermission = staffPermission.canEdit;
            break;
          case 'delete':
            hasPermission = staffPermission.canDelete;
            break;
          default:
            hasPermission = false;
        }

        if (!hasPermission) {
          return next(new AppError('Bu işlem için yetkiniz bulunmamaktadır', 403, ErrorCodes.GENERAL_FORBIDDEN));
        }
      }

      next();
    } catch (error) {
      console.error('İzin kontrolü hatası:', error);
      next(new AppError('İzin kontrolü sırasında bir hata oluştu', 500, ErrorCodes.GENERAL_SERVER_ERROR));
    }
  };
};

export { checkPermission }; 