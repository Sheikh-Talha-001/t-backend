// server/routes/taskRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// UPDATED: Added collaboration routes for sharing and viewing shared tasks.
//
// ROUTE ORDER MATTERS:
// Express matches routes top-to-bottom. We must define /shared BEFORE /:id,
// otherwise Express would interpret "shared" as a task ID and try to look up
// a task with _id = "shared" (which would fail with a 400 "Invalid ObjectId").
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');

const {
  createTask,
  getTasks,
  getSharedTasks,
  getTaskById,
  updateTask,
  deleteTask,
  shareTask,
  uploadAttachment,
  deleteAttachment,
} = require('../controllers/taskController');

const { upload } = require('../config/cloudinary');

// ─── Apply auth middleware to ALL task routes ─────────────────────────────────
router.use(protect);

// ─── Routes for /api/tasks ───────────────────────────────────────────────────

router.route('/')
  .get((req, res, next) => {
    console.log(`Route hit: GET /api/tasks`);
    next();
  }, getTasks)        // GET  /api/tasks  → return all tasks (owned + shared)
  .post((req, res, next) => {
    console.log(`Route hit: POST /api/tasks`);
    next();
  }, createTask);     // POST /api/tasks  → create a new task

// ─── NEW: Shared Tasks Route ─────────────────────────────────────────────────
// IMPORTANT: This MUST come BEFORE /:id or Express will treat "shared" as an ID
router.get('/shared', (req, res, next) => {
  console.log(`Route hit: GET /api/tasks/shared`);
  next();
}, getSharedTasks);   // GET /api/tasks/shared → tasks shared with me

// ─── Routes for /api/tasks/:id ───────────────────────────────────────────────

router.route('/:id')
  .get((req, res, next) => {
    console.log(`Route hit: GET /api/tasks/${req.params.id}`);
    next();
  }, getTaskById)     // GET    /api/tasks/:id  → return single task
  .put((req, res, next) => {
    console.log(`Route hit: PUT /api/tasks/${req.params.id}`);
    next();
  }, updateTask)      // PUT    /api/tasks/:id  → update task fields
  .delete((req, res, next) => {
    console.log(`Route hit: DELETE /api/tasks/${req.params.id}`);
    next();
  }, deleteTask);     // DELETE /api/tasks/:id  → remove task

// ─── NEW: Share a Task ───────────────────────────────────────────────────────
router.put('/:id/share', (req, res, next) => {
  console.log(`Route hit: PUT /api/tasks/${req.params.id}/share`);
  next();
}, shareTask);        // PUT /api/tasks/:id/share → share with another user

// ─── NEW: Task Attachments ───────────────────────────────────────────────────
router.post('/:id/attachments', (req, res, next) => {
  console.log(`Route hit: POST /api/tasks/${req.params.id}/attachments`);
  // Check Multer upload errors gracefully
  upload.single('file')(req, res, function (err) {
    if (err) {
      console.error(`Multer upload error: ${err.message}`);
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    next();
  });
}, uploadAttachment);

router.delete('/:id/attachments/:attachmentId', (req, res, next) => {
  console.log(`Route hit: DELETE /api/tasks/${req.params.id}/attachments/${req.params.attachmentId}`);
  next();
}, deleteAttachment);

module.exports = router;
