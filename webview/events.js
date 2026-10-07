import { els, state } from './state.js';
import { applyDocumentAvailability, applyLanguage, applyLayout, applyReaderFontSize, applySourceCollapsed, applyTheme, hasPendingLocalMarkdownChange, post, setOutlineFilesHeight, setSourceCollapsed, setStatus, setupOutlineSplitter, setupResizers, sourceIsHidden, t, updateDocumentKindLabels, updatePreviewModeStatus, updateReaderFastMode } from './ui.js';
import { beginPreviewScrollIntent, captureReadingProgress, handlePreviewLinkClick, markPreviewScrolling, navigateReadingHistory, pushReadingPosition, renderMarkdownFiles, requestDocumentSwitch, restoreReadingProgress, saveReadingProgressNow, schedulePreviewRepaint, schedulePreviewScrollFrame, schedulePreviewScrollIdleWork, scheduleReadingHistoryCapture, scheduleScrollSync, togglePreviewNotes, togglePreviewToc, topForReadingProgress } from './navigation.js';
import { addAnnotation, confirmNoteAnnotation, deleteAnnotation, finishRailPointerDrag, handlePreviewSelection, handleRailClick, handleRailMouseLeave, handleRailMouseMove, handleRailPointerDown, handleRailPointerMove, handleRailWheel, hasNoteAnnotations, hideHovercardSoon, hideNoteEditor, hideSelectionToolbar, sanitizeClientAnnotations, scheduleBookmarkMarkersUpdate, scheduleNoteMarginRender, showHovercard, showNoteEditor } from './annotations.js';
import { hideTableFilterMenus, sanitizeClientTableLayouts, saveTableLayoutsNow } from './tables.js';
import { clipboardImage, handleImagePaste, insertMarkdownAfterActiveBlock, insertTextInEditor, markdownImageLine, patchMarkdownBlockFromPreview, saveMarkdown, schedulePreviewPatch, setMarkdown, updateSourceStatus } from './editor.js';
import { renderPreview } from './rendering.js';
import { exportHtml } from './export.js';
import { closeSearchBox, handleSearchInputKeydown, navigateSearch, openSearchBox, refreshSearch } from './search.js';
import { handlePreviewCopy, hideFileContextMenu, showPreviewContextMenu } from './clipboard.js';
import { closeLightbox, setupImageEvents } from './images.js';
import { scheduleSourceAxisRender } from './outline.js';

function handleHostMessage(message) {
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'documentDeleted') {
    if (message.uri !== state.uri) return;
    state.documentDeleted = true;
    clearTimeout(state.saveTimer);
    clearTimeout(state.patchTimer);
    clearTimeout(state.readingProgressSaveTimer);
    state.pendingMarkdownSaves.clear();
    if (Array.isArray(message.markdownFiles)) state.markdownFiles = message.markdownFiles;
    applyDocumentAvailability();
    renderMarkdownFiles();
    return;
  }
  if (message.type === 'documentLoaded' || message.type === 'documentChanged') {
    if (message.type === 'documentChanged' && message.uri !== state.uri) return;
    const incomingMarkdown = typeof message.markdown === 'string' ? message.markdown : '';
    const guardedExternalChange = message.changeReason === 'external' || message.changeReason === 'editor';
    if (message.type === 'documentChanged' && guardedExternalChange && !message.forceReload && hasPendingLocalMarkdownChange() && incomingMarkdown !== state.markdown) {
      setStatus(t('externalChangePending'));
      return;
    }
    if (message.type === 'documentChanged' && message.forceReload) {
      clearTimeout(state.saveTimer);
      state.pendingMarkdownSaves.clear();
    }
    const pendingSwitch = message.type === 'documentLoaded' && state.pendingDocumentSwitch && state.pendingDocumentSwitch.targetUri === message.uri
      ? state.pendingDocumentSwitch
      : null;
    const reuseInitialRender = message.type === 'documentLoaded'
      && !pendingSwitch
      && message.uri === state.uri
      && incomingMarkdown === state.markdown
      && state.blockElements.length > 0;
    const restoreProgress = message.type === 'documentLoaded'
      ? ((pendingSwitch && pendingSwitch.restoreProgress) || message.readingProgress || state.readingProgress)
      : captureReadingProgress();
    if (message.type === 'documentLoaded') {
      state.documentDeleted = false;
      state.uri = message.uri || state.uri;
      state.fileName = message.fileName || state.fileName;
      state.documentKind = message.documentKind || state.documentKind || 'markdown';
      state.markdownHash = message.markdownHash || state.markdownHash;
      state.imageMap = new Map();
      state.pendingImageTarget = null;
      state.activeBlockIndex = null;
      state.pendingMarkdownSaves.clear();
      if (pendingSwitch) state.pendingDocumentSwitch = null;
    }
    state.markdown = incomingMarkdown;
    state.committedMarkdown = state.markdown;
    state.documentKind = message.documentKind || state.documentKind || 'markdown';
    state.markdownHash = message.markdownHash || state.markdownHash;
    if (Array.isArray(message.annotations)) state.annotations = sanitizeClientAnnotations(message.annotations);
    if (message.tableLayouts && typeof message.tableLayouts === 'object') {
      state.tableLayouts = sanitizeClientTableLayouts(message.tableLayouts);
    }
    if (Array.isArray(message.markdownFiles)) state.markdownFiles = message.markdownFiles;
    if (!sourceIsHidden()) els.editor.value = state.markdown;
    els.documentName.textContent = message.fileName || state.fileName;
    updateSourceStatus();
    applyDocumentAvailability();
    renderMarkdownFiles();
    updateDocumentKindLabels();
    if (reuseInitialRender) {
      state.readingProgress = restoreProgress || null;
      restoreReadingProgress(state.readingProgress, { resetHistory: state.readingHistory.length === 0 });
      schedulePreviewRepaint(80);
      return;
    }
    renderPreview({ initialProgress: restoreProgress, forceFull: message.type === 'documentLoaded' }).then(rendered => {
      if (rendered === false) return;
      state.readingProgress = restoreProgress || null;
      restoreReadingProgress(state.readingProgress, { resetHistory: state.readingHistory.length === 0 });
      if (pendingSwitch && pendingSwitch.recordTarget) {
        window.setTimeout(() => pushReadingPosition(topForReadingProgress(state.readingProgress), { force: true }), 180);
      }
      if (pendingSwitch && pendingSwitch.historyNavigation) {
        window.setTimeout(() => { state.readingHistoryApplying = false; }, 260);
      }
      scheduleNoteMarginRender();
      if (hasNoteAnnotations()) {
        window.setTimeout(scheduleNoteMarginRender, 180);
      }
    });
    if (message.type === 'documentChanged' && message.changeReason === 'external') {
      setStatus(t('externalChangeReloaded'));
    }
  }
  if (message.type === 'panelVisible') {
    if (message.uri !== state.uri) return;
    schedulePreviewRepaint(30);
  }
  if (message.type === 'imageResolved') {
    if (!message.relativePath || !message.webviewUri) return;
    state.imageMap.set(message.relativePath, message.webviewUri);
    els.preview.querySelectorAll('img[data-raw-src="' + CSS.escape(message.relativePath) + '"]').forEach(img => {
      img.src = message.webviewUri;
    });
  }
  if (message.type === 'imageSaved') {
    state.imageMap.set(message.markdownPath, message.webviewUri);
    const line = markdownImageLine(message);
    if (state.pendingImageTarget === 'preview') insertMarkdownAfterActiveBlock(line);
    else insertTextInEditor(line);
    saveMarkdown();
    setStatus(t('imageSaved', { path: message.markdownPath }));
    state.pendingImageTarget = null;
  }
  if (message.type === 'markdownFilesChanged') {
    if (message.uri !== state.uri || !Array.isArray(message.markdownFiles)) return;
    state.markdownFiles = message.markdownFiles;
    renderMarkdownFiles();
  }
  if (message.type === 'markdownCommitted') {
    if (message.uri !== state.uri) return;
    state.documentKind = message.documentKind || state.documentKind || 'markdown';
    state.markdownHash = message.markdownHash || state.markdownHash;
    const saveId = Number(message.saveId);
    if (Number.isFinite(saveId)) state.pendingMarkdownSaves.delete(saveId);
    if (typeof message.markdown === 'string') {
      state.committedMarkdown = message.markdown;
    }
  }
  if (message.type === 'filePathCopied') {
    if (message.uri !== state.uri) return;
    setStatus(t('pathCopied'));
  }
  if (message.type === 'previewSelectionCopied') {
    if (message.uri !== state.uri) return;
    setStatus(t('selectionCopied'));
  }
  if (message.type === 'linkedMarkdownResolved') {
    if (message.uri !== state.uri || !message.targetUri) return;
    requestDocumentSwitch(message.targetUri, { recordTarget: true });
  }
  if (message.type === 'error') setStatus(message.message || t('operationFailed'));
}

function setupEvents() {
  els.saveDocument.addEventListener('click', () => saveMarkdown({ saveToDisk: true }));
  if (els.collapseMarkdown) {
    els.collapseMarkdown.addEventListener('click', () => setSourceCollapsed(!state.sourceCollapsed));
  }
  els.exportHtml.addEventListener('click', exportHtml);
  els.togglePreviewEdit.addEventListener('click', () => {
    state.previewEditEnabled = !state.previewEditEnabled;
    updateReaderFastMode();
    updatePreviewModeStatus();
    renderPreview();
  });
  if (els.themeSelect) {
    els.themeSelect.addEventListener('change', () => applyTheme(els.themeSelect.value));
  }
  if (els.languageSelect) {
    els.languageSelect.addEventListener('change', () => applyLanguage(els.languageSelect.value));
  }
  if (els.fontSizeSelect) {
    els.fontSizeSelect.addEventListener('change', () => applyReaderFontSize(els.fontSizeSelect.value));
  }
  if (els.searchInput) {
    els.searchInput.addEventListener('input', () => refreshSearch());
    els.searchInput.addEventListener('keydown', handleSearchInputKeydown);
  }
  if (els.searchPrev) els.searchPrev.addEventListener('click', () => navigateSearch(-1));
  if (els.searchNext) els.searchNext.addEventListener('click', () => navigateSearch(1));
  if (els.searchClose) els.searchClose.addEventListener('click', () => closeSearchBox());
  els.previewTocToggle.addEventListener('click', togglePreviewToc);
  els.previewNotesToggle.addEventListener('click', togglePreviewNotes);
  els.readingBack.addEventListener('click', () => navigateReadingHistory(-1));
  els.readingForward.addEventListener('click', () => navigateReadingHistory(1));
  els.selectionToolbar.addEventListener('pointerdown', event => {
    if (event.target.closest('textarea, input')) return;
    event.preventDefault();
  });
  els.highlightSelection.addEventListener('click', () => addAnnotation('highlight'));
  els.bookmarkSelection.addEventListener('click', () => addAnnotation('bookmark'));
  els.noteSelection.addEventListener('click', showNoteEditor);
  els.confirmSelectionNote.addEventListener('click', confirmNoteAnnotation);
  els.cancelSelectionNote.addEventListener('click', hideNoteEditor);
  els.selectionNoteText.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      confirmNoteAnnotation();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      hideNoteEditor();
    }
  });

  els.editor.addEventListener('input', () => setMarkdown(els.editor.value, { skipEditorUpdate: true }));
  els.editor.addEventListener('scroll', () => scheduleScrollSync('source'));
  els.editor.addEventListener('wheel', () => scheduleScrollSync('source'));
  els.editor.addEventListener('paste', event => {
    const image = clipboardImage(event);
    if (!image) return;
    event.preventDefault();
    handleImagePaste(image, 'source').catch(error => setStatus(error.message || t('imageSaveFailed')));
  });

  els.previewScroller.addEventListener('scroll', () => {
    markPreviewScrolling();
    schedulePreviewScrollFrame();
    schedulePreviewScrollIdleWork();
  }, { passive: true });
  els.previewScroller.addEventListener('wheel', () => {
    beginPreviewScrollIntent();
  }, { passive: true });
  els.previewScroller.addEventListener('pointerdown', beginPreviewScrollIntent);
  els.previewScroller.addEventListener('pointerup', scheduleReadingHistoryCapture);
  els.previewScroller.addEventListener('pointercancel', scheduleReadingHistoryCapture);

  els.preview.addEventListener('click', event => {
    if (handlePreviewLinkClick(event)) return;
    const block = event.target.closest('.md-block');
    if (!block) return;
    state.activeBlockIndex = Number(block.dataset.blockIndex);
  });
  els.preview.addEventListener('mouseup', handlePreviewSelection);
  els.preview.addEventListener('keyup', handlePreviewSelection);
  els.preview.addEventListener('contextmenu', showPreviewContextMenu);
  els.preview.addEventListener('copy', handlePreviewCopy);
  els.preview.addEventListener('input', event => {
    const block = event.target.closest('.md-block[contenteditable="true"]');
    if (block) schedulePreviewPatch(block);
  });
  els.preview.addEventListener('focusout', event => {
    const block = event.target.closest('.md-block[contenteditable="true"]');
    if (block) patchMarkdownBlockFromPreview(block);
  });
  els.preview.addEventListener('paste', event => {
    const image = clipboardImage(event);
    if (!image) return;
    event.preventDefault();
    const block = event.target.closest('.md-block');
    if (block) state.activeBlockIndex = Number(block.dataset.blockIndex);
    handleImagePaste(image, 'preview').catch(error => setStatus(error.message || t('imageSaveFailed')));
  });

  els.preview.addEventListener('mouseover', event => {
    const anchor = event.target.closest('a, [data-preview-id], [data-annotation-id]');
    if (anchor && els.preview.contains(anchor)) showHovercard(anchor);
  });
  els.preview.addEventListener('mouseout', event => {
    const anchor = event.target.closest('a, [data-preview-id], [data-annotation-id]');
    if (!anchor || !els.preview.contains(anchor)) return;
    if (anchor.contains(event.relatedTarget)) return;
    hideHovercardSoon();
  });
  if (els.bookmarkRail) {
    els.bookmarkRail.addEventListener('pointerdown', handleRailPointerDown);
    els.bookmarkRail.addEventListener('pointermove', handleRailPointerMove);
    els.bookmarkRail.addEventListener('pointerup', finishRailPointerDrag);
    els.bookmarkRail.addEventListener('pointercancel', finishRailPointerDrag);
    els.bookmarkRail.addEventListener('mousemove', handleRailMouseMove);
    els.bookmarkRail.addEventListener('mouseleave', handleRailMouseLeave);
    els.bookmarkRail.addEventListener('click', handleRailClick);
    els.bookmarkRail.addEventListener('wheel', handleRailWheel, { passive: false });
  }
  els.hovercard.addEventListener('mouseenter', () => clearTimeout(state.hoverTimer));
  els.hovercard.addEventListener('mouseleave', hideHovercardSoon);
  els.hovercard.addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-delete-annotation-id]');
    if (!deleteButton) return;
    event.preventDefault();
    deleteAnnotation(deleteButton.dataset.deleteAnnotationId || '');
  });

  setupImageEvents();

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      openSearchBox();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveMarkdown();
    }
    if (event.key === 'Escape') {
      hideTableFilterMenus();
      hideFileContextMenu();
      if (els.searchBox && !els.searchBox.hidden) closeSearchBox();
      hideSelectionToolbar();
      closeLightbox();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.table-filter-menu, .table-filter-button')) hideTableFilterMenus();
    if (els.fileContextMenu && els.fileContextMenu.contains(event.target)) return;
    hideFileContextMenu();
    if (els.selectionToolbar.contains(event.target) || els.preview.contains(event.target)) return;
    hideSelectionToolbar();
  });
  document.addEventListener('copy', handlePreviewCopy);

  window.addEventListener('message', event => handleHostMessage(event.data));
  window.addEventListener('beforeunload', () => {
    saveReadingProgressNow();
    saveTableLayoutsNow();
  });
  window.addEventListener('resize', () => {
    hideTableFilterMenus();
    hideFileContextMenu();
    hideSelectionToolbar();
    scheduleSourceAxisRender();
    scheduleBookmarkMarkersUpdate();
    scheduleNoteMarginRender();
  });
  els.markdownFileList.addEventListener('scroll', hideFileContextMenu);
}

function bootstrap() {
  applyTheme(state.theme, { silent: true });
  applyReaderFontSize(state.readerFontSize);
  applyLanguage(state.language, { silent: true });
  applySourceCollapsed();
  applyLayout();
  els.documentName.textContent = state.fileName;
  if (!sourceIsHidden()) els.editor.value = state.markdown;
  state.annotations = sanitizeClientAnnotations(state.annotations);
  if (state.previewOnly) els.editor.disabled = true;
  setOutlineFilesHeight(state.outlineFilesHeight, false);
  renderMarkdownFiles();
  setupResizers();
  setupOutlineSplitter();
  setupEvents();
  updateSourceStatus();
  renderPreview({ initialProgress: state.readingProgress }).then(async rendered => {
    if (rendered === false) return;
    restoreReadingProgress(state.readingProgress, { resetHistory: true });
    scheduleNoteMarginRender();
    if (hasNoteAnnotations()) {
      window.setTimeout(scheduleNoteMarginRender, 180);
    }
    if (window.__MARKDOWN_STUDIO_INITIAL_STATE__?.exportOnReady) await exportHtml();
  });
  post({ type: 'ready' });
}

export { handleHostMessage, setupEvents, bootstrap };
