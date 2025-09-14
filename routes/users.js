// routes/users.js
const express = require("express");
const User = require("../models/User");
const { authenticate, authorize, isAdmin } = require("../middleware/auth");
const { validateProfileUpdate } = require("../middleware/validation");

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (with pagination and filtering)
// @access  Private (Admin/Manager)
router.get(
  "/",
  authenticate,
  authorize("admin", "manager", "finance"),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        role,
        department,
        search,
        isActive = "all",
      } = req.query;

      // Build filter object
      const filter = {};

      if (role && role !== "all") {
        filter.role = role;
      }

      if (department && department !== "all") {
        filter.department = new RegExp(department, "i");
      }

      if (isActive !== "all") {
        filter.isActive = isActive === "true";
      }

      if (search) {
        filter.$or = [
          { firstName: new RegExp(search, "i") },
          { lastName: new RegExp(search, "i") },
          { email: new RegExp(search, "i") },
          { employeeId: new RegExp(search, "i") },
        ];
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Get users with pagination
      const users = await User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      // Get total count for pagination
      const total = await User.countDocuments(filter);
      const totalPages = Math.ceil(total / parseInt(limit));

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalUsers: total,
            hasNext: parseInt(page) < totalPages,
            hasPrev: parseInt(page) > 1,
          },
        },
      });
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching users",
      });
    }
  }
);

// @route   GET /api/users/:id
// @desc    Get single user by ID
// @access  Private
router.get("/:id", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Users can only view their own profile unless they're admin/manager
    if (
      req.user.id !== req.params.id &&
      !["admin", "manager", "finance"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user",
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user profile
// @access  Private
router.put("/:id", authenticate, validateProfileUpdate, async (req, res) => {
  try {
    const userId = req.params.id;

    // Users can only update their own profile unless they're admin
    if (req.user.id !== userId && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      "firstName",
      "lastName",
      "phone",
      "department",
      "position",
    ];
    const updates = {};

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user profile",
    });
  }
});

// @route   PUT /api/users/:id/role
// @desc    Update user role (Admin only)
// @access  Private (Admin only)
router.put("/:id/role", authenticate, isAdmin, async (req, res) => {
  try {
    const { role } = req.body;

    if (!["staff", "manager", "finance", "admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User role updated successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Update role error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user role",
    });
  }
});

// @route   PUT /api/users/:id/status
// @desc    Activate/Deactivate user (Admin only)
// @access  Private (Admin only)
router.put("/:id/status", authenticate, isAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean value",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user status",
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user (Admin only)
// @access  Private (Admin only)
router.delete("/:id", authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting user",
    });
  }
});

// @route   GET /api/users/roles/summary
// @desc    Get user count by roles
// @access  Private (Admin/Manager)
router.get(
  "/roles/summary",
  authenticate,
  authorize("admin", "manager"),
  async (req, res) => {
    try {
      const summary = await User.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

      res.json({
        success: true,
        data: {
          summary,
        },
      });
    } catch (error) {
      console.error("Get roles summary error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching roles summary",
      });
    }
  }
);

module.exports = router;
