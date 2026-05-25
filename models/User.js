// server/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define the User schema
const userSchema = new mongoose.Schema(
  {
    // User full name
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    // User email — required and must be unique
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },

    // User password — required (stored as a bcrypt hash)
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
    },

    // Optional role/title
    role: {
      type: String,
      trim: true,
      default: '',
    },

    // Optional bio/description
    description: {
      type: String,
      trim: true,
      default: '',
    },

    // User preferences for UI state
    preferences: {
      darkMode: { type: Boolean, default: false },
      sidebarOpen: { type: Boolean, default: true },
      language: { type: String, default: 'en' },
    },
  },
  {
    // Automatically add createdAt and updatedAt fields
    timestamps: true,
  }
);

// ─── Pre-save Hook: Hash password before saving ──────────────────────────────
userSchema.pre('save', async function () {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return;
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// ─── Instance Method: Compare candidate password with stored hash ────────────
userSchema.methods.matchPassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Create and export the User model
const User = mongoose.model('User', userSchema);

module.exports = User;
