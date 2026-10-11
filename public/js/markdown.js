import { marked } from '/vendor/marked.esm.js';
import hljsModule from '/vendor/hljs.esm.js';

const hljs = hljsModule.default || hljsModule;

// DOMPurify is loaded via script tag or window.DOMPurify
const sanitize = (dirtyHtml) => {
  if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    return window.DOMPurify.sanitize(dirtyHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'hr', 'pre', 'code', 'table', 'thead',
        'tbody', 'tr', 'th', 'td', 'a', 'span', 'div', 'button'
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-code', 'type', 'title', 'aria-label']
    });
  }
  return dirtyHtml;
};

// Configure custom marked renderer
const renderer = new marked.Renderer();

renderer.code = function(arg1, arg2) {
  // Support both marked v18 token object ({ text, lang }) and legacy arguments (code, lang)
  const text = typeof arg1 === 'object' && arg1 !== null ? (arg1.text || '') : String(arg1 || '');
  const lang = typeof arg1 === 'object' && arg1 !== null ? (arg1.lang || '') : String(arg2 || '');
  const language = lang.trim().toLowerCase();
  let highlighted = '';

  if (language && hljs?.getLanguage && hljs.getLanguage(language)) {
    try {
      highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value;
    } catch {
      highlighted = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  } else {
    highlighted = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const langLabel = language || 'text';
  return `
    <div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-lang">${langLabel}</span>
        <button type="button" class="code-copy-btn" data-code="${encodeURIComponent(text)}" title="Copy code">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span class="code-copy-label">Copy</span>
        </button>
      </div>
      <pre><code class="hljs language-${langLabel}">${highlighted}</code></pre>
    </div>
  `;
};

renderer.link = function(arg1, arg2, arg3) {
  const href = typeof arg1 === 'object' && arg1 !== null ? (arg1.href || '#') : (arg1 || '#');
  const text = typeof arg1 === 'object' && arg1 !== null ? (arg1.text || '') : (arg3 || '');
  const title = typeof arg1 === 'object' && arg1 !== null ? (arg1.title || '') : (arg2 || '');
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
};

const originalTable = renderer.table.bind(renderer);
renderer.table = function(...args) {
  return `<div class="table-wrapper">${originalTable(...args)}</div>`;
};

marked.use({
  renderer,
  gfm: true,
  breaks: true
});

/**
 * Parses markdown to secure, syntax-highlighted HTML.
 */
export function renderMarkdown(markdownText) {
  if (!markdownText) return '';
  try {
    const rawHtml = marked.parse(markdownText);
    return sanitize(rawHtml);
  } catch (err) {
    console.error('[Markdown Render Error]:', err);
    return `<p>${String(markdownText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
  }
}
