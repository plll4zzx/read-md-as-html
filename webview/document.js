import { annotationBlockPattern, state } from './state.js';
import { blockPlainText, escapeHtml, hashString, makeSlug, stripLatex, stripMarkdown } from './utils.js';
import { t } from './ui.js';

function trimReferencePunctuation(value) {
  return String(value || '').replace(/^[\s.,;:，。；：]+|[\s.,;:，。；：]+$/g, '').trim();
}

function markdownForRender() {
  return String(state.markdown || '').replace(annotationBlockPattern, '').replace(/\s+$/g, '');
}

function sourceForRender() {
  return state.documentKind === 'latex'
    ? String(state.markdown || '').replace(/\s+$/g, '')
    : markdownForRender();
}

function cleanReferencePart(value) {
  return stripMarkdown(trimReferencePunctuation(value))
    .replace(/^(?:authors?|作者)\s*[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function referenceTitleMatch(raw) {
  const patterns = [
    /(?<!\*)\*([^*\n]+)\*(?!\*)/,
    /(?<!_)_([^_\n]+)_(?!_)/,
    /["“]([^"”]+)["”]/,
    /《([^》]+)》/,
    /\*\*([^*]+)\*\*/,
    /__([^_]+)__/
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(raw);
    if (match) return match;
  }
  return null;
}

function explicitReferenceAuthors(raw) {
  const match = /(?:^|[.;。；]\s*)(?:authors?|作者)\s*[:：]\s*([^.;。；]+)/i.exec(raw);
  return match ? cleanReferencePart(match[1]) : '';
}

function explicitReferenceVenue(raw) {
  const match = /(?:^|[.;。；]\s*)(?:venue|source|journal|conference|booktitle|会议|期刊|来源|出处)\s*[:：]\s*([^.;。；]+)/i.exec(raw);
  return match ? cleanReferencePart(match[1]) : '';
}

function venueFromReferenceMeta(meta) {
  const clean = cleanReferencePart(meta);
  if (!clean) return '';
  const explicit = explicitReferenceVenue(clean);
  if (explicit) return explicit;
  const arxiv = /\barXiv\s*:?\s*\d{4}\.\d+(?:v\d+)?/i.exec(clean);
  if (arxiv) return arxiv[0].replace(/\s+/g, '');
  if (/\barXiv\b/i.test(clean)) return 'arXiv';

  const venuePattern = /\b(?:proceedings|conference|journal|transactions|symposium|workshop|workshops|neurips|nips|iclr|icml|acl|emnlp|naacl|cvpr|iccv|eccv|aaai|ijcai|chi|uist|siggraph|www|kdd|sigmod|vldb|usenix|ndss|ccs|s&p|oakland|nature|science|pnas|acm|ieee)\b/i;
  const parts = clean.split(/[.;。；]/).map(part => trimReferencePunctuation(part)).filter(Boolean);
  for (const part of parts) {
    if (venuePattern.test(part)) return part.replace(/^in\s+/i, '');
  }
  const firstCommaPart = trimReferencePunctuation(clean.split(',')[0] || '');
  if (firstCommaPart && !/^(?:\d{4}|version\s+\S+|accessed\s+.+)$/i.test(firstCommaPart)) {
    return firstCommaPart;
  }
  return '';
}

function parseReferenceContent(raw, url) {
  const withoutUrl = raw.replace(url || '', '').trim();
  const titleMatch = referenceTitleMatch(withoutUrl);
  if (titleMatch) {
    const meta = trimReferencePunctuation(withoutUrl.slice(titleMatch.index + titleMatch[0].length));
    return {
      authors: cleanReferencePart(withoutUrl.slice(0, titleMatch.index)) || explicitReferenceAuthors(withoutUrl),
      title: cleanReferencePart(titleMatch[1]),
      venue: explicitReferenceVenue(withoutUrl) || venueFromReferenceMeta(meta),
      meta
    };
  }
  return {
    title: cleanReferencePart(withoutUrl).slice(0, 160),
    authors: explicitReferenceAuthors(withoutUrl),
    venue: explicitReferenceVenue(withoutUrl) || venueFromReferenceMeta(withoutUrl),
    meta: ''
  };
}

function collectReferences(markdown) {
  const refs = new Map();
  const refRe = /^\[R(\d+)\]\s+(.+?)\s*$/;
  for (const line of markdown.split(/\r?\n/)) {
    const match = refRe.exec(line.trim());
    if (!match) continue;
    const label = 'R' + match[1];
    const raw = match[2];
    const urlMatch = /(https?:\/\/\S+)/.exec(raw);
    const parsed = parseReferenceContent(raw, urlMatch ? urlMatch[0] : '');
    refs.set(label, {
      label,
      raw,
      title: parsed.title,
      authors: parsed.authors,
      venue: parsed.venue,
      meta: parsed.meta,
      url: urlMatch ? urlMatch[0].replace(/[),.;]+$/, '') : ''
    });
  }
  return refs;
}

function collectLatexReferences(source) {
  const refs = new Map();
  const bibitemRe = /\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}([\s\S]*?)(?=\\bibitem(?:\[[^\]]*\])?\{|\\end\{thebibliography\}|$)/g;
  let match;
  while ((match = bibitemRe.exec(source))) {
    const key = match[1].trim();
    if (!key) continue;
    const raw = stripLatex(match[2]).replace(/\s+/g, ' ').trim();
    const ref = {
      label: key,
      raw,
      title: raw.slice(0, 160) || key,
      authors: '',
      venue: venueFromReferenceMeta(raw),
      meta: raw,
      url: ''
    };
    refs.set(key, ref);
    refs.set(key.replace(/[^A-Za-z0-9_.:-]+/g, '-').toLowerCase(), ref);
  }
  return refs;
}

function collectDocumentReferences(source) {
  return state.documentKind === 'latex' ? collectLatexReferences(source) : collectReferences(source);
}

function markdownMathFenceStart(trimmed) {
  if (trimmed.startsWith('$$')) return '$$';
  if (trimmed.startsWith('\\[')) return '\\]';
  return '';
}

function markdownMathFenceCloses(trimmed, fence) {
  if (fence === '$$') return /\$\$\s*$/.test(trimmed);
  if (fence === '\\]') return /\\\]\s*$/.test(trimmed);
  return false;
}

function markdownMathFenceOpenerOnly(trimmed, fence) {
  if (fence === '$$') return trimmed === '$$';
  if (fence === '\\]') return trimmed === '\\[';
  return false;
}

function isMarkdownMathBlock(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed === '$$' || trimmed.startsWith('$$\n') || (/^\$\$[\s\S]*\$\$$/.test(trimmed) && trimmed.length > 4)) return true;
  if (trimmed === '\\[' || trimmed.startsWith('\\[\n') || (/^\\\[[\s\S]*\\\]$/.test(trimmed) && trimmed.length > 4)) return true;
  return false;
}

function classifyBlock(raw) {
  const trimmed = raw.trim();
  if (/^---\n[\s\S]*\n---$/.test(trimmed)) return 'frontmatter';
  if (/^#{1,6}\s+/.test(trimmed)) return 'heading';
  if (/^\[R\d+\]\s+/.test(trimmed)) return 'reference';
  if (/^```/.test(trimmed)) return 'code';
  if (isMarkdownMathBlock(trimmed)) return 'math';
  if (/^>\s?/.test(trimmed)) return 'blockquote';
  if (/^\s*(?:[-*+]\s+|\d+\.\s+)/m.test(raw)) return 'list';
  if (raw.includes('|') && /\n\s*\|?\s*:?-{3,}:?/.test(raw)) return 'table';
  return 'paragraph';
}

function splitMarkdownBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let start = null;
  let buffer = [];
  let inFence = false;
  let mathFence = '';
  let firstContentLine = lines.findIndex(line => line.trim());
  let loopStart = 0;

  function flush(end) {
    if (start === null || !buffer.join('\n').trim()) {
      start = null;
      buffer = [];
      return;
    }
    const raw = buffer.join('\n');
    blocks.push({
      index: blocks.length,
      start,
      end,
      raw,
      type: classifyBlock(raw)
    });
    start = null;
    buffer = [];
  }

  if (firstContentLine === 0 && lines[0].trim() === '---') {
    const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (closing > 0) {
      blocks.push({
        index: blocks.length,
        start: 0,
        end: closing,
        raw: lines.slice(0, closing + 1).join('\n'),
        type: 'frontmatter'
      });
      loopStart = closing + 1;
    }
  }

  for (let i = loopStart; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (start === null && trimmed) start = i;
    if (start === null) continue;
    if (!inFence && !mathFence && buffer.length && markdownMathFenceStart(trimmed)) {
      flush(i - 1);
      start = i;
    }
    buffer.push(line);

    if (trimmed.startsWith('```')) {
      if (inFence) {
        inFence = false;
        flush(i);
      } else {
        inFence = true;
      }
      continue;
    }
    if (mathFence) {
      if (markdownMathFenceCloses(trimmed, mathFence)) {
        mathFence = '';
        flush(i);
      }
      continue;
    }
    const nextMathFence = markdownMathFenceStart(trimmed);
    if (!inFence && nextMathFence) {
      if (markdownMathFenceCloses(trimmed, nextMathFence) && !markdownMathFenceOpenerOnly(trimmed, nextMathFence)) {
        flush(i);
      } else {
        mathFence = nextMathFence;
      }
      continue;
    }
    if (inFence || mathFence) continue;
    if (!lines[i + 1] || !lines[i + 1].trim()) flush(i);
  }
  flush(lines.length - 1);
  return annotateBlocks(blocks, 'markdown');
}

function classifyLatexBlock(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return 'paragraph';
  if (/^\\documentclass\b|^\\usepackage\b|^\\(?:title|author|date)\b/m.test(trimmed)) return 'frontmatter';
  if (/^\\(?:chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\{/.test(trimmed)) return 'heading';
  if (/^\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?)\}/.test(trimmed) || /^\\\[/.test(trimmed) || /^\$\$/.test(trimmed)) return 'math';
  if (/^\\begin\{figure\*?\}/.test(trimmed)) return 'figure';
  if (/^\\begin\{(?:itemize|enumerate)\}/.test(trimmed)) return 'list';
  if (/^\\begin\{(?:table\*?|tabular\*?)\}/.test(trimmed)) return 'table';
  if (/^\\begin\{abstract\}/.test(trimmed)) return 'abstract';
  if (/^\\begin\{thebibliography\}/.test(trimmed) || /^\\bibitem/.test(trimmed)) return 'reference';
  if (/^\\begin\{[^}]+\}/.test(trimmed)) return 'latex-env';
  return 'paragraph';
}

function splitLatexBlocks(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let start = null;
  let buffer = [];
  let env = '';
  let mathFence = '';

  const headingRe = /^\\(?:chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\{/;
  const documentBoundaryRe = /^\\(?:begin|end)\{document\}\s*(?:%.*)?$/;

  function flush(end) {
    if (start === null || !buffer.join('\n').trim()) {
      start = null;
      buffer = [];
      return;
    }
    const raw = buffer.join('\n');
    blocks.push({
      index: blocks.length,
      start,
      end,
      raw,
      type: classifyLatexBlock(raw)
    });
    start = null;
    buffer = [];
  }

  function startSingleLineBlock(index, line) {
    flush(index - 1);
    start = index;
    buffer = [line];
    flush(index);
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (mathFence) {
      buffer.push(line);
      if ((mathFence === '$$' && /\$\$\s*$/.test(trimmed)) || (mathFence === '\\]' && /\\\]\s*$/.test(trimmed))) {
        mathFence = '';
        flush(i);
      }
      continue;
    }

    if (env) {
      const endRe = new RegExp('^\\\\end\\{' + env.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\*?\\}');
      buffer.push(line);
      if (endRe.test(trimmed)) {
        env = '';
        flush(i);
      }
      continue;
    }

    if (!trimmed) {
      flush(i - 1);
      continue;
    }

    if (documentBoundaryRe.test(trimmed) || /^\\maketitle\b/.test(trimmed)) {
      flush(i - 1);
      continue;
    }

    if (headingRe.test(trimmed)) {
      startSingleLineBlock(i, line);
      continue;
    }

    if (/^\\\[/.test(trimmed) || /^\$\$/.test(trimmed)) {
      flush(i - 1);
      start = i;
      buffer = [line];
      if (/\\\]\s*$/.test(trimmed) || (trimmed.length > 2 && /\$\$\s*$/.test(trimmed))) {
        flush(i);
      } else {
        mathFence = trimmed.startsWith('$$') ? '$$' : '\\]';
      }
      continue;
    }

    const beginMatch = /^\\begin\{([^}]+)\}/.exec(trimmed);
    if (beginMatch) {
      const baseEnv = beginMatch[1].replace(/\*$/, '');
      if (baseEnv === 'document') {
        flush(i - 1);
        continue;
      }
      flush(i - 1);
      start = i;
      buffer = [line];
      const endRe = new RegExp('\\\\end\\{' + baseEnv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\*?\\}');
      if (endRe.test(trimmed)) {
        flush(i);
      } else {
        env = baseEnv;
      }
      continue;
    }

    if (start === null) start = i;
    buffer.push(line);
    if (!lines[i + 1] || !lines[i + 1].trim()) flush(i);
  }
  flush(lines.length - 1);
  return annotateBlocks(blocks, 'latex');
}

function splitDocumentBlocks(source) {
  return state.documentKind === 'latex' ? splitLatexBlocks(source) : splitMarkdownBlocks(source);
}

function headingInfo(raw, used) {
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(raw.trim());
  if (!match) return null;
  let title = match[2].trim();
  const explicit = /\s*\{#([A-Za-z0-9_.:-]+)\}\s*$/.exec(title);
  let id = '';
  if (explicit) {
    id = explicit[1];
    title = title.replace(/\s*\{#[A-Za-z0-9_.:-]+\}\s*$/, '').trim();
  } else {
    id = makeSlug(stripMarkdown(title), used);
  }
  return {
    level: match[1].length,
    title: stripMarkdown(title),
    id
  };
}

function latexHeadingInfo(raw, used) {
  const match = /\\(chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\{([^{}]+)\}/.exec(raw.trim());
  if (!match) return null;
  const levels = { chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };
  const title = stripLatex(match[2]);
  return {
    level: levels[match[1]] || 2,
    title,
    id: makeSlug(title, used)
  };
}

function isEditablePreviewBlock(type, raw, documentKind = 'markdown') {
  if (documentKind !== 'markdown') return false;
  if (!['heading', 'paragraph', 'blockquote', 'list'].includes(type)) return false;
  if (raw.includes('$$') || raw.includes('```')) return false;
  if (/\$[^$\n]+\$/.test(raw)) return false;
  if (/!\[[^\]]*\]\([^)]+\)/.test(raw)) return false;
  return true;
}

function annotateBlocks(blocks, documentKind = 'markdown') {
  const used = new Map();
  const occurrences = new Map();
  blocks.forEach(block => {
    block.documentKind = documentKind;
    block.hash = hashString([documentKind, block.type, block.raw].join('\n'));
    const occurrenceKey = block.type + ':' + block.hash;
    const occurrence = (occurrences.get(occurrenceKey) || 0) + 1;
    occurrences.set(occurrenceKey, occurrence);
    block.key = occurrenceKey + ':' + occurrence;
    block.editable = isEditablePreviewBlock(block.type, block.raw, documentKind);
    if (block.type !== 'heading') return;
    const info = documentKind === 'latex' ? latexHeadingInfo(block.raw, used) : headingInfo(block.raw, used);
    if (!info) return;
    block.headingId = info.id;
    block.headingTitle = info.title;
    block.headingLevel = info.level;
  });
  return blocks;
}

function collectSectionPreviews(blocks) {
  const sections = new Map();
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.type !== 'heading' || !block.headingId) continue;
    const parts = [];
    for (let j = i + 1; j < blocks.length; j += 1) {
      const next = blocks[j];
      if (next.type === 'heading' && (next.headingLevel || 7) <= (block.headingLevel || 7)) break;
      const text = blockPlainText(next);
      if (text) parts.push(text);
      if (parts.join(' ').length > 720) break;
    }
    let body = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (body.length > 760) body = body.slice(0, 760).trim() + '...';
    sections.set(block.headingId, {
      title: block.headingTitle || block.headingId,
      body: body || t('emptySection')
    });
  }
  return sections;
}

function mathBlockHtml(raw) {
  const source = String(raw || '');
  return '<div class="math-block" data-latex="' + escapeHtml(source) + '">' + escapeHtml(source) + '</div>';
}

function mathSpanHtml(raw) {
  const source = String(raw || '');
  return '<span class="inline-math-source" data-latex="' + escapeHtml(source) + '">' + escapeHtml(source) + '</span>';
}

function nextUnescaped(text, needle, from) {
  let index = Math.max(0, from);
  while (index < text.length) {
    const found = text.indexOf(needle, index);
    if (found < 0) return -1;
    let slashCount = 0;
    for (let pos = found - 1; pos >= 0 && text[pos] === '\\'; pos -= 1) slashCount += 1;
    if (slashCount % 2 === 0) return found;
    index = found + needle.length;
  }
  return -1;
}

function inlineMathRanges(text) {
  const source = String(text || '');
  const ranges = [];
  let index = 0;
  while (index < source.length) {
    let open = '';
    let close = '';
    if (source.startsWith('\\(', index)) {
      open = '\\(';
      close = '\\)';
    } else if (source.startsWith('\\[', index)) {
      open = '\\[';
      close = '\\]';
    } else if (source.startsWith('$$', index)) {
      open = '$$';
      close = '$$';
    } else if (source[index] === '$' && source[index + 1] !== '$') {
      open = '$';
      close = '$';
    }
    if (!open) {
      index += 1;
      continue;
    }
    const end = nextUnescaped(source, close, index + open.length);
    if (end < 0) {
      index += open.length;
      continue;
    }
    const raw = source.slice(index, end + close.length);
    if (raw.length > open.length + close.length) {
      ranges.push({ start: index, end: end + close.length, raw });
    }
    index = end + close.length;
  }
  return ranges;
}

function replaceInlineMathDelimiters(value) {
  const text = String(value || '');
  const ranges = inlineMathRanges(text);
  if (!ranges.length) return text;
  const parts = [];
  let offset = 0;
  for (const range of ranges) {
    if (range.start > offset) parts.push(text.slice(offset, range.start));
    parts.push(mathSpanHtml(range.raw));
    offset = range.end;
  }
  if (offset < text.length) parts.push(text.slice(offset));
  return parts.join('');
}

function protectInlineMathForMarked(raw) {
  const source = String(raw || '');
  let output = '';
  let index = 0;
  while (index < source.length) {
    if (source[index] === '`') {
      const match = /^`+/.exec(source.slice(index));
      const fence = match ? match[0] : '`';
      const close = source.indexOf(fence, index + fence.length);
      if (close >= 0) {
        output += source.slice(index, close + fence.length);
        index = close + fence.length;
        continue;
      }
      output += fence;
      index += fence.length;
      continue;
    }
    const nextCode = source.indexOf('`', index);
    const end = nextCode >= 0 ? nextCode : source.length;
    output += replaceInlineMathDelimiters(source.slice(index, end));
    index = end;
  }
  return output;
}

function annotateInlineMathHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const textNodes = [];
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !/[\\$]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest('code, pre, script, style, textarea, .mermaid, .math-block, [data-latex]')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    const ranges = inlineMathRanges(node.nodeValue);
    if (!ranges.length) continue;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const range of ranges) {
      if (range.start > offset) fragment.appendChild(document.createTextNode(node.nodeValue.slice(offset, range.start)));
      const span = document.createElement('span');
      span.className = 'inline-math-source';
      span.dataset.latex = range.raw;
      span.textContent = range.raw;
      fragment.appendChild(span);
      offset = range.end;
    }
    if (offset < node.nodeValue.length) fragment.appendChild(document.createTextNode(node.nodeValue.slice(offset)));
    node.parentNode.replaceChild(fragment, node);
  }
  return template.innerHTML;
}

function renderInlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  return annotateInlineMathHtml(text);
}

function simpleMarkdownFragment(raw, type) {
  if (type === 'frontmatter') return renderFrontMatter(raw);
  if (type === 'heading') {
    const match = /^(#{1,6})\s+(.+)$/.exec(raw.trim());
    if (match) {
      const level = match[1].length;
      return '<h' + level + '>' + renderInlineMarkdown(match[2]) + '</h' + level + '>';
    }
  }
  if (type === 'code') {
    const lines = raw.split('\n');
    const lang = lines[0].replace(/^```/, '').trim();
    const code = lines.slice(1, -1).join('\n');
    if (lang === 'mermaid') return '<div class="mermaid">' + escapeHtml(code) + '</div>';
    return '<pre><code>' + escapeHtml(code) + '</code></pre>';
  }
  if (type === 'math') {
    return mathBlockHtml(raw);
  }
  if (type === 'blockquote') {
    return '<blockquote><p>' + raw.split('\n').map(line => renderInlineMarkdown(line.replace(/^>\s?/, ''))).join('<br>') + '</p></blockquote>';
  }
  if (type === 'list') {
    const ordered = /^\s*\d+\.\s+/.test(raw);
    const tag = ordered ? 'ol' : 'ul';
    const items = raw.split('\n').filter(Boolean).map(line => line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''));
    return '<' + tag + '>' + items.map(item => '<li>' + renderInlineMarkdown(item) + '</li>').join('') + '</' + tag + '>';
  }
  return '<p>' + renderInlineMarkdown(raw.replace(/\n+/g, ' ')) + '</p>';
}

function parseFrontMatter(raw) {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n').slice(1, -1);
  const entries = [];
  let current = null;
  for (const line of lines) {
    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (match) {
      current = { key: match[1], value: match[2].trim() };
      entries.push(current);
      continue;
    }
    if (current && line.trim()) {
      current.value += ' ' + line.trim();
    }
  }
  return entries;
}

function renderFrontMatter(raw) {
  const entries = parseFrontMatter(raw);
  if (!entries.length) return '<div class="frontmatter-card"><div class="frontmatter-kicker">' + escapeHtml(t('metadata')) + '</div><pre>' + escapeHtml(raw) + '</pre></div>';
  return [
    '<div class="frontmatter-card">',
    '<div class="frontmatter-kicker">' + escapeHtml(t('metadata')) + '</div>',
    '<dl>',
    entries.map(entry => '<div><dt>' + escapeHtml(entry.key) + '</dt><dd>' + escapeHtml(entry.value) + '</dd></div>').join(''),
    '</dl>',
    '</div>'
  ].join('');
}

function renderMarkdownFragment(raw, type) {
  if (type === 'frontmatter') return renderFrontMatter(raw);
  if (type === 'math') return mathBlockHtml(raw);
  if (window.marked) {
    // Fail closed if the sanitizer is damaged or unavailable.
    if (!window.DOMPurify) return '<pre>' + escapeHtml(raw) + '</pre>';
    let html = window.DOMPurify.sanitize(window.marked.parse(protectInlineMathForMarked(raw)), { ADD_ATTR: ['target', 'data-latex'] });
    html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, function (_, code) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = code;
      return '<div class="mermaid">' + escapeHtml(textarea.value) + '</div>';
    });
    html = annotateInlineMathHtml(html);
    return window.DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'data-latex'] });
  }
  return simpleMarkdownFragment(raw, type);
}

function latexCommandValue(raw, command) {
  const pattern = new RegExp('\\\\' + command + '\\*?(?:\\[[^\\]]*\\])?\\{([^{}]*)\\}');
  const match = pattern.exec(raw);
  return match ? match[1].trim() : '';
}

function renderInlineLatex(value) {
  let text = escapeHtml(String(value || '').replace(/%.*$/gm, ''));
  text = text.replace(/\\cite(?:[tp])?\*?(?:\[[^\]]*\])?\{([^}]+)\}/g, function (_, keys) {
    return String(keys).split(',').map(key => {
      const clean = key.trim();
      const id = 'ref-' + clean.replace(/[^A-Za-z0-9_.:-]+/g, '-').toLowerCase();
      return '<a class="cite-ref" href="#' + escapeHtml(id) + '" data-preview-id="' + escapeHtml(id) + '">[' + escapeHtml(clean) + ']</a>';
    }).join(', ');
  });
  text = text.replace(/\\(?:ref|eqref|autoref)\{([^}]+)\}/g, function (_, label) {
    const clean = label.trim();
    return '<a class="section-ref" href="#' + escapeHtml(clean) + '" data-preview-id="' + escapeHtml(clean) + '">' + escapeHtml(clean) + '</a>';
  });
  text = text.replace(/\\(?:textbf|textit|emph)\{([^{}]*)\}/g, function (match, body) {
    const tag = match.startsWith('\\textbf') ? 'strong' : 'em';
    return '<' + tag + '>' + escapeHtml(body) + '</' + tag + '>';
  });
  text = text.replace(/\\url\{([^{}]*)\}/g, '<a href="$1">$1</a>');
  text = text.replace(/\\label\{([^}]+)\}/g, '');
  text = text.replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\\\/g, '<br>');
  return annotateInlineMathHtml(text.trim());
}

function latexMathContent(raw) {
  return String(raw || '')
    .replace(/^\\begin\{[^}]+\}/, '')
    .replace(/\\end\{[^}]+\}$/, '')
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .trim();
}

function renderLatexFrontMatter(raw) {
  const title = latexCommandValue(raw, 'title');
  const author = latexCommandValue(raw, 'author');
  const date = latexCommandValue(raw, 'date');
  if (!title && !author && !date) {
    return '<div class="frontmatter-card latex-frontmatter"><div class="frontmatter-kicker">LaTeX</div><pre>' + escapeHtml(raw) + '</pre></div>';
  }
  const rows = [
    title ? ['Title', title] : null,
    author ? ['Author', author] : null,
    date ? ['Date', date] : null
  ].filter(Boolean);
  return '<div class="frontmatter-card latex-frontmatter"><div class="frontmatter-kicker">LaTeX</div><dl>' +
    rows.map(row => '<div><dt>' + escapeHtml(row[0]) + '</dt><dd>' + renderInlineLatex(row[1]) + '</dd></div>').join('') +
    '</dl></div>';
}

function renderLatexFigure(raw) {
  const imageMatch = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/.exec(raw);
  const caption = latexCommandValue(raw, 'caption');
  const label = latexCommandValue(raw, 'label');
  if (!imageMatch) return '<pre class="latex-fallback">' + escapeHtml(raw) + '</pre>';
  const src = imageMatch[1].trim();
  return '<figure class="latex-figure"' + (label ? ' id="' + escapeHtml(label) + '"' : '') + '>' +
    '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(stripLatex(caption || src)) + '">' +
    (caption ? '<figcaption>' + renderInlineLatex(caption) + '</figcaption>' : '') +
    '</figure>';
}

function renderLatexList(raw, ordered) {
  const tag = ordered ? 'ol' : 'ul';
  const body = raw
    .replace(/^\\begin\{[^}]+\}/, '')
    .replace(/\\end\{[^}]+\}$/, '');
  const items = body.split(/\\item\b/).map(item => item.trim()).filter(Boolean);
  return '<' + tag + '>' + items.map(item => '<li>' + renderInlineLatex(item.replace(/\n+/g, ' ')) + '</li>').join('') + '</' + tag + '>';
}

function renderLatexReference(raw) {
  const items = Array.from(raw.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}([\s\S]*?)(?=\\bibitem(?:\[[^\]]*\])?\{|\\end\{thebibliography\}|$)/g));
  if (items.length > 1 || /\\begin\{thebibliography\}/.test(raw)) {
    return '<div class="latex-bibliography">' + items.map(item => {
      const key = item[1].trim();
      const id = 'ref-' + key.replace(/[^A-Za-z0-9_.:-]+/g, '-').toLowerCase();
      const body = stripLatex(item[2]).replace(/\s+/g, ' ').trim();
      return '<p id="' + escapeHtml(id) + '"><strong>[' + escapeHtml(key) + ']</strong> ' + escapeHtml(body) + '</p>';
    }).join('') + '</div>';
  }
  const itemMatch = /\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}([\s\S]*)/.exec(raw.trim());
  if (!itemMatch) return '<pre class="latex-fallback">' + escapeHtml(raw) + '</pre>';
  const key = itemMatch[1].trim();
  const body = stripLatex(itemMatch[2]).replace(/\s+/g, ' ').trim();
  return '<p><strong>[' + escapeHtml(key) + ']</strong> ' + escapeHtml(body) + '</p>';
}

function renderLatexFragment(raw, type) {
  if (type === 'frontmatter') return renderLatexFrontMatter(raw);
  if (type === 'heading') {
    const info = latexHeadingInfo(raw, new Map());
    const level = info ? Math.min(6, Math.max(1, info.level)) : 2;
    return '<h' + level + '>' + renderInlineLatex(info ? info.title : stripLatex(raw)) + '</h' + level + '>';
  }
  if (type === 'math') return mathBlockHtml(raw);
  if (type === 'figure') return renderLatexFigure(raw);
  if (type === 'list') return renderLatexList(raw, /^\\begin\{enumerate\}/.test(raw.trim()));
  if (type === 'abstract') {
    const body = raw.replace(/^\\begin\{abstract\}/, '').replace(/\\end\{abstract\}$/, '').trim();
    return '<section class="latex-abstract"><h2>Abstract</h2><p>' + renderInlineLatex(body.replace(/\n+/g, ' ')) + '</p></section>';
  }
  if (type === 'reference') return renderLatexReference(raw);
  if (type === 'table' || type === 'latex-env') return '<pre class="latex-fallback">' + escapeHtml(raw) + '</pre>';
  return '<p>' + renderInlineLatex(raw.replace(/\n+/g, ' ')) + '</p>';
}

function renderDocumentFragment(raw, type, documentKind) {
  if (!window.DOMPurify) return '<pre>' + escapeHtml(raw) + '</pre>';
  const html = documentKind === 'latex' ? renderLatexFragment(raw, type) : renderMarkdownFragment(raw, type);
  return window.DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'data-latex'] });
}

function blockRenderMode(block) {
  return [
    block.documentKind || 'markdown',
    block.type,
    block.editable && state.previewEditEnabled ? 'edit' : 'read'
  ].join(':');
}

function renderBlock(block) {
  const refMatch = block.documentKind === 'latex'
    ? /\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/.exec(block.raw.trim())
    : /^\[R(\d+)\]\s+/.exec(block.raw.trim());
  const refId = refMatch
    ? (block.documentKind === 'latex'
      ? 'ref-' + refMatch[1].replace(/[^A-Za-z0-9_.:-]+/g, '-').toLowerCase()
      : 'ref-r' + refMatch[1].toLowerCase())
    : '';
  const blockId = refId || (block.headingId || '');
  const idAttr = blockId ? ' id="' + escapeHtml(blockId) + '"' : '';
  const classes = [
    'md-block',
    block.documentKind === 'latex' ? 'latex-block' : 'markdown-block',
    block.editable && state.previewEditEnabled ? 'preview-editable' : 'preview-readonly',
    block.type === 'reference' ? 'reference-block' : '',
    block.type === 'frontmatter' ? 'frontmatter-block' : ''
  ].filter(Boolean).join(' ');
  const attrs = [
    ' data-block-index="' + block.index + '"',
    ' data-block-key="' + escapeHtml(block.key || '') + '"',
    ' data-block-hash="' + escapeHtml(block.hash || '') + '"',
    ' data-render-mode="' + escapeHtml(blockRenderMode(block)) + '"',
    ' data-block-type="' + block.type + '"',
    ' data-source-start="' + block.start + '"',
    ' data-source-end="' + block.end + '"',
    block.editable && state.previewEditEnabled ? ' contenteditable="true" spellcheck="true"' : ''
  ].join('');
  const renderRaw = block.type === 'heading'
    ? block.raw.replace(/\s*\{#[A-Za-z0-9_.:-]+\}\s*$/, '')
    : block.raw;
  return '<section' + idAttr + ' class="' + classes + '"' + attrs + '>' + renderDocumentFragment(renderRaw, block.type, block.documentKind) + '</section>';
}

export { trimReferencePunctuation, markdownForRender, sourceForRender, cleanReferencePart, referenceTitleMatch, explicitReferenceAuthors, explicitReferenceVenue, venueFromReferenceMeta, parseReferenceContent, collectReferences, collectLatexReferences, collectDocumentReferences, markdownMathFenceStart, markdownMathFenceCloses, markdownMathFenceOpenerOnly, isMarkdownMathBlock, classifyBlock, splitMarkdownBlocks, classifyLatexBlock, splitLatexBlocks, splitDocumentBlocks, headingInfo, latexHeadingInfo, isEditablePreviewBlock, annotateBlocks, collectSectionPreviews, mathBlockHtml, mathSpanHtml, nextUnescaped, inlineMathRanges, replaceInlineMathDelimiters, protectInlineMathForMarked, annotateInlineMathHtml, renderInlineMarkdown, simpleMarkdownFragment, parseFrontMatter, renderFrontMatter, renderMarkdownFragment, latexCommandValue, renderInlineLatex, latexMathContent, renderLatexFrontMatter, renderLatexFigure, renderLatexList, renderLatexReference, renderLatexFragment, renderDocumentFragment, blockRenderMode, renderBlock };
