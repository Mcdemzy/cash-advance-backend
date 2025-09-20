const express = require("express");
const CashAdvance = require("../models/CashAdvance");
const { authenticate } = require("../middleware/auth");
const {
  validateAdvanceRequest,
  validateRetirement,
} = require("../middleware/validation");

const router = express.Router();

// @route   POST /api/advances
// @desc    Create new cash advance request
// @access  Private (Staff)
router.post("/", authenticate, validateAdvanceRequest, async (req, res) => {
  try {
    const { amount, purpose, description, dateNeeded, priority } = req.body;

    const advance = new CashAdvance({
      user: req.user.id,
      amount,
      purpose,
      description,
      dateNeeded,
      priority,
    });

    await advance.save();

    // Populate user details for response
    await advance.populate("user", "firstName lastName email employeeId");

    res.status(201).json({
      success: true,
      message: "Cash advance request submitted successfully",
      data: { advance },
    });
  } catch (error) {
    console.error("Create advance error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating cash advance request",
    });
  }
});

// @route   GET /api/advances/my-requests
// @desc    Get all cash advance requests for current user
// @access  Private (Staff)
router.get("/my-requests", authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 10, sort = "-createdAt" } = req.query;

    // Build filter
    const filter = { user: req.user.id };
    if (status && status !== "all") {
      filter.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const advances = await CashAdvance.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("user", "firstName lastName employeeId")
      .populate("approvedBy", "firstName lastName");

    const total = await CashAdvance.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: {
        advances,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalAdvances: total,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get user advances error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching cash advance requests",
    });
  }
});

// @route   GET /api/advances/my-requests/:id
// @desc    Get single cash advance request for current user
// @access  Private (Staff)
router.get("/my-requests/:id", authenticate, async (req, res) => {
  try {
    const advance = await CashAdvance.findOne({
      _id: req.params.id,
      user: req.user.id,
    })
      .populate(
        "user",
        "firstName lastName email employeeId department position"
      )
      .populate("approvedBy", "firstName lastName");

    if (!advance) {
      return res.status(404).json({
        success: false,
        message: "Cash advance request not found",
      });
    }

    res.json({
      success: true,
      data: { advance },
    });
  } catch (error) {
    console.error("Get advance error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching cash advance request",
    });
  }
});

// @route   PUT /api/advances/:id/retire
// @desc    Retire a cash advance
// @access  Private (Staff)
router.put(
  "/:id/retire",
  authenticate,
  validateRetirement,
  async (req, res) => {
    try {
      const { retirementDate, totalExpenses, expenseBreakdown } = req.body;

      const advance = await CashAdvance.findOne({
        _id: req.params.id,
        user: req.user.id,
      });

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: "Cash advance request not found",
        });
      }

      if (advance.status !== "approved") {
        return res.status(400).json({
          success: false,
          message: "Only approved advances can be retired",
        });
      }

      if (advance.status === "retired") {
        return res.status(400).json({
          success: false,
          message: "Advance has already been retired",
        });
      }

      advance.status = "retired";
      advance.retirement = {
        retirementDate,
        totalExpenses,
        expenseBreakdown,
        retiredAt: new Date(),
      };

      await advance.save();

      res.json({
        success: true,
        message: "Cash advance retired successfully",
        data: { advance },
      });
    } catch (error) {
      console.error("Retire advance error:", error);
      res.status(500).json({
        success: false,
        message: "Error retiring cash advance",
      });
    }
  }
);

/// @route   GET /api/advances/staff/stats
// @desc    Get dashboard statistics for staff
// @access  Private (Staff)
router.get("/staff/stats", authenticate, async (req, res) => {
  try {
    // Use the alternative method that's more reliable
    const stats = await CashAdvance.getUserStatsAlt(req.user.id);

    res.json({
      success: true,
      data: { stats },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard statistics",
    });
  }
});

// @route   GET /api/advances/staff/recent
// @desc    Get recent requests for staff dashboard
// @access  Private (Staff)
router.get("/staff/recent", authenticate, async (req, res) => {
  try {
    const advances = await CashAdvance.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("amount purpose status createdAt dateNeeded")
      .lean();

    res.json({
      success: true,
      data: { advances },
    });
  } catch (error) {
    console.error("Get recent advances error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching recent requests",
    });
  }
});

// @route   GET /api/advances/staff/pending
// @desc    Get pending requests for staff dashboard
// @access  Private (Staff)
router.get("/staff/pending", authenticate, async (req, res) => {
  try {
    const advances = await CashAdvance.find({
      user: req.user.id,
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .select("amount purpose createdAt dateNeeded")
      .lean();

    res.json({
      success: true,
      data: { advances },
    });
  } catch (error) {
    console.error("Get pending advances error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching pending requests",
    });
  }
});

module.exports = router;
