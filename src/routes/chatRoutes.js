import { Router } from 'express';
import { AIService } from '../services/aiService.js';
import { validateChatPayload } from '../middleware/validator.js';
import { chatRateLimiter } from '../middleware/rateLimiter.js';

export const chatRouter = Router();

/**
 * POST /api/chat
 * Streams AI response using Server-Sent Events (SSE) or returns JSON if stream=false.
 */
chatRouter.post('/chat', chatRateLimiter, validateChatPayload, async (req, res, next) => {
  const { messages, temperature, systemPrompt } = req.body;
  const isStream = req.query.stream !== 'false';

  // Create an AbortController linked to client disconnection
  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  if (isStream) {
    // Configure SSE streaming headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (Nginx, etc.)
    res.flushHeaders?.();

    try {
      for await (const chunk of AIService.streamChat({
        messages,
        temperature,
        systemPrompt,
        signal: abortController.signal
      })) {
        if (abortController.signal.aborted) {
          break;
        }
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }

      if (!abortController.signal.aborted) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      }
      res.end();
    } catch (err) {
      if (abortController.signal.aborted) {
        return; // Normal abort on client disconnect / stop
      }
      console.error('[Chat Stream Error]:', err.message);
      if (!res.headersSent) {
        return next(err);
      }
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  } else {
    // Non-streaming fallback for testing or simple clients
    try {
      let fullText = '';
      for await (const chunk of AIService.streamChat({
        messages,
        temperature,
        systemPrompt,
        signal: abortController.signal
      })) {
        fullText += chunk;
      }
      res.json({
        message: {
          role: 'assistant',
          content: fullText
        }
      });
    } catch (err) {
      next(err);
    }
  }
});

/**
 * POST /api/title-gen
 * Generates a clean conversation title from the initial user prompt.
 */
chatRouter.post('/title-gen', async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing message string' });
  }

  try {
    const title = await AIService.generateTitle(message);
    res.json({ title });
  } catch (err) {
    res.json({ title: 'New Conversation' });
  }
});
