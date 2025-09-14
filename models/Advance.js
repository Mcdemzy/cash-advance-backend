// models/Advance.js
const mongoose = require("mongoose");

const advanceSchema = new mongoose.Schema(
  {
    requestNumber: {
      type: String,
      unique: true,
      required: true,
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [1, "Amount must be greater than 0"],
    },
    purpose: {
      type: String,
      required: [true, "Purpose is required"],
      trim: true,
      maxlength: [500, "Purpose cannot exceed 500 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    requestDate: {
      type: Date,
      default: Date.now,
    },
    expectedReturnDate: {
      type: Date,
      required: [true, "Expected return date is required"],
    },
    status: {
      type: String,
      enum: [
        "pending",
        "manager_approved",
        "finance_approved",
        "disbursed",
        "rejected",
        "retired",
      ],
      default: "pending",
    },
    approvals: [
      {
        approver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        role: {
          type: String,
          enum: ["manager", "finance"],
        },
        status: {
          type: String,
          enum: ["approved", "rejected"],
        },
        comment: {
          type: String,
          trim: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    disbursement: {
      disbursedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      disbursedDate: Date,
      disbursedAmount: Number,
      method: {
        type: String,
        enum: ["cash", "bank_transfer", "check"],
      },
      reference: String,
    },
    retirement: {
      retiredDate: Date,
      receipts: [
        {
          description: String,
          amount: Number,
          date: Date,
          receiptNumber: String,
        },
      ],
      totalSpent: Number,
      balanceReturned: Number,
      retiredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
advanceSchema.index({ requester: 1 });
advanceSchema.index({ status: 1 });
advanceSchema.index({ requestDate: -1 });
advanceSchema.index({ requestNumber: 1 }, { unique: true });

// Generate request number before saving
advanceSchema.pre("save", async function (next) {
  if (!this.requestNumber) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");

    // Find the last request number for this month
    const lastAdvance = await this.constructor
      .findOne({
        requestNumber: new RegExp(`^ADV${year}${month}`),
      })
      .sort({ requestNumber: -1 });

    let sequence = 1;
    if (lastAdvance) {
      const lastSequence = parseInt(lastAdvance.requestNumber.slice(-4));
      sequence = lastSequence + 1;
    }

    this.requestNumber = `ADV${year}${month}${String(sequence).padStart(
      4,
      "0"
    )}`;
  }
  next();
});

// Instance method to check if advance can be approved by role
advanceSchema.methods.canBeApprovedBy = function (userRole) {
  if (this.status === "rejected" || this.status === "retired") {
    return false;
  }

  if (userRole === "manager" && this.status === "pending") {
    return true;
  }

  if (userRole === "finance" && this.status === "manager_approved") {
    return true;
  }

  return false;
};

// Instance method to add approval
advanceSchema.methods.addApproval = function (
  approverId,
  role,
  status,
  comment = ""
) {
  this.approvals.push({
    approver: approverId,
    role,
    status,
    comment,
    date: new Date(),
  });

  // Update main status based on approval
  if (status === "rejected") {
    this.status = "rejected";
  } else if (role === "manager" && status === "approved") {
    this.status = "manager_approved";
  } else if (role === "finance" && status === "approved") {
    this.status = "finance_approved";
  }
};

// Static method to get pending approvals for a user
advanceSchema.statics.getPendingForApproval = function (userRole, userId) {
  let statusFilter = {};

  if (userRole === "manager") {
    statusFilter = { status: "pending" };
  } else if (userRole === "finance") {
    statusFilter = { status: "manager_approved" };
  }

  return this.find(statusFilter)
    .populate("requester", "firstName lastName employeeId department")
    .sort({ requestDate: 1 });
};

module.exports = mongoose.model("Advance", advanceSchema);
