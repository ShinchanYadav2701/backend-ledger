const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const tokenBlackListModel = require("../models/blackList.model");

function getTokenFromRequest(req) {
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : undefined;
  return req.cookies?.token || bearerToken;
}

async function authMiddleware(req, res, next) {
  if (!req || !res || typeof next !== "function") {
    throw new Error(
      "authMiddleware must be used as Express middleware: router.METHOD(path, authMiddleware, handler)",
    );
  }

  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access, token is missing",
      });
    }

    const isBlacklisted = await tokenBlackListModel.findOne({ token });
    if (isBlacklisted) {
      return res.status(401).json({
        message: "Unauthorized access, token is invalid",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await userModel.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        message: "Unauthorized access, user not found",
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({
      message: "Unauthorized access, token is invalid",
    });
  }
}

async function authSystemUserMiddleware(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access, token is missing",
      });
    }

    const isBlacklisted = await tokenBlackListModel.findOne({ token });
    if (isBlacklisted) {
      return res.status(401).json({
        message: "Unauthorized access, token is invalid",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await userModel.findById(decoded.userId).select("systemUser");
    if (!user) {
      return res.status(401).json({
        message: "Unauthorized access, user not found",
      });
    }
    if (!user.systemUser) {
      return res.status(403).json({
        message: "Forbidden access, not a system user",
      });
    }
    req.user = user;

    return next();
  } catch (err) {
    return res.status(401).json({
      message: "Unauthorized access, token is invalid",
    });
  }
}

module.exports = { authMiddleware, authSystemUserMiddleware };
