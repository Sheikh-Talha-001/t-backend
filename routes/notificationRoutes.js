// server/routes/notificationRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// REST endpoints for notification history.
// Socket.IO handles the real-time PUSH; these routes handle the PULL.
//
// All routes are protected — you must be logged in to see your notifications.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
} = require('../controllers/notificationController');

// ─── Apply auth middleware to ALL notification routes ─────────────────────────
router.use(protect);

// GET  /api/notifications          → fetch notification history
router.get('/', getNotifications);

// PUT  /api/notifications/read-all → mark ALL as read (must be before /:id)
router.put('/read-all', markAllAsRead);

// PUT  /api/notifications/:id/read → mark ONE as read
router.put('/:id/read', markAsRead);

module.exports = router;
