import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';


const handlePrismaError = (err) => {
  if (err.code === 'P2025') {
    return new AppError('İstenen kayıt bulunamadı', 404, ErrorCodes.PRISMA_RECORD_NOT_FOUND);
  }
  
  if (err.code === 'P2002') {
    let fieldName = 'alan';
    let message = 'Bu değer zaten kullanılıyor';
    
    if (err.meta?.target) {
      const targets = Array.isArray(err.meta.target) ? err.meta.target : [err.meta.target];
      const targetString = targets.join('_').toLowerCase();
      
      // Email için kontrol (hem direkt field adı hem constraint ismi)
      if (targetString.includes('email')) {
        fieldName = 'E-posta';
        message = 'Bu e-posta adresi zaten kayıtlı';
      }
      // Phone için kontrol  
      else if (targetString.includes('phone')) {
        fieldName = 'Telefon';
        message = 'Bu telefon numarası zaten kayıtlı';
      }
      // Service name için kontrol
      else if (targetString.includes('servicename')) {
        fieldName = 'Hizmet adı';
        message = 'Bu hizmet adı zaten mevcut';
      }
      // Username için kontrol
      else if (targetString.includes('username')) {
        fieldName = 'Kullanıcı adı';
        message = 'Bu kullanıcı adı zaten alınmış';
      }
      else {
        // Constraint isminden field adını çıkarmaya çalış
        const firstTarget = targets[0] || '';
        if (firstTarget.includes('_Email_')) {
          fieldName = 'E-posta';
          message = 'Bu e-posta adresi zaten kayıtlı';
        } else if (firstTarget.includes('_Phone_')) {
          fieldName = 'Telefon';
          message = 'Bu telefon numarası zaten kayıtlı';
        } else {
          fieldName = firstTarget.replace(/_/g, ' ') || 'alan';
        }
      }
    }
    
    return new AppError(
      message, 
      400, 
      ErrorCodes.PRISMA_UNIQUE_CONSTRAINT, 
      { field: fieldName }
    );
  }

  if (err.code === 'P2003') {
    return new AppError(
      'İşlem, diğer kayıtlarla ilişkili olduğu için gerçekleştirilemedi', 
      400, 
      ErrorCodes.PRISMA_FOREIGN_KEY_CONSTRAINT
    );
  }

  return new AppError(
    'Veritabanı işlemi sırasında bir hata oluştu', 
    500, 
    ErrorCodes.DB_QUERY_ERROR
  );
};

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: {
      code: err.errorCode,
      message: err.message,
      data: err.data
    },
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      error: {
        code: err.errorCode,
        message: err.message,
        data: err.data
      },
      timestamp: new Date().toISOString()
    });
  } 
  else {
    console.error('HATA 💥', err);
    
    res.status(500).json({
      status: 'error',
      error: {
        code: ErrorCodes.GENERAL_SERVER_ERROR,
        message: 'Bir şeyler yanlış gitti'
      },
      timestamp: new Date().toISOString()
    });
  }
};


const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  const isProd = process.env.NODE_ENV === 'production';
  
  let error = { ...err, message: err.message };
  
  if (err.name === 'PrismaClientKnownRequestError' || err.code?.startsWith('P')) {
    error = handlePrismaError(err);
  }
  
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Geçersiz token. Lütfen tekrar giriş yapın.', 401, ErrorCodes.GENERAL_UNAUTHORIZED);
  }
  
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token süresi doldu. Lütfen tekrar giriş yapın.', 401, ErrorCodes.GENERAL_UNAUTHORIZED);
  }
  
  if (err.statusCode === 404 && !err.isOperational) {
    error = new AppError(`${req.originalUrl} yolu bulunamadı`, 404, ErrorCodes.GENERAL_NOT_FOUND);
  }

  isProd ? sendErrorProd(error, res) : sendErrorDev(error, res);
};

export default globalErrorHandler; 