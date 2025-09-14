// routes/advances.js
const express = require("express");
const Advance = require("../models/Advance");
const { authenticate, authorize, canApprove } = require("../middleware/auth");
const { validateAdvanceRequest } = require("../middleware/validation");

const router = express.Router();

// @route   GET /api/advances
// @desc    Get all advances (filtered by user role)
// @access  Private
router.get("/", authenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      search,
      startDate,
      endDate,
    } = req.query;

    // Build filter based on user role
    let filter = { isActive: true };

    // Regular staff can only see their own requests
    if (req.user.role === "staff") {
      filter.requester = req.user._id;
    }

    // Add additional filters
    if (status && status !== "all") {
      filter.status = status;
    }

    if (priority && priority !== "all") {
      filter.priority = priority;
    }

    if (startDate) {
      filter.requestDate = { $gte: new Date(startDate) };
    }

    if (endDate) {
      filter.requestDate = { ...filter.requestDate, $lte: new Date(endDate) };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get advances with populated user data
    let query = Advance.find(filter)
      .populate("requester", "firstName lastName employeeId department")
      .populate("approvals.approver", "firstName lastName role")
      .sort({ requestDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Add search if provided
    if (search) {
      // For search, we need to use aggregation to search in populated fields
      const advances = await Advance.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "requester",
            foreignField: "_id",
            as: "requesterData",
          },
        },
        {
          $match: {
            ...filter,
            $or: [
              { requestNumber: new RegExp(search, "i") },
              { purpose: new RegExp(search, "i") },
              { "requesterData.firstName": new RegExp(search, "i") },
              { "requesterData.lastName": new RegExp(search, "i") },
              { "requesterData.employeeId": new RegExp(search, "i") },
            ],
          },
        },
        { $sort: { requestDate: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) },
      ]);

      const total = await Advance.countDocuments(filter);

      return res.json({
        success: true,
        data: {
          advances,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalAdvances: total,
            hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
            hasPrev: parseInt(page) > 1,
          },
        },
      });
    }

    const advances = await query;
    const total = await Advance.countDocuments(filter);
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
    console.error("Get advances error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching cash advances",
    });
  }
});

// @route   POST /api/advances
// @desc    Create new cash advance request
// @access  Private
router.post("/", authenticate, validateAdvanceRequest, async (req, res) => {
  try {
    const { amount, purpose, description, expectedReturnDate, priority } =
      req.body;

    const advance = new Advance({
      requester: req.user._id,
      amount,
      purpose,
      description,
      expectedReturnDate: new Date(expectedReturnDate),
      priority: priority || "medium",
    });

    await advance.save();

    // Populate requester info
    await advance.populate(
      "requester",
      "firstName lastName employeeId department"
    );

    res.status(201).json({
      success: true,
      message: "Cash advance request created successfully",
      data: {
        advance,
      },
    });
  } catch (error) {
    console.error("Create advance error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating cash advance request",
    });
  }
});

// @route   GET /api/advances/:id
// @desc    Get single advance by ID
// @access  Private
router.get("/:id", authenticate, async (req, res) => {
  try {
    const advance = await Advance.findById(req.params.id)
      .populate(
        "requester",
        "firstName lastName employeeId department position"
      )
      .populate("approvals.approver", "firstName lastName role")
      .populate("disbursement.disbursedBy", "firstName lastName")
      .populate("retirement.retiredBy", "firstName lastName")
      .populate("retirement.verifiedBy", "firstName lastName");

    if (!advance) {
      return res.status(404).json({
        success: false,
        message: "Cash advance request not found",
      });
    }

    // Check if user can view this advance
    const canView =
      advance.requester._id.toString() === req.user._id.toString() ||
      ["admin", "manager", "finance"].includes(req.user.role);

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: {
        advance,
      },
    });
  } catch (error) {
    console.error("Get advance error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching cash advance request",
    });
  }
});

// @route   PUT /api/advances/:id/approve
// @desc    Approve or reject advance request
// @access  Private (Manager/Finance)
router.put("/:id/approve", authenticate, canApprove, async (req, res) => {
  try {
    const { status, comment } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "approved" or "rejected"',
      });
    }

    const advance = await Advance.findById(req.params.id).populate(
      "requester",
      "firstName lastName employeeId"
    );

    if (!advance) {
      return res.status(404).json({
        success: false,
        message: "Cash advance request not found",
      });
    }

    // Check if user can approve this advance
    if (!advance.canBeApprovedBy(req.user.role)) {
      return res.status(400).json({
        success: false,
        message: `This request cannot be ${status} at this stage`,
        currentStatus: advance.status,
        userRole: req.user.role,
      });
    }

    // Add approval
    advance.addApproval(req.user._id, req.user.role, status, comment);

    await advance.save();

    res.json({
      success: true,
      message: `Cash advance request ${status} successfully`,
      data: {
        advance,
      },
    });
  } catch (error) {
    console.error("Approve advance error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing approval",
    });
  }
});

// @route   PUT /api/advances/:id/disburse
// @desc    Mark advance as disbursed (Finance only)
// @access  Private (Finance/Admin)
router.put(
  "/:id/disburse",
  authenticate,
  authorize("finance", "admin"),
  async (req, res) => {
    try {
      const { disbursedAmount, method, reference } = req.body;

      const advance = await Advance.findById(req.params.id);

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: "Cash advance request not found",
        });
      }

      if (advance.status !== "finance_approved") {
        return res.status(400).json({
          success: false,
          message: "Advance must be finance approved before disbursement",
        });
      }

      // Update disbursement info
      advance.disbursement = {
        disbursedBy: req.user._id,
        disbursedDate: new Date(),
        disbursedAmount: disbursedAmount || advance.amount,
        method: method || "cash",
        reference,
      };

      advance.status = "disbursed";
      await advance.save();

      await advance.populate("disbursement.disbursedBy", "firstName lastName");

      res.json({
        success: true,
        message: "Cash advance disbursed successfully",
        data: {
          advance,
        },
      });
    } catch (error) {
      console.error("Disburse advance error:", error);
      res.status(500).json({
        success: false,
        message: "Error disbursing advance",
      });
    }
  }
);

// @route   GET /api/advances/pending/approvals
// @desc    Get advances pending approval for current user
// @access  Private (Manager/Finance)
router.get("/pending/approvals", authenticate, canApprove, async (req, res) => {
  try {
    const advances = await Advance.getPendingForApproval(
      req.user.role,
      req.user._id
    );

    res.json({
      success: true,
      data: {
        advances,
        count: advances.length,
      },
    });
  } catch (error) {
    console.error("Get pending approvals error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching pending approvals",
    });
  }
});

// @route   GET /api/advances/dashboard/stats
// @desc    Get dashboard statistics
// @access  Private
router.get("/dashboard/stats", authenticate, async (req, res) => {
  try {
    let filter = { isActive: true };

    // Regular staff only see their own stats
    if (req.user.role === "staff") {
      filter.requester = req.user._id;
    }

    const stats = await Advance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    // Get recent advances
    const recentAdvances = await Advance.find(filter)
      .populate("requester", "firstName lastName employeeId")
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        stats,
        recentAdvances,
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard statistics",
    });
  }
});

module.exports = router;
