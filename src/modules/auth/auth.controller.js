const config = require("../../config");
const authService = require("./auth.service");

const loginUser = async (req, res) => {
  try {
    const result = await authService.loginUser(req.body);

    if (result?.message === "Please verify your email" && result.accessToken) {
      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          accessToken: result.accessToken,
        },
      });
    }

    const { refreshToken, accessToken, user } = result;

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: config.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "User logged in successfully",
      data: {
        accessToken,
        user,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: 400,
      message: error.message,
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken)
      return res.status(401).json({
        success: false,
        code: 401,
        message: "No refresh token provided",
      });

    const data = await authService.LoginRefreshToken(refreshToken);
    res.status(200).json({
      success: true,
      code: 200,
      message: "Access token refreshed successfully",
      data,
    });
  } catch (err) {
    res.status(401).json({ success: false, code: 401, message: err.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);

    return res.status(200).json({
      success: true,
      code: 200,
      message: "OTP sent to your email",
      data: result,
    });
  } catch (error) {
    return res
      .status(400)
      .json({ success: false, code: 400, message: error.message });
  }
};

const verifyToken = async (req, res) => {
  try {
    const { otp } = req.body;
    const { email } = req.user;
    const result = await authService.verifyToken(otp, email);

    return res.status(200).json({
      success: true,
      code: 200,
      message: "OTP verified successfully",
      data: result,
    });
  } catch (error) {
    return res
      .status(400)
      .json({ success: false, code: 400, message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email } = req.user;
    const result = await authService.resetPassword(req.body, email);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { email } = req.user;
    const result = await authService.changePassword(req.body, email);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const toggleTwoFactorAuthentication = async (req, res) => {
  try {
    const { email } = req.user;
    const result = await authService.toggleTwoFactorAuthentication(email);

    return res.status(200).json({
      success: true,
      message: "Two-factor authentication toggled successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const authController = {
  loginUser,
  refreshToken,
  forgotPassword,
  verifyToken,
  resetPassword,
  changePassword,
  toggleTwoFactorAuthentication,
};

module.exports = authController;
