// server/middleware/errorLogger.js

const errorLogger = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  // Only log unhandled 500 server errors
  if (statusCode >= 500) {
    const errorDetails = {
      timestamp,
      route: req.originalUrl,
      method: req.method,
      body: req.body,
      message: err.message,
      stack: err.stack,
    };

    // Log to console — captured by Railway's logging system
    console.error('[ErrorLogger]', JSON.stringify(errorDetails));

    // Send clean, standardized JSON payload back to the client
    res.status(statusCode).json({
      success: false,
      message: "An internal server error occurred.",
    });
  } else {
    // For 4xx errors, send normal JSON response
    res.status(statusCode).json({
      success: false,
      message: err.message || "Request failed.",
    });
  }
};

module.exports = { errorLogger };
