// server/models/Notification.js
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS:
// When User A shares a task with User B, or when a shared task's status
// changes, we need a permanent record of that event. Socket.IO handles the
// *real-time* push, but if User B is offline, they'd never know something
// happened. This model stores every notification so the frontend can fetch
// a history list via GET /api/notifications when the user comes back online.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // The user who RECEIVES this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification must have a recipient'],
      index: true, // Fast lookups: "give me all notifications for this user"
    },

    // The user who TRIGGERED the notification (e.g., the person who shared)
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification must have a sender'],
    },

    // The task this notification is about
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Notification must reference a task'],
    },

    // What kind of event triggered this notification
    // TASK_SHARED     → "Alice shared 'Build API' with you"
    // STATUS_UPDATED  → "Bob changed 'Build API' status to Completed"
    type: {
      type: String,
      required: true,
      enum: {
        values: ['TASK_SHARED', 'STATUS_UPDATED'],
        message: 'Notification type must be TASK_SHARED or STATUS_UPDATED',
      },
    },

    // Human-readable message displayed in the notification bell
    message: {
      type: String,
      required: [true, 'Notification must have a message'],
      trim: true,
    },

    // Has the user seen/acknowledged this notification?
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    // Automatically adds createdAt and updatedAt timestamps
    timestamps: true,
  }
);

// Compound index for the most common query:
// "Get all unread notifications for user X, newest first"
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
