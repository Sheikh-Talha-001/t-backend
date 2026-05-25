// server/routes/feedbackRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Feedback = require('../models/Feedback');

// All feedback routes require authentication
router.use(protect);

// POST /api/feedback — submit new feedback
router.post('/', async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: 'Please provide name, email, and message' });
  }

  try {
    const feedback = await Feedback.create({
      user: req.user._id,
      name,
      email,
      message,
    });

    res.status(201).json(feedback);
  } catch (error) {
    console.error(`[feedback] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error submitting feedback' });
  }
});

module.exports = router;
