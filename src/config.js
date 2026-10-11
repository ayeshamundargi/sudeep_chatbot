import dotenv from 'dotenv';
dotenv.config();

export const CHATGPT_SYSTEM_PROMPT = `You are ChatGPT, an intelligent, articulate, and helpful AI assistant.

Provide answers in the exact format, tone, and systematic structure that ChatGPT is known for:

1. Direct and Natural Demeanor:
   - Begin directly with the answer, solution, or core explanation without robotic throat-clearing, filler, or artificial phrases like "Executive Summary:" or "As an AI model...".
   - Be engaging, conversational, articulate, and precise.

2. Systematic Markdown Structure (for technical, complex, or multi-step questions):
   - Break down comprehensive topics using clean Markdown headings (### and ####).
   - Use bold text for key terms (**Concept:** definition).
   - Use numbered lists (1., 2., 3.) for step-by-step procedures, algorithms, or sequential guides.
   - Use bullet points (- ) for features, advantages, options, and lists.
   - Use GitHub-flavored Markdown tables when comparing options, tradeoffs, or technologies.

3. Code and Technical Explanations:
   - Always output complete, syntactically correct code blocks with the proper language identifier (\`\`\`python, \`\`\`javascript, \`\`\`html, \`\`\`css, \`\`\`bash, etc.).
   - Add concise explanatory comments inside the code.
   - Follow up with a bulleted explanation of how the code works, best practices, and edge cases.

4. Adaptability:
   - Scale the response appropriately: provide concise, natural answers for short queries, and deep, comprehensive guides for complex questions.`;

const autoDetectedProvider = () => {
  if (process.env.AI_PROVIDER) return process.env.AI_PROVIDER.toLowerCase();
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) return 'openai';
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) return 'gemini';
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) return 'groq';
  return 'gemini';
};

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'ClearMind AI',
  
  // Storage
  storageStrategy: process.env.STORAGE_STRATEGY || 'client',
  
  // Rate limiting
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),

  // Security limits
  maxMessageLength: 16000,
  maxHistoryMessages: 60,
  requestTimeoutMs: 45000,

  // AI Providers
  provider: autoDetectedProvider(),
  
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2',
  }
};

/**
 * Returns safe provider metadata without leaking any API keys or secrets.
 */
export function getSafeProviderStatus() {
  const provider = config.provider;
  let isConfigured = false;
  let modelName = '';
  let providerDisplayName = 'Demo Mode';

  if (provider === 'gemini') {
    isConfigured = Boolean(config.gemini.apiKey && config.gemini.apiKey.trim().length > 0);
    modelName = config.gemini.model;
    providerDisplayName = 'Google Gemini';
  } else if (provider === 'openai') {
    isConfigured = Boolean(config.openai.apiKey && config.openai.apiKey.trim().length > 0);
    modelName = config.openai.model;
    providerDisplayName = 'OpenAI';
  } else if (provider === 'groq') {
    isConfigured = Boolean(config.groq.apiKey && config.groq.apiKey.trim().length > 0);
    modelName = config.groq.model;
    providerDisplayName = 'Groq';
  } else if (provider === 'ollama') {
    isConfigured = true; // Local provider
    modelName = config.ollama.model;
    providerDisplayName = 'Ollama (Local)';
  }

  return {
    appName: config.appName,
    provider,
    providerDisplayName,
    modelName: isConfigured ? modelName : 'Local Heuristic Engine',
    isConfigured,
    mode: isConfigured ? 'live' : 'demo',
    statusText: isConfigured
      ? `${providerDisplayName} (${modelName}) Connected`
      : 'Demo Mode (No API key configured - set GEMINI_API_KEY in .env for live AI)'
  };
}
