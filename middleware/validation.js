// middleware/validation.js
const Joi = require("joi");

// User registration validation
const validateRegister = (req, res, next) => {
  const schema = Joi.object({
    firstName: Joi.string().min(2).max(50).required().trim(),
    lastName: Joi.string().min(2).max(50).required().trim(),
    email: Joi.string().email().required().lowercase().trim(),
    password: Joi.string().min(6).max(50).required(),
    employeeId: Joi.string().min(3).max(20).required().uppercase().trim(),
    department: Joi.string().min(2).max(50).required().trim(),
    position: Joi.string().min(2).max(50).required().trim(),
    role: Joi.string().valid("staff", "manager", "finance", "admin").optional(),
    phone: Joi.string()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/)
      .optional()
      .trim(),
  });

  const { error } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((detail) => ({
        field: detail.path[0],
        message: detail.message,
      })),
    });
  }

  next();
};

// User login validation
const validateLogin = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required().lowercase().trim(),
    password: Joi.string().required(),
  });

  const { error } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((detail) => ({
        field: detail.path[0],
        message: detail.message.replace(/['"]/g, ""), // Remove quotes from error messages
      })),
    });
  }

  next();
};

// Cash advance request validation
const validateAdvanceRequest = (req, res, next) => {
  const schema = Joi.object({
    amount: Joi.number().positive().max(1000000).required(),
    purpose: Joi.string().min(10).max(500).required().trim(),
    description: Joi.string().max(1000).optional().trim(),
    expectedReturnDate: Joi.date().greater("now").required(),
    priority: Joi.string().valid("low", "medium", "high", "urgent").optional(),
  });

  const { error } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((detail) => ({
        field: detail.path[0],
        message: detail.message,
      })),
    });
  }

  next();
};

// Password change validation
const validatePasswordChange = (req, res, next) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).max(50).required(),
  });

  const { error } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((detail) => ({
        field: detail.path[0],
        message: detail.message,
      })),
    });
  }

  next();
};

// Profile update validation
const validateProfileUpdate = (req, res, next) => {
  const schema = Joi.object({
    firstName: Joi.string().min(2).max(50).optional().trim(),
    lastName: Joi.string().min(2).max(50).optional().trim(),
    phone: Joi.string()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/)
      .optional()
      .trim(),
    department: Joi.string().min(2).max(50).optional().trim(),
    position: Joi.string().min(2).max(50).optional().trim(),
  });

  const { error } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details.map((detail) => ({
        field: detail.path[0],
        message: detail.message,
      })),
    });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateAdvanceRequest,
  validatePasswordChange,
  validateProfileUpdate,
};
