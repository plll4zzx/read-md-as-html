import { elementForNode } from './annotations.js';
import { els, state } from './state.js';
import { clamp, t } from './ui.js';
import { scheduleReadingProgressSave, setPreviewScrollTop } from './navigation.js';

function selectedPreviewText() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return '';
  const range = selection.getRangeAt(0);
  const container = elementForNode(range.commonAncestorContainer);
  if (!container || !els.preview.contains(container)) return '';
  return selection.toString().replace(/\s+/g, ' ').trim().slice(0, 160);
}

function openSearchBox() {
  if (!els.searchBox || !els.searchInput) return;
  const selectedText = selectedPreviewText();
  els.searchBox.hidden = false;
  els.searchBox.classList.add('visible');
  els.searchBox.setAttribute('aria-hidden', 'false');
  if (selectedText && !state.searchQuery) {
    els.searchInput.value = selectedText;
    refreshSearch();
  } else {
    els.searchInput.value = state.searchQuery || els.searchInput.value || '';
    updateSearchCount();
  }
  window.setTimeout(() => {
    els.searchInput.focus();
    els.searchInput.select();
  }, 0);
}

function closeSearchBox() {
  if (!els.searchBox) return;
  unwrapSearchHighlights();
  state.searchQuery = '';
  if (els.searchInput) els.searchInput.value = '';
  updateSearchCount();
  els.searchBox.classList.remove('visible');
  els.searchBox.setAttribute('aria-hidden', 'true');
  els.searchBox.hidden = true;
}

function unwrapSearchHighlights() {
  if (!els.preview) return;
  const marks = Array.from(els.preview.querySelectorAll('mark.search-hit'));
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
  state.searchMatches = [];
  state.searchIndex = -1;
  state.searchActiveElement = null;
}

function updateSearchCount() {
  if (!els.searchCount) return;
  const total = state.searchMatches.length;
  if (!state.searchQuery) {
    els.searchCount.textContent = '';
  } else if (!total) {
    els.searchCount.textContent = t('searchNoMatches');
  } else {
    els.searchCount.textContent = t('searchCount', {
      current: String(state.searchIndex + 1),
      total: String(total)
    });
  }
  if (els.searchPrev) els.searchPrev.disabled = total < 1;
  if (els.searchNext) els.searchNext.disabled = total < 1;
}

function searchNodeAllowed(node, queryLower) {
  if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
  const parent = node.parentElement;
  if (!parent) return NodeFilter.FILTER_REJECT;
  if (parent.closest('script, style, textarea, button, svg, mjx-container, .mermaid, .search-hit')) {
    return NodeFilter.FILTER_REJECT;
  }
  return node.nodeValue.toLowerCase().includes(queryLower)
    ? NodeFilter.FILTER_ACCEPT
    : NodeFilter.FILTER_REJECT;
}

function collectSearchTextNodes(queryLower) {
  const nodes = [];
  const walker = document.createTreeWalker(els.preview, NodeFilter.SHOW_TEXT, {
    acceptNode: node => searchNodeAllowed(node, queryLower)
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function markSearchTextNode(node, query, queryLower) {
  const text = node.nodeValue || '';
  const lower = text.toLowerCase();
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let index = lower.indexOf(queryLower);
  while (index >= 0) {
    if (index > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, index)));
    const mark = document.createElement('mark');
    mark.className = 'search-hit';
    mark.textContent = text.slice(index, index + query.length);
    fragment.appendChild(mark);
    state.searchMatches.push(mark);
    cursor = index + query.length;
    index = lower.indexOf(queryLower, cursor);
  }
  if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
  node.parentNode.replaceChild(fragment, node);
}

function refreshSearch(options = {}) {
  if (!els.preview || !els.searchInput) return;
  const previousIndex = state.searchIndex;
  const query = String(els.searchInput.value || '').trim();
  unwrapSearchHighlights();
  state.searchQuery = query;
  if (!query) {
    updateSearchCount();
    return;
  }
  const queryLower = query.toLowerCase();
  const nodes = collectSearchTextNodes(queryLower);
  for (const node of nodes) markSearchTextNode(node, query, queryLower);
  if (state.searchMatches.length) {
    state.searchIndex = options.preserveIndex
      ? clamp(previousIndex, 0, state.searchMatches.length - 1)
      : 0;
  }
  updateSearchActive({ skipScroll: !!options.skipScroll });
}

function updateSearchActive(options = {}) {
  if (state.searchActiveElement) state.searchActiveElement.classList.remove('active');
  const match = state.searchMatches[state.searchIndex] || null;
  state.searchActiveElement = match;
  if (match) {
    match.classList.add('active');
    if (!options.skipScroll) revealSearchMatch(match);
  }
  updateSearchCount();
}

function revealSearchMatch(match) {
  if (!match || !els.previewScroller) return;
  const matchRect = match.getBoundingClientRect();
  const scrollerRect = els.previewScroller.getBoundingClientRect();
  const top = els.previewScroller.scrollTop + matchRect.top - scrollerRect.top - Math.max(48, els.previewScroller.clientHeight * 0.18);
  setPreviewScrollTop(top);
  scheduleReadingProgressSave(120);
}

function navigateSearch(delta) {
  const total = state.searchMatches.length;
  if (!total) return;
  state.searchIndex = (state.searchIndex + delta + total) % total;
  updateSearchActive();
}

function handleSearchInputKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    navigateSearch(event.shiftKey ? -1 : 1);
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeSearchBox();
    els.previewScroller.focus();
  }
}

export { selectedPreviewText, openSearchBox, closeSearchBox, unwrapSearchHighlights, updateSearchCount, searchNodeAllowed, collectSearchTextNodes, markSearchTextNode, refreshSearch, updateSearchActive, revealSearchMatch, navigateSearch, handleSearchInputKeydown };
