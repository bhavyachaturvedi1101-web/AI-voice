// ─── Call Model — MongoDB Schema ─────────────────────────────────────────────
const mongoose = require('mongoose');

const TranscriptEntrySchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const CallSchema = new mongoose.Schema(
  {
    callSid: { type: String, required: true, unique: true, index: true },
    callerNumber: { type: String, default: 'Unknown' },
    language: { type: String, enum: ['en', 'hi', null], default: null },
    status: {
      type: String,
      enum: ['in-progress', 'completed', 'failed'],
      default: 'in-progress',
    },
    duration: { type: Number, default: 0 }, // seconds
    recordingUrl: { type: String, default: null },
    recordingSid: { type: String, default: null },
    transcript: [TranscriptEntrySchema],
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
  },
  { timestamps: true }
);

// Virtual: language label
CallSchema.virtual('languageLabel').get(function () {
  return this.language === 'hi' ? 'Hindi' : 'English';
});

// Virtual: formatted duration
CallSchema.virtual('durationFormatted').get(function () {
  const m = Math.floor(this.duration / 60);
  const s = this.duration % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
});

CallSchema.set('toJSON', { virtuals: true });
CallSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Call', CallSchema);
