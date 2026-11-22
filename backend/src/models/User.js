const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, maxlength: 100 },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },

  // Profile
  age:      { type: Number, min: 1, max: 120 },
  weight:   { type: Number, min: 1, max: 500 }, // kg
  gender:   { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
  timezone: { type: String, default: 'Asia/Kolkata' }, // IANA name, e.g. "Asia/Kolkata"

  // Google Fit OAuth — never returned to the client
  googleAccessToken:  { type: String, select: false },
  googleRefreshToken: { type: String, select: false },
  googleConnected:    { type: Boolean, default: false },

  lastPsychTestDate: { type: Date },
  createdAt:         { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

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
    googleConnected: this.googleConnected,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
