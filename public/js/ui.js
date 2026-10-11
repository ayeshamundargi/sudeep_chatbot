import { icons } from './icons.js';
import { renderMarkdown } from './markdown.js';

export class UIRenderer {
  /**
   * Renders the welcome screen with prompt cards.
   */
  static renderWelcomeScreen(container, onSelectPrompt) {
    container.innerHTML = `
      <div class="welcome-container">
        <div class="welcome-badge">
          ${icons.logo(14)}
          <span>ClearMind AI</span>
        </div>
        <h1 class="welcome-title">What would you like help with?</h1>
        <p class="welcome-subtitle">
          Ask questions, debug code, analyze documents, or organize projects with a clean, focused AI assistant.
        </p>

        <div class="prompt-grid">
          <div class="prompt-card" data-prompt="Explain a difficult concept in computer science with an intuitive mental model">
            <div class="prompt-card-header">
              <span class="prompt-card-title">Explain a difficult concept</span>
              <span class="prompt-card-icon">${icons.arrowRight(14)}</span>
            </div>
            <span class="prompt-card-desc">Break down a complex idea into intuitive, step-by-step mental models.</span>
          </div>

          <div class="prompt-card" data-prompt="Help me debug a programming problem: how to isolate memory leaks and unhandled exceptions">
            <div class="prompt-card-header">
              <span class="prompt-card-title">Help me debug code</span>
              <span class="prompt-card-icon">${icons.arrowRight(14)}</span>
            </div>
            <span class="prompt-card-desc">Isolate unexpected errors, inspect stack traces, and implement defensive fixes.</span>
          </div>

          <div class="prompt-card" data-prompt="Summarize a document: what are the key components of an architectural decision record?">
            <div class="prompt-card-header">
              <span class="prompt-card-title">Summarize a document</span>
              <span class="prompt-card-icon">${icons.arrowRight(14)}</span>
            </div>
            <span class="prompt-card-desc">Extract primary findings, actionable takeaways, and critical risks.</span>
          </div>

          <div class="prompt-card" data-prompt="Help me plan a project: milestone roadmap for building a full-stack web application">
            <div class="prompt-card-header">
              <span class="prompt-card-title">Help me plan a project</span>
              <span class="prompt-card-icon">${icons.arrowRight(14)}</span>
            </div>
            <span class="prompt-card-desc">Establish phased milestones, work breakdown structures, and execution timelines.</span>
          </div>
        </div>
      </div>
    `;

    // Attach click listeners to cards
    const cards = container.querySelectorAll('.prompt-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const promptText = card.getAttribute('data-prompt');
        if (onSelectPrompt) onSelectPrompt(promptText);
      });
    });
  }

  /**
   * Renders the sidebar conversations list.
   */
  static renderConversationList(container, conversations, activeId, { onSelect, onRename, onDelete }) {
    if (!conversations || conversations.length === 0) {
      container.innerHTML = `
        <div class="empty-conversations-state">
          No conversations yet.<br>Start a new chat to begin.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <ul class="conversation-list">
        ${conversations
          .map((c) => {
            const isActive = c.id === activeId;
            return `
              <li class="conversation-item ${isActive ? 'active' : ''}" data-id="${c.id}">
                <div class="conv-item-left">
                  <span class="conv-item-icon">${icons.chat(14)}</span>
                  <span class="conv-item-title" title="${c.title}">${c.title || 'Untitled Chat'}</span>
                </div>
                <div class="conv-item-actions">
                  <button type="button" class="conv-action-btn rename-btn" data-id="${c.id}" title="Rename conversation" aria-label="Rename conversation">
                    ${icons.edit(13)}
                  </button>
                  <button type="button" class="conv-action-btn delete-btn" data-id="${c.id}" title="Delete conversation" aria-label="Delete conversation">
                    ${icons.trash(13)}
                  </button>
                </div>
              </li>
            `;
          })
          .join('')}
      </ul>
    `;

    // Listeners
    container.querySelectorAll('.conversation-item').forEach((item) => {
      const id = item.getAttribute('data-id');
      item.addEventListener('click', (e) => {
        if (e.target.closest('.rename-btn') || e.target.closest('.delete-btn')) return;
        if (onSelect) onSelect(id);
      });
    });

    container.querySelectorAll('.rename-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (onRename) onRename(id);
      });
    });

    container.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (onDelete) onDelete(id);
      });
    });
  }

  /**
   * Renders full message thread in the conversation area.
   */
  static renderMessages(container, messages, { onRegenerate, onRetry }) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'messages-container';

    messages.forEach((msg, index) => {
      const isUser = msg.role === 'user';
      const isLastAssistant = !isUser && index === messages.length - 1;

      const node = document.createElement('div');
      node.className = `message-node ${isUser ? 'user' : 'assistant'}`;
      node.setAttribute('data-index', index);

      if (isUser) {
        node.innerHTML = `
          <div class="message-box">${UIRenderer.escapeHtml(msg.content)}</div>
        `;
      } else {
        node.innerHTML = `
          <div class="message-header">
            <div class="assistant-avatar">${icons.logo(12)}</div>
            <span class="assistant-label">ChatGPT</span>
          </div>
          <div class="message-box markdown-body">${renderMarkdown(msg.content)}</div>
          <div class="message-actions">
            <button type="button" class="msg-action-btn copy-msg-btn" data-content="${encodeURIComponent(msg.content)}" title="Copy response">
              ${icons.copy(12)}
              <span>Copy</span>
            </button>
            ${
              isLastAssistant
                ? `
              <button type="button" class="msg-action-btn regen-btn" title="Regenerate answer">
                ${icons.regenerate(12)}
                <span>Regenerate</span>
              </button>
            `
                : ''
            }
          </div>
        `;
      }

      wrapper.appendChild(node);
    });

    container.appendChild(wrapper);
    UIRenderer.attachMessageActionListeners(container, { onRegenerate });
  }

  /**
   * Appends a newly created message element dynamically.
   */
  static appendMessageNode(container, message) {
    let wrapper = container.querySelector('.messages-container');
    if (!wrapper) {
      container.innerHTML = '';
      wrapper = document.createElement('div');
      wrapper.className = 'messages-container';
      container.appendChild(wrapper);
    }

    const isUser = message.role === 'user';
    const node = document.createElement('div');
    node.className = `message-node ${isUser ? 'user' : 'assistant'}`;
    node.id = message.id || 'msg_' + Date.now();

    if (isUser) {
      node.innerHTML = `<div class="message-box">${UIRenderer.escapeHtml(message.content)}</div>`;
    } else {
      node.innerHTML = `
        <div class="message-header">
          <div class="assistant-avatar">${icons.logo(12)}</div>
          <span class="assistant-label">ChatGPT</span>
        </div>
        <div class="message-box markdown-body">${renderMarkdown(message.content)}</div>
        <div class="message-actions">
          <button type="button" class="msg-action-btn copy-msg-btn" data-content="${encodeURIComponent(message.content)}" title="Copy response">
            ${icons.copy(12)}
            <span>Copy</span>
          </button>
        </div>
      `;
    }

    wrapper.appendChild(node);
    UIRenderer.scrollToBottom();
    return node;
  }

  /**
   * Updates streaming message content in real time.
   */
  static updateStreamingNode(node, text) {
    if (!node) return;
    const box = node.querySelector('.message-box');
    if (box) {
      box.innerHTML = renderMarkdown(text) + `<span class="streaming-indicator"></span>`;
    }
    const copyBtn = node.querySelector('.copy-msg-btn');
    if (copyBtn) {
      copyBtn.setAttribute('data-content', encodeURIComponent(text));
    }
  }

  /**
   * Finalizes streaming message by removing blinking indicator and adding actions.
   */
  static finalizeStreamingNode(node, text, onRegenerate) {
    if (!node) return;
    const box = node.querySelector('.message-box');
    if (box) {
      box.innerHTML = renderMarkdown(text);
    }
    const actions = node.querySelector('.message-actions');
    if (actions && onRegenerate) {
      // Add regenerate button if not present
      if (!actions.querySelector('.regen-btn')) {
        const regenBtn = document.createElement('button');
        regenBtn.type = 'button';
        regenBtn.className = 'msg-action-btn regen-btn';
        regenBtn.title = 'Regenerate answer';
        regenBtn.innerHTML = `${icons.regenerate(12)} <span>Regenerate</span>`;
        regenBtn.addEventListener('click', onRegenerate);
        actions.appendChild(regenBtn);
      }
    }
    UIRenderer.attachMessageActionListeners(node.parentElement, { onRegenerate });
  }

  /**
   * Attaches clipboard copy actions to messages and code blocks.
   */
  static attachMessageActionListeners(scope, { onRegenerate }) {
    if (!scope) return;

    // Copy response buttons
    scope.querySelectorAll('.copy-msg-btn').forEach((btn) => {
      btn.onclick = async () => {
        const raw = decodeURIComponent(btn.getAttribute('data-content') || '');
        await navigator.clipboard.writeText(raw);
        btn.classList.add('copied');
        btn.innerHTML = `${icons.check(12)} <span>Copied</span>`;
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = `${icons.copy(12)} <span>Copy</span>`;
        }, 2000);
      };
    });

    // Copy code snippet buttons
    scope.querySelectorAll('.code-copy-btn').forEach((btn) => {
      btn.onclick = async () => {
        const raw = decodeURIComponent(btn.getAttribute('data-code') || '');
        await navigator.clipboard.writeText(raw);
        btn.classList.add('copied');
        const label = btn.querySelector('.code-copy-label');
        if (label) label.textContent = 'Copied!';
        setTimeout(() => {
          btn.classList.remove('copied');
          if (label) label.textContent = 'Copy';
        }, 2000);
      };
    });

    // Regenerate buttons
    if (onRegenerate) {
      scope.querySelectorAll('.regen-btn').forEach((btn) => {
        btn.onclick = () => onRegenerate();
      });
    }
  }

  /**
   * Renders error banner with a retry button.
   */
  static renderErrorBanner(container, errorMessage, onRetry) {
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.innerHTML = `
      <div class="error-banner-content">
        ${icons.alertTriangle(16)}
        <span>${UIRenderer.escapeHtml(errorMessage)}</span>
      </div>
      <button type="button" class="error-banner-btn retry-btn">Retry</button>
    `;

    banner.querySelector('.retry-btn').addEventListener('click', () => {
      banner.remove();
      if (onRetry) onRetry();
    });

    container.appendChild(banner);
    UIRenderer.scrollToBottom();
  }

  static scrollToBottom() {
    const area = document.querySelector('.chat-scroll-area');
    if (area) {
      area.scrollTop = area.scrollHeight;
    }
  }

  static escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
