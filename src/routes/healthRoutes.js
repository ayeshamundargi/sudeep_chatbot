import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';
import { config, getSafeProviderStatus } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../../.env');

export const healthRouter = Router();

healthRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

healthRouter.get('/config', (req, res) => {
  const status = getSafeProviderStatus();
  res.json(status);
});

healthRouter.post('/config', (req, res) => {
  const { provider, apiKey, model } = req.body || {};

  if (provider && ['gemini', 'openai', 'groq', 'ollama'].includes(provider)) {
    config.provider = provider;
  }

  if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
    const key = apiKey.trim();
    if (config.provider === 'gemini') {
      config.gemini.apiKey = key;
      if (model) config.gemini.model = model;
    } else if (config.provider === 'openai') {
      config.openai.apiKey = key;
      if (model) config.openai.model = model;
    } else if (config.provider === 'groq') {
      config.groq.apiKey = key;
      if (model) config.groq.model = model;
    }

    // Persist to .env safely
    try {
      let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
      const keyVar = config.provider === 'gemini' ? 'GEMINI_API_KEY' : config.provider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY';
      if (envContent.includes(`${keyVar}=`)) {
        envContent = envContent.replace(new RegExp(`${keyVar}=.*`), `${keyVar}=${key}`);
      } else {
        envContent += `\n${keyVar}=${key}\n`;
      }
      if (provider) {
        if (envContent.includes('AI_PROVIDER=')) {
          envContent = envContent.replace(/AI_PROVIDER=.*/, `AI_PROVIDER=${config.provider}`);
        } else {
          envContent += `\nAI_PROVIDER=${config.provider}\n`;
        }
      }
      fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
    } catch (err) {
      console.warn('[Config] Could not persist to .env:', err.message);
    }
  }

  const status = getSafeProviderStatus();
  res.json({ success: true, status });
});
