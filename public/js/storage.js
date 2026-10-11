/**
 * ClearMind AI - Storage Strategy & State Manager
 * Client-side browser persistence with clear user indicators.
 */

const STORAGE_KEY = 'clearmind_conversations_v1';
const SETTINGS_KEY = 'clearmind_settings_v1';

const CHATGPT_CLIENT_PROMPT = 'You are ChatGPT, an intelligent, articulate, and helpful AI assistant. Provide answers in authentic ChatGPT format: direct, natural explanations, clear Markdown headings, bullet points, numbered steps, comparison tables, and annotated code blocks.';

export class StorageManager {
  static getSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Seamlessly migrate legacy system instructions to ChatGPT persona
        if (!parsed.systemPrompt || parsed.systemPrompt.includes('ClearMind AI') || parsed.systemPrompt.includes('elite, highly articulate')) {
          parsed.systemPrompt = CHATGPT_CLIENT_PROMPT;
          StorageManager.saveSettings(parsed);
        }
        return parsed;
      }
    } catch (err) {
      console.warn('[StorageManager] Error reading settings:', err);
    }
    return {
      theme: 'light',
      temperature: 0.7,
      systemPrompt: CHATGPT_CLIENT_PROMPT,
      storageStrategy: 'client' // 'client' or 'server'
    };
  }

  static saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.warn('[StorageManager] Error saving settings:', err);
    }
  }

  static getConversations() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const list = JSON.parse(data);
        return Array.isArray(list) ? list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)) : [];
      }
    } catch (err) {
      console.warn('[StorageManager] Error reading conversations:', err);
    }
    return [];
  }

  static saveConversations(conversations) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (err) {
      console.warn('[StorageManager] Storage quota exceeded or storage unavailable:', err);
    }
  }

  static getConversation(id) {
    const list = StorageManager.getConversations();
    return list.find((c) => c.id === id) || null;
  }

  static saveConversation(conversation) {
    const list = StorageManager.getConversations();
    const index = list.findIndex((c) => c.id === conversation.id);
    const now = new Date().toISOString();

    const record = {
      ...conversation,
      updatedAt: now,
      createdAt: conversation.createdAt || now
    };

    if (index >= 0) {
      list[index] = record;
    } else {
      list.unshift(record);
    }

    StorageManager.saveConversations(list);
    return record;
  }

  static deleteConversation(id) {
    const list = StorageManager.getConversations();
    const filtered = list.filter((c) => c.id !== id);
    StorageManager.saveConversations(filtered);
    return filtered;
  }

  static clearAllConversations() {
    StorageManager.saveConversations([]);
  }

  static search(query) {
    const cleanQuery = (query || '').trim().toLowerCase();
    if (!cleanQuery) return StorageManager.getConversations();

    const list = StorageManager.getConversations();
    return list.filter((c) => {
      // Match title
      if (c.title?.toLowerCase().includes(cleanQuery)) return true;
      // Match any message content
      if (Array.isArray(c.messages)) {
        return c.messages.some((m) => m.content?.toLowerCase().includes(cleanQuery));
      }
      return false;
    });
  }

  static createNewConversation(initialTitle = 'New Conversation') {
    const now = new Date().toISOString();
    const newConv = {
      id: 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: initialTitle,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    return StorageManager.saveConversation(newConv);
  }

  static exportAsJSON() {
    const data = StorageManager.getConversations();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clearmind-chat-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
