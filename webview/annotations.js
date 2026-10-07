import { els, state } from './state.js';
import { clamp, post, t } from './ui.js';
import { escapeHtml, stripMarkdown } from './utils.js';
import { previewCopyDetails, rememberPreviewCopyDetails } from './clipboard.js';
import { blockElementAtScrollTop, previewBlockElementByIndex, previewBlockElementBySourceStart, previewBlockTop } from './rendering.js';
import { beginPreviewScrollIntent, maxPreviewScrollTop, normalizedPreviewScrollTop, scheduleReadingHistoryCapture, scheduleReadingProgressSave, scheduleScrollSync, setPreviewScrollTop } from './navigation.js';

function annotationSectionInfo(annotation) {
  if (!annotation) return null;
  const blockIndex = Number(annotation.blockIndex);
  const sourceStart = Number(annotation.sourceStart);
  let heading = null;
  for (const block of state.blocks) {
    if (block.type !== 'heading' || !block.headingTitle) continue;
    const beforeBlock = Number.isFinite(blockIndex) && blockIndex >= 0 && block.index <= blockIndex;
    const beforeLine = Number.isFinite(sourceStart) && sourceStart >= 0 && block.start <= sourceStart;
    if (beforeBlock || beforeLine) heading = block;
    const afterBlock = Number.isFinite(blockIndex) && blockIndex >= 0 && block.index > blockIndex;
    const afterLine = Number.isFinite(sourceStart) && sourceStart >= 0 && block.start > sourceStart;
    if (afterBlock || afterLine) break;
  }
  if (!heading) return null;
  const title = heading.headingTitle || '';
  const match = /^((?:\d+|[A-Z])(?:[.\-]\d+)*\.?)\s+(.+)$/.exec(title);
  return {
    id: heading.headingId || '',
    title,
    number: match ? match[1].replace(/\.$/, '') : '',
    subtitle: match ? match[2].trim() : title
  };
}

function compactNoteHoverMode() {
  if (!els.previewPane) return false;
  return els.previewPane.classList.contains('hide-margin-notes') || els.previewPane.clientWidth < 520;
}

function annotationHoverContent(annotation, anchor, options = {}) {
  const section = annotationSectionInfo(annotation);
  const fromRail = anchor && anchor.classList && anchor.classList.contains('annotation-marker');
  const label = annotation.type === 'bookmark' ? t('readingBookmark') : annotation.type === 'note' ? t('readingNote') : t('readingHighlight');
  const parts = [
    '<div class="hover-kicker">' + escapeHtml(label) + '</div>',
    '<div class="hover-title">' + escapeHtml(annotation.text || t('untitledSection')) + '</div>'
  ];
  if (fromRail && section) {
    parts.push('<div class="hover-body"><strong>' + escapeHtml(t('sectionLocation')) + '</strong>' + escapeHtml(section.title) + '</div>');
    if (section.number) parts.push('<div class="hover-body"><strong>' + escapeHtml(t('chapterNumber')) + '</strong>' + escapeHtml(section.number) + '</div>');
    if (section.subtitle) parts.push('<div class="hover-body"><strong>' + escapeHtml(t('subsectionTitle')) + '</strong>' + escapeHtml(section.subtitle) + '</div>');
  }
  if (annotation.context) {
    parts.push('<div class="hover-body"><strong>' + escapeHtml(t('context')) + '</strong>' + escapeHtml(annotation.context) + '</div>');
  }
  if (annotation.note && (annotation.type !== 'note' || options.includeNoteBody)) {
    parts.push('<div class="hover-body hover-note"><strong>' + escapeHtml(t('noteBody')) + '</strong>' + escapeHtml(annotation.note) + '</div>');
  }
  parts.push(
    '<div class="hover-actions"><button type="button" data-delete-annotation-id="' +
    escapeHtml(annotation.id) +
    '" title="' + escapeHtml(t('deleteAnnotationTitle')) + '">' +
    escapeHtml(t('deleteAnnotation')) +
    '</button></div>'
  );
  return parts.join('');
}

function hoverContentFor(anchor) {
  const targetId = anchor.dataset.previewId || ((anchor.getAttribute('href') || '').startsWith('#') ? anchor.getAttribute('href').slice(1) : '');
  if (/^ref-r\d+$/i.test(targetId)) {
    const label = targetId.replace(/^ref-r/i, 'R');
    const ref = state.refs.get(label);
    if (!ref) return null;
    return [
      '<div class="hover-kicker">' + escapeHtml(t('reference')) + '</div>',
      '<div class="hover-title">[' + ref.label + '] ' + escapeHtml(ref.title) + '</div>',
      ref.authors ? '<div class="hover-body"><strong>' + escapeHtml(t('authors')) + '</strong>' + escapeHtml(ref.authors) + '</div>' : '',
      ref.venue ? '<div class="hover-body"><strong>' + escapeHtml(t('venue')) + '</strong>' + escapeHtml(ref.venue) + '</div>' : '',
      ref.meta ? '<div class="hover-body"><strong>' + escapeHtml(t('info')) + '</strong>' + escapeHtml(ref.meta) + '</div>' : '',
      ref.url ? '<div class="hover-body"><a href="' + escapeHtml(ref.url) + '">' + escapeHtml(t('openSource')) + '</a></div>' : ''
    ].join('');
  }
  if (/^ref-[A-Za-z0-9_.:-]+$/i.test(targetId)) {
    const label = targetId.replace(/^ref-/i, '');
    const ref = state.refs.get(label) || state.refs.get(label.toLowerCase());
    if (!ref) return null;
    return [
      '<div class="hover-kicker">' + escapeHtml(t('reference')) + '</div>',
      '<div class="hover-title">[' + escapeHtml(ref.label) + '] ' + escapeHtml(ref.title) + '</div>',
      ref.venue ? '<div class="hover-body"><strong>' + escapeHtml(t('venue')) + '</strong>' + escapeHtml(ref.venue) + '</div>' : '',
      ref.meta ? '<div class="hover-body"><strong>' + escapeHtml(t('info')) + '</strong>' + escapeHtml(ref.meta) + '</div>' : ''
    ].join('');
  }
  const annotationId = anchor.dataset.annotationId;
  if (annotationId) {
    const annotation = state.annotations.find(entry => entry.id === annotationId);
    if (!annotation) return null;
    const fromRail = anchor.classList && anchor.classList.contains('annotation-marker');
    const compactNote = annotation.type === 'note' && compactNoteHoverMode();
    if (annotation.type === 'note' && !fromRail && !compactNote) return null;
    return annotationHoverContent(annotation, anchor, { includeNoteBody: compactNote });
  }
  if (targetId && state.sectionPreviews.has(targetId)) {
    const section = state.sectionPreviews.get(targetId);
    return [
      '<div class="hover-kicker">' + escapeHtml(t('section')) + '</div>',
      '<div class="hover-title">' + escapeHtml(section.title) + '</div>',
      '<div class="hover-body">' + escapeHtml(section.body) + '</div>'
    ].join('');
  }
  return null;
}

function showHovercardAt(html, rect) {
  if (!html) return;
  clearTimeout(state.hoverTimer);
  els.hovercard.innerHTML = html;
  els.hovercard.classList.add('visible');
  els.hovercard.setAttribute('aria-hidden', 'false');
  const cardRect = els.hovercard.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 10;
  if (left + cardRect.width > window.innerWidth - 14) left = window.innerWidth - cardRect.width - 14;
  if (top + cardRect.height > window.innerHeight - 14) top = Math.max(14, rect.top - cardRect.height - 10);
  els.hovercard.style.left = Math.max(14, left) + 'px';
  els.hovercard.style.top = Math.max(14, top) + 'px';
}

function showHovercard(anchor) {
  const html = hoverContentFor(anchor);
  if (!html) return;
  showHovercardAt(html, anchor.getBoundingClientRect());
}

function hideHovercardSoon() {
  clearTimeout(state.hoverTimer);
  state.hoverTimer = setTimeout(() => {
    els.hovercard.classList.remove('visible');
    els.hovercard.setAttribute('aria-hidden', 'true');
  }, 150);
}

function hideHovercardNow() {
  clearTimeout(state.hoverTimer);
  els.hovercard.classList.remove('visible');
  els.hovercard.setAttribute('aria-hidden', 'true');
}

function elementForNode(node) {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

function trimAnnotationText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeClientAnnotation(annotation) {
  if (!annotation || typeof annotation !== 'object') return null;
  const type = ['bookmark', 'highlight', 'note'].includes(annotation.type) ? annotation.type : '';
  if (!type) return null;
  const startOffset = Math.max(0, Math.round(Number(annotation.startOffset) || 0));
  const endOffset = Math.max(startOffset, Math.round(Number(annotation.endOffset) || startOffset));
  const blockIndex = Math.round(Number(annotation.blockIndex));
  const sourceStart = Math.round(Number(annotation.sourceStart));
  if (!Number.isFinite(blockIndex) && !Number.isFinite(sourceStart)) return null;
  return {
    id: trimAnnotationText(annotation.id, 80) || newAnnotationId(type),
    type,
    text: trimAnnotationText(annotation.text, 280),
    note: trimAnnotationText(annotation.note, 1600),
    context: trimAnnotationText(annotation.context, 900),
    blockIndex: Number.isFinite(blockIndex) ? blockIndex : -1,
    sourceStart: Number.isFinite(sourceStart) ? sourceStart : -1,
    startOffset,
    endOffset,
    blockOffset: Math.max(0, Math.round(Number(annotation.blockOffset) || 0)),
    createdAt: Math.max(0, Math.round(Number(annotation.createdAt) || Date.now()))
  };
}

function sanitizeClientAnnotations(annotations) {
  if (!Array.isArray(annotations)) return [];
  return annotations.map(sanitizeClientAnnotation).filter(Boolean).slice(-500);
}

function newAnnotationId(type) {
  return type + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function textOffsetWithinBlock(block, container, offset) {
  const range = document.createRange();
  range.selectNodeContents(block);
  try {
    range.setEnd(container, offset);
    return range.toString().length;
  } catch (error) {
    return 0;
  } finally {
    if (range.detach) range.detach();
  }
}

function selectionRect(range) {
  const rects = Array.from(range.getClientRects()).filter(rect => rect.width || rect.height);
  if (rects.length) return rects[rects.length - 1];
  return range.getBoundingClientRect();
}

function selectionIsAnnotatable(range) {
  const common = elementForNode(range.commonAncestorContainer);
  if (!common) return false;
  return !common.closest('svg, mjx-container, .mermaid, .selection-toolbar, .bookmark-rail');
}

function capturePreviewSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!selectionIsAnnotatable(range)) return null;
  const startElement = elementForNode(range.startContainer);
  const endElement = elementForNode(range.endContainer);
  const startBlock = startElement ? startElement.closest('.md-block') : null;
  const endBlock = endElement ? endElement.closest('.md-block') : null;
  if (!startBlock || !endBlock || startBlock !== endBlock || !els.preview.contains(startBlock)) return null;

  const blockText = startBlock.textContent || '';
  const startOffset = clamp(textOffsetWithinBlock(startBlock, range.startContainer, range.startOffset), 0, blockText.length);
  const endOffset = clamp(textOffsetWithinBlock(startBlock, range.endContainer, range.endOffset), startOffset, blockText.length);
  if (endOffset <= startOffset) return null;

  const selectedText = blockText.slice(startOffset, endOffset).trim() || selection.toString().trim();
  if (!selectedText) return null;
  const contextStart = Math.max(0, startOffset - 110);
  const contextEnd = Math.min(blockText.length, endOffset + 180);
  const context = (contextStart > 0 ? '...' : '') +
    trimAnnotationText(blockText.slice(contextStart, contextEnd), 900) +
    (contextEnd < blockText.length ? '...' : '');
  const rect = selectionRect(range);
  const scrollerRect = els.previewScroller.getBoundingClientRect();
  return {
    text: selectedText,
    context,
    blockIndex: Number(startBlock.dataset.blockIndex),
    sourceStart: Number(startBlock.dataset.sourceStart),
    startOffset,
    endOffset,
    blockOffset: Math.max(0, Math.round(els.previewScroller.scrollTop + rect.top - scrollerRect.top - startBlock.offsetTop)),
    rect
  };
}

function hideSelectionToolbar() {
  const noteEditorVisible = els.selectionNoteEditor && !els.selectionNoteEditor.hidden;
  if (!noteEditorVisible && !state.pendingAnnotationSelection && !els.selectionToolbar.classList.contains('visible')) return;
  state.pendingAnnotationSelection = null;
  hideNoteEditor();
  els.selectionToolbar.classList.remove('visible');
  els.selectionToolbar.setAttribute('aria-hidden', 'true');
}

function positionSelectionToolbar(selectionInfo) {
  if (!selectionInfo || !selectionInfo.rect) return;
  const toolbarRect = els.selectionToolbar.getBoundingClientRect();
  const rect = selectionInfo.rect;
  let left = selectionInfo.point ? selectionInfo.point.x + 12 : rect.left + rect.width / 2 - toolbarRect.width / 2;
  let top = selectionInfo.point ? selectionInfo.point.y + 12 : rect.top - toolbarRect.height - 10;
  if (!selectionInfo.point && top < 8) top = rect.bottom + 10;
  left = clamp(left, 8, Math.max(8, window.innerWidth - toolbarRect.width - 8));
  top = clamp(top, 8, Math.max(8, window.innerHeight - toolbarRect.height - 8));
  els.selectionToolbar.style.left = Math.round(left) + 'px';
  els.selectionToolbar.style.top = Math.round(top) + 'px';
}

function showSelectionToolbar(selectionInfo) {
  if (!selectionInfo || !selectionInfo.rect) {
    hideSelectionToolbar();
    return;
  }
  hideNoteEditor();
  state.pendingAnnotationSelection = selectionInfo;
  els.selectionToolbar.classList.add('visible');
  els.selectionToolbar.setAttribute('aria-hidden', 'false');
  positionSelectionToolbar(selectionInfo);
}

function hideNoteEditor() {
  if (!els.selectionNoteEditor) return;
  els.selectionNoteEditor.hidden = true;
  if (els.selectionNoteText) els.selectionNoteText.value = '';
}

function showNoteEditor() {
  const selectionInfo = state.pendingAnnotationSelection || capturePreviewSelection();
  if (!selectionInfo) return;
  state.pendingAnnotationSelection = selectionInfo;
  els.selectionToolbar.classList.add('visible');
  els.selectionToolbar.setAttribute('aria-hidden', 'false');
  els.selectionNoteEditor.hidden = false;
  els.selectionNoteText.value = '';
  els.selectionNoteText.placeholder = t('notePlaceholder');
  window.requestAnimationFrame(() => {
    positionSelectionToolbar(selectionInfo);
    els.selectionNoteText.focus();
  });
}

function handlePreviewSelection(event) {
  window.setTimeout(() => {
    const selectionInfo = capturePreviewSelection();
    if (selectionInfo && event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      selectionInfo.point = { x: event.clientX, y: event.clientY };
    }
    if (selectionInfo) {
      rememberPreviewCopyDetails(previewCopyDetails());
      showSelectionToolbar(selectionInfo);
    } else {
      hideSelectionToolbar();
    }
  }, 0);
}

function saveAnnotations() {
  state.annotations = sanitizeClientAnnotations(state.annotations);
  clearTimeout(state.saveTimer);
  post({
    type: 'updateAnnotations',
    uri: state.uri,
    markdown: state.markdown,
    annotations: state.annotations,
    baseMarkdownHash: state.markdownHash
  });
}

function addAnnotation(type, options = {}) {
  const selectionInfo = state.pendingAnnotationSelection || capturePreviewSelection();
  if (!selectionInfo) return;
  const noteText = type === 'note' ? trimAnnotationText(options.noteText, 1600) : '';
  if (type === 'note' && !noteText) {
    if (els.selectionNoteText) els.selectionNoteText.focus();
    return;
  }
  const annotation = sanitizeClientAnnotation(Object.assign({}, selectionInfo, {
    id: newAnnotationId(type),
    type,
    note: noteText,
    createdAt: Date.now()
  }));
  if (!annotation) return;
  state.annotations = sanitizeClientAnnotations(state.annotations).filter(entry => !(
    entry.type === annotation.type &&
    entry.blockIndex === annotation.blockIndex &&
    entry.sourceStart === annotation.sourceStart &&
    entry.startOffset === annotation.startOffset &&
    entry.endOffset === annotation.endOffset
  ));
  state.annotations.push(annotation);
  saveAnnotations();
  hideSelectionToolbar();
  const selection = window.getSelection();
  if (selection) selection.removeAllRanges();
  applyAnnotations();
  scheduleBookmarkMarkersUpdate();
  renderNotesPanel();
  scheduleNoteMarginRender();
}

function confirmNoteAnnotation() {
  addAnnotation('note', { noteText: els.selectionNoteText ? els.selectionNoteText.value : '' });
}

function deleteAnnotation(annotationId) {
  const before = state.annotations.length;
  state.annotations = sanitizeClientAnnotations(state.annotations).filter(annotation => annotation.id !== annotationId);
  if (state.annotations.length === before) return;
  saveAnnotations();
  hideHovercardNow();
  applyAnnotations();
  scheduleBookmarkMarkersUpdate();
  renderNotesPanel();
  scheduleNoteMarginRender();
}

function clearAnnotationMarks() {
  els.preview.querySelectorAll('.reader-highlight, .reader-bookmark-text, .reader-note-text').forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

function annotationBlockElement(annotation) {
  if (!annotation) return null;
  const sourceStart = Number(annotation.sourceStart);
  if (Number.isFinite(sourceStart) && sourceStart >= 0) {
    const byLine = previewBlockElementBySourceStart(sourceStart);
    if (byLine) return byLine;
  }
  const blockIndex = Number(annotation.blockIndex);
  if (Number.isFinite(blockIndex) && blockIndex >= 0) {
    return previewBlockElementByIndex(blockIndex);
  }
  return null;
}

function canWrapTextNode(node) {
  const parent = node.parentElement;
  if (!parent) return false;
  return !parent.closest('script, style, textarea, button, svg, mjx-container, .selection-toolbar, .bookmark-rail');
}

function wrapTextRangeInElement(block, annotation) {
  const blockText = block.textContent || '';
  const start = clamp(annotation.startOffset, 0, blockText.length);
  const end = clamp(annotation.endOffset, start, blockText.length);
  if (end <= start) return false;

  const segments = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.nodeValue.length;
    const nodeStart = offset;
    const nodeEnd = offset + length;
    if (nodeEnd > start && nodeStart < end && canWrapTextNode(node)) {
      segments.push({
        node,
        start: Math.max(0, start - nodeStart),
        end: Math.min(length, end - nodeStart)
      });
    }
    offset = nodeEnd;
  }

  let wrapped = false;
  const className = annotation.type === 'bookmark'
    ? 'reader-bookmark-text'
    : annotation.type === 'note'
      ? 'reader-note-text'
      : 'reader-highlight';
  for (const segment of segments.reverse()) {
    if (segment.end <= segment.start) continue;
    const range = document.createRange();
    range.setStart(segment.node, segment.start);
    range.setEnd(segment.node, segment.end);
    const mark = document.createElement('mark');
    mark.className = className;
    mark.dataset.annotationId = annotation.id;
    mark.title = annotation.type === 'bookmark' ? t('readingBookmark') : annotation.type === 'note' ? t('readingNote') : t('readingHighlight');
    try {
      range.surroundContents(mark);
    } catch (error) {
      const contents = range.extractContents();
      mark.appendChild(contents);
      range.insertNode(mark);
    } finally {
      if (range.detach) range.detach();
    }
    wrapped = true;
  }
  return wrapped;
}

function applyAnnotations() {
  clearAnnotationMarks();
  state.annotations = sanitizeClientAnnotations(state.annotations);
  const sorted = state.annotations.slice().sort((a, b) => {
    if (a.blockIndex !== b.blockIndex) return b.blockIndex - a.blockIndex;
    return b.startOffset - a.startOffset;
  });
  for (const annotation of sorted) {
    const block = annotationBlockElement(annotation);
    if (block) wrapTextRangeInElement(block, annotation);
  }
}

function targetAnnotationElement(annotation) {
  if (!annotation || !annotation.id) return null;
  return els.preview.querySelector('[data-annotation-id="' + CSS.escape(annotation.id) + '"]') || annotationBlockElement(annotation);
}

function annotationTargetTop(annotation, options = {}) {
  if (!options.precise) {
    const block = annotationBlockElement(annotation);
    if (block) {
      const blockOffset = Math.max(0, Math.round(Number(annotation.blockOffset) || 0));
      return Math.max(0, previewBlockTop(block) + blockOffset);
    }
  }
  const target = targetAnnotationElement(annotation);
  if (!target) return 0;
  const scrollerRect = els.previewScroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return Math.max(0, els.previewScroller.scrollTop + targetRect.top - scrollerRect.top);
}

function jumpToAnnotation(annotation) {
  const target = targetAnnotationElement(annotation);
  if (!target) return;
  const top = annotationTargetTop(annotation, { precise: true }) - Math.max(36, els.previewScroller.clientHeight * 0.16);
  setPreviewScrollTop(top, { recordCurrent: true, recordTarget: true });
  target.classList.add('annotation-pulse');
  window.setTimeout(() => target.classList.remove('annotation-pulse'), 1300);
  scheduleScrollSync('preview');
  scheduleReadingProgressSave(120);
}

function blockForPreviewTop(top) {
  const blockEl = blockElementAtScrollTop(top, 24);
  if (!blockEl) return null;
  const blockIndex = Number(blockEl.dataset.blockIndex);
  const block = state.blocks[blockIndex];
  return block ? { block, element: blockEl } : null;
}

function railPreviewContent(targetTop) {
  const match = blockForPreviewTop(targetTop);
  if (!match || !match.block) {
    return [
      '<div class="hover-kicker">' + escapeHtml(t('railPreview')) + '</div>',
      '<div class="hover-body">' + escapeHtml(t('railPreviewEmpty')) + '</div>'
    ].join('');
  }
  const section = annotationSectionInfo({
    blockIndex: match.block.index,
    sourceStart: match.block.start
  });
  const title = section ? section.title : (match.block.headingTitle || t('untitledSection'));
  const body = stripMarkdown(match.block.raw).slice(0, 620) || t('railPreviewEmpty');
  return [
    '<div class="hover-kicker">' + escapeHtml(t('railPreview')) + '</div>',
    '<div class="hover-title">' + escapeHtml(title) + '</div>',
    '<div class="hover-body">' + escapeHtml(body) + '</div>'
  ].join('');
}

function handleRailMouseMove(event) {
  if (!els.bookmarkRail || event.target.closest('.annotation-marker')) return;
  state.lastRailPreviewEvent = { clientX: event.clientX, clientY: event.clientY };
  if (state.railPreviewRaf) return;
  state.railPreviewRaf = window.requestAnimationFrame(() => {
    state.railPreviewRaf = 0;
    const point = state.lastRailPreviewEvent;
    if (!point) return;
    showRailPreviewAt(point.clientX, point.clientY);
  });
}

function showRailPreviewAt(clientX, clientY) {
  const targetTop = railTargetTopFromPoint(clientY);
  showHovercardAt(railPreviewContent(targetTop), {
    left: clientX - 6,
    right: clientX + 6,
    top: clientY - 6,
    bottom: clientY + 6,
    width: 12,
    height: 12
  });
}

function railTargetTopFromEvent(event) {
  return railTargetTopFromPoint(event.clientY);
}

function railTargetTopFromPoint(clientY) {
  const rect = els.bookmarkRail.getBoundingClientRect();
  const ratio = rect.height > 0 ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0;
  return maxPreviewScrollTop() * ratio;
}

function handleRailClick(event) {
  if (!els.bookmarkRail || event.target.closest('.annotation-marker')) return;
  event.preventDefault();
  if (state.railClickSuppressed) {
    state.railClickSuppressed = false;
    return;
  }
  beginPreviewScrollIntent();
  setPreviewScrollTop(railTargetTopFromEvent(event), { recordCurrent: true, recordTarget: true });
  scheduleScrollSync('preview');
  scheduleReadingProgressSave(120);
  scheduleReadingHistoryCapture();
  scheduleNoteMarginRender();
}

function handleRailWheel(event) {
  if (!els.previewScroller) return;
  event.preventDefault();
  beginPreviewScrollIntent();
  els.previewScroller.scrollTop = normalizedPreviewScrollTop(els.previewScroller.scrollTop + event.deltaY);
  scheduleScrollSync('preview');
  scheduleReadingProgressSave();
  scheduleReadingHistoryCapture();
  scheduleNoteMarginRender();
}

function handleRailMouseLeave() {
  state.lastRailPreviewEvent = null;
  if (state.railPreviewRaf) {
    window.cancelAnimationFrame(state.railPreviewRaf);
    state.railPreviewRaf = 0;
  }
  hideHovercardSoon();
}

function handleRailPointerDown(event) {
  if (!els.bookmarkRail || event.button !== 0 || event.target.closest('.annotation-marker')) return;
  event.preventDefault();
  beginPreviewScrollIntent();
  state.railDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    moved: false
  };
  clearTimeout(state.railClickSuppressTimer);
  state.railClickSuppressed = true;
  els.bookmarkRail.classList.add('dragging');
  document.body.classList.add('rail-dragging');
  els.bookmarkRail.setPointerCapture(event.pointerId);
  setPreviewScrollTop(railTargetTopFromEvent(event), { recordCurrent: true, recordTarget: true });
  scheduleScrollSync('preview');
  scheduleReadingProgressSave(120);
  scheduleNoteMarginRender();
}

function handleRailPointerMove(event) {
  if (!state.railDrag || state.railDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  if (Math.abs(event.clientY - state.railDrag.startY) > 2) state.railDrag.moved = true;
  els.previewScroller.scrollTop = normalizedPreviewScrollTop(railTargetTopFromEvent(event));
  scheduleScrollSync('preview');
  scheduleReadingProgressSave(120);
  if (hasNoteAnnotations()) scheduleNoteMarginRender();
}

function finishRailPointerDrag(event) {
  if (!state.railDrag || state.railDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const moved = !!state.railDrag.moved;
  state.railDrag = null;
  els.bookmarkRail.classList.remove('dragging');
  document.body.classList.remove('rail-dragging');
  if (els.bookmarkRail.hasPointerCapture(event.pointerId)) {
    els.bookmarkRail.releasePointerCapture(event.pointerId);
  }
  if (moved) scheduleReadingHistoryCapture();
  scheduleReadingProgressSave(120);
  clearTimeout(state.railClickSuppressTimer);
  state.railClickSuppressTimer = window.setTimeout(() => { state.railClickSuppressed = false; }, 160);
}

function scheduleBookmarkMarkersUpdate() {
  if (state.bookmarkMarkersRaf) return;
  state.bookmarkMarkersRaf = window.requestAnimationFrame(() => {
    state.bookmarkMarkersRaf = 0;
    updateBookmarkMarkers();
  });
}

function updateBookmarkMarkers() {
  if (!els.bookmarkRail) return;
  const railHeight = els.bookmarkRail.clientHeight || els.previewScroller.clientHeight;
  if (railHeight < 80 || (els.previewPane && els.previewPane.clientWidth < 320)) return;
  els.bookmarkRail.innerHTML = '';
  const railAnnotations = sanitizeClientAnnotations(state.annotations).filter(annotation => annotation.type === 'bookmark' || annotation.type === 'note');
  if (!railAnnotations.length) return;
  const travel = Math.max(0, railHeight - 12);
  const maxTop = maxPreviewScrollTop();
  for (const annotation of railAnnotations) {
    const targetTop = annotationTargetTop(annotation);
    const targetScrollTop = normalizedPreviewScrollTop(targetTop - Math.max(24, els.previewScroller.clientHeight * 0.16));
    const ratio = maxTop > 0 ? targetScrollTop / maxTop : 0;
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'annotation-marker ' + (annotation.type === 'note' ? 'note-marker' : 'bookmark-marker');
    marker.dataset.annotationId = annotation.id;
    marker.style.top = Math.round(clamp(ratio, 0, 1) * travel) + 'px';
    marker.title = annotation.text || (annotation.type === 'note' ? t('readingNote') : t('readingBookmark'));
    marker.addEventListener('mouseenter', () => showHovercard(marker));
    marker.addEventListener('mouseleave', hideHovercardSoon);
    marker.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      jumpToAnnotation(annotation);
    });
    els.bookmarkRail.appendChild(marker);
  }
}

function renderNotesPanel() {
  if (!els.previewNotesList) return;
  els.previewNotesList.innerHTML = '';
  const notes = sanitizeClientAnnotations(state.annotations).filter(annotation => annotation.type === 'note');
  if (!notes.length) {
    const empty = document.createElement('div');
    empty.className = 'preview-notes-empty';
    empty.textContent = t('noNotes');
    els.previewNotesList.appendChild(empty);
    return;
  }
  for (const annotation of notes) {
    const item = document.createElement('div');
    item.className = 'preview-note-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preview-note-jump';
    const section = annotationSectionInfo(annotation);
    const meta = document.createElement('div');
    meta.className = 'preview-note-meta';
    meta.textContent = section ? section.title : t('readingNote');
    const quote = document.createElement('div');
    quote.className = 'preview-note-quote';
    quote.textContent = annotation.text || t('untitledSection');
    const note = document.createElement('div');
    note.className = 'preview-note-body';
    note.textContent = annotation.note || '';
    button.append(meta, quote, note);
    button.addEventListener('click', () => {
      jumpToAnnotation(annotation);
      els.previewNotes.classList.add('collapsed');
      els.previewNotesToggle.setAttribute('aria-expanded', 'false');
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'preview-note-delete';
    remove.textContent = t('deleteAnnotation');
    remove.title = t('deleteAnnotationTitle');
    remove.addEventListener('click', event => {
      event.preventDefault();
      deleteAnnotation(annotation.id);
    });

    item.append(button, remove);
    els.previewNotesList.appendChild(item);
  }
}

function hasNoteAnnotations() {
  return Array.isArray(state.annotations) && state.annotations.some(annotation => annotation && annotation.type === 'note');
}

function renderNoteMargin() {
  if (!els.noteMarginPanel) return;
  const notes = sanitizeClientAnnotations(state.annotations).filter(annotation => annotation.type === 'note');
  const paneWidth = els.previewPane ? els.previewPane.clientWidth : window.innerWidth;
  const paneHeight = els.previewScroller ? els.previewScroller.clientHeight : window.innerHeight;
  if (paneWidth < 320 || paneHeight < 120) return;
  if (!notes.length) {
    if (els.noteMarginPanel.childElementCount) els.noteMarginPanel.innerHTML = '';
    if (els.noteConnectorLayer && els.noteConnectorLayer.childElementCount) els.noteConnectorLayer.innerHTML = '';
    if (els.previewPane) {
      els.previewPane.classList.remove('has-margin-notes', 'hide-margin-notes');
    }
    return;
  }
  els.noteMarginPanel.innerHTML = '';
  if (els.noteConnectorLayer) els.noteConnectorLayer.innerHTML = '';
  const showMarginNotes = notes.length > 0 && paneWidth >= 520;
  if (els.previewPane) {
    els.previewPane.classList.toggle('has-margin-notes', showMarginNotes);
    els.previewPane.classList.toggle('hide-margin-notes', notes.length > 0 && !showMarginNotes);
  }
  if (!showMarginNotes) return;
  prepareNoteConnectorLayer();
  const panelHeight = els.noteMarginPanel.clientHeight || els.previewScroller.clientHeight;
  const visibleTopMin = -180;
  const visibleTopMax = panelHeight + 100;
  let lastTop = -Infinity;
  for (const annotation of notes) {
    const targetTop = annotationTargetTop(annotation);
    const visibleTop = targetTop - els.previewScroller.scrollTop;
    if (visibleTop < visibleTopMin || visibleTop > visibleTopMax) continue;
    const card = document.createElement('article');
    card.className = 'note-margin-card';
    card.dataset.annotationId = annotation.id;
    const section = annotationSectionInfo(annotation);
    const meta = document.createElement('div');
    meta.className = 'note-margin-meta';
    meta.textContent = section ? section.title : t('readingNote');
    const quote = document.createElement('button');
    quote.type = 'button';
    quote.className = 'note-margin-quote';
    quote.textContent = annotation.text || t('untitledSection');
    quote.addEventListener('click', () => jumpToAnnotation(annotation));
    const body = document.createElement('div');
    body.className = 'note-margin-body';
    body.textContent = annotation.note || '';
    const actions = document.createElement('div');
    actions.className = 'note-margin-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = t('deleteAnnotation');
    remove.title = t('deleteAnnotationTitle');
    remove.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      deleteAnnotation(annotation.id);
    });
    actions.appendChild(remove);
    card.append(meta, quote, body, actions);
    const rawTop = clamp(Math.round(visibleTop), 8, Math.max(8, panelHeight - 120));
    const top = Math.max(rawTop, lastTop + 12);
    card.style.top = Math.min(top, Math.max(8, panelHeight - 72)) + 'px';
    lastTop = top + 72;
    els.noteMarginPanel.appendChild(card);
    drawNoteConnector(annotation, card);
  }
}

function scheduleNoteMarginRender(delay = 0) {
  clearTimeout(state.noteMarginTimer);
  if (delay > 0) {
    state.noteMarginTimer = window.setTimeout(() => {
      state.noteMarginTimer = null;
      scheduleNoteMarginRender();
    }, delay);
    return;
  }
  if (state.noteMarginRaf) return;
  state.noteMarginRaf = window.requestAnimationFrame(() => {
    state.noteMarginRaf = 0;
    state.lastNoteMarginRender = Date.now();
    renderNoteMargin();
  });
}

function prepareNoteConnectorLayer() {
  if (!els.noteConnectorLayer) return;
  const rect = els.noteConnectorLayer.getBoundingClientRect();
  els.noteConnectorLayer.setAttribute('viewBox', '0 0 ' + Math.max(1, Math.round(rect.width)) + ' ' + Math.max(1, Math.round(rect.height)));
}

function drawNoteConnector(annotation, card) {
  if (!els.noteConnectorLayer || !card) return;
  const target = targetAnnotationElement(annotation);
  if (!target) return;
  const layerRect = els.noteConnectorLayer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  if (targetRect.bottom < layerRect.top || targetRect.top > layerRect.bottom) return;
  const startX = clamp(targetRect.right - layerRect.left + 2, 0, layerRect.width);
  const startY = clamp(targetRect.top + targetRect.height / 2 - layerRect.top, 0, layerRect.height);
  const endX = clamp(cardRect.left - layerRect.left + 2, 0, layerRect.width);
  const endY = clamp(cardRect.top + Math.min(26, Math.max(12, cardRect.height / 2)) - layerRect.top, 0, layerRect.height);
  const bend = Math.max(28, Math.min(110, Math.abs(endX - startX) * 0.45));
  const c1X = startX + bend;
  const c2X = Math.max(startX + bend, endX - bend);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('note-connector-path');
  path.setAttribute('d', 'M ' + startX.toFixed(1) + ' ' + startY.toFixed(1) +
    ' C ' + c1X.toFixed(1) + ' ' + startY.toFixed(1) +
    ', ' + c2X.toFixed(1) + ' ' + endY.toFixed(1) +
    ', ' + endX.toFixed(1) + ' ' + endY.toFixed(1));
  const startDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  startDot.classList.add('note-connector-dot');
  startDot.setAttribute('cx', startX.toFixed(1));
  startDot.setAttribute('cy', startY.toFixed(1));
  startDot.setAttribute('r', '2.5');
  els.noteConnectorLayer.append(path, startDot);
}

export { annotationSectionInfo, compactNoteHoverMode, annotationHoverContent, hoverContentFor, showHovercardAt, showHovercard, hideHovercardSoon, hideHovercardNow, elementForNode, trimAnnotationText, sanitizeClientAnnotation, sanitizeClientAnnotations, newAnnotationId, textOffsetWithinBlock, selectionRect, selectionIsAnnotatable, capturePreviewSelection, hideSelectionToolbar, positionSelectionToolbar, showSelectionToolbar, hideNoteEditor, showNoteEditor, handlePreviewSelection, saveAnnotations, addAnnotation, confirmNoteAnnotation, deleteAnnotation, clearAnnotationMarks, annotationBlockElement, canWrapTextNode, wrapTextRangeInElement, applyAnnotations, targetAnnotationElement, annotationTargetTop, jumpToAnnotation, blockForPreviewTop, railPreviewContent, handleRailMouseMove, showRailPreviewAt, railTargetTopFromEvent, railTargetTopFromPoint, handleRailClick, handleRailWheel, handleRailMouseLeave, handleRailPointerDown, handleRailPointerMove, finishRailPointerDrag, scheduleBookmarkMarkersUpdate, updateBookmarkMarkers, renderNotesPanel, hasNoteAnnotations, renderNoteMargin, scheduleNoteMarginRender, prepareNoteConnectorLayer, drawNoteConnector };
