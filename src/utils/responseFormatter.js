// 🚀 Standard API response formatter

export const successResponse = (data = null, message = 'Success', meta = null) => {
  const response = {
    status: 'success',
    message,
    timestamp: new Date().toISOString()
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  if (meta) {
    response.meta = meta;
  }
  
  return response;
};

export const errorResponse = (error, statusCode = 500) => {
  const response = {
    status: 'error',
    error: {
      code: error.errorCode || `ERR_${statusCode}`,
      message: error.message || 'Internal server error'
    },
    timestamp: new Date().toISOString()
  };
  
  // Development ortamında stack trace ekle
  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.error.stack = error.stack;
  }
  
  // Ek data varsa ekle
  if (error.data) {
    response.error.data = error.data;
  }
  
  return response;
};

export const paginatedResponse = (data, page, limit, total, message = 'Success') => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return successResponse(data, message, {
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? page + 1 : null,
      prevPage: hasPrevPage ? page - 1 : null
    }
  });
};

// 🚀 Express response helpers
export const sendSuccess = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  return res.status(statusCode).json(successResponse(data, message, meta));
};

export const sendError = (res, error, statusCode = 500) => {
  return res.status(statusCode).json(errorResponse(error, statusCode));
};

export const sendPaginated = (res, data, page, limit, total, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json(paginatedResponse(data, page, limit, total, message));
};

// 🚀 Created response (201)
export const sendCreated = (res, data, message = 'Created successfully') => {
  return sendSuccess(res, data, message, 201);
};

// 🚀 No content response (204)
export const sendNoContent = (res) => {
  return res.status(204).send();
};
