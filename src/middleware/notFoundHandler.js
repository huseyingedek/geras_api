import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';

const notFoundHandler = (req, res, next) => {
  next(new AppError(`${req.originalUrl} yolu bulunamadı`, 404, ErrorCodes.GENERAL_NOT_FOUND));
};

export default notFoundHandler; 