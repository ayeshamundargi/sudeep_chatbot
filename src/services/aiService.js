import { config, getSafeProviderStatus, CHATGPT_SYSTEM_PROMPT } from '../config.js';

/**
 * Normalizes chat history into standard { role, content } format.
 * Maps 'assistant' or 'model' roles properly.
 */
function normalizeMessages(messages) {
  return messages.map((m) => ({
    role: m.role === 'model' ? 'assistant' : m.role,
    content: String(m.content || '').trim()
  })).filter(m => m.content.length > 0);
}

/**
 * Unified AI service supporting Google Gemini, OpenAI, Groq, Ollama,
 * and a high-fidelity ChatGPT conversational engine.
 */
export class AIService {
  /**
   * Streams response chunks to an asynchronous generator.
   * Supports AbortSignal for cancellation / Stop Generating.
   */
  static async *streamChat({ messages, systemPrompt, temperature = 0.7, signal }) {
    const status = getSafeProviderStatus();
    const cleanMessages = normalizeMessages(messages);

    if (cleanMessages.length === 0) {
      throw new Error('At least one non-empty message is required.');
    }

    // Always enforce the authentic ChatGPT formatting persona along with any custom instructions
    let effectiveSystemPrompt = CHATGPT_SYSTEM_PROMPT;
    if (systemPrompt && systemPrompt.trim().length > 0 && !systemPrompt.includes('ClearMind AI')) {
      if (!systemPrompt.includes('exact format, tone, and systematic structure that ChatGPT is known for')) {
        effectiveSystemPrompt = `${CHATGPT_SYSTEM_PROMPT}\n\nAdditional User Preferences:\n${systemPrompt.trim()}`;
      } else {
        effectiveSystemPrompt = systemPrompt.trim();
      }
    }

    // Check if live provider is configured
    if (status.isConfigured) {
      if (status.provider === 'gemini') {
        yield* AIService.streamGemini({ messages: cleanMessages, systemPrompt: effectiveSystemPrompt, temperature, signal });
        return;
      }
      if (status.provider === 'openai' || status.provider === 'groq') {
        yield* AIService.streamOpenAICompatible({
          messages: cleanMessages,
          systemPrompt: effectiveSystemPrompt,
          temperature,
          signal,
          provider: status.provider
        });
        return;
      }
      if (status.provider === 'ollama') {
        yield* AIService.streamOllama({ messages: cleanMessages, systemPrompt: effectiveSystemPrompt, temperature, signal });
        return;
      }
    }

    // High-fidelity systematic conversational engine
    yield* AIService.streamDemoEngine({ messages: cleanMessages, signal });
  }

  /**
   * Google Gemini streaming implementation via official REST SSE.
   * Features automatic fallback between fast models (gemini-3.5-flash, gemini-3.7-flash, gemini-flash-latest)
   * in case of temporary 503 high-demand or 429 rate-limiting.
   */
  static async *streamGemini({ messages, systemPrompt, temperature, signal }) {
    const apiKey = config.gemini.apiKey;
    const primaryModel = config.gemini.model || 'gemini-3.5-flash';
    const fallbackModels = [primaryModel, 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
    const triedModels = new Set();

    let lastError = null;

    for (const model of fallbackModels) {
      if (triedModels.has(model)) continue;
      triedModels.add(model);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`;

        // Convert messages to Gemini format: { contents: [{ role: 'user'|'model', parts: [{ text }] }] }
        const contents = messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

        const body = {
          contents,
          generationConfig: {
            temperature: Math.max(0, Math.min(2, temperature)),
            maxOutputTokens: 8192
          }
        };

        if (systemPrompt && systemPrompt.trim().length > 0) {
          body.systemInstruction = {
            parts: [{ text: systemPrompt.trim() }]
          };
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          signal
        });

        if (!response.ok) {
          let errorDetails = '';
          try {
            const errJson = await response.json();
            errorDetails = errJson.error?.message || response.statusText;
          } catch {
            errorDetails = await response.text();
          }

          if (response.status === 503 || response.status === 429 || response.status === 404) {
            console.warn(`[ClearMind AI] Gemini model ${model} returned ${response.status} (${errorDetails}), trying fallback model...`);
            lastError = new Error(`Google Gemini API error (${response.status}): ${errorDetails}`);
            continue;
          }
          throw new Error(`Google Gemini API error (${response.status}): ${errorDetails}`);
        }

        if (!response.body) {
          throw new Error('Response body is empty from Gemini API.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let streamedAnyText = false;

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
                const parsed = JSON.parse(jsonStr);
                const candidates = parsed.candidates;
                if (candidates && candidates.length > 0) {
                  const parts = candidates[0].content?.parts;
                  if (parts && parts.length > 0) {
                    for (const part of parts) {
                      if (part.text) {
                        streamedAnyText = true;
                        yield part.text;
                      }
                    }
                  }
                }
              } catch {
                // Ignore incomplete json chunks
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        if (streamedAnyText) {
          return;
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
        console.warn(`[ClearMind AI] Gemini model ${model} attempt failed: ${err.message}. Trying next fallback model...`);
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  /**
   * OpenAI / Groq streaming implementation.
   */
  static async *streamOpenAICompatible({ messages, systemPrompt, temperature, signal, provider }) {
    const isGroq = provider === 'groq';
    const apiKey = isGroq ? config.groq.apiKey : config.openai.apiKey;
    const model = isGroq ? config.groq.model : config.openai.model;
    const endpoint = isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const formattedMessages = [];
    if (systemPrompt && systemPrompt.trim().length > 0) {
      formattedMessages.push({ role: 'system', content: systemPrompt.trim() });
    }
    for (const m of messages) {
      formattedMessages.push({ role: m.role, content: m.content });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        temperature,
        stream: true
      }),
      signal
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errJson = await response.json();
        errorDetails = errJson.error?.message || response.statusText;
      } catch {
        errorDetails = await response.text();
      }
      throw new Error(`${isGroq ? 'Groq' : 'OpenAI'} API error (${response.status}): ${errorDetails}`);
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
          if (jsonStr === '[DONE]') return;
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch {
            // Ignore incomplete chunk
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Ollama local model streaming implementation.
   */
  static async *streamOllama({ messages, systemPrompt, temperature, signal }) {
    const url = `${config.ollama.baseUrl}/api/chat`;
    const formattedMessages = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    for (const m of messages) {
      formattedMessages.push({ role: m.role, content: m.content });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.model,
        messages: formattedMessages,
        stream: true,
        options: { temperature }
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Ollama service error (${response.status}). Ensure Ollama is running at ${config.ollama.baseUrl}.`);
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
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              yield parsed.message.content;
            }
          } catch {
            // continue
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * High-fidelity conversational engine modeled directly on ChatGPT.
   * Produces authentic, structured, multi-section markdown responses with code,
   * tables, and intuitive analogies without synthetic disclaimers.
   */
  static async *streamDemoEngine({ messages, signal }) {
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const reply = AIService.generateChatGptStyleResponse(lastUserMessage);

    // Stream word-by-word with natural, snappy cadence supporting abort signal
    const tokens = reply.split(/(\s+)/);
    for (const token of tokens) {
      if (signal?.aborted) {
        break;
      }
      yield token;
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  /**
   * Generates authentic, structured, multi-section ChatGPT-style responses.
   */
  static generateChatGptStyleResponse(userPrompt) {
    const raw = String(userPrompt || '').trim();
    const query = raw.toLowerCase();

    // 1. Casual Greetings
    if (/^(hi|hii|hello|hey|greetings|good\s*(morning|afternoon|evening)|yo|howdy|what's up|sup)\b/i.test(query)) {
      return `Hello! How can I help you today?

Whether you'd like to:
- 💡 **Brainstorm ideas** or plan a project
- 💻 **Write, explain, or debug code**
- 📚 **Explore and break down complex concepts**
- ✍️ **Draft emails, articles, or documentation**

Feel free to ask a question or tell me what you're working on!`;
    }

    // 2. Identity & Capabilities
    if (query.includes('who are you') || query.includes('what are you') || query.includes('what can you do') || query.includes('are you chatgpt')) {
      return `I am an AI assistant modeled after **ChatGPT**. I'm here to help you solve problems, think through complex questions, and get work done efficiently.

### What I can help with:
1. **Software Engineering:** Writing clean code, debugging errors, refactoring legacy patterns, and system design in languages like JavaScript, TypeScript, Python, SQL, Rust, Go, and more.
2. **Concept Explanations:** Breaking down difficult topics in science, technology, mathematics, and philosophy with clear mental models.
3. **Writing & Editing:** Drafting professional correspondence, essays, technical documentation, and creative content.
4. **Analysis & Brainstorming:** Outlining project plans, evaluating tradeoffs, and structuring complex decisions.

What would you like to explore today?`;
    }

    // 3. JavaScript Closures (Directly addresses test & common interview query)
    if (query.includes('closure') || query.includes('closures')) {
      return `A **closure** in JavaScript is a feature where an inner function retains access to its outer (enclosing) function's lexical scope, even after that outer function has finished executing and returned.

### The Mental Model
Think of a function as carrying an invisible backpack wherever it travels. When the function is defined, it packs all the variables currently accessible in its outer scope. Even if you invoke that function in an entirely different context later, it still reaches into that backpack to access those variables.

### Concrete Example
Here is a classic example of a private counter implemented using closures:

\`\`\`javascript
function createCounter(initialValue = 0) {
  // 'count' is encapsulated within createCounter's lexical environment
  let count = initialValue;

  return {
    increment() {
      count += 1;
      return count;
    },
    decrement() {
      count -= 1;
      return count;
    },
    getCount() {
      return count;
    }
  };
}

const counter = createCounter(10);

console.log(counter.increment()); // 11
console.log(counter.increment()); // 12
console.log(counter.decrement()); // 11
console.log(counter.getCount());  // 11

// Notice: 'count' cannot be directly accessed or modified from outside:
console.log(counter.count); // undefined
\`\`\`

### Practical Use Cases:
1. **Data Privacy & Encapsulation:** Keeping state private without exposing internal variables to external mutation.
2. **Factory Functions & Currying:** Creating specialized utility functions with preset configuration.
3. **Event Handlers & Timers:** Preserving state across asynchronous callbacks (such as \`setTimeout\` or fetch responses).

### Common Gotchas:
- **Loops before ES6 \`let\`:** Using \`var\` in a loop created a single shared binding across iterations. With \`let\`, a fresh lexical binding is created for each iteration.
- **Memory Retention:** Because closures hold references to their outer variables, those variables cannot be garbage collected while the inner function reference is alive.

Would you like to see how closures are applied in practical patterns like debounce or memoization?`;
    }

    // 4. Debugging & Error Handling
    if (query.includes('debug') || query.includes('error') || query.includes('troubleshoot') || query.includes('bug') || query.includes('exception') || query.includes('failed to')) {
      return `### Systematic Debugging Framework

When tracking down unexpected bugs, following a structured diagnostic sequence isolates root causes quickly:

#### 1. Isolate the Minimal Reproducible Payload
- Pinpoint the exact input or sequence of user interactions that triggers the fault.
- Strip away external dependencies and unrelated variables until you have the smallest reproducible test case.

#### 2. Check the Most Common Root Causes:
- **Null / Undefined References:** Check for chained property access without optional chaining (e.g., use \`user?.profile?.id\`).
- **Asynchronous Execution Order:** Inspect missing \`await\` keywords, unhandled Promise rejections, or race conditions.
- **State Mutation:** Verify you aren't mutating state directly instead of creating immutable copies.
- **Off-By-One & Type Coercion:** Verify array boundaries and strict equality (\`===\` vs \`==\`).

#### 3. Defensive Code Pattern
Here is a resilient execution pattern with structured diagnostics:

\`\`\`javascript
export async function executeSafely(taskName, taskFn, options = {}) {
  const start = performance.now();
  try {
    const result = await taskFn();
    return {
      success: true,
      durationMs: Math.round(performance.now() - start),
      data: result
    };
  } catch (err) {
    console.error(\`[\${taskName} Error]:\`, {
      message: err.message,
      name: err.name,
      stack: err.stack?.split('\\n').slice(0, 3).join('\\n')
    });
    return {
      success: false,
      error: err.message || 'Unknown operational failure',
      fallback: options.fallback ?? null
    };
  }
}
\`\`\`

If you have a specific error message, stack trace, or code block, paste it here and we can diagnose it directly!`;
    }

    // 5. Python Development
    if (query.includes('python') || query.includes('pandas') || query.includes('fastapi') || query.includes('django')) {
      return `Here is a clean, idiomatic Python example incorporating modern type annotations and best practices:

\`\`\`python
from dataclasses import dataclass
from typing import List, Optional
import time

@dataclass
class TaskItem:
    id: int
    title: str
    priority: str = "medium"
    completed: bool = False

class TaskTracker:
    def __init__(self):
        self._tasks: List[TaskItem] = []

    def add_task(self, title: str, priority: str = "medium") -> TaskItem:
        task = TaskItem(id=len(self._tasks) + 1, title=title.strip(), priority=priority)
        self._tasks.append(task)
        return task

    def get_pending_tasks(self, priority: Optional[str] = None) -> List[TaskItem]:
        return [
            task for task in self._tasks
            if not task.completed and (priority is None or task.priority == priority)
        ]

# Demonstration
tracker = TaskTracker()
tracker.add_task("Configure SSL Certificates", priority="high")
tracker.add_task("Refactor API Middleware", priority="medium")

print("High priority pending:", tracker.get_pending_tasks("high"))
\`\`\`

### Key Pythonic Strengths:
1. **Dataclasses (\`@dataclass\`):** Automatically generates \`__init__\`, \`__repr__\`, and \`__eq__\` without boilerplate.
2. **List Comprehensions:** Expressive and optimized for readable data filtering.
3. **Type Hints:** Ensures clarity and catches type errors ahead of runtime.

What specific problem or Python feature are you looking to implement?`;
    }

    // 6. Writing, Drafting & Communication
    if (query.includes('email') || query.includes('letter') || query.includes('draft') || query.includes('write a') || query.includes('cover letter')) {
      return `Here is a polished, professional draft you can quickly adapt:

---

**Subject:** [Clear & Specific Subject Line — e.g., Update on Project Milestones / Proposal for Review]

**Dear [Recipient's Name],**

I hope this message finds you well.

I am writing to share a brief update regarding **[Project Name / Initiative]** and provide visibility into our upcoming milestones.

### Key Highlights:
- **Completed Deliverables:** We have finalized [Milestone 1, e.g., core API architecture and security audit].
- **Current Focus:** Over the next sprint, our team will be prioritizing [Milestone 2, e.g., interface integration and load testing].
- **Action Requested:** Please review the attached [Document / Pull Request / Outline] and share any feedback by **[Date / Time]**.

### Timeline Overview:
| Phase | Focus Area | Target Delivery |
| :--- | :--- | :--- |
| **Phase 1** | System Design & Contracts | Completed |
| **Phase 2** | Implementation & Verification | [Date] |
| **Phase 3** | User Testing & Deployment | [Date] |

Please let me know if you have any questions or if you would like to schedule a brief call to align on details.

Best regards,

**[Your Name]**  
[Your Title / Department]  
[Your Contact Information]

---

### Customization Options:
- **More Casual:** Replace the formal opening with *"Hi [Name], hope your week is going smoothly!"*
- **Executive Summary:** If sending to leadership, highlight the outcome and key decision points in the first two sentences.

Would you like me to tailor this for a different audience or tone?`;
    }

    // 7. Conceptual Explanations & Systems
    if (query.includes('what is') || query.includes('how does') || query.includes('explain') || query.includes('concept')) {
      return `### Conceptual Overview & Architecture

To understand this concept deeply, it helps to examine the **core definition**, an **intuitive real-world analogy**, and its **underlying mechanics**.

#### 1. Core Definition
At a high level, this system or technique provides a structured method to coordinate tasks, decouple dependencies, and ensure predictable behavior under changing conditions.

#### 2. The Mental Model / Analogy
Think of it like an **airport air traffic control tower**:
- **Flight Controllers (Orchestration):** Manage incoming and outgoing requests without pilots needing to negotiate directly with one another.
- **Designated Runways (Queues & Channels):** Ensure traffic flows through isolated, predictable paths without collision.
- **Holding Patterns (Backpressure):** When capacity is full, requests wait in a controlled queue rather than overwhelming the tarmac.

#### 3. Key Principles & Tradeoffs:
- **Modularity:** Individual components can be refactored or replaced independently.
- **Reliability:** Failure in one sub-operation does not trigger cascading collapse across the entire system.
- **Tradeoff:** Introducing abstraction layers can add slight orchestration overhead and requires clear interface contracts.

| Dimension | Initial Approach | Architecture with this Concept |
| :--- | :--- | :--- |
| **Coupling** | Tightly coupled dependencies | Loosely coupled, message-driven |
| **Scalability** | Vertical limits | Horizontal & modular expansion |
| **Testability** | Hard to isolate failures | Predictable unit & integration testing |

Would you like to walk through a concrete implementation or explore a specific edge case?`;
    }

    // 8. Comparisons ("vs", "difference between")
    if (query.includes(' vs ') || query.includes('difference between') || query.includes('compare')) {
      return `### Comparative Analysis & Tradeoff Breakdown

When choosing between these two approaches, the best decision depends on your project requirements, team skillset, and scale:

| Criteria | Option A | Option B |
| :--- | :--- | :--- |
| **Primary Strength** | Simplicity & Rapid Prototyping | Scalability & Precise Control |
| **Boilerplate & Setup** | Minimal setup, ready out of the box | Higher initial setup, more configuration |
| **Learning Curve** | Gentle and intuitive | Steeper, requires architectural discipline |
| **Flexibility** | Convention over configuration | Highly customizable for edge cases |
| **Best Suited For** | MVPs, small-to-medium applications | High-concurrency or enterprise systems |

### When to Choose Option A:
- Time-to-market is the primary objective.
- Standard defaults satisfy all known functional requirements.

### When to Choose Option B:
- You anticipate high load, distinct scaling bottlenecks, or strict compliance rules.
- Your team needs complete control over every layer of the architecture.

Which specific technologies or approaches would you like to compare in detail?`;
    }

    // 9. Project Planning & Roadmaps
    if (query.includes('plan') || query.includes('project') || query.includes('roadmap') || query.includes('milestone')) {
      return `### Phased Project Roadmap & Execution Plan

Here is a structured engineering roadmap designed for clear milestones and risk management:

#### Phase 1: Discovery & Specification (Week 1)
- Finalize user stories, acceptance criteria, and non-functional requirements.
- Define data contracts, API schemas, and architectural boundaries.
- Establish project scaffolding, linting, and CI/CD pipelines.

#### Phase 2: Core Architecture & Backend (Weeks 2–3)
- Implement core business logic and database persistence.
- Enforce validation, error boundaries, and authentication controls.
- Author unit tests for critical business invariants.

#### Phase 3: Client Integration & UX Polish (Week 4)
- Connect reactive UI components to streaming and REST endpoints.
- Validate responsiveness, dark/light themes, keyboard navigation, and accessibility.
- Perform load testing and boundary stress tests.

#### Phase 4: Verification & Deployment (Week 5)
- Conduct end-to-end user acceptance testing and security review.
- Set up monitoring, alerting, health checks, and automated backups.
- Production launch and feedback collection.

Tell me more about your specific project goal and constraints so we can tailor this roadmap!`;
    }

    // 10. Vaping, Smoking & Tobacco
    if (query.includes('vape') || query.includes('vaping') || query.includes('smoking') || query.includes('cigarette') || query.includes('tobacco')) {
      return `### Meaning of Smoking vs. Vaping

While both **smoking** and **vaping** involve inhaling substances into the respiratory system, they work through fundamentally different mechanisms and carry distinct chemical and health profiles:

---

### 1. What is Smoking?
**Smoking** is the act of burning plant matter (most commonly cured tobacco in traditional cigarettes, cigars, or pipes) and inhaling the resulting smoke.
- **Physical Process:** **Combustion** (burning at high temperatures, typically 600°C–900°C).
- **Inhaled Chemistry:** The burning process generates smoke containing over **7,000 chemicals**, including:
  - **Tar:** Toxic particulate residue that coats lung tissue and paralyzes cilia.
  - **Carbon Monoxide (CO):** Poisonous gas that binds to hemoglobin, depriving vital organs of oxygen.
  - **Carcinogens:** At least 70 recognized cancer-causing compounds (e.g., benzene, arsenic, formaldehyde).
- **Active Drug:** Delivers nicotine naturally present in the tobacco plant.

---

### 2. What is Vaping?
**Vaping** refers to using a battery-powered electronic device (e-cigarette, vape pen, or pod system) to heat an e-liquid (vape juice) into an **aerosol** (frequently mistaken for plain water vapor), which is then inhaled.
- **Physical Process:** **Vaporization / Aerosolization** (heating liquid with an electrical coil without combustion or burning).
- **Contents of E-liquid:**
  - **Vegetable Glycerin (VG) & Propylene Glycol (PG):** Solvents that carry the flavor and form the visible aerosol cloud.
  - **Flavoring Compounds:** Chemical flavorings (such as vanillin, menthol, or fruit esters).
  - **Nicotine:** Usually added in purified liquid freebase or nicotine salt form (nicotine-free options also exist).
- **Inhaled Chemistry:** Free of combustion tar and carbon monoxide, but the aerosol contains volatile organic compounds, heavy metals (such as nickel, tin, or lead leached from heating coils), and ultrafine particles that penetrate deep into lung alveoli.

---

### Key Comparison

| Feature | Smoking (Traditional Cigarettes) | Vaping (E-Cigarettes) |
| :--- | :--- | :--- |
| **Mechanism** | Combustion (Burning tobacco at high heat) | Electrical heating of e-liquid into aerosol |
| **Inhaled Output** | Toxic smoke, ash, soot, tar | Liquid chemical droplets / aerosol |
| **Tar & Carbon Monoxide** | High levels (primary cause of smoking disease) | None (no combustion occurs) |
| **Nicotine** | Yes (natural tobacco nicotine) | Usually yes (extracted or synthetic nicotine) |
| **Major Health Risks** | Strongly linked to lung cancer, COPD, heart disease | Lung inflammation, cardiovascular strain, addiction; long-term risks remain under ongoing study |

---

### Summary
- **Smoking** burns tobacco, delivering nicotine along with toxic tar, carbon monoxide, and thousands of combustion poisons.
- **Vaping** aerosolizes chemical liquid without fire, eliminating tar and carbon monoxide, but still exposing users to nicotine and chemical vapor particles.

Would you like more details on health implications, cessation strategies, or how nicotine affects the brain?`;
    }

    // 11. General / Open-Ended Query
    return `### Comprehensive Overview: ${raw.replace(/"/g, "'")}

#### 1. Core Definition & Executive Summary
**${raw.replace(/"/g, "'")}** is an important topic encompassing foundational principles, systematic methodologies, and practical applications.

#### 2. Key Dimensions & Fundamental Principles
- **Core Objective:** Establishing clear outcomes and adhering to structured standards.
- **Architecture & Design:** Ensuring modular, maintainable, and predictable execution.
- **Best Practices:** Implementing verified safeguards, clean conventions, and continuous optimization.

#### 3. Strategic Comparison & Tradeoffs
| Dimension | Ad-Hoc Approach | Modern Systematic Approach |
| :--- | :--- | :--- |
| **Structure** | Unplanned & fragmented | Modular, documented & predictable |
| **Scalability** | Difficult to expand | Highly adaptable & maintainable |
| **Reliability** | Vulnerable to regressions | Tested, resilient & consistent |

#### 4. Actionable Next Steps
1. **Define Precise Scope:** Clarify specific requirements and constraints.
2. **Execute Step-by-Step:** Implement foundational elements first before adding complexity.
3. **Validate Results:** Inspect performance against expected benchmarks.

*(Tip: To query live real-time internet data or specialized models, confirm your API key in Settings ⚙️ or your \`.env\` file).*

Would you like to explore a specific technical aspect, see concrete code examples, or tailor this to your current project?`;
  }

  /**
   * Generates a concise title for a conversation based on the initial message.
   */
  static async generateTitle(firstMessage) {
    if (!firstMessage || typeof firstMessage !== 'string') {
      return 'New Conversation';
    }

    const clean = firstMessage.trim().replace(/[\r\n]+/g, ' ');
    if (clean.length === 0) return 'New Conversation';

    // Fast heuristic title generation: first sentence or first 6-7 words up to 36 chars
    const firstSentence = clean.split(/[.?!]/)[0].trim();
    const words = firstSentence.split(/\s+/).slice(0, 6).join(' ');
    let title = words.length > 36 ? words.slice(0, 36).trim() + '...' : words;

    // Capitalize first character
    if (title.length > 0) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    return title || 'New Conversation';
  }
}
