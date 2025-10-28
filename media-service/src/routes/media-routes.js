const express = require("express");
const multer = require("multer");

const { uploadMedia } = require("../controllers/media-controller");
const { authenticateRequest } = require("../middleware/authMiddleware");
const logger = require("../utils/logger");

const router = express.Router();

// configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB limit
  },
}).single("file");

router.post(
  "/upload",
  authenticateRequest,
  (req, res, next) => {
    upload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        logger.error("Multer error during file upload:", err);
        return res
          .status(400)
          .json({ message: err.message, success: false, stack: err.stack });
      } else if (err) {
        logger.error("Unknown error during file upload:", err);
        return res.status(500).json({
          message: "File upload failed",
          success: false,
          stack: err.stack,
        });
      }
      if (!req.file) {
        logger.warn("No file provided in the upload request");
        return res
          .status(400)
          .json({ message: "No file provided", success: false });
      }
      next();
    });
  },
  uploadMedia
);

module.exports = router;
