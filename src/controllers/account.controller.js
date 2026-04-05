const accountModel = require("../models/account.model");
const mongoose = require("mongoose");

async function createAccountController(req, res) {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({
        message: "Unauthorized access",
      });
    }

    const account = await accountModel.create({
      user: user._id,
    });

    return res.status(201).json({
      account,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create account",
    });
  }
}

async function getUserAccountsController(req, res) {
  try {
    const accounts = await accountModel.find({ user: req.user._id });

    return res.status(200).json({
      accounts,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch accounts",
    });
  }
}

async function getAccountBalanceController(req, res) {
  try {
    const { accountId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({
        message: "accountId must be a valid account ID",
      });
    }

    const account = await accountModel.findOne({
      _id: accountId,
      user: req.user._id,
    });

    if (!account) {
      return res.status(404).json({
        message: "Account not found",
      });
    }
    const balance = await account.getBalance();

    return res.status(200).json({
      accountId: account._id,
      balance: balance,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch account balance",
    });
  }
}

module.exports = {
  createAccountController,
  getUserAccountsController,
  getAccountBalanceController,
};
