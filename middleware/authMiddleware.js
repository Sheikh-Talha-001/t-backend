// server/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect middleware — verifies JWT from the Authorization header.
 *
 * Expected header format:  Authorization: Bearer <token>
 *
 * On success: attaches the authenticated user (minus password) to req.user
 *             and calls next().
 * On failure: returns 401 Unauthorized with a descriptive message.
 */
const protect = async (req, res, next) => {
  let token;

  // 1. Extract the token from the Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. No token present → reject immediately
  if (!token) {
    return res
      .status(401)
      .json({ message: 'Not authorized — no token provided' });
  }

  try {
    // 3. Verify the token and decode its payload
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Look up the user (exclude the password hash from the result)
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res
        .status(401)
        .json({ message: 'Not authorized — user no longer exists' });
    }

    // 5. Attach the user to the request so downstream handlers can use it
    req.user = user;
    next();
  } catch (error) {
    // Handle specific JWT error types for clearer feedback
    if (error.name === 'TokenExpiredError') {
      return res
        .status(401)
        .json({ message: 'Not authorized — token has expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res
        .status(401)
        .json({ message: 'Not authorized — token is invalid' });
    }

    console.error(`[protect] Error: ${error.message}`);
    return res.status(401).json({ message: 'Not authorized' });
  }
};

module.exports = { protect };
