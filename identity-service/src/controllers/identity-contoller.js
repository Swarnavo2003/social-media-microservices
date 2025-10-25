const RefreshToken = require("../models/refreshToken.model");
const User = require("../models/user.model");
const generateToken = require("../utils/generateToken");
const logger = require("../utils/logger");
const { validateRegistration, validateLogin } = require("../utils/validation");

const registerUser = async (req, res) => {
  logger.info("Registration endpoint hit");
  try {
    const { error } = validateRegistration(req.body);
    if (error) {
      logger.warn(
        "Validation error during registration: %s",
        error.details[0].message
      );
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }
    const { username, email, password } = req.body;

    let user = await User.findOne({ $or: [{ username }, { email }] });
    if (user) {
      logger.warn(
        "User already exists with username: %s or email: %s",
        username,
        email
      );
      return res
        .status(409)
        .json({ success: false, message: "Username or email already in use" });
    }

    user = new User({ username, email, password });
    await user.save();
    logger.info("User saved successfully: %s", user._id);

    const { accessToken, refreshToken } = await generateToken(user);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      accessToken,
      refreshToken,
    });
  } catch (e) {
    logger.error("Error during user registration: %o", e);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const loginUser = async (req, res) => {
  logger.info("Login endpoint hit");
  try {
    const { error } = validateLogin(req.body);
    if (error) {
      logger.warn(
        "Validation error during login: %s",
        error.details[0].message
      );
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      logger.warn("No user found with email: %s", email);
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // valid password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      logger.warn("Invalid password");
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const { accessToken, refreshToken } = await generateToken(user);
    return res.status(200).json({
      userId: user._id,
      accessToken,
      refreshToken,
    });
  } catch (e) {
    logger.error("Error during user login: %o", e);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const refreshToken = async (req, res) => {
  logger.info("Refresh token endpoint hit");
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      logger.warn("Refresh token not provided");
      return res
        .status(400)
        .json({ success: false, message: "Refresh token is required" });
    }

    const storedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      logger.warn("Invalid or expired refresh token");
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired refresh token" });
    }

    const user = await User.findById(storedToken.user);
    if (!user) {
      logger.warn("User not found for the provided refresh token");
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      await generateToken(user);

    // delete old refresh token
    await RefreshToken.deleteOne({ _id: storedToken._id });

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (e) {
    logger.error("Error during token refresh: %o", e);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const logoutUser = async (req, res) => {
  logger.info("Logout endpoint hit");
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      logger.warn("Refresh token not provided for logout");
      return res
        .status(400)
        .json({ success: false, message: "Refresh token is required" });
    }

    await RefreshToken.deleteOne({ token: refreshToken });
    logger.info("Refresh token deleted successfully");

    return res
      .status(200)
      .json({ success: true, message: "User logged out successfully" });
  } catch (e) {
    logger.error("Error during user logout: %o", e);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = { registerUser, loginUser, refreshToken, logoutUser };
