import { els, state, vscode } from './state.js';
import { escapeHtml } from './utils.js';
import { updateSourceStatus } from './editor.js';
import { renderMarkdownFiles } from './navigation.js';
import { collectSectionPreviews } from './document.js';
import { renderOutlines, scheduleSourceAxisRender } from './outline.js';
import { renderNotesPanel, scheduleNoteMarginRender } from './annotations.js';
import { bindDiagramClicks } from './images.js';

const I18N = {
  en: {
    outline: 'Outline',
    markdownFiles: 'Markdown Files',
    markdownFilesLabel: 'Markdown files',
    outlineSplitLabel: 'Resize Markdown file list and outline',
    markdown: 'Markdown',
    documents: 'Documents',
    latex: 'LaTeX',
    preview: 'HTML Preview',
    language: 'Language',
    languageTitle: 'Choose UI language',
    theme: 'Theme',
    themeTitle: 'Choose read-md-as-html theme',
    fontSize: 'Size',
    fontSizeTitle: 'Preview font size',
    themeReaderLight: 'Light',
    themeSoftGreen: 'Soft Green',
    themeVscode: 'VS Code',
    themeDark: 'Dark',
    save: 'Save',
    saveTitle: 'Save',
    collapse: 'Collapse',
    collapseTitle: 'Collapse Markdown',
    expand: 'Markdown',
    expandTitle: 'Show Markdown',
    edit: 'Edit',
    editTitle: 'Edit rendered blocks',
    export: 'Export',
    exportTitle: 'Export HTML',
    backTitle: 'Back to previous reading position',
    forwardTitle: 'Forward to next reading position',
    previewToc: 'Outline',
    previewTocLabel: 'HTML outline',
    previewNotes: 'Notes',
    previewNotesLabel: 'Annotations',
    outlineResizeLabel: 'Resize outline and Markdown panes',
    previewResizeLabel: 'Resize Markdown and HTML preview panes',
    imageControls: 'Image controls',
    zoomOut: 'Zoom out',
    reset: 'Reset',
    zoomIn: 'Zoom in',
    close: 'Close',
    liveRender: 'Live render',
    previewEditable: 'Simple blocks editable',
    emptyDocument: 'Empty document',
    noHeadings: 'This document has no headings.',
    untitledSection: 'Untitled section',
    emptySection: 'This section has no previewable body.',
    metadata: 'Metadata',
    blocks: 'blocks',
    lines: 'lines',
    saved: 'Saved',
    synced: 'Synced to VS Code',
    previewSynced: 'Preview edit synced to Markdown',
    imageSaved: 'Image saved to {path}',
    operationFailed: 'Operation failed',
    externalChangeReloaded: 'Reloaded the latest Markdown from disk.',
    externalChangePending: 'External Markdown change detected; local webview edits are still pending.',
    documentDeleted: 'This document was deleted from disk. Pick another file from the project tree to continue.',
    documentDeletedTitle: 'Document deleted',
    documentDeletedBody: 'The Markdown file for this reader no longer exists on disk. The current preview is kept read-only so you can copy text or switch to another file from the project tree.',
    imageSaveFailed: 'Image save failed',
    mermaidError: 'Mermaid render error',
    mathError: 'Formula render error',
    clickToZoom: 'Click to zoom',
    reference: 'Reference',
    authors: 'Authors: ',
    venue: 'Venue: ',
    info: 'Info: ',
    openSource: 'Open source',
    copyAbsolutePath: 'Copy absolute path',
    copyRelativePath: 'Copy relative path',
    copySelection: 'Copy',
    copyWithPath: 'Copy with path',
    copyPathLabel: 'Path',
    copySectionLabel: 'Section',
    copyLineLabel: 'Line',
    copyContentLabel: 'Content',
    pathCopied: 'Path copied',
    selectionCopied: 'Copied',
    noCopySelection: 'Select preview text to copy',
    pinnedSection: 'Pinned',
    tableFilter: 'Filter column',
    tableFilterSearch: 'Search values',
    tableClearFilter: 'Clear filter',
    tableEmptyValue: '(empty)',
    tableMoreValues: '{count} more values hidden. Search to narrow.',
    tableResize: 'Resize table',
    search: 'Search',
    searchPlaceholder: 'Search preview text',
    searchNoMatches: 'No matches',
    searchCount: '{current}/{total}',
    searchPrevTitle: 'Previous match',
    searchNextTitle: 'Next match',
    closeSearchTitle: 'Close search',
    section: 'Section',
    highlight: 'Highlight',
    bookmark: 'Bookmark',
    note: 'Note',
    pinFileTitle: 'Keep this file at the top',
    pinnedFile: 'Pinned',
    highlightSelection: 'Highlight selection',
    bookmarkSelection: 'Add bookmark',
    noteSelection: 'Add note',
    readingBookmark: 'Reading bookmark',
    readingHighlight: 'Highlight',
    readingNote: 'Note',
    noteBody: 'Note: ',
    notePrompt: 'Write a note for the selected text:',
    notePlaceholder: 'Write a note...',
    confirmNote: 'OK',
    cancelNote: 'Cancel',
    noNotes: 'No notes yet.',
    context: 'Context: ',
    bookmarkRail: 'Reading bookmarks',
    railPreview: 'Position preview',
    railPreviewEmpty: 'No previewable content near this position.',
    marginNotesLabel: 'Margin notes',
    sourceAxisLabel: 'Markdown source line map',
    sourceLineRange: 'Markdown lines {lines}',
    axisHeading: 'Heading',
    axisParagraph: 'Paragraph',
    axisFigure: 'Figure',
    axisTable: 'Table',
    axisDiagram: 'Diagram',
    axisFormula: 'Formula',
    axisCode: 'Code',
    axisList: 'List',
    axisQuote: 'Quote',
    axisReference: 'Reference',
    axisMetadata: 'Metadata',
    axisBlock: 'Block',
    sectionLocation: 'Section: ',
    chapterNumber: 'Chapter: ',
    subsectionTitle: 'Title: ',
    deleteAnnotation: 'Delete',
    deleteAnnotationTitle: 'Delete this annotation'
  },
  'zh-CN': {
    outline: '目录',
    markdownFiles: 'Markdown 文件',
    markdownFilesLabel: 'Markdown 文件列表',
    outlineSplitLabel: '调整 Markdown 文件列表和目录高度',
    markdown: 'Markdown',
    documents: '\u6587\u6863',
    latex: 'LaTeX',
    preview: 'HTML 预览',
    language: '语言',
    languageTitle: '选择界面语言',
    theme: '主题',
    themeTitle: '选择 read-md-as-html 主题',
    fontSize: '字号',
    fontSizeTitle: '调整 HTML 预览字号',
    themeReaderLight: '浅色阅读',
    themeSoftGreen: '护眼',
    themeVscode: '跟随 VS Code',
    themeDark: '深色高对比',
    save: '保存',
    saveTitle: '保存',
    collapse: '折叠',
    collapseTitle: '折叠 Markdown',
    expand: 'Markdown',
    expandTitle: '显示 Markdown',
    edit: '右侧编辑',
    editTitle: '右侧编辑',
    export: '导出',
    exportTitle: '导出 HTML',
    backTitle: '返回上一个阅读位置',
    forwardTitle: '前进到下一个阅读位置',
    previewToc: '目录',
    previewTocLabel: 'HTML 目录',
    previewNotes: '批注',
    previewNotesLabel: '批注列表',
    outlineResizeLabel: '调整目录和 Markdown 宽度',
    previewResizeLabel: '调整 Markdown 和 HTML 预览宽度',
    imageControls: '图片控制',
    zoomOut: '缩小',
    reset: '重置',
    zoomIn: '放大',
    close: '关闭',
    liveRender: '实时渲染',
    previewEditable: '简单块可编辑',
    emptyDocument: '空文档',
    noHeadings: '当前文档没有标题。',
    untitledSection: '未命名小节',
    emptySection: '这个小节没有可预览的正文。',
    metadata: '元信息',
    blocks: '块',
    lines: '行',
    saved: '已保存',
    synced: '已同步到 VS Code',
    previewSynced: '右侧修改已同步到 Markdown',
    imageSaved: '图片已保存到 {path}',
    operationFailed: '操作失败',
    externalChangeReloaded: '\u5df2\u4ece\u78c1\u76d8\u5237\u65b0\u6700\u65b0 Markdown\u3002',
    externalChangePending: '\u68c0\u6d4b\u5230\u5916\u90e8 Markdown \u53d8\u5316\uff1bwebview \u91cc\u8fd8\u6709\u672a\u4fdd\u5b58\u7f16\u8f91\u3002',
    documentDeleted: '当前文档已从磁盘删除。请从项目文件树切换到其他文档。',
    documentDeletedTitle: '文档已删除',
    documentDeletedBody: '这个阅读器对应的 Markdown 文件已经不在磁盘上。当前预览会保留为只读状态，方便复制内容或从项目文件树切换到其他文档。',
    imageSaveFailed: '图片保存失败',
    mermaidError: 'Mermaid 渲染有错误',
    mathError: '公式渲染有错误',
    clickToZoom: '点击放大查看',
    reference: '参考文献',
    authors: '作者：',
    venue: '会议/期刊：',
    info: '信息：',
    openSource: '打开来源',
    copyAbsolutePath: '复制绝对路径',
    copyRelativePath: '复制相对路径',
    copySelection: '复制',
    copyWithPath: '带路径复制',
    copyPathLabel: '路径',
    copySectionLabel: '章节',
    copyLineLabel: '行',
    copyContentLabel: '内容',
    pathCopied: '路径已复制',
    selectionCopied: '已复制',
    noCopySelection: '请先选中 HTML 预览里的文字',
    pinnedSection: '已置顶',
    tableFilter: '筛选这一列',
    tableFilterSearch: '搜索值',
    tableClearFilter: '清除筛选',
    tableEmptyValue: '（空）',
    tableMoreValues: '还有 {count} 个值，可以搜索缩小范围。',
    tableResize: '调整表格大小',
    search: '搜索',
    searchPlaceholder: '搜索预览内容',
    searchNoMatches: '无匹配',
    searchCount: '{current}/{total}',
    searchPrevTitle: '上一个匹配',
    searchNextTitle: '下一个匹配',
    closeSearchTitle: '关闭搜索',
    section: '小节',
    highlight: '高亮',
    bookmark: '书签',
    note: '批注',
    pinFileTitle: '将这个文件置顶',
    pinnedFile: '已置顶',
    highlightSelection: '高亮选中文字',
    bookmarkSelection: '加入书签',
    noteSelection: '添加文字批注',
    readingBookmark: '阅读书签',
    readingHighlight: '高亮',
    readingNote: '批注',
    noteBody: '批注：',
    notePrompt: '给选中的文字添加批注：',
    notePlaceholder: '输入批注内容...',
    confirmNote: '确定',
    cancelNote: '取消',
    noNotes: '还没有批注。',
    context: '上下文：',
    bookmarkRail: '阅读书签',
    railPreview: '位置预览',
    railPreviewEmpty: '这个位置附近没有可预览内容。',
    marginNotesLabel: '侧边批注',
    sourceAxisLabel: 'Markdown 源文档行号映射',
    sourceLineRange: 'Markdown 第 {lines} 行',
    axisHeading: '标题',
    axisParagraph: '段落',
    axisFigure: '图',
    axisTable: '表',
    axisDiagram: '图表',
    axisFormula: '公式',
    axisCode: '代码',
    axisList: '列表',
    axisQuote: '引用',
    axisReference: '文献',
    axisMetadata: '元数据',
    axisBlock: '内容块',
    sectionLocation: '所在章节：',
    chapterNumber: '章节号：',
    subsectionTitle: '小标题：',
    deleteAnnotation: '删除',
    deleteAnnotationTitle: '删除这条批注'
  }
};

function validLanguage(language) {
  return Object.prototype.hasOwnProperty.call(I18N, language) ? language : 'en';
}

function t(key, replacements = {}) {
  const dictionary = I18N[validLanguage(state.language)] || I18N.en;
  let value = dictionary[key] || I18N.en[key] || key;
  for (const [name, replacement] of Object.entries(replacements)) {
    value = value.replace('{' + name + '}', replacement);
  }
  return value;
}

function hasPendingLocalMarkdownChange() {
  return state.markdown !== state.committedMarkdown;
}

function validTheme(theme) {
  return ['reader-light', 'soft-green', 'vscode', 'dark'].includes(theme) ? theme : 'reader-light';
}

function validReaderFontSize(value) {
  const size = Math.round(Number(value) || 15);
  return Math.min(24, Math.max(12, size));
}

function persistWebviewState() {
  if (!vscode.setState) return;
  vscode.setState(Object.assign({}, vscode.getState ? (vscode.getState() || {}) : {}, {
    theme: state.theme,
    language: state.language,
    layout: state.layout,
    outlineFilesHeight: state.outlineFilesHeight,
    expandedFolders: state.expandedFolders,
    readerFontSize: state.readerFontSize,
    sourceCollapsed: state.sourceCollapsed
  }));
}

function applyTheme(theme, options = {}) {
  state.theme = validTheme(theme);
  document.body.classList.remove('theme-reader-light', 'theme-soft-green', 'theme-vscode', 'theme-dark');
  document.body.classList.add('theme-' + state.theme);
  if (els.themeSelect) els.themeSelect.value = state.theme;
  persistWebviewState();
  if (!options.silent) post({ type: 'updateTheme', theme: state.theme });
}

function applyReaderFontSize(value) {
  state.readerFontSize = validReaderFontSize(value);
  document.documentElement.style.setProperty('--preview-font-size', state.readerFontSize + 'px');
  if (els.fontSizeSelect) els.fontSizeSelect.value = String(state.readerFontSize);
  persistWebviewState();
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function setTitle(element, text) {
  if (element) element.title = text;
}

function setThemeOptionText(value, text) {
  if (!els.themeSelect) return;
  const option = els.themeSelect.querySelector('option[value="' + value + '"]');
  if (option) option.textContent = text;
}

function updateCollapseButton() {
  if (!els.collapseMarkdown) return;
  const collapsed = !state.previewOnly && state.sourceCollapsed;
  els.collapseMarkdown.hidden = state.previewOnly;
  els.collapseMarkdown.textContent = collapsed ? t('expand') : t('collapse');
  els.collapseMarkdown.title = collapsed ? t('expandTitle') : t('collapseTitle');
  els.collapseMarkdown.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function updatePreviewModeStatus() {
  els.previewStatus.textContent = state.previewEditEnabled ? t('previewEditable') : t('liveRender');
}

function applyDocumentAvailability() {
  const deleted = !!state.documentDeleted;
  document.body.classList.toggle('document-deleted', deleted);
  if (els.editor) els.editor.disabled = state.previewOnly || deleted;
  if (els.saveDocument) els.saveDocument.disabled = deleted;
  if (els.togglePreviewEdit) els.togglePreviewEdit.disabled = deleted;
  renderDeletedDocumentBanner();
  if (deleted) setStatus(t('documentDeleted'));
}

function renderDeletedDocumentBanner() {
  if (!els.preview) return;
  const existing = els.preview.querySelector('.document-deleted-banner');
  if (!state.documentDeleted) {
    if (existing) existing.remove();
    return;
  }
  const banner = existing || document.createElement('aside');
  banner.className = 'document-deleted-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = [
    '<div class="document-deleted-title">' + escapeHtml(t('documentDeletedTitle')) + '</div>',
    '<div class="document-deleted-body">' + escapeHtml(t('documentDeletedBody')) + '</div>'
  ].join('');
  if (!existing) els.preview.insertBefore(banner, els.preview.firstChild);
}

function updateRenderStats() {
  els.renderStats.textContent = state.blocks.length + ' ' + t('blocks');
}

function documentSourceTitle() {
  return state.documentKind === 'latex' ? t('latex') : t('markdown');
}

function updateDocumentKindLabels() {
  setText(els.fileListTitle, t('documents'));
  setText(els.sourceTitle, documentSourceTitle());
}

function applyLanguage(language, options = {}) {
  state.language = validLanguage(language);
  document.documentElement.lang = state.language === 'zh-CN' ? 'zh-CN' : 'en';
  if (els.languageSelect) els.languageSelect.value = state.language;

  setText(els.outlineTitle, t('outline'));
  updateDocumentKindLabels();
  setText(els.previewTitle, t('preview'));
  setText(els.languageLabel, t('language'));
  setText(els.themeLabel, t('theme'));
  setText(els.fontSizeLabel, t('fontSize'));
  setText(els.saveDocument, t('save'));
  setText(els.togglePreviewEdit, t('edit'));
  setText(els.exportHtml, t('export'));
  setText(els.previewTocToggle, t('previewToc'));
  setText(els.previewNotesToggle, t('previewNotes'));
  setText(els.highlightSelection, t('highlight'));
  setText(els.bookmarkSelection, t('bookmark'));
  setText(els.noteSelection, t('note'));
  setText(els.confirmSelectionNote, t('confirmNote'));
  setText(els.cancelSelectionNote, t('cancelNote'));
  if (els.selectionNoteText) els.selectionNoteText.placeholder = t('notePlaceholder');

  setTitle(els.languageControl, t('languageTitle'));
  setTitle(els.themeControl, t('themeTitle'));
  setTitle(els.fontSizeControl, t('fontSizeTitle'));
  setTitle(els.saveDocument, t('saveTitle'));
  setTitle(els.togglePreviewEdit, t('editTitle'));
  setTitle(els.exportHtml, t('exportTitle'));
  setTitle(els.readingBack, t('backTitle'));
  setTitle(els.readingForward, t('forwardTitle'));
  setTitle(els.zoomOutButton, t('zoomOut'));
  setTitle(els.resetZoomButton, t('reset'));
  setTitle(els.zoomInButton, t('zoomIn'));
  setTitle(els.closeLightboxButton, t('close'));
  setTitle(els.highlightSelection, t('highlightSelection'));
  setTitle(els.bookmarkSelection, t('bookmarkSelection'));
  setTitle(els.noteSelection, t('noteSelection'));
  setTitle(els.confirmSelectionNote, t('confirmNote'));
  setTitle(els.cancelSelectionNote, t('cancelNote'));
  if (els.searchInput) els.searchInput.placeholder = t('searchPlaceholder');
  setTitle(els.searchPrev, t('searchPrevTitle'));
  setTitle(els.searchNext, t('searchNextTitle'));
  setTitle(els.searchClose, t('closeSearchTitle'));

  document.querySelector('[data-resize-handle="outline-source"]')?.setAttribute('aria-label', t('outlineResizeLabel'));
  document.querySelector('[data-resize-handle="source-preview"]')?.setAttribute('aria-label', t('previewResizeLabel'));
  els.markdownFileList.setAttribute('aria-label', t('markdownFilesLabel'));
  els.outlineSplitHandle.setAttribute('aria-label', t('outlineSplitLabel'));
  els.previewToc.setAttribute('aria-label', t('previewTocLabel'));
  els.previewNotes.setAttribute('aria-label', t('previewNotesLabel'));
  els.noteMarginPanel.setAttribute('aria-label', t('marginNotesLabel'));
  if (els.sourceAxis) els.sourceAxis.setAttribute('aria-label', t('sourceAxisLabel'));
  els.bookmarkRail.setAttribute('aria-label', t('bookmarkRail'));
  els.lightboxToolbar.setAttribute('aria-label', t('imageControls'));

  setThemeOptionText('reader-light', t('themeReaderLight'));
  setThemeOptionText('soft-green', t('themeSoftGreen'));
  setThemeOptionText('vscode', t('themeVscode'));
  setThemeOptionText('dark', t('themeDark'));

  updateCollapseButton();
  updateSourceStatus();
  updateRenderStats();
  updatePreviewModeStatus();
  applyDocumentAvailability();
  renderMarkdownFiles();
  if (state.blocks.length) state.sectionPreviews = collectSectionPreviews(state.blocks);
  renderOutlines();
  scheduleSourceAxisRender();
  renderNotesPanel();
  scheduleNoteMarginRender();
  bindDiagramClicks();
  persistWebviewState();
  if (!options.silent) post({ type: 'updateLanguage', language: state.language });
}

function post(message) {
  vscode.postMessage(message);
}

function setStatus(message) {
  els.previewStatus.textContent = message;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyLayout() {
  document.documentElement.style.setProperty('--outline-width', Math.round(state.layout.outline) + 'px');
  document.documentElement.style.setProperty('--outline-files-height', Math.round(state.outlineFilesHeight) + 'px');
  document.documentElement.style.setProperty('--source-width', Math.round(state.layout.source) + 'px');
}

function sourceIsHidden() {
  return state.previewOnly || state.sourceCollapsed;
}

function updateReaderFastMode() {
  document.body.classList.toggle('reader-fast-mode', sourceIsHidden() && !state.previewEditEnabled);
}

function applySourceCollapsed() {
  const collapsed = !state.previewOnly && state.sourceCollapsed;
  const toolbarInPreview = state.previewOnly || collapsed;
  document.body.classList.toggle('source-collapsed', collapsed);
  updateReaderFastMode();
  if (els.sourceActions) {
    const host = toolbarInPreview ? els.collapsedToolbarHost : els.sourceToolbarHost;
    if (host && els.sourceActions.parentElement !== host) {
      host.appendChild(els.sourceActions);
    }
  }
  updateCollapseButton();
}

function setSourceCollapsed(collapsed) {
  if (state.previewOnly) return;
  state.sourceCollapsed = !!collapsed;
  if (!state.sourceCollapsed && els.editor.value !== state.markdown) {
    els.editor.value = state.markdown;
  }
  applySourceCollapsed();
  setLayout(state.layout.outline, state.layout.source);
  scheduleSourceAxisRender();
}

function constrainLayout(nextOutline, nextSource) {
  const shell = document.querySelector('.studio-shell');
  const shellWidth = shell ? shell.clientWidth : window.innerWidth;
  if (!Number.isFinite(shellWidth) || shellWidth < 360) {
    return { outline: state.layout.outline, source: state.layout.source };
  }
  const hiddenSource = sourceIsHidden();
  const minOutline = 170;
  const minSource = 300;
  const minPreview = hiddenSource ? 420 : 360;
  const handleTotal = hiddenSource ? 10 : 20;
  const maxOutlineRoom = shellWidth - minPreview - handleTotal - (hiddenSource ? 0 : minSource);
  const outlineMax = Math.max(minOutline, Math.min(520, maxOutlineRoom));
  const outline = clamp(nextOutline, minOutline, outlineMax);

  if (hiddenSource) {
    return { outline, source: state.layout.source };
  }

  const sourceMaxRoom = shellWidth - outline - minPreview - handleTotal;
  const sourceMax = Math.max(minSource, Math.min(960, sourceMaxRoom));
  const source = clamp(nextSource, minSource, sourceMax);
  return { outline, source };
}

function setLayout(nextOutline, nextSource, shouldPersist = true) {
  state.layout = constrainLayout(nextOutline, nextSource);
  applyLayout();
  if (shouldPersist) persistWebviewState();
}

function setOutlineFilesHeight(nextHeight, shouldPersist = true) {
  const pane = document.querySelector('.outline-pane');
  const paneHeight = pane ? pane.clientHeight : window.innerHeight;
  if (!Number.isFinite(paneHeight) || paneHeight < 240) {
    applyLayout();
    return;
  }
  const minFiles = 92;
  const minOutline = 92;
  const handleHeight = 9;
  const maxFiles = Math.max(minFiles, paneHeight - minOutline - handleHeight);
  state.outlineFilesHeight = clamp(Math.round(Number(nextHeight) || minFiles), minFiles, maxFiles);
  applyLayout();
  if (shouldPersist) persistWebviewState();
}

function setupOutlineSplitter() {
  if (!els.outlineSplitHandle) return;
  els.outlineSplitHandle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = state.outlineFilesHeight;
    document.body.classList.add('resizing-outline-split');
    els.outlineSplitHandle.setPointerCapture(event.pointerId);

    const onPointerMove = moveEvent => {
      setOutlineFilesHeight(startHeight + moveEvent.clientY - startY, false);
    };

    const finishResize = finishEvent => {
      document.body.classList.remove('resizing-outline-split');
      els.outlineSplitHandle.removeEventListener('pointermove', onPointerMove);
      els.outlineSplitHandle.removeEventListener('pointerup', finishResize);
      els.outlineSplitHandle.removeEventListener('pointercancel', finishResize);
      try {
        els.outlineSplitHandle.releasePointerCapture(finishEvent.pointerId);
      } catch (error) {
        // The VS Code webview may release the pointer before this handler runs.
      }
      persistWebviewState();
    };

    els.outlineSplitHandle.addEventListener('pointermove', onPointerMove);
    els.outlineSplitHandle.addEventListener('pointerup', finishResize);
    els.outlineSplitHandle.addEventListener('pointercancel', finishResize);
  });

  els.outlineSplitHandle.addEventListener('keydown', event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    setOutlineFilesHeight(state.outlineFilesHeight + (event.key === 'ArrowDown' ? 18 : -18));
  });
}

function setupResizers() {
  document.querySelectorAll('[data-resize-handle]').forEach(handle => {
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();

      const kind = handle.dataset.resizeHandle;
      const startX = event.clientX;
      const startLayout = { outline: state.layout.outline, source: state.layout.source };
      handle.classList.add('active');
      document.body.classList.add('resizing');
      handle.setPointerCapture(event.pointerId);

      const onPointerMove = moveEvent => {
        const dx = moveEvent.clientX - startX;
        if (kind === 'outline-source') {
          const nextSource = sourceIsHidden() ? startLayout.source : startLayout.source - dx;
          setLayout(startLayout.outline + dx, nextSource, false);
        } else if (kind === 'source-preview') {
          setLayout(startLayout.outline, startLayout.source + dx, false);
        }
      };

      const finishResize = finishEvent => {
        handle.classList.remove('active');
        document.body.classList.remove('resizing');
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', finishResize);
        handle.removeEventListener('pointercancel', finishResize);
        try {
          handle.releasePointerCapture(finishEvent.pointerId);
        } catch (error) {
          // The VS Code webview may release the pointer before this handler runs.
        }
        persistWebviewState();
        scheduleSourceAxisRender();
      };

      handle.addEventListener('pointermove', onPointerMove);
      handle.addEventListener('pointerup', finishResize);
      handle.addEventListener('pointercancel', finishResize);
    });

    handle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 24 : -24;
      if (handle.dataset.resizeHandle === 'outline-source') {
        const nextSource = sourceIsHidden() ? state.layout.source : state.layout.source - delta;
        setLayout(state.layout.outline + delta, nextSource);
      } else if (handle.dataset.resizeHandle === 'source-preview') {
        setLayout(state.layout.outline, state.layout.source + delta);
      }
    });
  });

  window.addEventListener('resize', () => applyLayout());
}

export { I18N, validLanguage, t, hasPendingLocalMarkdownChange, validTheme, validReaderFontSize, persistWebviewState, applyTheme, applyReaderFontSize, setText, setTitle, setThemeOptionText, updateCollapseButton, updatePreviewModeStatus, applyDocumentAvailability, renderDeletedDocumentBanner, updateRenderStats, documentSourceTitle, updateDocumentKindLabels, applyLanguage, post, setStatus, clamp, applyLayout, sourceIsHidden, updateReaderFastMode, applySourceCollapsed, setSourceCollapsed, constrainLayout, setLayout, setOutlineFilesHeight, setupOutlineSplitter, setupResizers };
