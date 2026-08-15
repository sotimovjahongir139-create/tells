function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Manzil topilmadi.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.statusCode || 500;
  const message = status === 500 ? 'Serverda xatolik yuz berdi.' : err.message;
  res.status(status).json({ error: message });
}

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = { notFoundHandler, errorHandler, ApiError };
