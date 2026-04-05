const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const accountModel = require("../models/account.model");
const emailService = require("../services/email.service");
const mongoose = require("mongoose");

/**
 * - Create a new transaction
 *  THE 10-STEP TRANSFER FLOW:
 *      * 1. Validate request
 *      * 2. validate idempotency key
 *      * 3. Check account status
 *      * 4. Derive sender balance from ledger
 *      * 5. Create transaction (PENDING)
 *      * 6. Create DEBIT ledger entry
 *      * 7. Create CREDIT ledger entry
 *      * 8. Mark Transaction COMPLETED
 *      * 9. Commit MongoDB session
 *      * 10. Send email notification
 */

async function createTransaction(req, res) {
  /**
   * 1. Validate request
   */
  const { fromAccount, toAccount, amount, idempotencyKey } = req.body;
  const normalizedAmount = Number(amount);

  if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
    return res.status(400).json({
      message: "fromAccount, toAccount, amount and idempotencyKey are required",
    });
  }

  if (
    !mongoose.Types.ObjectId.isValid(fromAccount) ||
    !mongoose.Types.ObjectId.isValid(toAccount)
  ) {
    return res.status(400).json({
      message: "fromAccount and toAccount must be valid account IDs",
    });
  }

  if (fromAccount === toAccount) {
    return res.status(400).json({
      message: "fromAccount and toAccount cannot be same",
    });
  }

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return res.status(400).json({
      message: "amount must be a positive number",
    });
  }

  /**
   * 2. Validate idempotency key
   */
  const isTransactionAlreadyExists = await transactionModel.findOne({
    idempotencyKey: idempotencyKey,
  });

  if (isTransactionAlreadyExists) {
    if (isTransactionAlreadyExists.status === "COMPLETED") {
      return res.status(200).json({
        message: "Transaction already processed",
        transaction: isTransactionAlreadyExists,
      });
    }

    if (isTransactionAlreadyExists.status === "PENDING") {
      return res.status(200).json({
        message: "Transaction is still processing",
      });
    }

    if (isTransactionAlreadyExists.status === "FAILED") {
      return res.status(500).json({
        message: "Transaction processing failed, please retry",
      });
    }

    if (isTransactionAlreadyExists.status === "REVERSED") {
      return res.status(500).json({
        message: "Transaction was reversed, please retry",
      });
    }
  }

  const fromUserAccount = await accountModel.findOne({
    _id: fromAccount,
    user: req.user._id,
  });
  const toUserAccount = await accountModel.findById(toAccount);

  if (!fromUserAccount || !toUserAccount) {
    return res.status(400).json({
      message: "Invalid fromAccount or toAccount",
    });
  }

  /**
   * 3. Check account status
   */
  if (
    fromUserAccount.status !== "ACTIVE" ||
    toUserAccount.status !== "ACTIVE"
  ) {
    return res.status(400).json({
      message: "Both accounts must be active to perform a transaction",
    });
  }

  /**
   * 4. Derive sender balance from ledger
   */
  const balance = await fromUserAccount.getBalance();
  if (balance < normalizedAmount) {
    return res.status(400).json({
      message: `Insufficient balance. Current balance is ${balance}. Request amount is ${normalizedAmount}`,
    });
  }

  /**
   * 5. Create transaction (PENDING)
   */
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const transaction = new transactionModel({
      fromAccount,
      toAccount,
      amount: normalizedAmount,
      idempotencyKey,
      status: "PENDING",
    });
    await transaction.save({ session });

    /**
     * 6. Create DEBIT ledger entry
     */
    await ledgerModel.create(
      [
        {
          account: fromAccount,
          amount: normalizedAmount,
          transaction: transaction._id,
          type: "DEBIT",
        },
      ],
      { session },
    );

    /**
     * 7. Create CREDIT ledger entry
     */
    await ledgerModel.create(
      [
        {
          account: toAccount,
          amount: normalizedAmount,
          transaction: transaction._id,
          type: "CREDIT",
        },
      ],
      { session },
    );

    /**
     * 8. Mark Transaction COMPLETED
     */
    transaction.status = "COMPLETED";
    await transaction.save({ session });

    /**
     * 9. Commit MongoDB session
     */
    await session.commitTransaction();

    /**
     * 10. Send email notification
     */
    await emailService.sendTransactionEmail(
      req.user.email,
      req.user.name,
      normalizedAmount,
      toAccount,
    );

    return res.status(201).json({
      message: "Transaction Completed Successfully",
      transaction: transaction,
    });
  } catch (error) {
    await session.abortTransaction();
    if (error?.code === 11000) {
      const existing = await transactionModel.findOne({ idempotencyKey });
      if (existing) {
        return res.status(200).json({
          message: "Transaction already processed",
          transaction: existing,
        });
      }
    }
    return res.status(500).json({
      message: "Transaction processing failed",
    });
  } finally {
    await session.endSession();
  }
}

async function createInitialFundsTransaction(req, res) {
  const { toAccount, amount, idempotencyKey } = req.body;
  const normalizedAmount = Number(amount);

  if (!toAccount || !amount || !idempotencyKey) {
    return res.status(400).json({
      message: "toAccount, amount and idempotencyKey are required",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(toAccount)) {
    return res.status(400).json({
      message: "toAccount must be a valid account ID",
    });
  }

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return res.status(400).json({
      message: "amount must be a positive number",
    });
  }

  const isTransactionAlreadyExists = await transactionModel.findOne({
    idempotencyKey: idempotencyKey,
  });

  if (isTransactionAlreadyExists) {
    return res.status(200).json({
      message: "Transaction already processed",
      transaction: isTransactionAlreadyExists,
    });
  }

  const toUserAccount = await accountModel.findById(toAccount);
  if (!toUserAccount) {
    return res.status(400).json({
      message: "Invalid toAccount",
    });
  }

  const fromUserAccount = await accountModel.findOne({
    user: req.user._id,
  });

  if (!fromUserAccount) {
    return res.status(400).json({
      message: "System user account not found",
    });
  }

  if (
    fromUserAccount.status !== "ACTIVE" ||
    toUserAccount.status !== "ACTIVE"
  ) {
    return res.status(400).json({
      message: "Both accounts must be active to perform a transaction",
    });
  }

  const balance = await fromUserAccount.getBalance();
  if (balance < normalizedAmount) {
    return res.status(400).json({
      message: "System user has insufficient balance",
    });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const transaction = new transactionModel({
      fromAccount: fromUserAccount._id,
      toAccount,
      amount: normalizedAmount,
      idempotencyKey,
      status: "PENDING",
    });
    await transaction.save({ session });

    await ledgerModel.create(
      [
        {
          account: fromUserAccount._id,
          amount: normalizedAmount,
          transaction: transaction._id,
          type: "DEBIT",
        },
      ],
      { session },
    );

    await ledgerModel.create(
      [
        {
          account: toAccount,
          amount: normalizedAmount,
          transaction: transaction._id,
          type: "CREDIT",
        },
      ],
      { session },
    );

    transaction.status = "COMPLETED";
    await transaction.save({ session });

    await session.commitTransaction();

    return res.status(201).json({
      message: "Initial funds transaction completed Successfully",
      transaction: transaction,
    });
  } catch (error) {
    await session.abortTransaction();
    if (error?.code === 11000) {
      const existing = await transactionModel.findOne({ idempotencyKey });
      if (existing) {
        return res.status(200).json({
          message: "Transaction already processed",
          transaction: existing,
        });
      }
    }
    return res.status(500).json({
      message: "Initial funds transaction failed",
    });
  } finally {
    await session.endSession();
  }
}

module.exports = {
  createTransaction,
  createInitialFundsTransaction,
};
