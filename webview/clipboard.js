import { els, state } from './state.js';
import { post, setStatus, t } from './ui.js';
import { annotationSectionInfo, hideHovercardNow, hideSelectionToolbar } from './annotations.js';
import { visiblePreviewBlock } from './navigation.js';

function hideFileContextMenu() {
  if (!els.fileContextMenu) return;
  els.fileContextMenu.classList.remove('visible');
  els.fileContextMenu.setAttribute('aria-hidden', 'true');
  els.fileContextMenu.innerHTML = '';
  state.previewContextSelection = null;
}

function copyFilePath(file, pathKind) {
  if (!file) return;
  post({
    type: 'copyFilePath',
    uri: state.uri,
    targetUri: file.uri || '',
    targetName: file.name || '',
    targetRelativePath: file.relativePath || '',
    targetFsPath: file.fsPath || '',
    pathKind
  });
  hideFileContextMenu();
}

function showFileContextMenu(file, event) {
  if (!els.fileContextMenu || !file) return;
  event.preventDefault();
  event.stopPropagation();
  hideHovercardNow();
  state.previewContextSelection = null;
  els.fileContextMenu.innerHTML = '';
  const actions = [
    { kind: 'absolute', label: t('copyAbsolutePath') },
    { kind: 'relative', label: t('copyRelativePath') }
  ];
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'file-context-menu-item';
    button.setAttribute('role', 'menuitem');
    button.textContent = action.label;
    button.addEventListener('click', () => copyFilePath(file, action.kind));
    els.fileContextMenu.appendChild(button);
  }
  els.fileContextMenu.classList.add('visible');
  els.fileContextMenu.setAttribute('aria-hidden', 'false');
  const rect = els.fileContextMenu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, event.clientX));
  const top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, event.clientY));
  els.fileContextMenu.style.left = left + 'px';
  els.fileContextMenu.style.top = top + 'px';
}

function rangeIntersectsNode(range, node) {
  try {
    return !!(range && node && range.intersectsNode(node));
  } catch (error) {
    return false;
  }
}

function previewSelectionRanges() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !els.preview) return [];
  const ranges = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (!range || range.collapsed || !rangeIntersectsNode(range, els.preview)) continue;
    ranges.push(range);
  }
  return ranges;
}

function closestLatexSource(node) {
  const element = node && node.nodeType === Node.ELEMENT_NODE ? node : (node ? node.parentElement : null);
  return element ? element.closest('[data-latex]') : null;
}

function cleanCopiedLatex(value) {
  return String(value || '').replace(/\u00a0/g, ' ').trim();
}

function directLatexSelection(range) {
  const startMath = closestLatexSource(range.startContainer);
  const endMath = closestLatexSource(range.endContainer);
  if (startMath && startMath === endMath) return cleanCopiedLatex(startMath.dataset.latex || '');
  return '';
}

function copyNodeChildrenText(node) {
  return Array.from(node.childNodes || []).map(child => copyNodeText(child)).join('');
}

function copyNodeText(node) {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return copyNodeChildrenText(node);
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node;
  if (element.matches('script, style, textarea, .selection-toolbar, .file-context-menu, .hovercard')) return '';
  const latex = element.getAttribute('data-latex');
  if (latex) return cleanCopiedLatex(latex);
  const tag = element.tagName;
  if (tag === 'BR') return '\n';
  if (tag === 'IMG') return element.alt ? '[image: ' + element.alt + ']' : '';
  if (tag === 'MJX-CONTAINER' && element.closest('[data-latex]')) return '';
  if (tag === 'TR') {
    return Array.from(element.children)
      .filter(child => child.tagName === 'TD' || child.tagName === 'TH')
      .map(child => normalizeCopiedText(copyNodeChildrenText(child), { trim: true }))
      .join('\t') + '\n';
  }
  if (tag === 'TABLE' || tag === 'THEAD' || tag === 'TBODY') return copyNodeChildrenText(element) + '\n';
  if (tag === 'LI') return '- ' + normalizeCopiedText(copyNodeChildrenText(element), { trim: true }) + '\n';
  const text = copyNodeChildrenText(element);
  if (/^(P|DIV|SECTION|ARTICLE|BLOCKQUOTE|FIGURE|FIGCAPTION|H[1-6]|PRE|UL|OL)$/.test(tag)) {
    return text + '\n\n';
  }
  return text;
}

function normalizeCopiedText(value, options = {}) {
  const text = String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return options.trim === false ? text : text.trim();
}

function rangeTextWithLatex(range) {
  const directLatex = directLatexSelection(range);
  if (directLatex) return directLatex;
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());
  return normalizeCopiedText(copyNodeChildrenText(container));
}

function selectedBlocksForRanges(ranges) {
  const blocks = [];
  const seen = new Set();
  for (const block of state.blockElements || []) {
    for (const range of ranges) {
      if (!rangeIntersectsNode(range, block)) continue;
      const index = block.dataset.blockIndex || '';
      if (!seen.has(index)) {
        seen.add(index);
        blocks.push(block);
      }
      break;
    }
  }
  return blocks;
}

function copyMetadataForBlock(firstBlock, lastBlock) {
  const firstSource = firstBlock ? Number(firstBlock.dataset.sourceStart) : -1;
  const lastSource = lastBlock ? Number(lastBlock.dataset.sourceEnd || lastBlock.dataset.sourceStart) : firstSource;
  const lineStart = Number.isFinite(firstSource) && firstSource >= 0 ? firstSource + 1 : 0;
  const lineEnd = Number.isFinite(lastSource) && lastSource >= 0 ? lastSource + 1 : lineStart;
  const blockIndex = firstBlock ? Number(firstBlock.dataset.blockIndex) : -1;
  const section = annotationSectionInfo({ blockIndex, sourceStart: firstSource });
  return {
    sectionTitle: section ? section.title : '',
    lineRange: lineStart > 0 ? (lineEnd > lineStart ? lineStart + '-' + lineEnd : String(lineStart)) : ''
  };
}

function previewCopyDetails() {
  const ranges = previewSelectionRanges();
  if (!ranges.length) return null;
  const text = normalizeCopiedText(ranges.map(rangeTextWithLatex).filter(Boolean).join('\n'));
  if (!text) return null;
  const selectedBlocks = selectedBlocksForRanges(ranges);
  const firstBlock = selectedBlocks[0] || visiblePreviewBlock();
  const lastBlock = selectedBlocks[selectedBlocks.length - 1] || firstBlock;
  return Object.assign({ text }, copyMetadataForBlock(firstBlock, lastBlock));
}

function rememberPreviewCopyDetails(details) {
  if (!details || !details.text) return null;
  state.lastPreviewCopyDetails = Object.assign({}, details, { capturedAt: Date.now() });
  return state.lastPreviewCopyDetails;
}

function recentPreviewCopyDetails() {
  const details = state.lastPreviewCopyDetails;
  if (!details || !details.text) return null;
  if (Date.now() - Number(details.capturedAt || 0) > 30000) return null;
  return details;
}

function previewCopyDetailsFromTarget(target) {
  const element = target && target.nodeType === Node.ELEMENT_NODE ? target : (target ? target.parentElement : null);
  const math = element ? element.closest('[data-latex]') : null;
  if (!math || !els.preview.contains(math)) return null;
  const text = cleanCopiedLatex(math.dataset.latex || '');
  if (!text) return null;
  const block = math.closest('.md-block');
  return Object.assign({ text }, copyMetadataForBlock(block, block));
}

function previewCopyDetailsFromBlockTarget(target) {
  const element = target && target.nodeType === Node.ELEMENT_NODE ? target : (target ? target.parentElement : null);
  const block = element ? element.closest('.md-block') : null;
  if (!block || !els.preview.contains(block)) return null;
  const text = normalizeCopiedText(copyNodeText(block));
  if (!text) return null;
  return Object.assign({ text }, copyMetadataForBlock(block, block));
}

function previewCopyDetailsForContextTarget(target) {
  return rememberPreviewCopyDetails(previewCopyDetails()) ||
    previewCopyDetailsFromTarget(target) ||
    recentPreviewCopyDetails() ||
    previewCopyDetailsFromBlockTarget(target);
}

function activeMarkdownRelativePath() {
  const files = Array.isArray(state.markdownFiles) ? state.markdownFiles : [];
  const active = files.find(file => file && file.uri === state.uri) || files.find(file => file && file.active);
  return String(active && (active.relativePath || active.name) || state.fileName || 'document.md').replace(/\\/g, '/');
}

function previewClipboardText(copyDetails, withPath) {
  if (!withPath) return copyDetails.text;
  return [
    t('copyPathLabel') + ': ' + activeMarkdownRelativePath(),
    t('copySectionLabel') + ': ' + (copyDetails.sectionTitle || '-'),
    t('copyLineLabel') + ': ' + (copyDetails.lineRange || '-'),
    '',
    t('copyContentLabel') + ':',
    copyDetails.text
  ].join('\n');
}

function copyPreviewSelection(withPath = false, details = null) {
  const copyDetails = details || state.previewContextSelection || rememberPreviewCopyDetails(previewCopyDetails());
  if (!copyDetails || !copyDetails.text) {
    setStatus(t('noCopySelection'));
    hideFileContextMenu();
    return;
  }
  const message = {
    type: 'copyPreviewSelection',
    uri: state.uri,
    text: copyDetails.text,
    sectionTitle: copyDetails.sectionTitle || '',
    lineRange: copyDetails.lineRange || '',
    withPath: !!withPath,
    labels: {
      path: t('copyPathLabel'),
      section: t('copySectionLabel'),
      line: t('copyLineLabel'),
      content: t('copyContentLabel')
    }
  };
  const text = previewClipboardText(copyDetails, withPath);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => setStatus(t('selectionCopied')))
      .catch(() => post(message));
  } else {
    post(message);
  }
  hideFileContextMenu();
}

function addContextMenuButton(label, disabled, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-context-menu-item';
  button.setAttribute('role', 'menuitem');
  button.textContent = label;
  button.disabled = !!disabled;
  if (!disabled) button.addEventListener('click', onClick);
  els.fileContextMenu.appendChild(button);
}

function showPreviewContextMenu(event) {
  if (!els.fileContextMenu || !els.preview || !els.preview.contains(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  hideHovercardNow();
  state.previewContextSelection = previewCopyDetailsForContextTarget(event.target);
  hideSelectionToolbar();
  const disabled = !state.previewContextSelection;
  els.fileContextMenu.innerHTML = '';
  addContextMenuButton(t('copySelection'), disabled, () => copyPreviewSelection(false));
  addContextMenuButton(t('copyWithPath'), disabled, () => copyPreviewSelection(true));
  els.fileContextMenu.classList.add('visible');
  els.fileContextMenu.setAttribute('aria-hidden', 'false');
  const rect = els.fileContextMenu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, event.clientX));
  const top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, event.clientY));
  els.fileContextMenu.style.left = left + 'px';
  els.fileContextMenu.style.top = top + 'px';
}

function handlePreviewCopy(event) {
  if (event.defaultPrevented) return;
  const details = rememberPreviewCopyDetails(previewCopyDetails());
  if (!details || !details.text || !event.clipboardData) return;
  event.preventDefault();
  event.clipboardData.setData('text/plain', details.text);
  setStatus(t('selectionCopied'));
}

export { hideFileContextMenu, copyFilePath, showFileContextMenu, rangeIntersectsNode, previewSelectionRanges, closestLatexSource, cleanCopiedLatex, directLatexSelection, copyNodeChildrenText, copyNodeText, normalizeCopiedText, rangeTextWithLatex, selectedBlocksForRanges, copyMetadataForBlock, previewCopyDetails, rememberPreviewCopyDetails, recentPreviewCopyDetails, previewCopyDetailsFromTarget, previewCopyDetailsFromBlockTarget, previewCopyDetailsForContextTarget, activeMarkdownRelativePath, previewClipboardText, copyPreviewSelection, addContextMenuButton, showPreviewContextMenu, handlePreviewCopy };
