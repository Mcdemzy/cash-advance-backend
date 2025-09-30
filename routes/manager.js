// routes/manager.js - FIXED VERSION
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
      const manager = await User.findById(req.user.id);

      // Get team members count
      const teamMembersCount = await User.countDocuments({
        department: manager.department,
        role: "staff",
        isActive: true,
      });

      // Get team member IDs for filtering
      const teamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      }).select("_id");

      const teamMemberIds = teamMembers.map((member) => member._id);

      // Get pending approvals count
      const pendingApprovalsCount = await CashAdvance.countDocuments({
        status: "pending",
        user: { $in: teamMemberIds },
      });

      // Get team requests stats using aggregation
      const teamStats = await CashAdvance.aggregate([
        {
          $match: {
            user: { $in: teamMemberIds },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);

      // Calculate stats from aggregation results
      const stats = {
        pendingApprovals: pendingApprovalsCount,
        teamMembers: teamMembersCount,
        totalTeamRequests: teamStats.reduce((sum, stat) => sum + stat.count, 0),
        approvedRequests:
          teamStats.find((stat) => stat._id === "approved")?.count || 0,
        pendingRequests:
          teamStats.find((stat) => stat._id === "pending")?.count || 0,
        totalAmount: teamStats.reduce((sum, stat) => sum + stat.totalAmount, 0),
      };

      // Get recent pending approvals
      const pendingApprovals = await CashAdvance.find({
        status: "pending",
        user: { $in: teamMemberIds },
      })
        .populate("user", "firstName lastName employeeId position department")
        .sort({ createdAt: -1 })
        .limit(5);

      // Get recent team requests
      const recentTeamRequests = await CashAdvance.find({
        user: { $in: teamMemberIds },
      })
        .populate("user", "firstName lastName employeeId department")
        .populate("approvedBy", "firstName lastName")
        .sort({ createdAt: -1 })
        .limit(5);

      // Get team members for display
      const displayTeamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      })
        .select("firstName lastName employeeId position")
        .limit(6);

      res.json({
        success: true,
        data: {
          stats,
          pendingApprovals,
          teamMembers: displayTeamMembers,
          recentTeamRequests,
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
      const { page = 1, limit = 10, search = "" } = req.query;
      const manager = await User.findById(req.user.id);

      // Get team member IDs
      const teamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      }).select("_id");

      const teamMemberIds = teamMembers.map((member) => member._id);

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build search filter
      let searchFilter = {};
      if (search) {
        searchFilter = {
          $or: [
            { purpose: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ],
        };
      }

      const pendingApprovals = await CashAdvance.find({
        status: "pending",
        user: { $in: teamMemberIds },
        ...searchFilter,
      })
        .populate("user", "firstName lastName employeeId position department")
        .populate("approvedBy", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await CashAdvance.countDocuments({
        status: "pending",
        user: { $in: teamMemberIds },
        ...searchFilter,
      });

      res.json({
        success: true,
        data: {
          pendingApprovals,
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
      console.error("Pending approvals error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching pending approvals",
      });
    }
  }
);

// @route   PUT /api/manager/requests/:id/approve
// @desc    Approve a cash advance request
// @access  Private (Manager)
router.put(
  "/requests/:id/approve",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      const manager = await User.findById(req.user.id);

      // Get team member IDs to verify request belongs to manager's team
      const teamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      }).select("_id");

      const teamMemberIds = teamMembers.map((member) => member._id);

      const advance = await CashAdvance.findOne({
        _id: req.params.id,
        status: "pending",
        user: { $in: teamMemberIds },
      });

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: "Request not found or already processed",
        });
      }

      advance.status = "approved";
      advance.approvedBy = req.user.id;
      advance.approvedAt = new Date();

      await advance.save();
      await advance.populate(
        "user",
        "firstName lastName email employeeId department"
      );
      await advance.populate("approvedBy", "firstName lastName");

      res.json({
        success: true,
        message: "Request approved successfully",
        data: { advance },
      });
    } catch (error) {
      console.error("Approve request error:", error);
      res.status(500).json({
        success: false,
        message: "Error approving request",
      });
    }
  }
);

// @route   PUT /api/manager/requests/:id/reject
// @desc    Reject a cash advance request
// @access  Private (Manager)
router.put(
  "/requests/:id/reject",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      const { reason } = req.body;
      const manager = await User.findById(req.user.id);

      // Get team member IDs to verify request belongs to manager's team
      const teamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      }).select("_id");

      const teamMemberIds = teamMembers.map((member) => member._id);

      const advance = await CashAdvance.findOne({
        _id: req.params.id,
        status: "pending",
        user: { $in: teamMemberIds },
      });

      if (!advance) {
        return res.status(404).json({
          success: false,
          message: "Request not found or already processed",
        });
      }

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required",
        });
      }

      advance.status = "rejected";
      advance.rejectedReason = reason.trim();
      advance.rejectedBy = req.user.id;
      advance.rejectedAt = new Date();

      await advance.save();
      await advance.populate(
        "user",
        "firstName lastName email employeeId department"
      );
      await advance.populate("rejectedBy", "firstName lastName");

      res.json({
        success: true,
        message: "Request rejected successfully",
        data: { advance },
      });
    } catch (error) {
      console.error("Reject request error:", error);
      res.status(500).json({
        success: false,
        message: "Error rejecting request",
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
      const {
        status,
        page = 1,
        limit = 10,
        sort = "-createdAt",
        search = "",
      } = req.query;

      const manager = await User.findById(req.user.id);

      // Get team member IDs
      const teamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      }).select("_id");

      const teamMemberIds = teamMembers.map((member) => member._id);

      // Build filter
      let filter = { user: { $in: teamMemberIds } };

      if (status && status !== "all") {
        filter.status = status;
      }

      // Add search filter
      if (search) {
        filter.$or = [
          { purpose: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const requests = await CashAdvance.find(filter)
        .populate("user", "firstName lastName employeeId position department")
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
      const { search = "" } = req.query;
      const manager = await User.findById(req.user.id);

      // Build search filter for team members
      let memberFilter = {
        department: manager.department,
        role: "staff",
        isActive: true,
      };

      if (search) {
        memberFilter.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { position: { $regex: search, $options: "i" } },
        ];
      }

      const teamMembers = await User.find(memberFilter)
        .select(
          "firstName lastName employeeId position email phone department hireDate"
        )
        .sort({ firstName: 1 });

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
            totalAmount: 0,
          };

          stats.forEach((stat) => {
            statusCounts[stat._id] = stat.count;
            statusCounts.total += stat.count;
            statusCounts.totalAmount += stat.totalAmount || 0;
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

// @route   GET /api/manager/team-members/:id/requests
// @desc    Get all requests for a specific team member
// @access  Private (Manager)
router.get(
  "/team-members/:id/requests",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, page = 1, limit = 10 } = req.query;
      const manager = await User.findById(req.user.id);

      // Verify the team member belongs to manager's department
      const teamMember = await User.findOne({
        _id: id,
        department: manager.department,
        role: "staff",
        isActive: true,
      });

      if (!teamMember) {
        return res.status(404).json({
          success: false,
          message: "Team member not found",
        });
      }

      // Build filter for member's requests
      const filter = { user: id };
      if (status && status !== "all") {
        filter.status = status;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const requests = await CashAdvance.find(filter)
        .populate("user", "firstName lastName employeeId position department")
        .populate("approvedBy", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await CashAdvance.countDocuments(filter);

      // Get stats for this team member
      const stats = await CashAdvance.aggregate([
        { $match: { user: teamMember._id } },
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
        totalAmount: 0,
      };

      stats.forEach((stat) => {
        statusCounts[stat._id] = stat.count;
        statusCounts.total += stat.count;
        statusCounts.totalAmount += stat.totalAmount || 0;
      });

      res.json({
        success: true,
        data: {
          teamMember: {
            ...teamMember.toObject(),
            stats: statusCounts,
          },
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
      console.error("Team member requests error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching team member requests",
      });
    }
  }
);

// @route   GET /api/manager/requests/:id
// @desc    Get detailed view of a specific request
// @access  Private (Manager)
router.get(
  "/requests/:id",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const manager = await User.findById(req.user.id);

      // Get team member IDs
      const teamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      }).select("_id");

      const teamMemberIds = teamMembers.map((member) => member._id);

      const request = await CashAdvance.findOne({
        _id: id,
        user: { $in: teamMemberIds },
      })
        .populate(
          "user",
          "firstName lastName email employeeId position department phone"
        )
        .populate("approvedBy", "firstName lastName")
        .populate("rejectedBy", "firstName lastName");

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Request not found",
        });
      }

      res.json({
        success: true,
        data: { request },
      });
    } catch (error) {
      console.error("Get request detail error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching request details",
      });
    }
  }
);

// @route   GET /api/manager/reports/summary
// @desc    Get reports and analytics for manager's department
// @access  Private (Manager)
router.get(
  "/reports/summary",
  authenticate,
  authorize("manager"),
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const manager = await User.findById(req.user.id);

      // Get team member IDs
      const teamMembers = await User.find({
        department: manager.department,
        role: "staff",
        isActive: true,
      }).select("_id");

      const teamMemberIds = teamMembers.map((member) => member._id);

      // Build date filter
      let dateFilter = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
        if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
      }

      // Get department summary
      const departmentSummary = await CashAdvance.aggregate([
        {
          $match: {
            user: { $in: teamMemberIds },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            approvedRequests: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
            approvedAmount: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$amount", 0] },
            },
            pendingRequests: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            pendingAmount: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] },
            },
          },
        },
      ]);

      // Get status breakdown
      const statusBreakdown = await CashAdvance.aggregate([
        {
          $match: {
            user: { $in: teamMemberIds },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Get monthly trends for the current year
      const currentYear = new Date().getFullYear();
      const monthlyTrends = await CashAdvance.aggregate([
        {
          $match: {
            user: { $in: teamMemberIds },
            createdAt: {
              $gte: new Date(`${currentYear}-01-01`),
              $lte: new Date(`${currentYear}-12-31`),
            },
          },
        },
        {
          $group: {
            _id: {
              month: { $month: "$createdAt" },
              year: { $year: "$createdAt" },
            },
            totalRequests: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            approvedRequests: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
          },
        },
        {
          $project: {
            month: "$_id.month",
            year: "$_id.year",
            totalRequests: 1,
            totalAmount: 1,
            approvedRequests: 1,
            approvalRate: {
              $multiply: [
                { $divide: ["$approvedRequests", "$totalRequests"] },
                100,
              ],
            },
          },
        },
        { $sort: { month: 1 } },
      ]);

      const summary = departmentSummary[0] || {
        totalRequests: 0,
        totalAmount: 0,
        approvedRequests: 0,
        approvedAmount: 0,
        pendingRequests: 0,
        pendingAmount: 0,
      };

      res.json({
        success: true,
        data: {
          summary,
          statusBreakdown,
          monthlyTrends,
          teamMembersCount: teamMembers.length,
        },
      });
    } catch (error) {
      console.error("Manager reports error:", error);
      res.status(500).json({
        success: false,
        message: "Error generating reports",
      });
    }
  }
);

module.exports = router;
