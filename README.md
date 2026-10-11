# ClearMind AI

A production-ready, privacy-first conversational AI web application built with a restrained, developer-grade aesthetic. Inspired by modern productivity tools, **ClearMind AI** prioritizes speed, accuracy, data isolation, and accessibility over flashy visuals.

---

## 1. Distinctive Visual Identity & Design System

The visual design system adheres strictly to professional developer-tool ergonomics:
- **Warm Neutral Background:** Alabaster/linen tint (`#FAF9F6`) in light mode; charcoal slate (`#121417`) in dark mode.
- **High-Contrast Typography:** Deep charcoal text (`#1C2025`) using system font hierarchy and monospace code blocks.
- **Restrained Forest Green Accent:** (`#1B4D3E`) for subtle highlights, active states, and primary actions.
- **Crisp Rectangular Geometry:** Modestly rounded controls (3px–6px radius); strictly no pill-shaped buttons.
- **Custom Line SVG Icons:** Original 24x24 and 16x16 vector line icons; zero emojis in the interface.
- **No Filler Copy or Gradients:** Free of purple gradients, fake ratings, or generic AI stock photos.

---

## 2. Architecture & Folder Structure

```text
sudeep_chatbot/
├── .env                        # Local runtime environment variables
├── .env.example                # Safe configuration template (no secrets committed)
├── .gitignore                  # Git ignore rules for node_modules, data, and .env
├── package.json                # Project dependencies and script runner
├── README.md                   # Comprehensive architecture, setup, and deployment guide
│
├── src/                        # Server-Side Backend (Node.js & Express 5 ESM)
│   ├── config.js               # Environment parsing, rate limit constants, safe status reporter
│   ├── server.js               # Express application with Helmet, CORS, CSP, and route mounting
│   ├── middleware/
│   │   ├── errorHandler.js     # Centralized error handler preventing stack trace leaks
│   │   ├── rateLimiter.js      # IP-based rate limiting (60 req/min for chat)
│   │   └── validator.js        # Request schema, length (16KB), and history validation
│   ├── routes/
│   │   ├── chatRoutes.js       # POST /api/chat (SSE streaming & JSON), POST /api/title-gen
│   │   ├── convRoutes.js       # CRUD endpoints for optional server-side conversation persistence
│   │   └── healthRoutes.js     # GET /api/health and GET /api/config
│   └── services/
│       ├── aiService.js        # Multi-provider AI interface (Gemini, OpenAI, Groq, Ollama, Demo)
│       └── storageService.js   # Server file persistence for conversations (data/conversations.json)
│
├── public/                     # Static Web Client (Pure HTML5, Vanilla CSS & Vanilla JS)
│   ├── index.html              # Main conversational interface (3-part responsive desktop/mobile)
│   ├── privacy.html            # Dedicated Privacy Policy page
│   ├── terms.html              # Dedicated Terms & Conditions page
│   ├── favicon.svg             # Custom geometric vector brand favicon
│   ├── css/
│   │   ├── variables.css       # Design tokens (colors, spacing, shadows, radii)
│   │   ├── base.css            # Base resets, accessibility focus rings, reduced motion
│   │   ├── layout.css          # Left sidebar, top header, chat scroll area, bottom composer
│   │   ├── components.css      # Buttons, cards, message nodes, modals, error banners
│   │   ├── markdown.css        # Typography for code blocks, copy buttons, tables, blockquotes
│   │   └── responsive.css      # Mobile navigation drawer and adaptive breakpoints
│   ├── js/
│   │   ├── app.js              # Application coordinator, state management, keyboard shortcuts
│   │   ├── api.js              # SSE client with AbortController for Stop Generating & retries
│   │   ├── storage.js          # LocalStorage persistence, fuzzy search, and JSON export
│   │   ├── ui.js               # DOM manipulation, welcome screen, streaming cursor, modals
│   │   ├── markdown.js         # Marked parser + Highlight.js syntax highlighter + DOMPurify
│   │   └── icons.js            # Standardized SVG line icon definitions
│   └── vendor/                 # Self-hosted browser libraries (no third-party CDN leaks)
│       ├── marked.esm.js       # Markdown parser
│       ├── purify.min.js       # DOMPurify HTML sanitization
│       └── hljs.esm.js         # Syntax highlighter bundle
│
├── tests/                      # Automated Verification
│   └── test-api.js             # Comprehensive integration and SSE stream tests
└── scripts/
    └── build-vendor.js         # Esbuild bundler script for vendor dependencies
```

---

## 3. Genuine AI Provider Integration

ClearMind AI connects to real AI models through a server-side abstraction layer. Secret API keys are stored exclusively in `.env` and are never exposed to browser clients.

### Supported Providers:
1. **Google Gemini (Recommended):**
   - Model: `gemini-2.5-flash` or `gemini-1.5-flash`.
   - Setup: Obtain a free API key at [Google AI Studio](https://aistudio.google.com/).
   - Set in `.env`:
     ```env
     AI_PROVIDER=gemini
     GEMINI_API_KEY=your_gemini_api_key_here
     GEMINI_MODEL=gemini-2.5-flash
     ```

2. **OpenAI:**
   - Model: `gpt-4o-mini` or `gpt-4o`.
   - Setup: Obtain key at [OpenAI Platform](https://platform.openai.com/).
   - Set in `.env`:
     ```env
     AI_PROVIDER=openai
     OPENAI_API_KEY=your_openai_api_key_here
     OPENAI_MODEL=gpt-4o-mini
     ```

3. **Groq (Fast open-source inference):**
   - Model: `llama-3.3-70b-versatile`.
   - Set in `.env`:
     ```env
     AI_PROVIDER=groq
     GROQ_API_KEY=your_groq_api_key_here
     GROQ_MODEL=llama-3.3-70b-versatile
     ```

4. **Ollama (Fully local & self-hosted):**
   - Set in `.env`:
     ```env
     AI_PROVIDER=ollama
     OLLAMA_BASE_URL=http://localhost:11434
     OLLAMA_MODEL=llama3.2
     ```

5. **Honest Demonstration Mode:**
   - If no API key is configured, the server does not simulate fake AI. It presents an honest **Demo Mode** indicator in the header and uses an intelligent rule-based heuristic engine with streaming token emission so you can test all features (streaming, Stop Generating, markdown tables, code syntax highlighting, copy controls, conversation management).

---

## 4. Key Application Features

- **Real-Time Streaming:** Server-Sent Events (SSE) deliver tokens dynamically with low latency.
- **Stop Generating:** Immediate cancellation of in-flight AI streams using `AbortController` linked to upstream client disconnects.
- **Copy & Regenerate:** One-click copying for code blocks and assistant messages with instant feedback; re-run prompt completions seamlessly.
- **Welcome Screen:** Features the standard prompt `"What would you like help with?"` with four actionable starting cards (debugging code, explaining concepts, summarizing documents, planning projects).
- **Conversation Management:**
  - Fast search across conversation titles and message bodies (`Ctrl + K`).
  - Automatic title generation from initial user messages.
  - In-place renaming and deletion.
  - One-click clear conversation history with confirmation dialog.
  - Export chat history as JSON.
- **Multi-Line Composer:**
  - Auto-expanding textarea up to 200px height.
  - `Enter` submits; `Shift + Enter` inserts newlines.
- **Security & Privacy:**
  - Default browser-local persistence (zero server tracking).
  - DOMPurify XSS sanitization on all rendered markdown.
  - Rate limiting (60 requests/minute per IP).
  - Helmet CSP and security headers.
  - Dedicated `/privacy` and `/terms` legal pages.

---

## 5. Local Setup & Quickstart

### Prerequisites
- Node.js v18.0.0 or higher (v24 tested)
- npm v9 or higher

### Installation & Launch
1. Clone the repository and enter the directory:
   ```bash
   cd sudeep_chatbot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env and enter your GEMINI_API_KEY if available
   ```

4. Run the automated test suite:
   ```bash
   npm test
   ```

5. Start the development server:
   ```bash
   npm start
   ```

6. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```

---

## 6. Automated Test Results

The test suite validates backend security, SSE streaming, and route integrity:

| Test Case | Description | Result |
| :--- | :--- | :--- |
| `GET /api/health` | Verifies uptime and server health | **PASS** |
| `GET /api/config` | Ensures zero API key leaks in metadata | **PASS** |
| `POST /api/chat` (Validation) | Rejects missing/empty messages array with 400 | **PASS** |
| `POST /api/chat` (Role check) | Rejects invalid message roles with 400 | **PASS** |
| `POST /api/chat` (Temp check) | Rejects invalid temperature (> 2.0) with 400 | **PASS** |
| `POST /api/title-gen` | Generates concise conversation title | **PASS** |
| `POST /api/chat` (JSON) | Non-streaming fallback delivers complete message | **PASS** |
| `POST /api/chat` (SSE) | Validates text/event-stream chunks and `done: true` | **PASS** |
| Conversation CRUD | Full lifecycle test (Create, Read, Update, Delete) | **PASS** |
| Static Page Routing | Verifies `/`, `/privacy`, `/terms`, `/favicon.svg` | **PASS** |

**Summary: 11 Passed, 0 Failed.**

---

## 7. Production Deployment Instructions

1. **Docker Container Deployment:**
   Create a standard `Dockerfile`:
   ```dockerfile
   FROM node:24-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   EXPOSE 3000
   USER node
   CMD ["node", "src/server.js"]
   ```

2. **Reverse Proxy (Nginx):**
   When proxying Server-Sent Events through Nginx, disable proxy buffering:
   ```nginx
   location /api/chat {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Connection '';
       proxy_buffering off;
       proxy_cache off;
       chunked_transfer_encoding on;
   }
   ```

3. **HTTPS & Security:**
   Deploy behind a TLS certificate (Let's Encrypt / Cloudflare) to ensure encrypted transmission of prompt data.
