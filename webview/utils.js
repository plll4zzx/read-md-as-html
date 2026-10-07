

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stripMarkdown(value) {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLatex(value) {
  return String(value || '')
    .replace(/%.*$/gm, ' ')
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, ' ')
    .replace(/\\(?:label|ref|cite|bibliography|bibliographystyle)(?:\[[^\]]*\])?\{[^}]*\}/g, ' ')
    .replace(/\\(?:textbf|textit|emph|title|author|date|caption|item)\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, '$1')
    .replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?/g, ' ')
    .replace(/[{}$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function blockPlainText(block) {
  return block && block.documentKind === 'latex' ? stripLatex(block.raw) : stripMarkdown(block.raw);
}

function makeSlug(title, used) {
  const base = String(title)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'section';
  const count = used.get(base) || 0;
  used.set(base, count + 1);
  return count ? base + '-' + (count + 1) : base;
}

export { escapeHtml, hashString, stripMarkdown, stripLatex, blockPlainText, makeSlug };
