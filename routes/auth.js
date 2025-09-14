// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { authenticate, isAdmin } = require("../middleware/auth");
const {
  validateRegister,
  validateLogin,
  validatePasswordChange,
} = require("../middleware/validation");

const router = express.Router();

// Generate JWT Token
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }

  return jwt.sign({ id: userId }, secret, { expiresIn: "7d" });
};

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public (but in real app, might be admin only)
router.post("/register", validateRegister, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      employeeId,
      department,
      position,
      role = "staff",
      phone,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { employeeId }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          existingUser.email === email
            ? "User with this email already exists"
            : "Employee ID already exists",
      });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      email,
      password,
      employeeId,
      department,
      position,
      role,
      phone,
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          employeeId: user.employeeId,
          department: user.department,
          position: user.position,
          role: user.role,
          phone: user.phone,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${
          field === "email" ? "Email" : "Employee ID"
        } already exists`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating user account",
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        message: "Account has been deactivated. Please contact administrator.",
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          employeeId: user.employeeId,
          department: user.department,
          position: user.position,
          role: user.role,
          phone: user.phone,
          lastLogin: user.lastLogin,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Error during login",
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get("/me", authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user profile",
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post(
  "/change-password",
  authenticate,
  validatePasswordChange,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // Get user with password
      const user = await User.findById(req.user.id).select("+password");

      // Verify current password
      const isMatch = await user.comparePassword(currentPassword);

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({
        success: false,
        message: "Error changing password",
      });
    }
  }
);

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post("/logout", authenticate, (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully. Please remove token from client.",
  });
});

// @route   GET /api/auth/verify-token
// @desc    Verify if token is still valid
// @access  Private
router.get("/verify-token", authenticate, (req, res) => {
  res.json({
    success: true,
    message: "Token is valid",
    data: {
      user: req.user,
    },
  });
});

module.exports = router;
