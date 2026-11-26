const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, maxlength: 100 },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },

  // Profile
  age:      { type: Number, min: 1, max: 120 },
  weight:   { type: Number, min: 1, max: 500 },
  gender:   { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
  timezone: { type: String, default: 'Asia/Kolkata' }, // IANA name, e.g. "Asia/Kolkata"

  // Password reset (only a hash of the emailed token is stored)
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpires:   { type: Date, select: false },
  // Sessions (JWTs) issued before this moment are rejected — set on password change/reset
  passwordChangedAt:      { type: Date },

  lastPsychTestDate: { type: Date },
  createdAt:         { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

// True if a session token was issued before the last password change.
userSchema.methods.tokenIssuedBeforePasswordChange = function (iatSeconds) {
  if (!this.passwordChangedAt) return false;
  return iatSeconds * 1000 < this.passwordChangedAt.getTime() - 1000;
};

userSchema.methods.matchPassword = function (entered) {
  if (!this.password || typeof entered !== 'string') return false;
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    age: this.age,
    weight: this.weight,
    gender: this.gender,
    timezone: this.timezone,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
