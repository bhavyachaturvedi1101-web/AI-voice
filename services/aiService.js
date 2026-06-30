// ─── AI Service — Groq (LLaMA 3, free) ──────────────────────────────────────
const Groq = require('groq-sdk');

// Lazy init — avoids crash on startup if key isn't set yet
let _groq = null;
function getClient() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set. Get a free key at console.groq.com');
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

const SYSTEM_PROMPTS = {
  en: `${process.env.AGENT_SYSTEM_PROMPT || 'You are Aria, a friendly and helpful AI voice assistant.'}
Always respond in English. Keep responses short (2-3 sentences max) and natural for voice conversation.
Do not use markdown, bullet points, or special formatting — plain speech only.`,

  hi: `${process.env.AGENT_SYSTEM_PROMPT || 'You are Aria, a friendly and helpful AI voice assistant.'}
हमेशा हिंदी में जवाब दें। अपने जवाब छोटे रखें (2-3 वाक्य) और आवाज़ की बातचीत के लिए स्वाभाविक।
कोई markdown, bullet points या special formatting मत use करें — सिर्फ सादी बोलचाल की भाषा।`,
};

async function getAIResponse(messages, language = 'en') {
  const systemPrompt = SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.en;

  const response = await getClient().chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama3-8b-8192',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    max_tokens: 150,
    temperature: 0.7,
  });

  return response.choices[0].message.content.trim();
}

module.exports = { getAIResponse };
