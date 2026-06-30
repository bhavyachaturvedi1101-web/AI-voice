// ─── AI Voice Agent — Server Entry Point ─────────────────────────────────────
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const callRoutes = require('./routes/call');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for Twilio webhooks
app.use(express.static(path.join(__dirname, 'public'))); // Dashboard + audio files

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/call', callRoutes);
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── MongoDB Connection ───────────────────────────────────────────────────────
async function connectDB() {
  try {
    mongoose.set('bufferCommands', false);
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-voice-agent');
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('⚠️  Running without database — call logs will not persist.');
  }
}

// ─── Start Server ─────────────────────────────────────────────────────────────
async function start() {
  connectDB(); // Run in background, do not block server startup

  app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║        🤖  AI Voice Agent  Started!          ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Local:    http://localhost:${PORT}             ║`);
    console.log(`║  Dashboard: http://localhost:${PORT}            ║`);
    console.log('║                                              ║');
    console.log('║  Next: Run ngrok to get public URL          ║');
    console.log('║  > npx ngrok http 3000                      ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');

    if (!process.env.BASE_URL || process.env.BASE_URL.includes('your-ngrok-url')) {
      console.warn('⚠️  BASE_URL not set in .env — set it to your ngrok URL!');
    }
    if (!process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID.includes('xxx')) {
      console.warn('⚠️  TWILIO credentials not configured in .env');
    }
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.includes('xxx')) {
      console.warn('⚠️  GROQ_API_KEY not configured — get a free key at console.groq.com');
    } else {
      console.log('✅ Groq AI ready');
    }
  });
}

start();
