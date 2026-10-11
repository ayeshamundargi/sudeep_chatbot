import { config } from '../config.js';

/**
 * Validates incoming chat requests for valid schema, content length, and history depth.
 */
export function validateChatPayload(req, res, next) {
  const { messages, temperature, systemPrompt } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Request body must include a "messages" array.'
      }
    });
  }

  if (messages.length === 0) {
    return res.status(400).json({
      error: {
        code: 'EMPTY_MESSAGES',
        message: 'Messages array cannot be empty.'
      }
    });
  }

  if (messages.length > config.maxHistoryMessages) {
    return res.status(400).json({
      error: {
        code: 'HISTORY_TOO_LONG',
        message: `History exceeds the maximum allowed limit of ${config.maxHistoryMessages} messages.`
      }
    });
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') {
      return res.status(400).json({
        error: {
          code: 'INVALID_MESSAGE_OBJECT',
          message: `Message at index ${i} must be a valid object.`
        }
      });
    }

    if (!['user', 'assistant', 'system'].includes(m.role)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ROLE',
          message: `Message at index ${i} has invalid role "${m.role}". Role must be user, assistant, or system.`
        }
      });
    }

    if (typeof m.content !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: `Message at index ${i} content must be a string.`
        }
      });
    }

    if (m.content.length > config.maxMessageLength) {
      return res.status(400).json({
        error: {
          code: 'MESSAGE_TOO_LONG',
          message: `Message at index ${i} exceeds maximum allowed length of ${config.maxMessageLength} characters.`
        }
      });
    }
  }

  if (temperature !== undefined) {
    const tempNum = Number(temperature);
    if (isNaN(tempNum) || tempNum < 0 || tempNum > 2) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TEMPERATURE',
          message: 'Temperature must be a number between 0.0 and 2.0.'
        }
      });
    }
    req.body.temperature = tempNum;
  }

  if (systemPrompt !== undefined && typeof systemPrompt !== 'string') {
    return res.status(400).json({
      error: {
        code: 'INVALID_SYSTEM_PROMPT',
        message: 'systemPrompt must be a string if provided.'
      }
    });
  }

  next();
}
