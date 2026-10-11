/**
 * ClearMind AI - API Client
 * Handles real-time SSE streaming, graceful cancellation, and health checks.
 */

export class APIClient {
  static async getConfig() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      return await res.json();
    } catch (err) {
      console.warn('[APIClient] Could not fetch server config:', err.message);
      return {
        appName: 'ClearMind AI',
        mode: 'demo',
        isConfigured: false,
        statusText: 'Connecting to server...'
      };
    }
  }

  static async updateConfig({ provider, apiKey, model }) {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, model })
      });
      if (!res.ok) throw new Error('Failed to update server configuration');
      return await res.json();
    } catch (err) {
      console.error('[APIClient] Error updating config:', err);
      throw err;
    }
  }

  static async generateTitle(firstMessage) {
    try {
      const res = await fetch('/api/title-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: firstMessage })
      });
      if (res.ok) {
        const data = await res.json();
        return data.title || 'New Conversation';
      }
    } catch (err) {
      console.warn('[APIClient] Failed to generate title:', err.message);
    }
    return 'New Conversation';
  }

  /**
   * Streams chat completion via Server-Sent Events with AbortSignal support.
   */
  static async streamChat({ messages, temperature, systemPrompt, signal, onChunk, onDone, onError }) {
    let response;
    try {
      response = await fetch('/api/chat?stream=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({
          messages,
          temperature,
          systemPrompt
        }),
        signal
      });
    } catch (err) {
      if (signal?.aborted) return;
      onError(new Error(`Network connection failure: ${err.message}`));
      return;
    }

    if (!response.ok) {
      let errMessage = `Server returned status ${response.status}`;
      try {
        const errJson = await response.json();
        errMessage = errJson.error?.message || errMessage;
      } catch {
        // Fallback to text
      }
      onError(new Error(errMessage));
      return;
    }

    if (!response.body) {
      onError(new Error('ReadableStream not supported by browser or empty body returned.'));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);
            if (data.error) {
              onError(new Error(data.error));
              return;
            }
            if (data.chunk) {
              onChunk(data.chunk);
            }
            if (data.done) {
              onDone();
              return;
            }
          } catch {
            // Incomplete or non-json chunk
          }
        }
      }

      onDone();
    } catch (err) {
      if (signal?.aborted) {
        // User aborted intentionally via Stop button
        return;
      }
      onError(err);
    } finally {
      reader.releaseLock();
    }
  }
}
