// server/routes/analyticsRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Protected analytics routes for Donezu's reporting dashboard.
// Every route requires a valid JWT and only reports on tasks owned by the user.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const {
  getOverview,
  getTrends,
} = require('../controllers/analyticsController');

router.use(protect);

router.get('/overview', (req, res, next) => {
  console.log(`Route hit: GET /api/analytics/overview`);
  next();
}, getOverview);

router.get('/trends', (req, res, next) => {
  console.log(`Route hit: GET /api/analytics/trends`);
  next();
}, getTrends);

module.exports = router;
