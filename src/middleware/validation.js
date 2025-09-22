import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';

// 🚀 Generic validation middleware
export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      return next(new AppError(
        'Validation failed',
        400,
        ErrorCodes.GENERAL_VALIDATION_ERROR,
        { errors: validationErrors }
      ));
    }
    
    next();
  };
};

// 🚀 Query parameter validation
export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query, { abortEarly: false });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      return next(new AppError(
        'Query validation failed',
        400,
        ErrorCodes.GENERAL_VALIDATION_ERROR,
        { errors: validationErrors }
      ));
    }
    
    next();
  };
};

// 🚀 File upload validation
export const validateFileUpload = (options = {}) => {
  const { 
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
    required = false 
  } = options;
  
  return (req, res, next) => {
    if (!req.file && required) {
      return next(new AppError(
        'File is required',
        400,
        ErrorCodes.GENERAL_VALIDATION_ERROR,
        { field: 'file' }
      ));
    }
    
    if (req.file) {
      // Size check
      if (req.file.size > maxSize) {
        return next(new AppError(
          `File size too large. Maximum ${maxSize / (1024 * 1024)}MB allowed`,
          400,
          ErrorCodes.GENERAL_VALIDATION_ERROR,
          { field: 'file', maxSize: maxSize }
        ));
      }
      
      // Type check
      if (!allowedTypes.includes(req.file.mimetype)) {
        return next(new AppError(
          'Invalid file type',
          400,
          ErrorCodes.GENERAL_VALIDATION_ERROR,
          { field: 'file', allowedTypes }
        ));
      }
    }
    
    next();
  };
};
