// server/controllers/userController.js
const User = require('../models/User');

// @desc    Update user preferences
// @route   PATCH /api/users/preferences
// @access  Private
const updatePreferences = async (req, res, next) => {
  try {
    const { darkMode, sidebarOpen, language } = req.body;
    
    // Find the user by ID
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update preferences
    if (darkMode !== undefined) user.preferences.darkMode = darkMode;
    if (sidebarOpen !== undefined) user.preferences.sidebarOpen = sidebarOpen;
    if (language !== undefined) user.preferences.language = language;
    
    // Save user
    const updatedUser = await user.save();
    
    res.json(updatedUser.preferences);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updatePreferences,
};
