/**
 * Centralized error handler to catch errors and return consistent,
 * safe responses without leaking stack traces or internal secrets.
 */
export function errorHandler(err, req, res, next) {
  // Avoid sending after headers already sent (e.g. during an ongoing SSE stream)
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  console.error('[Application Error]:', {
    path: req.path,
    method: req.method,
    message: err.message,
    code: err.code || 'INTERNAL_ERROR'
  });

  res.status(statusCode).json({
    error: {
      code: err.code || 'SERVER_ERROR',
      message: err.message || 'An unexpected error occurred while processing the request.',
      ...(isProduction ? {} : { details: err.stack?.split('\n').slice(0, 3).join('\n') })
    }
  });
}
