const logger = require("../utils/logger");

const authenticateRequest = (req, res, next) => {
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("🔐 Post Service - User ID Validation");
  logger.info(`📍 ${req.method} ${req.url}`);

  const userId = req.headers["x-user-id"];

  logger.info(`👤 x-user-id Header: ${userId || "MISSING"}`);

  // BUG FIX: Changed from if (userId) to if (!userId)
  if (!userId) {
    logger.warn("❌ No user ID provided in headers");
    return res.status(401).json({
      success: false,
      message: "Authentication required! Please login to continue",
    });
  }

  // Validate userId format (optional but recommended)
  if (userId.trim() === "") {
    logger.warn("❌ Empty user ID provided");
    return res.status(401).json({
      success: false,
      message: "Invalid user ID",
    });
  }

  logger.info(`✅ User authenticated: ${userId}`);

  // Attach user info to request
  req.user = { userId };

  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  next();
};

module.exports = { authenticateRequest };
