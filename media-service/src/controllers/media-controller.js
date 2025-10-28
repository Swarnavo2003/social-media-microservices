const Media = require("../models/media.model");
const { uploadMediaToClodinary } = require("../utils/cloudinary");
const logger = require("../utils/logger");

const uploadMedia = async (req, res) => {
  logger.info("Strating media upload process");
  try {
    if (!req.file) {
      logger.warn("No file provided in the request");
      return res
        .status(400)
        .json({ message: "No file provided", success: false });
    }

    const { originalName, mimeType, buffer } = req.file;
    const userId = req.user.userId;

    logger.info(`File details - Name: ${originalname}, Type: ${mimeType}`);
    logger.info("Uploading to cloudinary starting");

    const cloudinaryUploadResult = await uploadMediaToClodinary(req.file);
    logger.info(
      "Clodinary upload successful, Public ID: %s",
      cloudinaryUploadResult.public_id
    );

    const newlyCreatedMedia = new Media({
      publicId: cloudinaryUploadResult.public_id,
      originalName,
      mimeType,
      url: cloudinaryUploadResult.secure_url,
      userId: userId,
    });
    await newlyCreatedMedia.save();

    logger.info(
      "Media metadata saved to database, Media ID: %s",
      newlyCreatedMedia._id
    );
    res.status(201).json({
      message: "Media uploaded successfully",
      mediaId: newlyCreatedMedia._id,
      url: newlyCreatedMedia.url,
      success: true,
    });
  } catch (error) {
    logger.error("Media upload failed:", error);
    res
      .status(500)
      .json({ message: "Media upload failed", error: error.message });
  }
};

module.exports = {
  uploadMedia,
};
