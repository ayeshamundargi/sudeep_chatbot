import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'conversations.json');

/**
 * Server-side conversation storage service.
 * Used when STORAGE_STRATEGY=server or for server-synchronized profiles.
 */
export class StorageService {
  static async ensureDataDir() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      try {
        await fs.access(DB_FILE);
      } catch {
        await fs.writeFile(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('[StorageService] Error ensuring data directory:', err.message);
    }
  }

  static async readAll() {
    await StorageService.ensureDataDir();
    try {
      const data = await fs.readFile(DB_FILE, 'utf-8');
      return JSON.parse(data || '[]');
    } catch {
      return [];
    }
  }

  static async writeAll(conversations) {
    await StorageService.ensureDataDir();
    await fs.writeFile(DB_FILE, JSON.stringify(conversations, null, 2), 'utf-8');
  }

  static async listConversations() {
    const list = await StorageService.readAll();
    // Return sorted by updatedAt desc, omitting full messages for fast sidebar listing
    return list
      .map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messages?.length || 0,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  static async getConversation(id) {
    const list = await StorageService.readAll();
    return list.find((c) => c.id === id) || null;
  }

  static async saveConversation(conversation) {
    const list = await StorageService.readAll();
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

    await StorageService.writeAll(list);
    return record;
  }

  static async deleteConversation(id) {
    const list = await StorageService.readAll();
    const filtered = list.filter((c) => c.id !== id);
    const deleted = filtered.length < list.length;
    if (deleted) {
      await StorageService.writeAll(filtered);
    }
    return deleted;
  }

  static async clearAll() {
    await StorageService.writeAll([]);
    return true;
  }
}
