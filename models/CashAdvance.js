const mongoose = require("mongoose");

const cashAdvanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
      max: 1000000,
    },
    purpose: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "retired"],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    dateNeeded: {
      type: Date,
      required: true,
    },
    retirement: {
      retirementDate: Date,
      totalExpenses: Number,
      expenseBreakdown: String,
      retiredAt: Date,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectedReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
cashAdvanceSchema.index({ user: 1, createdAt: -1 });
cashAdvanceSchema.index({ status: 1 });
cashAdvanceSchema.index({ createdAt: -1 });

// Static method to get user stats
cashAdvanceSchema.statics.getUserStats = async function (userId) {
  try {
    const stats = await this.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          approved: {
            $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
          },
          retired: {
            $sum: { $cond: [{ $eq: ["$status", "retired"] }, 1, 0] },
          },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    return (
      stats[0] || {
        totalRequests: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        retired: 0,
        totalAmount: 0,
      }
    );
  } catch (error) {
    console.error("Error in getUserStats:", error);
    return {
      totalRequests: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      retired: 0,
      totalAmount: 0,
    };
  }
};

// Alternative method using regular queries (more reliable)
cashAdvanceSchema.statics.getUserStatsAlt = async function (userId) {
  try {
    const totalRequests = await this.countDocuments({ user: userId });
    const pending = await this.countDocuments({
      user: userId,
      status: "pending",
    });
    const approved = await this.countDocuments({
      user: userId,
      status: "approved",
    });
    const rejected = await this.countDocuments({
      user: userId,
      status: "rejected",
    });
    const retired = await this.countDocuments({
      user: userId,
      status: "retired",
    });

    const totalAmountResult = await this.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);

    const totalAmount = totalAmountResult[0]?.totalAmount || 0;

    return {
      totalRequests,
      pending,
      approved,
      rejected,
      retired,
      totalAmount,
    };
  } catch (error) {
    console.error("Error in getUserStatsAlt:", error);
    return {
      totalRequests: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      retired: 0,
      totalAmount: 0,
    };
  }
};

module.exports = mongoose.model("CashAdvance", cashAdvanceSchema);
