import { els, state } from './state.js';
import { clamp, persistWebviewState, post, setStatus, sourceIsHidden, t } from './ui.js';
import { hideFileContextMenu, showFileContextMenu } from './clipboard.js';
import { saveTableLayoutsNow } from './tables.js';
import { blockElementAtScrollTop, flushRichRendererQueue, previewBlockElementByIndex, previewBlockElementBySourceStart, previewBlockTop } from './rendering.js';
import { blockForPreviewTop, hasNoteAnnotations, hideSelectionToolbar, scheduleNoteMarginRender } from './annotations.js';
import { renderVisibleSourceAxisMarkers, scheduleSourceAxisActiveUpdate, scheduleSourceAxisGeometryUpdate, scheduleSourceAxisRender, scheduleSourceAxisVisibleUpdate, updateSourceAxisActive } from './outline.js';

function renderMarkdownFiles() {
  if (!els.markdownFileList) return;
  const previousScrollTop = els.markdownFileList.scrollTop;
  const files = sortMarkdownFiles(Array.isArray(state.markdownFiles) ? state.markdownFiles : []);
  const signature = markdownFilesSignature(files);
  if (signature === state.markdownFilesSignature && els.markdownFileList.childElementCount) {
    updateMarkdownFileActiveRows(files);
    openActiveMarkdownFolders(activeMarkdownFolderPaths(files));
    return;
  }
  state.markdownFilesSignature = signature;
  els.markdownFileList.innerHTML = '';
  if (!files.length) {
    const empty = document.createElement('div');
    empty.className = 'pane-subtitle';
    empty.textContent = state.fileName || t('emptyDocument');
    els.markdownFileList.appendChild(empty);
    return;
  }
  const pinned = files.filter(file => file.pinned);
  const unpinned = files.filter(file => !file.pinned);
  if (pinned.length) {
    const pinnedSection = document.createElement('section');
    pinnedSection.className = 'markdown-pinned-section';
    const pinnedHeading = document.createElement('div');
    pinnedHeading.className = 'markdown-tree-heading markdown-pinned-heading';
    pinnedHeading.textContent = t('pinnedSection');
    pinnedSection.appendChild(pinnedHeading);
    pinned.forEach(file => {
      pinnedSection.appendChild(markdownFileRow(file, 0, { pinnedFlat: true, fullPathTitle: true }));
    });
    els.markdownFileList.appendChild(pinnedSection);
  }
  const tree = buildMarkdownFileTree(unpinned);
  renderMarkdownTreeNode(tree, els.markdownFileList, 0, { activeFolders: activeMarkdownFolderPaths(files) });
  els.markdownFileList.scrollTop = Math.min(previousScrollTop, els.markdownFileList.scrollHeight);
}

function markdownFilesSignature(files) {
  return state.language + '|' + files.map(file => [
    file.uri || '',
    file.relativePath || '',
    file.name || '',
    file.pinned ? '1' : '0',
    Number(file.pinRank) || 0,
    Number(file.mtime) || 0
  ].join('\u001f')).join('\u001e');
}

function updateMarkdownFileActiveRows(files) {
  const activeUris = new Set(files.filter(file => file && (file.uri === state.uri || file.active)).map(file => file.uri));
  els.markdownFileList.querySelectorAll('.markdown-file-row[data-uri]').forEach(row => {
    row.classList.toggle('active', activeUris.has(row.dataset.uri));
  });
}

function openActiveMarkdownFolders(activeFolders) {
  if (!activeFolders || !activeFolders.size) return;
  activeFolders.forEach(folderPath => {
    const details = els.markdownFileList.querySelector('.markdown-folder[data-folder-path="' + CSS.escape(folderPath) + '"]');
    if (details) details.open = true;
  });
}

function markdownRelativePath(file) {
  return String(file && (file.relativePath || file.name) || '').replace(/\\/g, '/');
}

function activeMarkdownFolderPaths(files) {
  const active = files.find(file => file && (file.uri === state.uri || file.active));
  const relativePath = markdownRelativePath(active);
  const parts = relativePath.split('/').filter(Boolean);
  parts.pop();
  const paths = new Set();
  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? currentPath + '/' + part : part;
    paths.add(currentPath);
  }
  return paths;
}

function markdownFolderIsOpen(folderPath, activeFolders) {
  if (activeFolders && activeFolders.has(folderPath)) return true;
  if (!state.expandedFolders || typeof state.expandedFolders !== 'object') return false;
  return state.expandedFolders[folderPath] === true;
}

function rememberMarkdownFolderOpen(folderPath, open) {
  if (!folderPath) return;
  state.expandedFolders = Object.assign({}, state.expandedFolders || {}, { [folderPath]: !!open });
  persistWebviewState();
}

function markdownFileLabel(file, showRelativePath = false) {
  if (showRelativePath && file.relativePath) return file.relativePath;
  return file.name || (file.relativePath ? file.relativePath.split('/').pop() : 'document.md');
}

function markdownFileRow(file, depth, options = {}) {
  const row = document.createElement('div');
  row.className = 'markdown-file-row' + (file.uri === state.uri || file.active ? ' active' : '') + (file.pinned ? ' pinned' : '') + (options.pinnedFlat ? ' pinned-flat' : '');
  row.style.setProperty('--file-depth', String(Math.max(0, depth)));
  row.dataset.uri = file.uri || '';
  if (options.fullPathTitle) row.title = file.fsPath || file.relativePath || file.name || '';
  row.addEventListener('contextmenu', event => showFileContextMenu(file, event));

  const pin = document.createElement('input');
  pin.type = 'checkbox';
  pin.className = 'markdown-file-pin';
  pin.checked = !!file.pinned;
  pin.title = t('pinFileTitle');
  pin.setAttribute('aria-label', t('pinFileTitle'));
  pin.addEventListener('click', event => event.stopPropagation());
  pin.addEventListener('change', () => setFilePinned(file.uri, pin.checked));

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'markdown-file-item';
  button.title = options.fullPathTitle
    ? (file.fsPath || file.relativePath || file.name || '')
    : (file.pinned ? t('pinnedFile') + ': ' : '') + (file.relativePath || file.name || '');
  button.dataset.uri = file.uri || '';
  const label = document.createElement('span');
  label.textContent = markdownFileLabel(file, !!options.showRelativePath);
  button.appendChild(label);
  button.addEventListener('click', () => switchMarkdownFile(file.uri));
  row.append(pin, button);
  return row;
}

function buildMarkdownFileTree(files) {
  const root = { name: '', folders: new Map(), files: [] };
  files.forEach(file => {
    const relativePath = markdownRelativePath(file);
    const parts = relativePath.split('/').filter(Boolean);
    const fileName = parts.pop() || file.name || 'document.md';
    let node = root;
    parts.forEach(part => {
      if (!node.folders.has(part)) node.folders.set(part, { name: part, folders: new Map(), files: [] });
      node = node.folders.get(part);
    });
    node.files.push(Object.assign({}, file, { name: file.name || fileName }));
  });
  return root;
}

function renderMarkdownTreeNode(node, container, depth, options = {}, parentPath = '') {
  const folders = Array.from(node.folders.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  for (const folder of folders) {
    const folderPath = parentPath ? parentPath + '/' + folder.name : folder.name;
    const details = document.createElement('details');
    details.className = 'markdown-folder';
    details.dataset.folderPath = folderPath;
    details.open = markdownFolderIsOpen(folderPath, options.activeFolders);
    details.style.setProperty('--folder-depth', String(Math.max(0, depth)));
    const summary = document.createElement('summary');
    summary.className = 'markdown-folder-summary';
    summary.title = folderPath;
    summary.textContent = folder.name;
    details.appendChild(summary);
    let folderToggleReady = false;
    window.setTimeout(() => { folderToggleReady = true; }, 0);
    details.addEventListener('toggle', () => {
      if (!folderToggleReady) return;
      rememberMarkdownFolderOpen(folderPath, details.open);
    });
    renderMarkdownTreeNode(folder, details, depth + 1, options, folderPath);
    container.appendChild(details);
  }
  node.files
    .sort((a, b) => {
      if (Number(b.mtime) !== Number(a.mtime)) return Number(b.mtime) - Number(a.mtime);
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });
    })
    .forEach(file => container.appendChild(markdownFileRow(file, depth)));
}

function sortMarkdownFiles(files) {
  return files.slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned && Number(a.pinRank) !== Number(b.pinRank)) {
      return Number(a.pinRank) - Number(b.pinRank);
    }
    if (Number(b.mtime) !== Number(a.mtime)) return Number(b.mtime) - Number(a.mtime);
    return String(a.relativePath || a.name || '').localeCompare(String(b.relativePath || b.name || ''), undefined, { sensitivity: 'base', numeric: true });
  });
}

function setFilePinned(targetUri, pinned) {
  if (!targetUri) return;
  const files = Array.isArray(state.markdownFiles) ? state.markdownFiles : [];
  if (pinned) {
    state.markdownFiles = files.map(file => {
      if (file.uri === targetUri) return Object.assign({}, file, { pinned: true, pinRank: 0 });
      if (file.pinned) return Object.assign({}, file, { pinRank: Math.max(1, Number(file.pinRank) + 1 || 1) });
      return file;
    });
  } else {
    state.markdownFiles = files.map(file => file.uri === targetUri ? Object.assign({}, file, { pinned: false, pinRank: -1 }) : file);
  }
  state.markdownFiles = sortMarkdownFiles(state.markdownFiles);
  renderMarkdownFiles();
  post({
    type: 'setFilePinned',
    uri: state.uri,
    targetUri,
    pinned: !!pinned
  });
}

function switchMarkdownFile(targetUri) {
  if (!targetUri || targetUri === state.uri) return;
  pushReadingPosition(els.previewScroller.scrollTop, { force: true });
  requestDocumentSwitch(targetUri, { recordTarget: true });
}

function isReaderDocumentHref(href) {
  const raw = String(href || '').trim();
  if (!raw || raw.startsWith('#')) return false;
  if (/^(?:https?|mailto|data|blob|javascript|command|vscode):/i.test(raw)) return false;
  const pathPart = raw.split('#')[0].split('?')[0];
  return /\.(?:md|markdown|tex)$/i.test(pathPart);
}

function handlePreviewLinkClick(event) {
  const anchor = event.target.closest('a[href]');
  if (!anchor || !els.preview.contains(anchor)) return false;
  const href = anchor.getAttribute('href') || '';
  if (!isReaderDocumentHref(href)) return false;
  event.preventDefault();
  event.stopPropagation();
  saveReadingProgressNow();
  post({
    type: 'openLinkedMarkdown',
    uri: state.uri,
    href
  });
  return true;
}

function requestDocumentSwitch(targetUri, options = {}) {
  if (!targetUri || targetUri === state.uri) return;
  clearTimeout(state.renderTimer);
  clearTimeout(state.saveTimer);
  clearTimeout(state.patchTimer);
  clearTimeout(state.readingHistoryTimer);
  saveReadingProgressNow();
  saveTableLayoutsNow();
  state.pendingDocumentSwitch = {
    targetUri,
    restoreProgress: options.restoreProgress || null,
    recordTarget: !!options.recordTarget,
    historyNavigation: !!options.historyNavigation
  };
  post({
    type: 'switchDocument',
    uri: state.uri,
    targetUri,
    markdown: state.markdown,
    baseMarkdownHash: state.markdownHash,
    readingProgress: captureReadingProgress(),
    tableLayouts: state.tableLayouts
  });
  setStatus(t('liveRender'));
}

function renderOutlineList(container, headings) {
  container.innerHTML = '';
  if (!headings.length) {
    const empty = document.createElement('div');
    empty.className = 'pane-subtitle';
    empty.textContent = t('noHeadings');
    container.appendChild(empty);
    return;
  }
  for (const block of headings) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'outline-item outline-level-' + Math.min(block.headingLevel || 2, 6);
    button.textContent = block.headingTitle || t('untitledSection');
    button.title = button.textContent;
    button.addEventListener('click', () => {
      jumpToPreviewBlock(block.index);
      collapsePreviewToc();
    });
    container.appendChild(button);
  }
}

function collapsePreviewToc() {
  els.previewToc.classList.add('collapsed');
  els.previewTocToggle.setAttribute('aria-expanded', 'false');
}

function togglePreviewToc() {
  const collapsed = els.previewToc.classList.toggle('collapsed');
  els.previewTocToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function togglePreviewNotes() {
  const collapsed = els.previewNotes.classList.toggle('collapsed');
  els.previewNotesToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function editorLineHeight() {
  const style = getComputedStyle(els.editor);
  return Number.parseFloat(style.lineHeight) || 20;
}

function scrollEditorToLine(line) {
  els.editor.scrollTop = Math.max(0, line * editorLineHeight() - els.editor.clientHeight * 0.18);
}

function lineFromEditorScroll() {
  return Math.max(0, Math.floor(els.editor.scrollTop / editorLineHeight()));
}

function visiblePreviewBlock() {
  return blockElementAtScrollTop(els.previewScroller.scrollTop, 12);
}

function captureReadingProgress(top = els.previewScroller.scrollTop) {
  const scrollTop = normalizedPreviewScrollTop(top);
  const maxTop = maxPreviewScrollTop();
  const blockMatch = Math.abs(scrollTop - els.previewScroller.scrollTop) <= 2 ? null : blockForPreviewTop(scrollTop);
  const blockEl = blockMatch && blockMatch.element ? blockMatch.element : visiblePreviewBlock();
  const sourceStart = blockEl ? Number(blockEl.dataset.sourceStart) : -1;
  const blockIndex = blockEl ? Number(blockEl.dataset.blockIndex) : -1;
  return {
    top: scrollTop,
    ratio: maxTop > 0 ? Math.min(1, Math.max(0, scrollTop / maxTop)) : 0,
    sourceStart: Number.isFinite(sourceStart) ? sourceStart : -1,
    blockIndex: Number.isFinite(blockIndex) ? blockIndex : -1,
    blockOffset: blockEl ? Math.round(scrollTop - previewBlockTop(blockEl)) : 0,
    timestamp: Date.now()
  };
}

function readingHistoryEntry(top = els.previewScroller.scrollTop) {
  return {
    uri: state.uri,
    fileName: state.fileName,
    progress: captureReadingProgress(top)
  };
}

function entryProgressTop(entry) {
  return Math.max(0, Math.round(Number(entry && entry.progress && entry.progress.top) || 0));
}

function updateCurrentHistoryEntry(progress = captureReadingProgress()) {
  if (state.readingHistoryIndex < 0 || state.readingHistoryIndex >= state.readingHistory.length) return;
  const current = state.readingHistory[state.readingHistoryIndex];
  if (!current || current.uri !== state.uri) return;
  state.readingHistory[state.readingHistoryIndex] = Object.assign({}, current, {
    fileName: state.fileName,
    progress
  });
}

function progressBlockElement(progress) {
  if (!progress) return null;
  const sourceStart = Number(progress.sourceStart);
  if (Number.isFinite(sourceStart) && sourceStart >= 0) {
    const byLine = previewBlockElementBySourceStart(sourceStart);
    if (byLine) return byLine;
  }
  const blockIndex = Number(progress.blockIndex);
  if (Number.isFinite(blockIndex) && blockIndex >= 0) {
    return previewBlockElementByIndex(blockIndex);
  }
  return null;
}

function topForReadingProgress(progress) {
  if (!progress) return 0;
  const blockEl = progressBlockElement(progress);
  if (blockEl) {
    return normalizedPreviewScrollTop(previewBlockTop(blockEl) + Math.round(Number(progress.blockOffset) || 0));
  }
  const ratio = Number(progress.ratio);
  if (Number.isFinite(ratio) && ratio > 0) {
    return normalizedPreviewScrollTop(maxPreviewScrollTop() * ratio);
  }
  return normalizedPreviewScrollTop(progress.top || 0);
}

function restoreReadingProgress(progress, options = {}) {
  const target = topForReadingProgress(progress);
  if (options.resetHistory) resetReadingHistory(target);
  setPreviewScrollTop(target);
  window.setTimeout(() => setPreviewScrollTop(topForReadingProgress(progress)), 120);
  window.setTimeout(() => {
    setPreviewScrollTop(topForReadingProgress(progress));
    schedulePreviewRepaint();
  }, 600);
  updateReadingNavButtons();
}

function forcePreviewRepaint() {
  if (!els.preview || !els.preview.isConnected) return;
  if (state.previewRepaintRaf) window.cancelAnimationFrame(state.previewRepaintRaf);
  const previousTransform = els.preview.style.transform;
  els.preview.style.transform = 'translateZ(0)';
  void els.preview.offsetHeight;
  state.previewRepaintRaf = window.requestAnimationFrame(() => {
    state.previewRepaintRaf = 0;
    els.preview.style.transform = previousTransform;
  });
}

function schedulePreviewRepaint(delay = 0) {
  clearTimeout(state.previewRepaintTimer);
  state.previewRepaintTimer = window.setTimeout(() => {
    state.previewRepaintTimer = null;
    forcePreviewRepaint();
  }, Math.max(0, delay));
}

function saveReadingProgressNow() {
  if (state.documentDeleted) return;
  const progress = captureReadingProgress();
  const serialized = JSON.stringify(progress);
  if (serialized === state.lastSavedReadingProgress) return;
  state.lastSavedReadingProgress = serialized;
  state.readingProgress = progress;
  updateCurrentHistoryEntry(progress);
  post({ type: 'updateReadingProgress', uri: state.uri, progress });
}

function scheduleReadingProgressSave(delay = 500) {
  clearTimeout(state.readingProgressSaveTimer);
  state.readingProgressSaveTimer = setTimeout(saveReadingProgressNow, delay);
}

function blockForLine(line) {
  let best = null;
  for (const block of state.blocks) {
    if (block.start <= line) best = block;
    if (block.start > line) break;
  }
  return best;
}

function syncEditorToPreviewScroll() {
  if (state.scrollSyncLock === 'source') return;
  const blockEl = visiblePreviewBlock();
  if (!blockEl) return;
  const line = Number(blockEl.dataset.sourceStart);
  if (!Number.isFinite(line)) return;
  state.scrollSyncLock = 'preview';
  scrollEditorToLine(line);
  clearTimeout(state.scrollLockTimer);
  state.scrollLockTimer = setTimeout(() => { state.scrollSyncLock = null; }, 180);
}

function syncPreviewToEditorScroll() {
  if (state.scrollSyncLock === 'preview') return;
  const line = lineFromEditorScroll();
  const block = blockForLine(line);
  if (!block) return;
  const blockEl = previewBlockElementByIndex(block.index);
  if (!blockEl) return;
  state.scrollSyncLock = 'source';
  setPreviewScrollTop(previewBlockTop(blockEl) - els.previewScroller.clientHeight * 0.12);
  clearTimeout(state.scrollLockTimer);
  state.scrollLockTimer = setTimeout(() => { state.scrollSyncLock = null; }, 180);
}

function scheduleScrollSync(kind) {
  if (sourceIsHidden()) return;
  clearTimeout(state.scrollDebounceTimer);
  state.scrollDebounceTimer = setTimeout(() => {
    if (kind === 'preview') syncEditorToPreviewScroll();
    if (kind === 'source') syncPreviewToEditorScroll();
  }, 90);
}

function schedulePreviewScrollFrame() {
  if (state.previewScrollRaf) return;
  state.previewScrollRaf = window.requestAnimationFrame(() => {
    state.previewScrollRaf = 0;
    renderVisibleSourceAxisMarkers();
    updateSourceAxisActive();
  });
}

function schedulePreviewScrollIdleWork() {
  scheduleScrollSync('preview');
  scheduleReadingProgressSave();
  if (!state.readingHistoryApplying && state.scrollSyncLock !== 'source' && !state.previewScrollIntent) {
    state.previewScrollIntent = true;
  }
  scheduleReadingHistoryCapture();
}

function markPreviewScrolling() {
  if (!state.previewScrolling) {
    state.previewScrolling = true;
    document.body.classList.add('preview-scrolling');
    hideFileContextMenu();
    hideSelectionToolbar();
  }
  clearTimeout(state.previewScrollIdleTimer);
  state.previewScrollIdleTimer = window.setTimeout(() => {
    state.previewScrollIdleTimer = null;
    state.previewScrolling = false;
    document.body.classList.remove('preview-scrolling');
    if (state.sourceAxisPending || state.previewMetricsDirty) scheduleSourceAxisRender();
    else if (state.sourceAxisGeometryPending) scheduleSourceAxisGeometryUpdate();
    scheduleSourceAxisVisibleUpdate();
    scheduleSourceAxisActiveUpdate();
    if (hasNoteAnnotations()) scheduleNoteMarginRender(80);
    if (state.richRendererQueue.size && !state.richRendererTimer && !state.richRendererRunning) {
      state.richRendererTimer = window.setTimeout(flushRichRendererQueue, 40);
    }
  }, 420);
}

function maxPreviewScrollTop() {
  return Math.max(0, els.previewScroller.scrollHeight - els.previewScroller.clientHeight);
}

function normalizedPreviewScrollTop(value) {
  return clamp(Math.round(Number(value) || 0), 0, maxPreviewScrollTop());
}

function updateReadingNavButtons() {
  els.readingBack.disabled = state.readingHistoryIndex <= 0;
  els.readingForward.disabled = state.readingHistoryIndex < 0 || state.readingHistoryIndex >= state.readingHistory.length - 1;
}

function pushReadingPosition(top = els.previewScroller.scrollTop, options = {}) {
  const next = readingHistoryEntry(top);
  const nextTop = entryProgressTop(next);
  const minDelta = options.force ? 24 : Math.max(180, Math.round(els.previewScroller.clientHeight * 0.35));
  if (state.readingHistoryIndex >= 0) {
    const current = state.readingHistory[state.readingHistoryIndex];
    const currentTop = entryProgressTop(current);
    if (current && current.uri === next.uri && Math.abs(currentTop - nextTop) < minDelta) {
      updateReadingNavButtons();
      return false;
    }
  }
  if (state.readingHistoryIndex < state.readingHistory.length - 1) {
    state.readingHistory = state.readingHistory.slice(0, state.readingHistoryIndex + 1);
  }
  state.readingHistory.push(next);
  if (state.readingHistory.length > 80) state.readingHistory.shift();
  state.readingHistoryIndex = state.readingHistory.length - 1;
  updateReadingNavButtons();
  return true;
}

function resetReadingHistory(top = 0) {
  clearTimeout(state.readingHistoryTimer);
  state.previewScrollIntent = false;
  state.readingHistoryApplying = true;
  state.readingHistory = [readingHistoryEntry(top)];
  state.readingHistoryIndex = 0;
  updateReadingNavButtons();
  setTimeout(() => { state.readingHistoryApplying = false; }, 240);
}

function setPreviewScrollTop(top, options = {}) {
  const target = normalizedPreviewScrollTop(top);
  if (options.recordCurrent) pushReadingPosition(els.previewScroller.scrollTop, { force: true });
  state.readingHistoryApplying = true;
  els.previewScroller.scrollTop = target;
  if (options.recordTarget) pushReadingPosition(target, { force: true });
  setTimeout(() => { state.readingHistoryApplying = false; }, 240);
}

function navigateReadingHistory(delta) {
  const nextIndex = state.readingHistoryIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.readingHistory.length) return;
  updateCurrentHistoryEntry();
  const entry = state.readingHistory[nextIndex];
  if (!entry || !entry.progress) return;
  state.readingHistoryIndex = nextIndex;
  state.previewScrollIntent = false;
  if (entry.uri && entry.uri !== state.uri) {
    state.readingHistoryApplying = true;
    requestDocumentSwitch(entry.uri, {
      restoreProgress: entry.progress,
      recordTarget: false,
      historyNavigation: true
    });
    updateReadingNavButtons();
    return;
  }
  setPreviewScrollTop(topForReadingProgress(entry.progress));
  updateReadingNavButtons();
  scheduleScrollSync('preview');
  scheduleReadingProgressSave(120);
}

function beginPreviewScrollIntent() {
  if (state.readingHistoryApplying) return;
  if (!state.previewScrollIntent) pushReadingPosition(els.previewScroller.scrollTop, { force: true });
  state.previewScrollIntent = true;
}

function scheduleReadingHistoryCapture() {
  if (state.readingHistoryApplying || !state.previewScrollIntent) return;
  clearTimeout(state.readingHistoryTimer);
  state.readingHistoryTimer = setTimeout(() => {
    state.previewScrollIntent = false;
    pushReadingPosition(els.previewScroller.scrollTop);
  }, 620);
}

function jumpToPreviewBlock(blockIndex) {
  const blockEl = previewBlockElementByIndex(blockIndex);
  if (!blockEl) return;
  state.scrollSyncLock = 'source';
  setPreviewScrollTop(previewBlockTop(blockEl) - 24, { recordCurrent: true, recordTarget: true });
  clearTimeout(state.scrollLockTimer);
  state.scrollLockTimer = setTimeout(() => { state.scrollSyncLock = null; }, 180);
  scheduleReadingProgressSave(120);
}

export { renderMarkdownFiles, markdownFilesSignature, updateMarkdownFileActiveRows, openActiveMarkdownFolders, markdownRelativePath, activeMarkdownFolderPaths, markdownFolderIsOpen, rememberMarkdownFolderOpen, markdownFileLabel, markdownFileRow, buildMarkdownFileTree, renderMarkdownTreeNode, sortMarkdownFiles, setFilePinned, switchMarkdownFile, isReaderDocumentHref, handlePreviewLinkClick, requestDocumentSwitch, renderOutlineList, collapsePreviewToc, togglePreviewToc, togglePreviewNotes, editorLineHeight, scrollEditorToLine, lineFromEditorScroll, visiblePreviewBlock, captureReadingProgress, readingHistoryEntry, entryProgressTop, updateCurrentHistoryEntry, progressBlockElement, topForReadingProgress, restoreReadingProgress, forcePreviewRepaint, schedulePreviewRepaint, saveReadingProgressNow, scheduleReadingProgressSave, blockForLine, syncEditorToPreviewScroll, syncPreviewToEditorScroll, scheduleScrollSync, schedulePreviewScrollFrame, schedulePreviewScrollIdleWork, markPreviewScrolling, maxPreviewScrollTop, normalizedPreviewScrollTop, updateReadingNavButtons, pushReadingPosition, resetReadingHistory, setPreviewScrollTop, navigateReadingHistory, beginPreviewScrollIntent, scheduleReadingHistoryCapture, jumpToPreviewBlock };
