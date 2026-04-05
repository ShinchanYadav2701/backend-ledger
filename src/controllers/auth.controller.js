const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const emailService = require("../services/email.service");
const tokenBlackListModel = require("../models/blackList.model");

const TOKEN_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_MAX_AGE_MS,
  });
}

function getTokenFromRequest(req) {
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : undefined;
  return req.cookies?.token || bearerToken;
}

/**
 * - user register controller
 * - POST /api/auth/register
 */
async function userRegisterController(req, res) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        message: "email, password and name are required",
      });
    }

    const isExists = await userModel.findOne({
      email: email,
    });

    if (isExists) {
      return res.status(422).json({
        message: "User already exists with email.",
        status: "failed",
      });
    }

    const user = await userModel.create({
      email,
      password,
      name,
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });

    setAuthCookie(res, token);

    res.status(201).json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
      token,
    });

    emailService.sendRegistrationEmail(user.email, user.name).catch(() => {});
  } catch (error) {
    return res.status(500).json({
      message: "Registration failed",
    });
  }
}

/**
 * - User Login Controller
 * - POST /api/auth/login
 *
 */
async function userLoginController(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required",
      });
    }

    const user = await userModel
      .findOne({ email })
      .select("+password email name systemUser");

    if (!user) {
      return res.status(401).json({
        message: "Email or password is INVALID",
      });
    }
    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      return res.status(401).json({
        message: "Email or password is INVALID",
      });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });

    setAuthCookie(res, token);

    return res.status(200).json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
      token,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Login failed",
    });
  }
}

/**
 * - User Logout Controller
 * - POST /api/auth/logout
 */
async function userLogoutController(req, res) {
  try {
    const token = getTokenFromRequest(req);

    res.clearCookie("token", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    if (!token) {
      return res.status(200).json({
        message: "User logged out successfully",
      });
    }

    await tokenBlackListModel.create({
      token: token,
    });

    return res.status(200).json({
      message: "User logged out successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Logout failed",
    });
  }
}
module.exports = {
  userRegisterController,
  userLoginController,
  userLogoutController,
};
