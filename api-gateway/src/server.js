require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const logger = require("./utils/logger");
const proxy = require("express-http-proxy");
const errHandler = require("./middlewares/errorHandler");
const validateToken = require("./middlewares/authMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;

// Validate environment variables
if (!process.env.IDENTITY_SERVICE_URL) {
  logger.error("IDENTITY_SERVICE_URL is not defined in environment variables");
  process.exit(1);
}
if (!process.env.POST_SERVICE_URL) {
  logger.error("POST_SERVICE_URL is not defined in environment variables");
  process.exit(1);
}
if (!process.env.REDIS_URL) {
  logger.error("REDIS_URL is not defined in environment variables");
  process.exit(1);
}

const redisClient = new Redis(process.env.REDIS_URL);

// Redis connection error handling
redisClient.on("error", (err) => {
  logger.error("Redis connection error: %o", err);
});

redisClient.on("connect", () => {
  logger.info("Successfully connected to Redis");
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// Enhanced logging middleware
app.use((req, res, next) => {
  logger.info(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  logger.info(`Headers: ${JSON.stringify(req.headers)}`);
  logger.info(`Body: ${JSON.stringify(req.body)}`);
  logger.info(`IP: ${req.ip}`);
  next();
});

// Rate limiting
const rateLimiteOptions = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ success: false, message: "Too Many Requests" });
  },
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

app.use(rateLimiteOptions);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "api-gateway",
    timestamp: new Date().toISOString(),
  });
});

// Debug endpoint to check service URLs
app.get("/debug/config", (req, res) => {
  res.json({
    identityServiceUrl: process.env.IDENTITY_SERVICE_URL,
    postServiceUrl: process.env.POST_SERVICE_URL,
    redisUrl: process.env.REDIS_URL ? "Connected" : "Not Connected",
    port: PORT,
  });
});

// Identity Service Proxy
app.use(
  "/v1/auth",
  (req, res, next) => {
    logger.info(
      `Proxying to Identity Service: ${req.method} ${req.originalUrl}`
    );
    logger.info(`Target URL: ${process.env.IDENTITY_SERVICE_URL}`);
    next();
  },
  proxy(process.env.IDENTITY_SERVICE_URL, {
    proxyReqPathResolver: (req) => {
      const newPath = req.originalUrl.replace(/^\/v1\/auth/, "/api/auth");
      logger.info(`Path transformation: ${req.originalUrl} -> ${newPath}`);
      return newPath;
    },
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      logger.info(
        `Proxy request headers: ${JSON.stringify(proxyReqOpts.headers)}`
      );
      proxyReqOpts.headers["Content-Type"] = "application/json";
      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(`Identity Service response: ${proxyRes.statusCode}`);
      logger.info(`Response data: ${proxyResData.toString("utf8")}`);
      return proxyResData;
    },
    proxyErrorHandler: (err, res, next) => {
      logger.error("Identity Service proxy error: %o", err);
      logger.error(
        "Error details - Message: %s, Code: %s",
        err.message,
        err.code
      );
      res.status(502).json({
        success: false,
        message: "Identity Service unavailable",
        error: err.message,
        code: err.code,
      });
    },
  })
);

// Post Service Proxy
app.use(
  "/v1/posts",
  validateToken,
  (req, res, next) => {
    logger.info(`Proxying to Post Service: ${req.method} ${req.originalUrl}`);
    logger.info(`Target URL: ${process.env.POST_SERVICE_URL}`);
    logger.info(`User ID from token: ${req.user?.userId}`);
    next();
  },
  proxy(process.env.POST_SERVICE_URL, {
    proxyReqPathResolver: (req) => {
      const newPath = req.originalUrl.replace(/^\/v1\/posts/, "/api/posts");
      logger.info(`Path transformation: ${req.originalUrl} -> ${newPath}`);
      return newPath;
    },
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      logger.info(
        `Proxy request headers: ${JSON.stringify(proxyReqOpts.headers)}`
      );
      proxyReqOpts.headers["Content-Type"] = "application/json";
      if (srcReq.user?.userId) {
        proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
      }
      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(`Post Service response: ${proxyRes.statusCode}`);
      logger.info(`Response data: ${proxyResData.toString("utf8")}`);
      return proxyResData;
    },
    proxyErrorHandler: (err, res, next) => {
      logger.error("Post Service proxy error: %o", err);
      logger.error(
        "Error details - Message: %s, Code: %s",
        err.message,
        err.code
      );
      res.status(502).json({
        success: false,
        message: "Post Service unavailable",
        error: err.message,
        code: err.code,
      });
    },
  })
);

// 404 handler
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// Error handler
app.use(errHandler);

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info(`Identity Service URL: ${process.env.IDENTITY_SERVICE_URL}`);
  logger.info(`Post Service URL: ${process.env.POST_SERVICE_URL}`);
  logger.info(`Redis URL: ${process.env.REDIS_URL}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at: %o, reason: %o", promise, reason);
});
