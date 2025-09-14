// routes/reports.js
const express = require("express");
const Advance = require("../models/Advance");
const User = require("../models/User");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// @route   GET /api/reports/summary
// @desc    Get summary report
// @access  Private (Manager/Finance/Admin)
router.get(
  "/summary",
  authenticate,
  authorize("manager", "finance", "admin"),
  async (req, res) => {
    try {
      const { startDate, endDate, department, status } = req.query;

      // Build date filter
      let dateFilter = {};
      if (startDate || endDate) {
        dateFilter.requestDate = {};
        if (startDate) dateFilter.requestDate.$gte = new Date(startDate);
        if (endDate) dateFilter.requestDate.$lte = new Date(endDate);
      }

      // Build match filter
      let matchFilter = { isActive: true, ...dateFilter };
      if (status && status !== "all") {
        matchFilter.status = status;
      }

      const summary = await Advance.aggregate([
        { $match: matchFilter },
        {
          $lookup: {
            from: "users",
            localField: "requester",
            foreignField: "_id",
            as: "requesterData",
          },
        },
        {
          $unwind: "$requesterData",
        },
        {
          $match:
            department && department !== "all"
              ? { "requesterData.department": department }
              : {},
        },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            approvedAmount: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      ["finance_approved", "disbursed", "retired"],
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },
            pendingAmount: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["pending", "manager_approved"]] },
                  "$amount",
                  0,
                ],
              },
            },
            disbursedAmount: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["disbursed", "retired"]] },
                  "$disbursement.disbursedAmount",
                  0,
                ],
              },
            },
          },
        },
      ]);

      // Get status breakdown
      const statusBreakdown = await Advance.aggregate([
        { $match: matchFilter },
        {
          $lookup: {
            from: "users",
            localField: "requester",
            foreignField: "_id",
            as: "requesterData",
          },
        },
        {
          $unwind: "$requesterData",
        },
        {
          $match:
            department && department !== "all"
              ? { "requesterData.department": department }
              : {},
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

      // Get department breakdown
      const departmentBreakdown = await Advance.aggregate([
        { $match: matchFilter },
        {
          $lookup: {
            from: "users",
            localField: "requester",
            foreignField: "_id",
            as: "requesterData",
          },
        },
        {
          $unwind: "$requesterData",
        },
        {
          $group: {
            _id: "$requesterData.department",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]);

      res.json({
        success: true,
        data: {
          summary: summary[0] || {
            totalRequests: 0,
            totalAmount: 0,
            approvedAmount: 0,
            pendingAmount: 0,
            disbursedAmount: 0,
          },
          statusBreakdown,
          departmentBreakdown,
        },
      });
    } catch (error) {
      console.error("Get summary report error:", error);
      res.status(500).json({
        success: false,
        message: "Error generating summary report",
      });
    }
  }
);

// @route   GET /api/reports/user-activity
// @desc    Get user activity report
// @access  Private (Manager/Finance/Admin)
router.get(
  "/user-activity",
  authenticate,
  authorize("manager", "finance", "admin"),
  async (req, res) => {
    try {
      const { startDate, endDate, limit = 20 } = req.query;

      let dateFilter = {};
      if (startDate || endDate) {
        dateFilter.requestDate = {};
        if (startDate) dateFilter.requestDate.$gte = new Date(startDate);
        if (endDate) dateFilter.requestDate.$lte = new Date(endDate);
      }

      const userActivity = await Advance.aggregate([
        { $match: { isActive: true, ...dateFilter } },
        {
          $lookup: {
            from: "users",
            localField: "requester",
            foreignField: "_id",
            as: "requesterData",
          },
        },
        {
          $unwind: "$requesterData",
        },
        {
          $group: {
            _id: "$requester",
            employeeId: { $first: "$requesterData.employeeId" },
            fullName: {
              $first: {
                $concat: [
                  "$requesterData.firstName",
                  " ",
                  "$requesterData.lastName",
                ],
              },
            },
            department: { $first: "$requesterData.department" },
            totalRequests: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            approvedRequests: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      ["finance_approved", "disbursed", "retired"],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            pendingRequests: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["pending", "manager_approved"]] },
                  1,
                  0,
                ],
              },
            },
            rejectedRequests: {
              $sum: {
                $cond: [{ $eq: ["$status", "rejected"] }, 1, 0],
              },
            },
          },
        },
        { $sort: { totalAmount: -1 } },
        { $limit: parseInt(limit) },
      ]);

      res.json({
        success: true,
        data: {
          userActivity,
        },
      });
    } catch (error) {
      console.error("Get user activity report error:", error);
      res.status(500).json({
        success: false,
        message: "Error generating user activity report",
      });
    }
  }
);

// @route   GET /api/reports/monthly-trends
// @desc    Get monthly trends report
// @access  Private (Manager/Finance/Admin)
router.get(
  "/monthly-trends",
  authenticate,
  authorize("manager", "finance", "admin"),
  async (req, res) => {
    try {
      const { year = new Date().getFullYear() } = req.query;

      const monthlyTrends = await Advance.aggregate([
        {
          $match: {
            isActive: true,
            requestDate: {
              $gte: new Date(`${year}-01-01`),
              $lte: new Date(`${year}-12-31`),
            },
          },
        },
        {
          $group: {
            _id: {
              month: { $month: "$requestDate" },
              year: { $year: "$requestDate" },
            },
            totalRequests: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            approvedRequests: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      ["finance_approved", "disbursed", "retired"],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            approvedAmount: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      ["finance_approved", "disbursed", "retired"],
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
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
            approvedAmount: 1,
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

      res.json({
        success: true,
        data: {
          monthlyTrends,
          year: parseInt(year),
        },
      });
    } catch (error) {
      console.error("Get monthly trends error:", error);
      res.status(500).json({
        success: false,
        message: "Error generating monthly trends report",
      });
    }
  }
);

// @route   GET /api/reports/pending-advances
// @desc    Get all pending advances report
// @access  Private (Manager/Finance/Admin)
router.get(
  "/pending-advances",
  authenticate,
  authorize("manager", "finance", "admin"),
  async (req, res) => {
    try {
      const pendingAdvances = await Advance.find({
        status: { $in: ["pending", "manager_approved"] },
        isActive: true,
      })
        .populate(
          "requester",
          "firstName lastName employeeId department position"
        )
        .populate("approvals.approver", "firstName lastName role")
        .sort({ requestDate: 1 }); // Oldest first

      // Categorize by status for easier processing
      const categorized = {
        pending: pendingAdvances.filter((adv) => adv.status === "pending"),
        managerApproved: pendingAdvances.filter(
          (adv) => adv.status === "manager_approved"
        ),
      };

      res.json({
        success: true,
        data: {
          pendingAdvances,
          categorized,
          summary: {
            totalPending: pendingAdvances.length,
            awaitingManagerApproval: categorized.pending.length,
            awaitingFinanceApproval: categorized.managerApproved.length,
            totalPendingAmount: pendingAdvances.reduce(
              (sum, adv) => sum + adv.amount,
              0
            ),
          },
        },
      });
    } catch (error) {
      console.error("Get pending advances error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching pending advances report",
      });
    }
  }
);

// @route   GET /api/reports/overdue-returns
// @desc    Get overdue returns report
// @access  Private (Finance/Admin)
router.get(
  "/overdue-returns",
  authenticate,
  authorize("finance", "admin"),
  async (req, res) => {
    try {
      const today = new Date();

      const overdueAdvances = await Advance.find({
        status: "disbursed",
        expectedReturnDate: { $lt: today },
        isActive: true,
      })
        .populate("requester", "firstName lastName employeeId department phone")
        .populate("disbursement.disbursedBy", "firstName lastName")
        .sort({ expectedReturnDate: 1 });

      // Calculate days overdue
      const overdueWithDays = overdueAdvances.map((advance) => ({
        ...advance.toObject(),
        daysOverdue: Math.floor(
          (today - advance.expectedReturnDate) / (1000 * 60 * 60 * 24)
        ),
      }));

      res.json({
        success: true,
        data: {
          overdueAdvances: overdueWithDays,
          summary: {
            totalOverdue: overdueAdvances.length,
            totalOverdueAmount: overdueAdvances.reduce(
              (sum, adv) =>
                sum + (adv.disbursement.disbursedAmount || adv.amount),
              0
            ),
          },
        },
      });
    } catch (error) {
      console.error("Get overdue returns error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching overdue returns report",
      });
    }
  }
);

module.exports = router;
