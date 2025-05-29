
class AppError extends Error {
  constructor(message, statusCode, errorCode = null, data = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errorCode = errorCode || `ERR_${statusCode}`;
    this.data = data;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError; 