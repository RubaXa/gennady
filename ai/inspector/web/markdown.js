// @file: ai/inspector — markdown-lite renderer for prompt text (the only render seam).
// SWAP POINT: to use a ready library, replace renderMarkdown's body with e.g. `return marked.parse(text)`.
// Callers depend ONLY on renderMarkdown(text) -> HTML string; everything else here is private.

// Path tokens (group 1) vs word tokens (group 2). Each gets a per-class colour so the eye separates them.
const TOKEN =
  /([\w./-]+\.(?:directive\.xml|spec\.md|task-\d+\.md))|\b(AX_[A-Z0-9_]+|STEP_[A-Z0-9_]+|H_[A-Z0-9_]+|sdd-(?:state|task|extract|verify|log|sync|check)|orient|READ_AND_USE_DIRECTIVE|LOGIC_SWITCH|FLOW_VERSION|READINESS|WHEN|DEFAULT)\b/g;

function classify(word) {
  if (word.startsWith('AX_')) return 'tok-axiom';
  if (word.startsWith('STEP_')) return 'tok-step';
  if (word.startsWith('H_')) return 'tok-halt';
  if (word.startsWith('sdd-') || word === 'orient') return 'tok-cmd';
  return 'tok-kw';
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Wrap recognised tokens in per-class spans (runs on already-escaped text). */
function highlight(t) {
  return t.replace(
    TOKEN,
    (m, path, word) => '<span class="' + (path ? 'tok-path' : classify(word)) + '">' + m + '</span>'
  );
}

/** Inline transforms: `code`, **bold**, per-class token highlight (also inside code spans). */
function inline(s) {
  let out = '';
  for (const part of s.split(/(`[^`]+`)/)) {
    if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
      out += '<code>' + highlight(escapeHtml(part.slice(1, -1))) + '</code>';
    } else {
      out += highlight(escapeHtml(part).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'));
    }
  }
  return out;
}

/** Inline-only render (no paragraphs/lists): for short one-line notes/summaries. */
export function renderInline(text) {
  return inline(String(text == null ? '' : text));
}

/** Render prompt prose to HTML: paragraphs, `-`/`•` bullet lists, inline code/bold/tokens. */
export function renderMarkdown(text) {
  const lines = String(text == null ? '' : text).split('\n');
  let html = '';
  let inList = false;
  let para = [];
  const flushPara = () => {
    if (para.length) {
      html += '<p>' + inline(para.join(' ')) + '</p>';
      para = [];
    }
  };
  const flushList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*[-•]\s+/.test(line)) {
      flushPara();
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += '<li>' + inline(line.replace(/^\s*[-•]\s+/, '')) + '</li>';
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return html;
}
