import { els, state } from './state.js';
import { renderOutlineList, scrollEditorToLine, visiblePreviewBlock } from './navigation.js';
import { setSourceCollapsed, t } from './ui.js';
import { blockPlainText, escapeHtml } from './utils.js';
import { refreshPreviewBlockMetrics } from './rendering.js';

function renderOutlines() {
  const headings = state.blocks.filter(block => block.type === 'heading' && block.headingTitle);
  renderOutlineList(els.outlineTree, headings);
  renderOutlineList(els.previewTocNav, headings);
}

function sourceLineRangeLabel(block) {
  const start = Math.max(1, Number(block.start) + 1);
  const end = Math.max(start, Number(block.end) + 1);
  return start === end ? String(start) : start + '-' + end;
}

function axisBlockKind(block, element) {
  if (!block) return t('axisBlock');
  if (block.type === 'heading') return t('axisHeading');
  if (block.type === 'table' || (element && element.querySelector('table'))) return t('axisTable');
  if (block.type === 'math') return t('axisFormula');
  if (block.type === 'code') return t('axisCode');
  if (block.type === 'list') return t('axisList');
  if (block.type === 'blockquote') return t('axisQuote');
  if (block.type === 'reference') return t('axisReference');
  if (block.type === 'frontmatter') return t('axisMetadata');
  if (element && element.querySelector('.mermaid, .doc-diagram')) return t('axisDiagram');
  if (element && element.querySelector('img, figure')) return t('axisFigure');
  return t('axisParagraph');
}

function axisBlockClass(block, element) {
  if (!block) return 'block';
  if (block.type === 'table' || (element && element.querySelector('table'))) return 'table';
  if (element && element.querySelector('img, figure')) return 'figure';
  if (element && element.querySelector('.mermaid, .doc-diagram')) return 'diagram';
  if (block.type === 'math') return 'math';
  return String(block.type || 'block').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
}

function axisBlockSummary(block, element) {
  const text = blockPlainText(block || {});
  const fallback = element ? (element.innerText || element.textContent || '') : '';
  return String(text || fallback || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function offsetForSourceLine(value, line) {
  const targetLine = Math.max(0, Math.round(Number(line) || 0));
  let offset = 0;
  let currentLine = 0;
  const text = String(value || '');
  while (currentLine < targetLine && offset < text.length) {
    const next = text.indexOf('\n', offset);
    if (next < 0) return text.length;
    offset = next + 1;
    currentLine += 1;
  }
  return offset;
}

function revealSourceLine(line) {
  const sourceLine = Math.max(0, Math.round(Number(line) || 0));
  if (!state.previewOnly && state.sourceCollapsed) {
    setSourceCollapsed(false);
  }
  window.requestAnimationFrame(() => {
    scrollEditorToLine(sourceLine);
    if (state.previewOnly || !els.editor) return;
    const start = offsetForSourceLine(els.editor.value, sourceLine);
    const nextBreak = els.editor.value.indexOf('\n', start);
    const end = nextBreak < 0 ? els.editor.value.length : nextBreak;
    els.editor.focus();
    els.editor.setSelectionRange(start, end);
  });
}

function renderSourceAxis() {
  if (!els.sourceAxis || !els.previewScroller) return;
  clearTimeout(state.sourceAxisGeometryTimer);
  state.sourceAxisGeometryTimer = null;
  state.sourceAxisGeometryPending = false;
  if (state.sourceAxisGeometryRaf) {
    window.cancelAnimationFrame(state.sourceAxisGeometryRaf);
    state.sourceAxisGeometryRaf = 0;
  }
  const buildVersion = ++state.sourceAxisBuildVersion;
  clearTimeout(state.sourceAxisBuildTimer);
  state.sourceAxisBuildTimer = null;
  const enabled = state.blocks.length > 0 && state.blockElements.length > 0;
  els.previewScroller.classList.toggle('has-source-axis', enabled);
  els.sourceAxis.innerHTML = '';
  state.sourceAxisItems = [];
  state.sourceAxisVisibleRange = '';
  state.sourceAxisMarkers = new Map();
  state.activeSourceAxisMarker = null;
  state.activeSourceAxisIndex = '';
  if (!enabled) {
    els.sourceAxis.style.height = '0px';
    return;
  }

  if (state.previewMetricsDirty || state.blockTops.length !== state.blockElements.length) {
    refreshPreviewBlockMetrics();
  }
  let blockBottom = 0;
  for (let index = 0; index < state.blockTops.length; index += 1) {
    blockBottom = Math.max(blockBottom, state.blockTops[index] + (state.blockHeights[index] || 0));
  }
  const axisHeight = blockBottom + 40;
  els.sourceAxis.style.height = axisHeight + 'px';

  let elementIndex = 0;
  const buildChunk = () => {
    state.sourceAxisBuildTimer = null;
    if (buildVersion !== state.sourceAxisBuildVersion) return;
    if (state.previewScrolling) {
      state.sourceAxisPending = true;
      return;
    }
    const startedAt = performance.now();
    let count = 0;
    while (elementIndex < state.blockElements.length && count < 80 && performance.now() - startedAt < 5) {
      const element = state.blockElements[elementIndex];
      const blockIndex = Number(element.dataset.blockIndex);
      const block = state.blocks[blockIndex];
      if (block) {
        const cachedTop = Number(state.blockTops[elementIndex]);
        const cachedHeight = Number(state.blockHeights[elementIndex]);
        const top = Math.max(0, Number.isFinite(cachedTop) ? cachedTop : Math.round(element.offsetTop || 0));
        const height = Math.max(18, Number.isFinite(cachedHeight) ? cachedHeight : Math.round(element.offsetHeight || 0));
        const kind = axisBlockKind(block, element);
        const lines = sourceLineRangeLabel(block);
        const summary = axisBlockSummary(block, element);
        state.sourceAxisItems.push({
          blockIndex: block.index,
          sourceStart: block.start,
          top,
          height,
          bottom: top + height,
          kind,
          lines,
          summary,
          className: 'source-axis-marker source-axis-' + axisBlockClass(block, element)
        });
      }
      elementIndex += 1;
      count += 1;
    }
    if (elementIndex < state.blockElements.length) {
      state.sourceAxisBuildTimer = window.setTimeout(buildChunk, 0);
      return;
    }
    state.activeSourceAxisMarker = null;
    state.activeSourceAxisIndex = '';
    renderVisibleSourceAxisMarkers(true);
    updateSourceAxisActive();
  };
  buildChunk();
}

function sourceAxisVisibleRange() {
  const items = state.sourceAxisItems || [];
  if (!items.length || !els.previewScroller) return null;
  const viewport = els.previewScroller.clientHeight || 700;
  const buffer = Math.max(520, Math.round(viewport * 1.25));
  const visibleTop = Math.max(0, els.previewScroller.scrollTop - buffer);
  const visibleBottom = els.previewScroller.scrollTop + viewport + buffer;
  let low = 0;
  let high = items.length - 1;
  let start = items.length;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (items[mid].bottom >= visibleTop) {
      start = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  let end = start;
  while (end < items.length && items[end].top <= visibleBottom) end += 1;
  if (start >= items.length || end <= start) return { start: 0, end: 0 };
  const chunkSize = 36;
  return {
    start: Math.max(0, Math.floor(start / chunkSize) * chunkSize),
    end: Math.min(items.length, Math.ceil(end / chunkSize) * chunkSize)
  };
}

function renderVisibleSourceAxisMarkers(force = false) {
  if (!els.sourceAxis) return;
  const range = sourceAxisVisibleRange();
  if (!range) return;
  const signature = range.start + ':' + range.end;
  if (!force && state.sourceAxisVisibleRange === signature) return;
  state.sourceAxisVisibleRange = signature;
  const visibleItems = (state.sourceAxisItems || []).slice(range.start, range.end);
  const visibleKeys = new Set(visibleItems.map(item => String(item.blockIndex)));
  state.sourceAxisMarkers.forEach((marker, key) => {
    if (visibleKeys.has(key)) return;
    if (state.activeSourceAxisMarker === marker) {
      state.activeSourceAxisMarker = null;
      state.activeSourceAxisIndex = '';
    }
    marker.remove();
    state.sourceAxisMarkers.delete(key);
  });
  const fragment = document.createDocumentFragment();
  for (const item of visibleItems) {
    const key = String(item.blockIndex);
    const existing = state.sourceAxisMarkers.get(key);
    if (existing) {
      existing.style.top = item.top + 'px';
      existing.style.minHeight = Math.min(92, Math.max(22, item.height)) + 'px';
      continue;
    }
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = item.className;
    marker.dataset.blockIndex = key;
    marker.dataset.sourceStart = String(item.sourceStart);
    marker.style.top = item.top + 'px';
    marker.style.minHeight = Math.min(92, Math.max(22, item.height)) + 'px';
    marker.title = [item.kind + ' - ' + t('sourceLineRange', { lines: item.lines }), item.summary].filter(Boolean).join('\n');
    marker.innerHTML = [
      '<span class="source-axis-tick" aria-hidden="true"></span>',
      '<span class="source-axis-text">',
      '<span class="source-axis-lines">L' + escapeHtml(item.lines) + '</span>',
      '<span class="source-axis-kind">' + escapeHtml(item.kind) + '</span>',
      '</span>'
    ].join('');
    marker.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      revealSourceLine(item.sourceStart);
    });
    state.sourceAxisMarkers.set(key, marker);
    fragment.appendChild(marker);
  }
  els.sourceAxis.appendChild(fragment);
  updateSourceAxisActive();
}

function scheduleSourceAxisRender(delay = 0) {
  clearTimeout(state.sourceAxisTimer);
  state.sourceAxisBuildVersion += 1;
  clearTimeout(state.sourceAxisBuildTimer);
  state.sourceAxisBuildTimer = null;
  if (state.previewScrolling) {
    state.sourceAxisPending = true;
    return;
  }
  state.sourceAxisPending = false;
  if (delay > 0) {
    state.sourceAxisTimer = window.setTimeout(() => {
      state.sourceAxisTimer = null;
      scheduleSourceAxisRender();
    }, delay);
    return;
  }
  if (state.sourceAxisRaf) return;
  state.sourceAxisRaf = window.requestAnimationFrame(() => {
    state.sourceAxisRaf = 0;
    renderSourceAxis();
  });
}

function updateSourceAxisActive() {
  if (!els.sourceAxis) return;
  const block = visiblePreviewBlock();
  const activeIndex = block ? String(block.dataset.blockIndex) : '';
  if (state.activeSourceAxisIndex === activeIndex) return;
  if (state.activeSourceAxisMarker) state.activeSourceAxisMarker.classList.remove('active');
  const marker = activeIndex ? state.sourceAxisMarkers.get(activeIndex) || null : null;
  if (marker) marker.classList.add('active');
  state.activeSourceAxisMarker = marker;
  state.activeSourceAxisIndex = activeIndex;
}

function scheduleSourceAxisActiveUpdate() {
  if (state.sourceAxisActiveRaf) return;
  state.sourceAxisActiveRaf = window.requestAnimationFrame(() => {
    state.sourceAxisActiveRaf = 0;
    updateSourceAxisActive();
  });
}

function refreshSourceAxisGeometry() {
  if (!els.sourceAxis || !state.sourceAxisItems.length) return;
  if (state.sourceAxisItems.length !== state.blockElements.length) {
    scheduleSourceAxisRender(120);
    return;
  }
  if (state.previewMetricsDirty || state.blockTops.length !== state.blockElements.length) {
    refreshPreviewBlockMetrics();
  }
  let blockBottom = 0;
  for (let index = 0; index < state.sourceAxisItems.length; index += 1) {
    const item = state.sourceAxisItems[index];
    const top = Math.max(0, Number(state.blockTops[index]) || 0);
    const height = Math.max(18, Number(state.blockHeights[index]) || 0);
    item.top = top;
    item.height = height;
    item.bottom = top + height;
    blockBottom = Math.max(blockBottom, item.bottom);
    const marker = state.sourceAxisMarkers.get(String(item.blockIndex));
    if (!marker) continue;
    marker.style.top = top + 'px';
    marker.style.minHeight = Math.min(92, Math.max(22, height)) + 'px';
  }
  els.sourceAxis.style.height = blockBottom + 40 + 'px';
  state.sourceAxisVisibleRange = '';
  renderVisibleSourceAxisMarkers(true);
  updateSourceAxisActive();
}

function scheduleSourceAxisGeometryUpdate(delay = 0) {
  clearTimeout(state.sourceAxisGeometryTimer);
  state.sourceAxisGeometryTimer = null;
  if (state.previewScrolling) {
    state.sourceAxisGeometryPending = true;
    return;
  }
  state.sourceAxisGeometryPending = false;
  if (delay > 0) {
    state.sourceAxisGeometryTimer = window.setTimeout(() => {
      state.sourceAxisGeometryTimer = null;
      scheduleSourceAxisGeometryUpdate();
    }, delay);
    return;
  }
  if (state.sourceAxisGeometryRaf) return;
  state.sourceAxisGeometryRaf = window.requestAnimationFrame(() => {
    state.sourceAxisGeometryRaf = 0;
    refreshSourceAxisGeometry();
  });
}

function scheduleSourceAxisVisibleUpdate() {
  if (!state.sourceAxisItems || !state.sourceAxisItems.length) return;
  if (state.sourceAxisVisibleRaf) return;
  state.sourceAxisVisibleRaf = window.requestAnimationFrame(() => {
    state.sourceAxisVisibleRaf = 0;
    renderVisibleSourceAxisMarkers();
  });
}

export { renderOutlines, sourceLineRangeLabel, axisBlockKind, axisBlockClass, axisBlockSummary, offsetForSourceLine, revealSourceLine, renderSourceAxis, sourceAxisVisibleRange, renderVisibleSourceAxisMarkers, scheduleSourceAxisRender, updateSourceAxisActive, scheduleSourceAxisActiveUpdate, refreshSourceAxisGeometry, scheduleSourceAxisGeometryUpdate, scheduleSourceAxisVisibleUpdate };
