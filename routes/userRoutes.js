// server/routes/userRoutes.js
const express = require('express');
const { updatePreferences } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @openapi
 * /api/users/preferences:
 *   patch:
 *     tags:
 *       - Users
 *     summary: Update user UI preferences
 *     description: Allows an authenticated user to update their UI preferences like darkMode, sidebarOpen, and language.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               darkMode:
 *                 type: boolean
 *                 example: true
 *               sidebarOpen:
 *                 type: boolean
 *                 example: false
 *               language:
 *                 type: string
 *                 example: "en"
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 darkMode:
 *                   type: boolean
 *                 sidebarOpen:
 *                   type: boolean
 *                 language:
 *                   type: string
 *       401:
 *         description: Not authorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.patch('/preferences', protect, updatePreferences);

module.exports = router;
