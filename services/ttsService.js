// ─── TTS Service — returns null to use Twilio Polly voices (free) ────────────
// No OpenAI needed. Twilio's <Say> with Polly.Aditi handles Hindi + English.

async function textToSpeech(text, language = 'en') {
  // Return null — call.js will use twiml.say() with Polly voice instead
  return null;
}

module.exports = { textToSpeech };
