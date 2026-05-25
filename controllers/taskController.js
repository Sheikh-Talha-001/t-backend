// server/controllers/taskController.js
// ─────────────────────────────────────────────────────────────────────────────
// UPDATED: Now includes collaboration features (sharing) and real-time
// notifications via Socket.IO. The core CRUD operations remain, but with
// enhanced authorization logic:
//
//   OWNER  → can do everything (create, read, update ALL fields, delete, share)
//   COLLABORATOR (in sharedWith) → can view and update STATUS only
//
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getIO, getSocketId } = require('../config/socket');
const { cloudinary } = require('../config/cloudinary');

// Helper: validate MongoDB ObjectId early to return clean 400 errors
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Check if a user is the owner OR a collaborator
// ─────────────────────────────────────────────────────────────────────────────
const isOwner = (task, userId) =>
  task.user.toString() === userId.toString();

const isCollaborator = (task, userId) =>
  task.sharedWith.some((id) => id.toString() === userId.toString());

const hasAccess = (task, userId) =>
  isOwner(task, userId) || isCollaborator(task, userId);

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/tasks:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Create a new task
 *     description: Creates a new task document in MongoDB with the provided fields.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskInput'
 *           example:
 *             title: "Build REST API"
 *             description: "Set up Express routes and MongoDB models"
 *             status: "In Progress"
 *             dueDate: "2025-12-31T23:59:59.000Z"
 *     responses:
 *       201:
 *         description: Task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
const createTask = async (req, res) => {
  try {
    console.log('Inside createTask controller');
    // Attach the authenticated user's ID to the task before saving
    const task = await Task.create({
      ...req.body,
      user: req.user._id,
    });
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// READ ALL (OWNED + SHARED)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/tasks:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get all tasks (owned and shared)
 *     description: >
 *       Returns tasks where the authenticated user is the owner OR
 *       listed in the sharedWith array. Supports search filtering.
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter tasks by title or description (case-insensitive)
 *     responses:
 *       200:
 *         description: A list of tasks
 *       500:
 *         description: Server error
 */
// @desc    Get all tasks the user owns OR has been shared with
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res) => {
  try {
    const { search } = req.query;
    const userId = req.user._id;

    // ─── UPDATED QUERY ──────────────────────────────────────────────────
    // Previously: { user: userId }           → only owner's tasks
    // Now:        { $or: [owner, shared] }    → owner's tasks + shared tasks
    // This is the key change that makes collaboration visible in the main
    // task list — you see YOUR tasks and tasks others shared WITH you.
    const query = {
      $or: [
        { user: userId },           // Tasks I created (I am the owner)
        { sharedWith: userId },     // Tasks shared with me (I am a collaborator)
      ],
    };

    // Apply search filter on top if provided
    if (search) {
      query.$and = [
        {
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
          ],
        },
      ];
    }

    // Execute query with .lean() for faster, read-only JSON responses
    const tasks = await Task.find(query)
      .populate('user', 'name email')           // Show owner's name
      .populate('sharedWith', 'name email')     // Show collaborators' names
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// READ SHARED ONLY
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Get only tasks that have been shared WITH the authenticated user
// @route   GET /api/tasks/shared
// @access  Private
const getSharedTasks = async (req, res) => {
  try {
    // Only find tasks where THIS user appears in the sharedWith array
    // (not tasks they own — those come from the main getTasks endpoint)
    const tasks = await Task.find({ sharedWith: req.user._id })
      .populate('user', 'name email')           // Show who owns each task
      .populate('sharedWith', 'name email')     // Show all collaborators
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(tasks);
  } catch (error) {
    console.error(`[getSharedTasks] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error while fetching shared tasks' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// READ ONE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/tasks/{id}:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get a single task by ID
 *     description: Finds and returns a single task using its MongoDB ObjectId.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The MongoDB ObjectId of the task
 *         example: 6629f3a2b4e2c10012345abc
 *     responses:
 *       200:
 *         description: Task found successfully
 *       400:
 *         description: Invalid task ID format
 *       404:
 *         description: Task not found
 *       500:
 *         description: Server error
 */
// @desc    Get a single task by ID
// @route   GET /api/tasks/:id
const getTaskById = async (req, res) => {
  // Validate ObjectId format before hitting the database
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: `Invalid task ID: '${req.params.id}'` });
  }

  try {
    const task = await Task.findById(req.params.id)
      .populate('user', 'name email')
      .populate('sharedWith', 'name email');

    if (!task) {
      return res.status(404).json({ message: `Task with ID '${req.params.id}' not found` });
    }

    // UPDATED: Allow access if user is owner OR collaborator
    if (!hasAccess(task, req.user._id)) {
      return res.status(401).json({ message: 'Not authorized to access this task' });
    }

    res.status(200).json(task);
  } catch (error) {
    console.error(`[getTaskById] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error while fetching task' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/tasks/{id}:
 *   put:
 *     tags:
 *       - Tasks
 *     summary: Update a task by ID
 *     description: >
 *       Owner can update all fields. Collaborators can only update status.
 *       When a shared task's status changes, real-time notifications are
 *       sent to the owner and all other collaborators.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskInput'
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       400:
 *         description: Invalid ID, empty body, or validation failure
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Task not found
 *       500:
 *         description: Server error
 */
// @desc    Update a task by ID
// @route   PUT /api/tasks/:id
const updateTask = async (req, res) => {
  // Validate ObjectId format before hitting the database
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: `Invalid task ID: '${req.params.id}'` });
  }

  // Reject empty update payloads
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Update body cannot be empty' });
  }

  try {
    const existingTask = await Task.findById(req.params.id);

    if (!existingTask) {
      return res.status(404).json({ message: `Task with ID '${req.params.id}' not found` });
    }

    const userId = req.user._id.toString();
    const taskOwnerId = existingTask.user.toString();
    const userIsOwner = taskOwnerId === userId;
    const userIsCollaborator = isCollaborator(existingTask, userId);

    // ─── Authorization Logic ──────────────────────────────────────────
    if (!userIsOwner && !userIsCollaborator) {
      return res.status(401).json({ message: 'Not authorized to update this task' });
    }

    // Collaborators can ONLY update the status field — nothing else.
    // Since the client sends the entire task object in the PUT payload,
    // we safely filter out all fields except 'status' to allow the request to succeed.
    if (userIsCollaborator && !userIsOwner) {
      req.body = { status: req.body.status };
    }

    // Track if status changed (for real-time notification)
    const oldStatus = existingTask.status;
    const newStatus = req.body.status;
    const statusChanged = newStatus && newStatus !== oldStatus;

    // Perform the update
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    ).populate('user', 'name email')
     .populate('sharedWith', 'name email');

    // ─── Real-Time Notification: Status Changed on a Shared Task ──────
    // When someone updates a shared task's status, every OTHER person
    // who has access (owner + all collaborators) should know about it.
    if (statusChanged && existingTask.sharedWith.length > 0) {
      const io = getIO();
      const senderName = req.user.name || 'A collaborator';
      const message = `${senderName} changed "${existingTask.title}" status from ${oldStatus} to ${newStatus}`;

      // Build the list of people to notify: owner + all collaborators, MINUS the updater
      const recipientIds = [
        existingTask.user.toString(),
        ...existingTask.sharedWith.map((id) => id.toString()),
      ].filter((id) => id !== userId); // Don't notify yourself

      // Create a notification record & emit for each recipient
      for (const recipientId of recipientIds) {
        try {
          const notification = await Notification.create({
            recipient: recipientId,
            sender: req.user._id,
            task: existingTask._id,
            type: 'STATUS_UPDATED',
            message,
          });

          // Populate for the real-time payload
          await notification.populate('sender', 'name email');
          await notification.populate('task', 'title status');

          // If the recipient is online, push it to them instantly
          const socketId = getSocketId(recipientId);
          if (socketId) {
            io.to(socketId).emit('notification', notification);
          }
        } catch (notifError) {
          // Don't fail the task update just because a notification failed
          console.error(`[updateTask] Notification error for ${recipientId}: ${notifError.message}`);
        }
      }
    }

    res.status(200).json(task);
  } catch (error) {
    console.error(`[updateTask] Error: ${error.message}`);
    // Mongoose validation errors (e.g. invalid enum value) → 400
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error while updating task' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/tasks/{id}:
 *   delete:
 *     tags:
 *       - Tasks
 *     summary: Delete a task by ID
 *     description: >
 *       Only the OWNER can delete a task. Collaborators receive a 403
 *       Forbidden response if they attempt to delete.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task deleted successfully
 *       400:
 *         description: Invalid task ID format
 *       403:
 *         description: Collaborators cannot delete tasks
 *       404:
 *         description: Task not found
 *       500:
 *         description: Server error
 */
// @desc    Delete a task by ID
// @route   DELETE /api/tasks/:id
const deleteTask = async (req, res) => {
  // Validate ObjectId format before hitting the database
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: `Invalid task ID: '${req.params.id}'` });
  }

  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: `Task with ID '${req.params.id}' not found` });
    }

    // SECURITY: Only the OWNER can delete a task
    if (!isOwner(task, req.user._id)) {
      // Distinguish between "collaborator trying to delete" vs "random stranger"
      if (isCollaborator(task, req.user._id)) {
        return res.status(403).json({
          message: 'Collaborators cannot delete shared tasks — only the owner can',
        });
      }
      return res.status(401).json({ message: 'Not authorized to delete this task' });
    }

    await Task.findByIdAndDelete(req.params.id);

    // Clean up related notifications when a task is deleted
    await Notification.deleteMany({ task: req.params.id });

    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error(`[deleteTask] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error while deleting task' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARE TASK
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Share a task with another user by their email
// @route   PUT /api/tasks/:id/share
// @access  Private (Owner only)
const shareTask = async (req, res) => {
  // 1. Validate task ID format
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: `Invalid task ID: '${req.params.id}'` });
  }

  // 2. Validate that an email was provided in the request body
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Please provide the email of the user to share with' });
  }

  try {
    // 3. Find the task
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: `Task with ID '${req.params.id}' not found` });
    }

    // 4. SECURITY: Only the OWNER can share a task
    if (!isOwner(task, req.user._id)) {
      if (isCollaborator(task, req.user._id)) {
        return res.status(403).json({
          message: 'Collaborators cannot share tasks — only the owner can',
        });
      }
      return res.status(401).json({ message: 'Not authorized to share this task' });
    }

    // 5. Find the target user by email
    const targetUser = await User.findOne({ email: email.toLowerCase() }).select('-password');

    if (!targetUser) {
      return res.status(404).json({ message: `No user found with email '${email}'` });
    }

    // 6. Prevent sharing with yourself
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot share a task with yourself' });
    }

    // 7. Prevent duplicate sharing
    if (isCollaborator(task, targetUser._id)) {
      return res.status(400).json({
        message: `This task is already shared with ${targetUser.name} (${targetUser.email})`,
      });
    }

    // 8. Add the target user to the sharedWith array
    task.sharedWith.push(targetUser._id);
    await task.save();

    // 9. Create a notification record in the database
    const senderName = req.user.name || 'Someone';
    const notification = await Notification.create({
      recipient: targetUser._id,
      sender: req.user._id,
      task: task._id,
      type: 'TASK_SHARED',
      message: `${senderName} shared the task "${task.title}" with you`,
    });

    // Populate for the real-time payload
    await notification.populate('sender', 'name email');
    await notification.populate('task', 'title status');

    // 10. Real-Time Push: If the target user is online, send it instantly
    const io = getIO();
    const targetSocketId = getSocketId(targetUser._id.toString());
    if (targetSocketId) {
      io.to(targetSocketId).emit('notification', notification);
      console.log(`📨 Real-time notification sent to ${targetUser.name}`);
    } else {
      console.log(`📬 ${targetUser.name} is offline — notification saved to DB for later`);
    }

    // 11. Return the updated task with populated fields
    const updatedTask = await Task.findById(task._id)
      .populate('user', 'name email')
      .populate('sharedWith', 'name email');

    res.status(200).json({
      message: `Task "${task.title}" shared with ${targetUser.name}`,
      task: updatedTask,
    });
  } catch (error) {
    console.error(`[shareTask] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error while sharing task' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD ATTACHMENT
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Upload an attachment to a task
// @route   POST /api/tasks/:id/attachments
// @access  Private
const uploadAttachment = async (req, res) => {
  // Validate ObjectId
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: `Invalid task ID: '${req.params.id}'` });
  }

  // Check if file was uploaded
  if (!req.file) {
    return res.status(400).json({ message: 'No file provided' });
  }

  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: `Task with ID '${req.params.id}' not found` });
    }

    // Verify task access: Only owner or collaborator can upload
    if (!hasAccess(task, req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to upload attachments for this task' });
    }

    // Prepare attachment object from Cloudinary/Multer data
    const attachment = {
      url: req.file.path, // Secure URL from Cloudinary
      publicId: req.file.filename, // Unique Cloudinary ID
      filename: req.file.originalname, // Original filename from user
    };

    task.attachments.push(attachment);
    await task.save();

    // Populate user and sharedWith before returning to keep client's state complete
    const updatedTask = await Task.findById(task._id)
      .populate('user', 'name email')
      .populate('sharedWith', 'name email');

    res.status(200).json(updatedTask);
  } catch (error) {
    console.error(`[uploadAttachment] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error while uploading attachment' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE ATTACHMENT
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Delete an attachment from a task
// @route   DELETE /api/tasks/:id/attachments/:attachmentId
// @access  Private
const deleteAttachment = async (req, res) => {
  const { id, attachmentId } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: `Invalid task ID: '${id}'` });
  }

  if (!isValidObjectId(attachmentId)) {
    return res.status(400).json({ message: `Invalid attachment ID: '${attachmentId}'` });
  }

  try {
    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: `Task with ID '${id}' not found` });
    }

    // Verify task access: Only owner or collaborator can delete
    // (A more restrictive rule might be owner only, or uploader only, but we'll use task access)
    if (!hasAccess(task, req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to delete attachments for this task' });
    }

    // Find the attachment in the array
    const attachment = task.attachments.id(attachmentId);
    
    if (!attachment) {
      return res.status(404).json({ message: `Attachment not found` });
    }

    // Delete the file from Cloudinary using publicId
    await cloudinary.uploader.destroy(attachment.publicId);

    // Pull the attachment from the mongoose array
    task.attachments.pull(attachmentId);
    await task.save();

    // Populate user and sharedWith before returning to keep client's state complete
    const updatedTask = await Task.findById(task._id)
      .populate('user', 'name email')
      .populate('sharedWith', 'name email');

    res.status(200).json(updatedTask);
  } catch (error) {
    console.error(`[deleteAttachment] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error while deleting attachment' });
  }
};

module.exports = {
  createTask,
  getTasks,
  getSharedTasks,
  getTaskById,
  updateTask,
  deleteTask,
  shareTask,
  uploadAttachment,
  deleteAttachment,
};
