const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      // Changed from `require` -> `required` so Mongoose validation works.
      required: [true, "Email is required for creating a user"],
      trim: true,
      // Changed from `lowerCase` -> `lowercase` (correct Mongoose option).
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        "Invalid Email address",
      ],
      unique: [true, "Email already exists."],
    },
    name: {
      type: String,
      required: [true, "Name is required for creating an account"],
    },
    password: {
      type: String,
      // Changed from `require` -> `required` so password is enforced.
      required: [true, "Password is required for creating an account"],
      minlength: [6, "password should be contain more than 6 character"],
      select: false,
    },
    systemUser: {
      type: Boolean,
      default: false,
      immutable: true,
      select: false,
    },
  },
  // Changed from `timestamp` -> `timestamps` to auto-add createdAt/updatedAt.
  { timestamps: true },
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const hash = await bcryptjs.hash(this.password, 10);
  this.password = hash;

  return;
});

userSchema.methods.comparePassword = async function (password) {
  return await bcryptjs.compare(password, this.password);
};

const userModel = mongoose.model("user", userSchema);

module.exports = userModel;
