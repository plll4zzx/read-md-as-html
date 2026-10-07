import { els, state } from './state.js';
import { renderOutlines, scheduleSourceAxisGeometryUpdate, scheduleSourceAxisRender } from './outline.js';
import { blockRenderMode, collectDocumentReferences, collectSectionPreviews, renderBlock, sourceForRender, splitDocumentBlocks } from './document.js';
import { escapeHtml } from './utils.js';
import { renderDeletedDocumentBanner, setStatus, t, updateRenderStats } from './ui.js';
import { topForReadingProgress } from './navigation.js';
import { applyAnnotations, hasNoteAnnotations, renderNotesPanel, scheduleBookmarkMarkersUpdate, scheduleNoteMarginRender } from './annotations.js';
import { refreshSearch } from './search.js';
import { bindImageClicks, markImages, resolvePreviewImages, scheduleDiagramBinding } from './images.js';
import { wrapTables } from './tables.js';

function refreshPreviewBlockCache(options = {}) {
  state.blockElements = Array.from(els.preview.querySelectorAll('.md-block[data-block-index]'));
  state.blockElementByIndex = new Map();
  state.blockElementBySourceStart = new Map();
  for (const element of state.blockElements) {
    const index = Number(element.dataset.blockIndex);
    const sourceStart = Number(element.dataset.sourceStart);
    if (Number.isFinite(index)) state.blockElementByIndex.set(index, element);
    if (Number.isFinite(sourceStart)) state.blockElementBySourceStart.set(sourceStart, element);
  }
  observePreviewBlockSizes();
  state.previewMetricsDirty = true;
  if (options.measure !== false) refreshPreviewBlockMetrics();
}

function refreshPreviewBlockMetrics() {
  state.blockTops = [];
  state.blockHeights = [];
  state.blockTopByIndex = new Map();
  for (const element of state.blockElements) {
    const index = Number(element.dataset.blockIndex);
    const top = Math.round(element.offsetTop || 0);
    state.blockTops.push(top);
    state.blockHeights.push(Math.round(element.offsetHeight || 0));
    if (Number.isFinite(index)) state.blockTopByIndex.set(index, top);
  }
  state.previewMetricsDirty = false;
}

function ensurePreviewResizeObserver() {
  if (state.previewResizeObserver || !window.ResizeObserver) return state.previewResizeObserver;
  state.previewResizeObserver = new ResizeObserver(entries => {
    const shifts = new Map();
    let changed = false;
    for (const entry of entries) {
      if (!entry.target || !entry.target.isConnected) continue;
      let index = Number(entry.target.dataset.blockIndex);
      if (!Number.isFinite(index) || state.blockElements[index] !== entry.target) {
        index = state.blockElements.indexOf(entry.target);
      }
      if (index < 0 || index >= state.blockHeights.length) continue;
      const borderSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
      const nextHeight = Math.max(0, Math.round(borderSize && Number(borderSize.blockSize) || entry.contentRect.height || 0));
      const previousHeight = Math.max(0, Number(state.blockHeights[index]) || 0);
      const delta = nextHeight - previousHeight;
      if (!delta) continue;
      state.blockHeights[index] = nextHeight;
      shifts.set(index + 1, (shifts.get(index + 1) || 0) + delta);
      changed = true;
    }
    if (!changed) return;
    let shift = 0;
    for (let index = 0; index < state.blockTops.length; index += 1) {
      shift += shifts.get(index) || 0;
      if (!shift) continue;
      state.blockTops[index] = Math.max(0, state.blockTops[index] + shift);
      const blockIndex = Number(state.blockElements[index] && state.blockElements[index].dataset.blockIndex);
      if (Number.isFinite(blockIndex)) state.blockTopByIndex.set(blockIndex, state.blockTops[index]);
    }
    state.previewMetricsDirty = false;
    scheduleSourceAxisGeometryUpdate(220);
  });
  return state.previewResizeObserver;
}

function observePreviewBlockSizes() {
  const observer = ensurePreviewResizeObserver();
  if (!observer) return;
  const current = new Set(state.blockElements);
  state.observedPreviewBlocks.forEach(element => {
    if (current.has(element)) return;
    observer.unobserve(element);
    state.observedPreviewBlocks.delete(element);
  });
  current.forEach(element => {
    if (state.observedPreviewBlocks.has(element)) return;
    state.observedPreviewBlocks.add(element);
    observer.observe(element);
  });
}

function createBlockElement(block) {
  const template = document.createElement('template');
  template.innerHTML = renderBlock(block).trim();
  return template.content.firstElementChild;
}

function updateBlockElementMetadata(element, block) {
  element.dataset.blockIndex = String(block.index);
  element.dataset.blockKey = block.key || '';
  element.dataset.blockHash = block.hash || '';
  element.dataset.renderMode = blockRenderMode(block);
  element.dataset.blockType = block.type;
  element.dataset.sourceStart = String(block.start);
  element.dataset.sourceEnd = String(block.end);
}

function patchPreviewBlocks(blocks, options = {}) {
  if (!blocks.length) {
    els.preview.classList.add('empty');
    els.preview.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<h1>' + escapeHtml(t('emptyDocument')) + '</h1>';
    els.preview.appendChild(empty);
    return [empty];
  }

  els.preview.classList.remove('empty');
  const oldByKey = new Map();
  if (!options.force) {
    els.preview.querySelectorAll('.md-block[data-block-key]').forEach(element => {
      const key = element.dataset.blockKey || '';
      if (key && !oldByKey.has(key)) oldByKey.set(key, element);
    });
  }

  const changed = [];
  const desiredElements = [];
  for (const block of blocks) {
    const oldElement = oldByKey.get(block.key || '');
    const canReuse = oldElement &&
      oldElement.dataset.blockHash === block.hash &&
      oldElement.dataset.renderMode === blockRenderMode(block);
    if (canReuse) {
      updateBlockElementMetadata(oldElement, block);
      desiredElements.push(oldElement);
      continue;
    }
    const nextElement = createBlockElement(block);
    if (nextElement) {
      changed.push(nextElement);
      desiredElements.push(nextElement);
    }
  }
  if (options.force) {
    const fragment = document.createDocumentFragment();
    desiredElements.forEach(element => fragment.appendChild(element));
    els.preview.replaceChildren(fragment);
    return changed;
  }

  let cursor = els.preview.firstElementChild;
  for (const element of desiredElements) {
    if (element === cursor) {
      cursor = cursor.nextElementSibling;
    } else {
      els.preview.insertBefore(element, cursor);
    }
  }
  const desiredSet = new Set(desiredElements);
  Array.from(els.preview.children).forEach(element => {
    if (!desiredSet.has(element)) element.remove();
  });
  return changed;
}

function previewBlockElementByIndex(index) {
  return state.blockElementByIndex.get(Number(index)) || null;
}

function previewBlockElementBySourceStart(sourceStart) {
  return state.blockElementBySourceStart.get(Number(sourceStart)) || null;
}

function previewBlockTop(element) {
  if (!element) return 0;
  const index = Number(element.dataset.blockIndex);
  if (Number.isFinite(index) && state.blockTopByIndex.has(index)) {
    return state.blockTopByIndex.get(index);
  }
  return Math.round(element.offsetTop || 0);
}

function blockElementAtScrollTop(top, offset = 24) {
  const blocks = state.blockElements;
  if (!blocks.length) return null;
  const targetTop = Math.max(0, Math.round(Number(top) || 0)) + offset;
  const blockTops = state.blockTops;
  if (blockTops && blockTops.length === blocks.length) {
    let low = 0;
    let high = blockTops.length - 1;
    let bestIndex = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (blockTops[mid] <= targetTop) {
        bestIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return blocks[bestIndex] || blocks[0];
  }
  let low = 0;
  let high = blocks.length - 1;
  let best = blocks[0];
  while (low <= high) {
    const mid = (low + high) >> 1;
    const element = blocks[mid];
    if (element.offsetTop <= targetTop) {
      best = element;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

async function renderPreview(options = {}) {
  const renderVersion = ++state.renderVersion;
  if (state.richRendererObserver) state.richRendererObserver.disconnect();
  state.richRendererQueue.forEach(block => {
    if (!block.isConnected) state.richRendererQueue.delete(block);
  });
  initLibraries();
  const sourceMarkdown = sourceForRender();
  state.refs = collectDocumentReferences(sourceMarkdown);
  state.blocks = splitDocumentBlocks(sourceMarkdown);
  els.previewScroller.classList.toggle('has-source-axis', state.blocks.length > 0);
  state.sectionPreviews = collectSectionPreviews(state.blocks);
  const changedBlocks = patchPreviewBlocks(state.blocks, { force: !!options.forceFull });
  refreshPreviewBlockCache({ measure: false });
  if (options.initialProgress) {
    els.previewScroller.scrollTop = topForReadingProgress(options.initialProgress);
  }
  updateRenderStats();
  renderOutlines();
  const renderRoots = changedBlocks.length ? changedBlocks : [];
  postProcessPreview(renderRoots);
  if (renderVersion !== state.renderVersion) return false;
  refreshPreviewBlockMetrics();
  scheduleRichRenderers(state.blockElements);
  if (options.initialProgress) {
    els.previewScroller.scrollTop = topForReadingProgress(options.initialProgress);
  }
  applyAnnotations();
  if (state.searchQuery) refreshSearch({ preserveIndex: true, skipScroll: true });
  renderDeletedDocumentBanner();
  scheduleSourceAxisRender(180);
  scheduleBookmarkMarkersUpdate();
  renderNotesPanel();
  scheduleNoteMarginRender();
  scheduleDiagramBinding();
  return true;
}

function initLibraries() {
  if (window.marked) {
    window.marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });
  }
  if (window.mermaid && !window.__msMermaidInitialized) {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    window.__msMermaidInitialized = true;
  }
}

function postProcessPreview(roots = [els.preview]) {
  markImages(roots);
  linkCitations(roots);
  bindImageClicks(roots);
  resolvePreviewImages(roots);
}

function nodesInRoots(roots, selector) {
  const nodes = [];
  const list = Array.isArray(roots) ? roots : [roots];
  for (const root of list) {
    if (!root || root.nodeType !== 1) continue;
    if (root.matches && root.matches(selector)) nodes.push(root);
    root.querySelectorAll(selector).forEach(node => nodes.push(node));
  }
  return nodes;
}

function linkCitations(roots = [els.preview]) {
  const nodes = [];
  const list = Array.isArray(roots) ? roots : [roots];
  for (const root of list) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('a, pre, code, .mermaid, .reference-block')) return NodeFilter.FILTER_REJECT;
        return /\[R\d+\]/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
  }
  nodes.forEach(node => {
    const fragment = document.createDocumentFragment();
    const parts = node.nodeValue.split(/(\[R\d+\])/g);
    for (const part of parts) {
      const match = /^\[R(\d+)\]$/.exec(part);
      if (!match) {
        fragment.appendChild(document.createTextNode(part));
        continue;
      }
      const label = 'R' + match[1];
      const a = document.createElement('a');
      a.className = 'cite-ref';
      a.href = '#ref-' + label.toLowerCase();
      a.dataset.previewId = 'ref-' + label.toLowerCase();
      a.textContent = '[' + label + ']';
      fragment.appendChild(a);
    }
    node.parentNode.replaceChild(fragment, node);
  });
}

async function runRenderers(roots = [els.preview]) {
  const renderRoots = Array.isArray(roots) ? roots.filter(Boolean) : [roots].filter(Boolean);
  if (!renderRoots.length) return;
  if (window.mermaid) {
    try {
      const mermaidNodes = nodesInRoots(renderRoots, '.mermaid');
      if (mermaidNodes.length) await window.mermaid.run({ nodes: mermaidNodes });
    } catch (error) {
      setStatus(t('mermaidError'));
    }
  }
  if (window.MathJax?.startup?.promise) await window.MathJax.startup.promise;
  const mathRoots = renderRoots.filter(root => root.matches('[data-latex], .math-block') || root.querySelector('[data-latex], .math-block'));
  if (mathRoots.length && window.MathJax && window.MathJax.typesetPromise) {
    try {
      await window.MathJax.typesetPromise(mathRoots);
    } catch (error) {
      setStatus(t('mathError'));
    }
  }
}

function blockNeedsRichRendering(block) {
  if (!block || block.dataset.richRendered === 'true') return false;
  return !!(block.matches('.math-block, .mermaid, [data-latex]') ||
    block.querySelector('.math-block, .mermaid, [data-latex], table:not([data-table-enhanced="true"])'));
}

function richRendererBlocks(roots) {
  const blocks = new Set();
  const renderRoots = Array.isArray(roots) ? roots : [roots];
  for (const root of renderRoots) {
    if (!root || root.nodeType !== 1) continue;
    const block = root.matches('.md-block') ? root : root.closest('.md-block');
    if (block && blockNeedsRichRendering(block)) blocks.add(block);
    root.querySelectorAll('.md-block').forEach(candidate => {
      if (blockNeedsRichRendering(candidate)) blocks.add(candidate);
    });
  }
  return Array.from(blocks);
}

function ensureRichRendererObserver() {
  if (state.richRendererObserver || !window.IntersectionObserver) return state.richRendererObserver;
  state.richRendererObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      state.richRendererObserver.unobserve(entry.target);
      queueRichRendererBlock(entry.target);
    });
  }, {
    root: els.previewScroller,
    rootMargin: '3200px 0px',
    threshold: 0
  });
  return state.richRendererObserver;
}

function queueRichRendererBlock(block) {
  if (!blockNeedsRichRendering(block)) return;
  state.richRendererQueue.add(block);
  if (state.richRendererTimer || state.richRendererRunning) return;
  state.richRendererTimer = window.setTimeout(flushRichRendererQueue, 120);
}

async function flushRichRendererQueue() {
  state.richRendererTimer = null;
  if (state.richRendererRunning || !state.richRendererQueue.size) return;
  if (state.previewScrolling) {
    state.richRendererTimer = window.setTimeout(flushRichRendererQueue, 220);
    return;
  }
  state.richRendererRunning = true;
  const viewportTop = els.previewScroller.scrollTop;
  const viewportBottom = viewportTop + els.previewScroller.clientHeight;
  const queued = Array.from(state.richRendererQueue).map(block => {
    const top = previewBlockTop(block);
    const bottom = top + Math.max(1, Number(state.blockHeights[Number(block.dataset.blockIndex)]) || 1);
    const distance = bottom >= viewportTop && top <= viewportBottom
      ? 0
      : (bottom < viewportTop ? viewportTop - bottom : top - viewportBottom);
    return { block, distance };
  }).sort((left, right) => left.distance - right.distance).map(entry => entry.block);
  const hasPendingTable = block => !!(block && block.querySelector('table:not([data-table-enhanced="true"])'));
  const batch = hasPendingTable(queued[0])
    ? queued.slice(0, 1)
    : queued.filter(block => !hasPendingTable(block)).slice(0, 4);
  const batchHasTable = batch.some(hasPendingTable);
  batch.forEach(block => state.richRendererQueue.delete(block));
  try {
    wrapTables(batch);
    await runRenderers(batch);
    batch.forEach(block => {
      if (block.isConnected) block.dataset.richRendered = 'true';
    });
    if (state.annotations.some(annotation => annotation && (annotation.type === 'bookmark' || annotation.type === 'note'))) {
      scheduleBookmarkMarkersUpdate();
    }
    if (hasNoteAnnotations()) scheduleNoteMarginRender(280);
    if (batch.some(block => block.querySelector('.mermaid'))) scheduleDiagramBinding();
  } finally {
    state.richRendererRunning = false;
    if (state.richRendererQueue.size) {
      state.richRendererTimer = window.setTimeout(flushRichRendererQueue, batchHasTable ? 260 : 32);
    }
  }
}

function scheduleRichRenderers(roots) {
  const blocks = richRendererBlocks(roots);
  if (!blocks.length) return;
  const observer = ensureRichRendererObserver();
  if (!observer) {
    blocks.forEach(queueRichRendererBlock);
    return;
  }
  blocks.forEach(block => observer.observe(block));
}

async function renderAllRichContent() {
  // Serialize export with the lazy renderer, which may already be typesetting.
  while (state.richRendererRunning) await new Promise(resolve => window.setTimeout(resolve, 20));
  if (state.richRendererObserver) state.richRendererObserver.disconnect();
  state.richRendererQueue.clear();
  clearTimeout(state.richRendererTimer);
  state.richRendererTimer = null;
  const blocks = richRendererBlocks(state.blockElements);
  for (let index = 0; index < blocks.length; index += 12) {
    const batch = blocks.slice(index, index + 12);
    wrapTables(batch);
    await runRenderers(batch);
    batch.forEach(block => { block.dataset.richRendered = 'true'; });
  }
  state.previewMetricsDirty = true;
}

export { refreshPreviewBlockCache, refreshPreviewBlockMetrics, ensurePreviewResizeObserver, observePreviewBlockSizes, createBlockElement, updateBlockElementMetadata, patchPreviewBlocks, previewBlockElementByIndex, previewBlockElementBySourceStart, previewBlockTop, blockElementAtScrollTop, renderPreview, initLibraries, postProcessPreview, nodesInRoots, linkCitations, runRenderers, blockNeedsRichRendering, richRendererBlocks, ensureRichRendererObserver, queueRichRendererBlock, flushRichRendererQueue, scheduleRichRenderers, renderAllRichContent };
