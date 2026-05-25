// server/models/Task.js
// ─────────────────────────────────────────────────────────────────────────────
// WHAT CHANGED (Collaboration Update):
// 1. Added `sharedWith` — an array of User ObjectIds. When the owner shares
//    a task, the collaborator's ID is pushed into this array. The collaborator
//    can then view and update the task's status, but CANNOT delete or re-share.
// 2. Added an index on `sharedWith` so the query "find all tasks shared with
//    me" is fast, even when the database has thousands of tasks.
// 3. The existing `user` field now acts as the OWNER. Only the owner can
//    delete, share, or fully edit the task.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

// Define the Task schema
const taskSchema = new mongoose.Schema(
  {
    // The user who OWNS this task (creator). Only the owner can delete or share.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ─── NEW: Collaboration ────────────────────────────────────────────────
    // Users this task has been shared with. They can VIEW and UPDATE STATUS,
    // but they CANNOT delete or share it further.
    sharedWith: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Task title - required, trimmed of whitespace
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },

    // Optional description - trimmed of whitespace
    description: {
      type: String,
      trim: true,
    },

    // Status of the task - restricted to specific values
    status: {
      type: String,
      required: [true, 'Task status is required'],
      enum: ['Pending', 'In Progress', 'Completed'],
      message: 'Status must be Pending, In Progress, or Completed',

      default: 'Pending',
    },

    // Priority level of the task
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },

    // Optional due date for the task
    dueDate: {
      type: Date,
    },

    // ─── NEW: Attachments ───────────────────────────────────────────────────
    // Files uploaded via Cloudinary
    attachments: [
      {
        url: {
          type: String,
          required: [true, 'Attachment must have a URL'],
        },
        publicId: {
          type: String,
          required: [true, 'Attachment must have a Cloudinary publicId'],
        },
        filename: {
          type: String,
          required: [true, 'Attachment must have a filename'],
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    // Automatically add createdAt and updatedAt fields
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Original: Optimize "get my tasks filtered by status"
taskSchema.index({ user: 1, status: 1 });

// Analytics: Optimize owner-only due-date reporting for overdue trend buckets.
taskSchema.index({ user: 1, dueDate: 1 });

// Analytics: Optimize owner-only completed-task trend buckets by update time.
taskSchema.index({ user: 1, status: 1, updatedAt: 1 });

// NEW: Optimize "get all tasks shared with me"
// When User B calls GET /api/tasks/shared, Mongo uses this index
// instead of scanning every task document in the collection.
taskSchema.index({ sharedWith: 1 });

// Create and export the Task model
const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
