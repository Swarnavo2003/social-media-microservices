const logger = require("../utils/logger");
const jwt = require("jsonwebtoken");

const validateToken = (req, res, next) => {
  // Enhanced logging for debugging
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("🔐 API Gateway - Token Validation");
  logger.info(`📍 ${req.method} ${req.originalUrl}`);

  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];

  logger.info(
    `🎫 Auth Header: ${
      authHeader ? authHeader.substring(0, 30) + "..." : "MISSING"
    }`
  );

  if (!authHeader) {
    logger.warn("❌ No authorization header provided");
    return res.status(401).json({
      success: false,
      message: "Authentication required - No token provided",
    });
  }

  // Check Bearer format
  if (!authHeader.startsWith("Bearer ") && !authHeader.startsWith("bearer ")) {
    logger.warn("❌ Invalid authorization header format");
    return res.status(401).json({
      success: false,
      message: "Authentication required - Invalid format. Use: Bearer <token>",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token || token.trim() === "") {
    logger.warn("❌ Empty token after extraction");
    return res.status(401).json({
      success: false,
      message: "Authentication required - Empty token",
    });
  }

  logger.info(`🎟️  Token extracted: ${token.substring(0, 20)}...`);

  // Verify JWT_SECRET exists
  if (!process.env.JWT_SECRET) {
    logger.error("❌ JWT_SECRET not configured");
    return res.status(500).json({
      success: false,
      message: "Server configuration error",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      logger.warn(`❌ Token verification failed: ${err.message}`);

      // Provide specific error messages
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token expired - Please login again",
        });
      }

      if (err.name === "JsonWebTokenError") {
        return res.status(403).json({
          success: false,
          message: "Invalid token - Authentication failed",
        });
      }

      return res.status(403).json({
        success: false,
        message: "Token verification failed",
      });
    }

    logger.info(`✅ Token verified for user: ${decoded.userId || decoded.id}`);
    logger.info(`Token payload: ${JSON.stringify(decoded)}`);

    // Attach user info to request
    req.user = decoded;

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    next();
  });
};

module.exports = validateToken;
