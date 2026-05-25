// server/controllers/notificationController.js
// ─────────────────────────────────────────────────────────────────────────────
// Handles the REST API side of notifications.
// Socket.IO handles the real-time PUSH; these endpoints handle the PULL:
//   • "Show me all my past notifications"   → GET  /api/notifications
//   • "I've read this notification"          → PUT  /api/notifications/:id/read
//   • "Mark all my notifications as read"    → PUT  /api/notifications/read-all
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// Helper: validate MongoDB ObjectId early to return clean 400 errors
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Get all notifications for the authenticated user
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    // Fetch this user's notifications, newest first
    // Populate sender name and task title so the frontend can display
    // "Alice shared 'Build API' with you" without extra API calls
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'name email')     // Only grab name & email, not password
      .populate('task', 'title status')      // Only grab title & status
      .sort({ createdAt: -1 })              // Newest first
      .limit(50)                            // Don't return thousands of old ones
      .lean();                              // Return plain JS objects (faster)

    res.status(200).json(notifications);
  } catch (error) {
    console.error(`[getNotifications] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error while fetching notifications' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MARK ONE AS READ
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Mark a single notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  // 1. Validate the notification ID format
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: `Invalid notification ID: '${req.params.id}'` });
  }

  try {
    // 2. Find the notification
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: `Notification with ID '${req.params.id}' not found` });
    }

    // 3. Security: Only the intended recipient can mark it as read
    if (notification.recipient.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized — this notification belongs to another user' });
    }

    // 4. Mark as read and save
    notification.isRead = true;
    await notification.save();

    res.status(200).json(notification);
  } catch (error) {
    console.error(`[markAsRead] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error while marking notification as read' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MARK ALL AS READ
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Mark all notifications as read for the authenticated user
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      message: `Marked ${result.modifiedCount} notification(s) as read`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error(`[markAllAsRead] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error while marking all notifications as read' });
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead };
