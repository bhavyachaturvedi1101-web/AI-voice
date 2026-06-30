// ─── API Routes — Dashboard Data ─────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const Call = require('../models/Call');

// GET /api/token — generate Twilio Access Token for browser calling
router.get('/token', (req, res) => {
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity: 'browser-user', ttl: 3600 }
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    incomingAllow: false,
  });

  token.addGrant(voiceGrant);
  res.json({ token: token.toJwt() });
});

// GET /api/calls — list all calls (most recent first)
router.get('/calls', async (req, res) => {
  try {
    const calls = await Call.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .select('-__v');
    res.json({ success: true, calls });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/calls/:id — single call with full transcript
router.get('/calls/:id', async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ success: false, error: 'Call not found' });
    res.json({ success: true, call });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stats — aggregate statistics
router.get('/stats', async (req, res) => {
  try {
    const [total, completed, hindi, english, avgDuration] = await Promise.all([
      Call.countDocuments(),
      Call.countDocuments({ status: 'completed' }),
      Call.countDocuments({ language: 'hi' }),
      Call.countDocuments({ language: 'en' }),
      Call.aggregate([
        { $match: { duration: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$duration' } } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        completed,
        inProgress: total - completed,
        hindi,
        english,
        avgDuration: Math.round(avgDuration[0]?.avg || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
