import { Router } from 'express';
import { StorageService } from '../services/storageService.js';
import { generalRateLimiter } from '../middleware/rateLimiter.js';

export const convRouter = Router();

convRouter.use(generalRateLimiter);

// List conversations
convRouter.get('/conversations', async (req, res, next) => {
  try {
    const list = await StorageService.listConversations();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// Get single conversation with full message history
convRouter.get('/conversations/:id', async (req, res, next) => {
  try {
    const conv = await StorageService.getConversation(req.params.id);
    if (!conv) {
      return res.status(404).json({ error: { message: 'Conversation not found' } });
    }
    res.json(conv);
  } catch (err) {
    next(err);
  }
});

// Save or create conversation
convRouter.post('/conversations', async (req, res, next) => {
  try {
    const { id, title, messages, createdAt } = req.body || {};
    if (!id || !title || !Array.isArray(messages)) {
      return res.status(400).json({ error: { message: 'Invalid conversation payload' } });
    }

    const saved = await StorageService.saveConversation({
      id,
      title,
      messages,
      createdAt
    });
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

// Update conversation (title or messages)
convRouter.put('/conversations/:id', async (req, res, next) => {
  try {
    const existing = await StorageService.getConversation(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Conversation not found' } });
    }

    const updated = await StorageService.saveConversation({
      ...existing,
      ...req.body,
      id: req.params.id
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete single conversation
convRouter.delete('/conversations/:id', async (req, res, next) => {
  try {
    const deleted = await StorageService.deleteConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Conversation not found' } });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

// Clear all conversations
convRouter.delete('/conversations', async (req, res, next) => {
  try {
    await StorageService.clearAll();
    res.json({ success: true, message: 'All conversations cleared' });
  } catch (err) {
    next(err);
  }
});
