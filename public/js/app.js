import { APIClient } from './api.js';
import { StorageManager } from './storage.js';
import { UIRenderer } from './ui.js';
import { icons } from './icons.js';

class ClearMindApp {
  constructor() {
    this.conversations = [];
    this.activeConversation = null;
    this.serverConfig = null;
    this.settings = StorageManager.getSettings();
    this.isGenerating = false;
    this.currentAbortController = null;

    // DOM references
    this.elements = {
      appContainer: document.getElementById('appContainer'),
      sidebar: document.getElementById('sidebar'),
      sidebarBackdrop: document.getElementById('sidebarBackdrop'),
      sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
      sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),
      headerThemeBtn: document.getElementById('headerThemeBtn'),
      newChatBtn: document.getElementById('newChatBtn'),
      headerNewChatBtn: document.getElementById('headerNewChatBtn'),
      searchInput: document.getElementById('searchInput'),
      searchClearBtn: document.getElementById('searchClearBtn'),
      conversationListContainer: document.getElementById('conversationListContainer'),
      currentConvTitle: document.getElementById('currentConvTitle'),
      statusBadge: document.getElementById('statusBadge'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      chatContentContainer: document.getElementById('chatContentContainer'),
      composerTextarea: document.getElementById('composerTextarea'),
      composerSendBtn: document.getElementById('composerSendBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      privacyBtn: document.getElementById('privacyBtn'),
      clearAllBtn: document.getElementById('clearAllBtn'),

      // Modals
      settingsModal: document.getElementById('settingsModal'),
      privacyModal: document.getElementById('privacyModal'),
      renameModal: document.getElementById('renameModal'),
      confirmModal: document.getElementById('confirmModal')
    };
  }

  async init() {
    this.bindEvents();
    this.bindKeyboardShortcuts();
    this.applyTheme(this.settings.theme);
    this.initResponsiveLayout();
    this.conversations = StorageManager.getConversations();

    // Populate initial conversation view
    if (this.conversations.length > 0) {
      this.selectConversation(this.conversations[0].id);
    } else {
      this.showWelcomeScreen();
    }
    this.renderSidebar();

    // Fetch safe server configuration asynchronously
    try {
      this.serverConfig = await APIClient.getConfig();
      this.updateStatusBadge();
    } catch (err) {
      console.warn('[ClearMind] Config error:', err);
    }
  }

  initResponsiveLayout() {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      const isCollapsed = localStorage.getItem('clearmind_sidebar_collapsed') === 'true';
      if (isCollapsed) {
        this.elements.sidebar.classList.add('collapsed');
      }
    }
    window.addEventListener('resize', () => this.handleWindowResize());
    this.updateThemeButtonIcon();
  }

  handleWindowResize() {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      this.closeMobileSidebar();
      const isCollapsed = localStorage.getItem('clearmind_sidebar_collapsed') === 'true';
      this.elements.sidebar.classList.toggle('collapsed', isCollapsed);
    } else {
      this.elements.sidebar.classList.remove('collapsed');
    }
  }

  toggleSidebar() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const isOpen = this.elements.sidebar.classList.toggle('open');
      this.elements.sidebarBackdrop.classList.toggle('active', isOpen);
      this.elements.sidebarToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    } else {
      const isCollapsed = this.elements.sidebar.classList.toggle('collapsed');
      localStorage.setItem('clearmind_sidebar_collapsed', isCollapsed ? 'true' : 'false');
      this.elements.sidebarToggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    }
  }

  closeMobileSidebar() {
    this.elements.sidebar.classList.remove('open');
    this.elements.sidebarBackdrop.classList.remove('active');
    this.elements.sidebarToggleBtn.setAttribute('aria-expanded', 'false');
  }

  toggleTheme() {
    const nextTheme = this.settings.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = nextTheme;
  }

  updateThemeButtonIcon() {
    if (!this.elements.headerThemeBtn) return;
    const isDark = this.settings.theme === 'dark';
    this.elements.headerThemeBtn.innerHTML = isDark ? icons.sun(16) : icons.moon(16);
    this.elements.headerThemeBtn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    this.elements.headerThemeBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.settings.theme = theme;
    StorageManager.saveSettings(this.settings);
    this.updateThemeButtonIcon();
  }

  updateStatusBadge() {
    const { statusBadge, statusText } = this.elements;
    if (!this.serverConfig) return;

    if (this.serverConfig.mode === 'live') {
      statusBadge.className = 'status-badge live';
      statusText.textContent = `${this.serverConfig.providerDisplayName} Connected`;
      statusBadge.title = `Active Model: ${this.serverConfig.modelName}`;
    } else {
      statusBadge.className = 'status-badge demo';
      statusText.textContent = 'Demo Mode';
      statusBadge.title = 'Demo Mode (No API key configured in .env - using local heuristic engine)';
    }
  }

  renderSidebar() {
    const query = this.elements.searchInput.value;
    const filtered = StorageManager.search(query);

    UIRenderer.renderConversationList(
      this.elements.conversationListContainer,
      filtered,
      this.activeConversation ? this.activeConversation.id : null,
      {
        onSelect: (id) => this.selectConversation(id),
        onRename: (id) => this.promptRename(id),
        onDelete: (id) => this.deleteConversation(id)
      }
    );
  }

  showWelcomeScreen() {
    this.activeConversation = null;
    this.elements.currentConvTitle.textContent = 'New Conversation';
    UIRenderer.renderWelcomeScreen(this.elements.chatContentContainer, (promptText) => {
      this.elements.composerTextarea.value = promptText;
      this.adjustComposerHeight();
      this.handleSendMessage();
    });
    this.renderSidebar();
    this.closeMobileSidebar();
  }

  selectConversation(id) {
    if (this.isGenerating) {
      this.stopGenerating();
    }

    const conv = StorageManager.getConversation(id);
    if (!conv) {
      this.showWelcomeScreen();
      return;
    }

    this.activeConversation = conv;
    this.elements.currentConvTitle.textContent = conv.title || 'Untitled Chat';

    if (!conv.messages || conv.messages.length === 0) {
      this.showWelcomeScreen();
    } else {
      UIRenderer.renderMessages(this.elements.chatContentContainer, conv.messages, {
        onRegenerate: () => this.regenerateLastResponse()
      });
      UIRenderer.scrollToBottom();
    }

    this.renderSidebar();
    this.closeMobileSidebar();
  }

  async handleSendMessage() {
    if (this.isGenerating) {
      this.stopGenerating();
      return;
    }

    const content = this.elements.composerTextarea.value.trim();
    if (!content) return;

    // Reset textarea
    this.elements.composerTextarea.value = '';
    this.adjustComposerHeight();

    // Ensure active conversation
    let isNewConv = false;
    if (!this.activeConversation) {
      this.activeConversation = StorageManager.createNewConversation('New Conversation');
      isNewConv = true;
    }

    // Add user message
    const userMsg = {
      id: 'msg_user_' + Date.now(),
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    this.activeConversation.messages.push(userMsg);
    StorageManager.saveConversation(this.activeConversation);

    // If first message in conversation, clear welcome screen and generate title
    if (this.activeConversation.messages.length === 1) {
      this.elements.chatContentContainer.innerHTML = '';
      APIClient.generateTitle(content).then((title) => {
        if (this.activeConversation) {
          this.activeConversation.title = title;
          this.elements.currentConvTitle.textContent = title;
          StorageManager.saveConversation(this.activeConversation);
          this.renderSidebar();
        }
      });
    }

    // Append user node to chat
    UIRenderer.appendMessageNode(this.elements.chatContentContainer, userMsg);

    // Prepare assistant streaming node
    const assistantMsg = {
      id: 'msg_ast_' + Date.now(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };
    const assistantNode = UIRenderer.appendMessageNode(this.elements.chatContentContainer, assistantMsg);

    // Start streaming execution
    this.startStreamingResponse(assistantNode, assistantMsg);
  }

  startStreamingResponse(assistantNode, assistantMsg) {
    this.isGenerating = true;
    this.currentAbortController = new AbortController();
    this.updateComposerButtonState(true);

    let accumulatedContent = '';

    APIClient.streamChat({
      messages: this.activeConversation.messages,
      temperature: this.settings.temperature,
      systemPrompt: this.settings.systemPrompt,
      signal: this.currentAbortController.signal,
      onChunk: (chunk) => {
        accumulatedContent += chunk;
        assistantMsg.content = accumulatedContent;
        UIRenderer.updateStreamingNode(assistantNode, accumulatedContent);
        UIRenderer.scrollToBottom();
      },
      onDone: () => {
        this.isGenerating = false;
        this.currentAbortController = null;
        this.updateComposerButtonState(false);

        if (accumulatedContent.trim().length > 0) {
          this.activeConversation.messages.push(assistantMsg);
          StorageManager.saveConversation(this.activeConversation);
        }

        UIRenderer.finalizeStreamingNode(assistantNode, accumulatedContent, () => {
          this.regenerateLastResponse();
        });
        this.renderSidebar();
      },
      onError: (err) => {
        this.isGenerating = false;
        this.currentAbortController = null;
        this.updateComposerButtonState(false);

        // Remove incomplete empty assistant node if no chunks received
        if (!accumulatedContent.trim()) {
          assistantNode.remove();
        } else {
          this.activeConversation.messages.push(assistantMsg);
          StorageManager.saveConversation(this.activeConversation);
          UIRenderer.finalizeStreamingNode(assistantNode, accumulatedContent);
        }

        // Display retryable error banner
        UIRenderer.renderErrorBanner(
          this.elements.chatContentContainer,
          err.message || 'Error communicating with AI service.',
          () => this.retryLastMessage()
        );
      }
    });
  }

  stopGenerating() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.isGenerating = false;
    this.updateComposerButtonState(false);
  }

  regenerateLastResponse() {
    if (this.isGenerating || !this.activeConversation || this.activeConversation.messages.length === 0) return;

    const messages = this.activeConversation.messages;
    const last = messages[messages.length - 1];

    if (last.role === 'assistant') {
      messages.pop(); // Remove previous assistant reply
      StorageManager.saveConversation(this.activeConversation);
    }

    // Re-render UI messages without the last assistant reply
    UIRenderer.renderMessages(this.elements.chatContentContainer, this.activeConversation.messages, {
      onRegenerate: () => this.regenerateLastResponse()
    });

    // Create new assistant node and stream
    const assistantMsg = {
      id: 'msg_ast_' + Date.now(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };
    const assistantNode = UIRenderer.appendMessageNode(this.elements.chatContentContainer, assistantMsg);
    this.startStreamingResponse(assistantNode, assistantMsg);
  }

  retryLastMessage() {
    if (this.isGenerating || !this.activeConversation || this.activeConversation.messages.length === 0) return;
    this.regenerateLastResponse();
  }

  updateComposerButtonState(generating) {
    const btn = this.elements.composerSendBtn;
    if (generating) {
      btn.className = 'btn btn-stop btn-icon-only';
      btn.innerHTML = icons.stop(14);
      btn.title = 'Stop generating response';
      btn.setAttribute('aria-label', 'Stop generating response');
    } else {
      btn.className = 'btn btn-primary btn-icon-only';
      btn.innerHTML = icons.send(16);
      btn.title = 'Send message';
      btn.setAttribute('aria-label', 'Send message');
    }
  }

  adjustComposerHeight() {
    const ta = this.elements.composerTextarea;
    ta.style.height = 'auto';
    const newHeight = Math.min(ta.scrollHeight, 200);
    ta.style.height = `${newHeight}px`;
  }

  promptRename(id) {
    const conv = StorageManager.getConversation(id);
    if (!conv) return;

    const modal = this.elements.renameModal;
    const input = modal.querySelector('#renameInput');
    input.value = conv.title || '';

    this.openModal(modal);
    input.focus();

    const form = modal.querySelector('#renameForm');
    form.onsubmit = (e) => {
      e.preventDefault();
      const newTitle = input.value.trim();
      if (newTitle) {
        conv.title = newTitle;
        StorageManager.saveConversation(conv);
        if (this.activeConversation?.id === id) {
          this.elements.currentConvTitle.textContent = newTitle;
        }
        this.renderSidebar();
      }
      this.closeModal(modal);
    };
  }

  deleteConversation(id) {
    this.confirmAction('Delete conversation?', 'This action cannot be undone and will remove all messages in this conversation.', () => {
      StorageManager.deleteConversation(id);
      this.conversations = StorageManager.getConversations();

      if (this.activeConversation?.id === id) {
        if (this.conversations.length > 0) {
          this.selectConversation(this.conversations[0].id);
        } else {
          this.showWelcomeScreen();
        }
      } else {
        this.renderSidebar();
      }
    });
  }

  clearAllConversations() {
    this.confirmAction('Clear all conversation history?', 'This will permanently remove all stored conversations from your browser.', () => {
      StorageManager.clearAllConversations();
      this.conversations = [];
      this.showWelcomeScreen();
      this.renderSidebar();
    });
  }

  confirmAction(title, message, onConfirm) {
    const modal = this.elements.confirmModal;
    modal.querySelector('#confirmTitle').textContent = title;
    modal.querySelector('#confirmMessage').textContent = message;

    this.openModal(modal);
    const confirmBtn = modal.querySelector('#confirmAcceptBtn');
    confirmBtn.onclick = () => {
      onConfirm();
      this.closeModal(modal);
    };
  }

  openModal(modal) {
    this.closeMobileSidebar();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  closeModal(modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  bindEvents() {
    // Send message actions
    this.elements.composerSendBtn.addEventListener('click', () => this.handleSendMessage());

    this.elements.composerTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    this.elements.composerTextarea.addEventListener('input', () => this.adjustComposerHeight());

    // New Chat buttons
    this.elements.newChatBtn.addEventListener('click', () => this.showWelcomeScreen());
    this.elements.headerNewChatBtn.addEventListener('click', () => this.showWelcomeScreen());

    // Sidebar toggle (supports mobile drawer and laptop collapsible sidebar)
    this.elements.sidebarToggleBtn.addEventListener('click', () => this.toggleSidebar());
    if (this.elements.sidebarCloseBtn) {
      this.elements.sidebarCloseBtn.addEventListener('click', () => this.toggleSidebar());
    }
    this.elements.sidebarBackdrop.addEventListener('click', () => this.closeMobileSidebar());

    // Quick theme toggle button in top header
    if (this.elements.headerThemeBtn) {
      this.elements.headerThemeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Search filter
    this.elements.searchInput.addEventListener('input', () => {
      const val = this.elements.searchInput.value;
      this.elements.searchClearBtn.classList.toggle('visible', val.length > 0);
      this.renderSidebar();
    });

    this.elements.searchClearBtn.addEventListener('click', () => {
      this.elements.searchInput.value = '';
      this.elements.searchClearBtn.classList.remove('visible');
      this.renderSidebar();
      this.elements.searchInput.focus();
    });

    // Modals
    this.elements.settingsBtn.addEventListener('click', () => this.openSettingsModal());
    this.elements.privacyBtn.addEventListener('click', () => this.openModal(this.elements.privacyModal));
    this.elements.clearAllBtn.addEventListener('click', () => this.clearAllConversations());

    // Generic modal close buttons
    document.querySelectorAll('.modal-close-trigger').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) this.closeModal(modal);
      });
    });

    // Close modal on clicking backdrop
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeModal(overlay);
      });
    });
  }

  openSettingsModal() {
    const modal = this.elements.settingsModal;
    const themeSelect = modal.querySelector('#themeSelect');
    const tempInput = modal.querySelector('#tempInput');
    const tempVal = modal.querySelector('#tempValue');
    const systemPromptInput = modal.querySelector('#systemPromptInput');
    const providerSelect = modal.querySelector('#providerSelect');
    const apiKeyInput = modal.querySelector('#apiKeyInput');
    const apiKeyHelper = modal.querySelector('#apiKeyHelper');
    const exportBtn = modal.querySelector('#exportChatsBtn');

    themeSelect.value = this.settings.theme;
    tempInput.value = this.settings.temperature;
    tempVal.textContent = this.settings.temperature;
    systemPromptInput.value = this.settings.systemPrompt;

    if (providerSelect && this.serverConfig?.provider) {
      providerSelect.value = this.serverConfig.provider;
    }

    const updateHelperText = () => {
      if (!apiKeyHelper || !providerSelect) return;
      const prov = providerSelect.value;
      if (prov === 'gemini') {
        apiKeyHelper.innerHTML = 'Get a free Gemini API key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;">Google AI Studio</a>.';
        apiKeyInput.placeholder = 'Paste your Gemini API key (AIzaSy...)';
      } else if (prov === 'openai') {
        apiKeyHelper.innerHTML = 'Get your OpenAI API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;">OpenAI Platform</a>.';
        apiKeyInput.placeholder = 'Paste your OpenAI key (sk-...)';
      } else if (prov === 'groq') {
        apiKeyHelper.innerHTML = 'Get a free Groq API key from <a href="https://console.groq.com/keys" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;">Groq Console</a>.';
        apiKeyInput.placeholder = 'Paste your Groq key (gsk_...)';
      }
    };

    if (providerSelect) {
      providerSelect.onchange = updateHelperText;
      updateHelperText();
    }

    tempInput.oninput = () => {
      tempVal.textContent = tempInput.value;
    };

    exportBtn.onclick = () => {
      StorageManager.exportAsJSON();
    };

    const form = modal.querySelector('#settingsForm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      this.applyTheme(themeSelect.value);
      this.settings.temperature = parseFloat(tempInput.value);
      this.settings.systemPrompt = systemPromptInput.value.trim();
      StorageManager.saveSettings(this.settings);

      // Save provider and key to server
      if (providerSelect) {
        const prov = providerSelect.value;
        const key = apiKeyInput ? apiKeyInput.value.trim() : '';
        try {
          const res = await APIClient.updateConfig({ provider: prov, apiKey: key });
          if (res?.status) {
            this.serverConfig = res.status;
            this.updateStatusBadge();
          }
        } catch (err) {
          console.warn('[ClearMind] Error updating server config:', err);
        }
      }

      this.closeModal(modal);
    };

    this.openModal(modal);
  }

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+K / Cmd+K -> Focus Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.elements.searchInput.focus();
      }

      // Ctrl+B / Cmd+B -> Toggle Sidebar on laptop or phone
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        this.toggleSidebar();
      }

      // Ctrl+Shift+O or Cmd+Shift+N -> New Chat
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'n')) {
        e.preventDefault();
        this.showWelcomeScreen();
      }

      // Escape -> Close mobile sidebar, close modals, or clear search
      if (e.key === 'Escape') {
        this.closeMobileSidebar();
        document.querySelectorAll('.modal-overlay.open').forEach((m) => this.closeModal(m));
        if (document.activeElement === this.elements.searchInput) {
          this.elements.searchInput.blur();
        }
      }
    });
  }
}

// Bootstrap application safely checking document.readyState
function bootstrap() {
  const app = new ClearMindApp();
  app.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
