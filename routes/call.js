// ─── Call Routes — Twilio Webhooks ───────────────────────────────────────────
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { getAIResponse } = require('../services/aiService');
const { textToSpeech } = require('../services/ttsService');
const Call = require('../models/Call');

const VoiceResponse = twilio.twiml.VoiceResponse;

// In-memory session store: callSid → { language, messages, callerNumber }
const callSessions = new Map();

// Helper — DB operations are optional; never crash if MongoDB is down
async function dbUpdate(query, update, opts = {}) {
  try { await Call.findOneAndUpdate(query, update, opts); } catch (_) {}
}
async function dbPush(callSid, entry) {
  try { await Call.findOneAndUpdate({ callSid }, { $push: { transcript: entry } }); } catch (_) {}
}

// ─── Greeting messages ────────────────────────────────────────────────────────
const GREETING = {
  en: `Hello! I'm Aria, your AI assistant. How can I help you today?`,
  hi: `नमस्ते! मैं Aria हूँ, आपकी AI असिस्टेंट। आज मैं आपकी कैसे मदद कर सकती हूँ?`,
};
const NO_INPUT = {
  en: `I didn't catch that. Could you please repeat?`,
  hi: `मुझे समझ नहीं आया। क्या आप फिर से बोल सकते हैं?`,
};
const GOODBYE = {
  en: `Thank you for calling. Goodbye, and have a wonderful day!`,
  hi: `कॉल करने के लिए धन्यवाद। अलविदा, आपका दिन शुभ रहे!`,
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /call/voice — Twilio calls this when a call comes in
// ─────────────────────────────────────────────────────────────────────────────
router.post('/voice', async (req, res) => {
  const callSid = req.body.CallSid;
  const callerNumber = req.body.From || 'Unknown';
  console.log(`📞 Incoming call: ${callerNumber} [SID: ${callSid}]`);

  callSessions.set(callSid, {
    language: null, messages: [], callerNumber, startTime: new Date(),
  });

  await dbUpdate({ callSid }, { callSid, callerNumber, status: 'in-progress', startTime: new Date() }, { upsert: true, new: true });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({ numDigits: '1', action: '/call/language', method: 'POST', timeout: 10 });
  gather.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'Welcome! Press 1 for English. Hindi ke liye 2 dabayen.');
  twiml.redirect({ method: 'POST' }, '/call/language');

  res.type('text/xml');
  res.send(twiml.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /call/language — handles key press for language selection
// ─────────────────────────────────────────────────────────────────────────────
router.post('/language', async (req, res) => {
  const callSid = req.body.CallSid;
  const digit = req.body.Digits;
  const session = callSessions.get(callSid);

  const language = digit === '2' ? 'hi' : 'en';
  if (session) session.language = language;
  await dbUpdate({ callSid }, { language });
  console.log(`🌐 Language: ${language === 'hi' ? 'Hindi' : 'English'} [${callSid}]`);

  let audioPath;
  try { audioPath = await textToSpeech(GREETING[language], language); } catch (err) { console.error('TTS:', err.message); }

  const twiml = new VoiceResponse();

  if (audioPath) {
    twiml.play(`${process.env.BASE_URL}${audioPath}`);
  } else {
    const voice = language === 'hi' ? 'Polly.Aditi' : 'Polly.Joanna';
    const twilioLang = language === 'hi' ? 'hi-IN' : 'en-US';
    twiml.say({ voice, language: twilioLang }, GREETING[language]);
  }

  twiml.redirect({ method: 'POST' }, '/call/listen');
  res.type('text/xml');
  res.send(twiml.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /call/listen — gather speech from caller
// ─────────────────────────────────────────────────────────────────────────────
router.post('/listen', (req, res) => {
  const callSid = req.body.CallSid;
  const session = callSessions.get(callSid);
  const language = session?.language || 'en';

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech', action: '/call/respond', method: 'POST',
    language: language === 'hi' ? 'hi-IN' : 'en-US',
    speechTimeout: 'auto', timeout: 8, enhanced: true,
  });
  gather.pause({ length: 1 });
  twiml.redirect({ method: 'POST' }, '/call/silence');

  res.type('text/xml');
  res.send(twiml.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /call/respond — process speech and respond with AI
// ─────────────────────────────────────────────────────────────────────────────
router.post('/respond', async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult;
  const confidence = parseFloat(req.body.Confidence || '0');
  const session = callSessions.get(callSid);
  const language = session?.language || 'en';
  const twiml = new VoiceResponse();

  if (!speechResult || confidence < 0.3) {
    let audioPath;
    try { audioPath = await textToSpeech(NO_INPUT[language], language); } catch (_) {}
    if (audioPath) twiml.play(`${process.env.BASE_URL}${audioPath}`);
    else {
      const voice = language === 'hi' ? 'Polly.Aditi' : 'Polly.Joanna';
      const twilioLang = language === 'hi' ? 'hi-IN' : 'en-US';
      twiml.say({ voice, language: twilioLang }, NO_INPUT[language]);
    }
    twiml.redirect({ method: 'POST' }, '/call/listen');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  console.log(`🗣️  Caller said: "${speechResult}" [${callSid}]`);
  if (session) session.messages.push({ role: 'user', content: speechResult });
  await dbPush(callSid, { role: 'user', content: speechResult, timestamp: new Date() });

  // Check goodbye
  const goodbyeWords = ['bye', 'goodbye', 'thank you bye', 'alvida', 'band karo', 'ok bye', 'धन्यवाद', 'अलविदा'];
  if (goodbyeWords.some(w => speechResult.toLowerCase().includes(w.toLowerCase()))) {
    let audioPath;
    try { audioPath = await textToSpeech(GOODBYE[language], language); } catch (_) {}
    if (audioPath) twiml.play(`${process.env.BASE_URL}${audioPath}`);
    else {
      const voice = language === 'hi' ? 'Polly.Aditi' : 'Polly.Joanna';
      const twilioLang = language === 'hi' ? 'hi-IN' : 'en-US';
      twiml.say({ voice, language: twilioLang }, GOODBYE[language]);
    }
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // AI response
  let aiText = '';
  try {
    aiText = await getAIResponse(session?.messages || [], language);
  } catch (err) {
    console.error('AI Error:', err.message);
    aiText = language === 'hi'
      ? 'माफ़ कीजिए, कोई समस्या हो रही है। क्या आप फिर से पूछ सकते हैं?'
      : 'I apologize, I encountered an issue. Could you please ask again?';
  }

  console.log(`🤖 Aria: "${aiText}" [${callSid}]`);
  if (session) session.messages.push({ role: 'assistant', content: aiText });
  await dbPush(callSid, { role: 'assistant', content: aiText, timestamp: new Date() });

  let audioPath;
  try { audioPath = await textToSpeech(aiText, language); } catch (err) { console.error('TTS:', err.message); }

  if (audioPath) {
    twiml.play(`${process.env.BASE_URL}${audioPath}`);
  } else {
    const voice = language === 'hi' ? 'Polly.Aditi' : 'Polly.Joanna';
    const twilioLang = language === 'hi' ? 'hi-IN' : 'en-US';
    twiml.say({ voice, language: twilioLang }, aiText);
  }

  twiml.redirect({ method: 'POST' }, '/call/listen');
  res.type('text/xml');
  res.send(twiml.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /call/silence
// ─────────────────────────────────────────────────────────────────────────────
router.post('/silence', async (req, res) => {
  const callSid = req.body.CallSid;
  const session = callSessions.get(callSid);
  const language = session?.language || 'en';
  const twiml = new VoiceResponse();

  let audioPath;
  try { audioPath = await textToSpeech(NO_INPUT[language], language); } catch (_) {}
  if (audioPath) twiml.play(`${process.env.BASE_URL}${audioPath}`);
  else {
    const voice = language === 'hi' ? 'Polly.Aditi' : 'Polly.Joanna';
    const twilioLang = language === 'hi' ? 'hi-IN' : 'en-US';
    twiml.say({ voice, language: twilioLang }, NO_INPUT[language]);
  }
  twiml.redirect({ method: 'POST' }, '/call/listen');

  res.type('text/xml');
  res.send(twiml.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /call/recording-status
// ─────────────────────────────────────────────────────────────────────────────
router.post('/recording-status', async (req, res) => {
  const { CallSid: callSid, RecordingUrl: recordingUrl, RecordingSid: recordingSid, RecordingDuration } = req.body;
  const duration = parseInt(RecordingDuration || '0', 10);
  console.log(`🎙️  Recording ready [${callSid}]: ${recordingUrl}`);
  await dbUpdate({ callSid }, { recordingUrl: `${recordingUrl}.mp3`, recordingSid, duration, status: 'completed', endTime: new Date() });
  callSessions.delete(callSid);
  res.sendStatus(200);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /call/status
// ─────────────────────────────────────────────────────────────────────────────
router.post('/status', async (req, res) => {
  const { CallSid: callSid, CallStatus: callStatus, CallDuration } = req.body;
  const duration = parseInt(CallDuration || '0', 10);
  console.log(`📊 Call status: ${callStatus} [${callSid}]`);
  if (['completed', 'failed', 'busy', 'no-answer'].includes(callStatus)) {
    await dbUpdate({ callSid }, { status: callStatus === 'completed' ? 'completed' : 'failed', duration, endTime: new Date() });
    callSessions.delete(callSid);
  }
  res.sendStatus(200);
});

module.exports = router;
