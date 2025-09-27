// routes/manager.js
const express = require("express");
const CashAdvance = require("../models/CashAdvance");
const User = require("../models/User");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// @route   GET /api/manager/dashboard
// @desc    Get manager dashboard overview
// @access  Private (Manager)
router.get(
  "/dashboard",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      // Get manager's department
      const manager = await User.findById(req.user.id);

      // Get team members in the same department
      const teamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      }).select("firstName lastName employeeId position");

      // Get pending approvals for manager's department
      const pendingApprovals = await CashAdvance.find({
        status: "pending",
        "user.department": manager.department,
      })
        .populate("user", "firstName lastName employeeId position")
        .sort({ createdAt: -1 });

      // Get team requests stats
      const teamStats = await CashAdvance.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userData",
          },
        },
        { $unwind: "$userData" },
        { $match: { "userData.department": manager.department } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);

      // Calculate dashboard stats
      const stats = {
        pendingApprovals: pendingApprovals.length,
        teamMembers: teamMembers.length,
        totalTeamRequests: teamStats.reduce((sum, stat) => sum + stat.count, 0),
        approvedRequests:
          teamStats.find((stat) => stat._id === "approved")?.count || 0,
        pendingRequests:
          teamStats.find((stat) => stat._id === "pending")?.count || 0,
      };

      res.json({
        success: true,
        data: {
          stats,
          pendingApprovals: pendingApprovals.slice(0, 5), // Recent 5
          teamMembers: teamMembers.slice(0, 6), // Top 6 team members
          recentTeamRequests: await CashAdvance.find({
            "user.department": manager.department,
          })
            .populate("user", "firstName lastName employeeId")
            .sort({ createdAt: -1 })
            .limit(5),
        },
      });
    } catch (error) {
      console.error("Manager dashboard error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching manager dashboard data",
      });
    }
  }
);

// @route   GET /api/manager/pending-approvals
// @desc    Get all pending approvals for manager
// @access  Private (Manager)
router.get(
  "/pending-approvals",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      const manager = await User.findById(req.user.id);

      const pendingApprovals = await CashAdvance.find({
        status: "pending",
        "user.department": manager.department,
      })
        .populate("user", "firstName lastName employeeId position department")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: {
          pendingApprovals,
          total: pendingApprovals.length,
        },
      });
    } catch (error) {
      console.error("Pending approvals error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching pending approvals",
      });
    }
  }
);

// @route   PUT /api/manager/approve/:id
// @desc    Approve or reject a cash advance request
// @access  Private (Manager)
router.put(
  "/approve/:id",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      const { action, reason } = req.body; // action: 'approve' or 'reject'
      const manager = await User.findById(req.user.id);

      const advance = await CashAdvance.findOne({
        _id: req.params.id,
        status: "pending",
        "user.department": manager.department,
      });

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: "Request not found or already processed",
        });
      }

      if (action === "approve") {
        advance.status = "approved";
        advance.approvedBy = req.user.id;
        advance.approvedAt = new Date();
      } else if (action === "reject") {
        advance.status = "rejected";
        advance.rejectedReason = reason;
        advance.rejectedBy = req.user.id;
        advance.rejectedAt = new Date();
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid action. Use 'approve' or 'reject'",
        });
      }

      await advance.save();
      await advance.populate("user", "firstName lastName email");

      res.json({
        success: true,
        message: `Request ${action}d successfully`,
        data: { advance },
      });
    } catch (error) {
      console.error("Approve/reject error:", error);
      res.status(500).json({
        success: false,
        message: "Error processing request",
      });
    }
  }
);

// @route   GET /api/manager/team-requests
// @desc    Get all team requests with filtering
// @access  Private (Manager)
router.get(
  "/team-requests",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      const { status, page = 1, limit = 10, sort = "-createdAt" } = req.query;
      const manager = await User.findById(req.user.id);

      // Build filter
      const filter = { "user.department": manager.department };
      if (status && status !== "all") {
        filter.status = status;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const requests = await CashAdvance.find(filter)
        .populate("user", "firstName lastName employeeId position")
        .populate("approvedBy", "firstName lastName")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      const total = await CashAdvance.countDocuments(filter);

      res.json({
        success: true,
        data: {
          requests,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalRequests: total,
            hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
            hasPrev: parseInt(page) > 1,
          },
        },
      });
    } catch (error) {
      console.error("Team requests error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching team requests",
      });
    }
  }
);

// @route   GET /api/manager/team-members
// @desc    Get all team members with their request stats
// @access  Private (Manager)
router.get(
  "/team-members",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      const manager = await User.findById(req.user.id);

      const teamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      }).select("firstName lastName employeeId position email");

      // Get request stats for each team member
      const teamMembersWithStats = await Promise.all(
        teamMembers.map(async (member) => {
          const stats = await CashAdvance.aggregate([
            { $match: { user: member._id } },
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalAmount: { $sum: "$amount" },
              },
            },
          ]);

          const statusCounts = {
            pending: 0,
            approved: 0,
            rejected: 0,
            retired: 0,
            total: 0,
          };

          stats.forEach((stat) => {
            statusCounts[stat._id] = stat.count;
            statusCounts.total += stat.count;
          });

          return {
            ...member.toObject(),
            stats: statusCounts,
          };
        })
      );

      res.json({
        success: true,
        data: {
          teamMembers: teamMembersWithStats,
          total: teamMembersWithStats.length,
        },
      });
    } catch (error) {
      console.error("Team members error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching team members",
      });
    }
  }
);

module.exports = router;
