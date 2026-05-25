// server/middleware/errorLogger.js
const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logDirectory = path.join(__dirname, '../logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

const logFilePath = path.join(logDirectory, 'error.log');

const errorLogger = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Only log unhandled 500 server errors to error.log
  if (statusCode >= 500) {
    const errorDetails = {
      timestamp,
      route: req.originalUrl,
      method: req.method,
      body: req.body,
      message: err.message,
      stack: err.stack,
    };
    
    // Log to file safely
    const logMessage = JSON.stringify(errorDetails) + '\n';
    fs.appendFile(logFilePath, logMessage, (fsErr) => {
      if (fsErr) {
        console.error('Failed to write to error.log', fsErr);
      }
    });
    
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
