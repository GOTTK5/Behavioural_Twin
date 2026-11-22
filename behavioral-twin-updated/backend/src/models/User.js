const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  email:  { type: String, required: true, unique: true },
  password: { type: String },

  // Profile
  age:    { type: Number },
  weight: { type: Number }, // kg
  gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
  timezone: { type: String, default: 'Asia/Kolkata' },

  // Google Fit OAuth
  googleAccessToken:  { type: String },
  googleRefreshToken: { type: String },
  googleConnected:    { type: Boolean, default: false },

  // Weekly psychology test tracking
  lastPsychTestDate: { type: Date },

  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);
