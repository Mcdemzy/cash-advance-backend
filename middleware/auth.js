// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token is not valid. User not found.",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account has been deactivated.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during authentication.",
    });
  }
};

// Authorization middleware for specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
        required: roles,
        current: req.user.role,
      });
    }

    next();
  };
};

// Check if user is admin
const isAdmin = authorize("admin");

// Check if user is finance officer
const isFinance = authorize("finance", "admin");

// Check if user is manager or above
const isManager = authorize("manager", "finance", "admin");

// Check if user can approve (manager or finance)
const canApprove = authorize("manager", "finance", "admin");

module.exports = {
  authenticate,
  authorize,
  isAdmin,
  isFinance,
  isManager,
  canApprove,
};
