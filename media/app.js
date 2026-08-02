(function () {
  const vscode = acquireVsCodeApi();
  const initial = window.__MARKDOWN_STUDIO_INITIAL_STATE__ || {};
  const persistedState = vscode.getState ? (vscode.getState() || {}) : {};

  const state = {
    uri: initial.uri || '',
    fileName: initial.fileName || 'document.md',
    documentKind: initial.documentKind || 'markdown',
    markdown: initial.markdown || '',
    committedMarkdown: initial.markdown || '',
    markdownHash: initial.markdownHash || '',
    previewOnly: !!initial.previewOnly,
    documentDeleted: false,
    autoSave: initial.autoSave !== false,
    previewEditEnabled: !!initial.previewEditEnabled,
    theme: persistedState.theme || initial.theme || 'reader-light',
    language: persistedState.language || initial.language || 'en',
    layout: Object.assign({ outline: 300, source: 580 }, persistedState.layout || {}),
    outlineFilesHeight: Number(persistedState.outlineFilesHeight) || 190,
    expandedFolders: persistedState.expandedFolders && typeof persistedState.expandedFolders === 'object' ? persistedState.expandedFolders : {},
    sourceCollapsed: !initial.previewOnly && (typeof persistedState.sourceCollapsed === 'boolean' ? persistedState.sourceCollapsed : true),
    readerFontSize: Number(persistedState.readerFontSize || initial.readerFontSize) || 15,
    markdownFiles: Array.isArray(initial.markdownFiles) ? initial.markdownFiles : [],
    blocks: [],
    refs: new Map(),
    sectionPreviews: new Map(),
    imageMap: new Map(),
    blockElements: [],
    blockTops: [],
    blockHeights: [],
    blockTopByIndex: new Map(),
    blockElementByIndex: new Map(),
    blockElementBySourceStart: new Map(),
    renderTimer: null,
    renderVersion: 0,
    saveTimer: null,
    saveSeq: 0,
    pendingMarkdownSaves: new Map(),
    patchTimer: null,
    hoverTimer: null,
    previewScrollRaf: 0,
    noteMarginRaf: 0,
    noteMarginTimer: null,
    lastNoteMarginRender: 0,
    bookmarkMarkersRaf: 0,
    railPreviewRaf: 0,
    sourceAxisRaf: 0,
    sourceAxisVisibleRaf: 0,
    sourceAxisTimer: null,
    sourceAxisActiveRaf: 0,
    sourceAxisItems: [],
    sourceAxisVisibleRange: '',
    sourceAxisMarkers: new Map(),
    activeSourceAxisMarker: null,
    activeSourceAxisIndex: '',
    lastRailPreviewEvent: null,
    railDrag: null,
    railClickSuppressed: false,
    railClickSuppressTimer: null,
    scrollDebounceTimer: null,
    scrollLockTimer: null,
    scrollSyncLock: null,
    activeBlockIndex: null,
    outlineMode: 'preview',
    readingHistory: [],
    readingHistoryIndex: -1,
    readingHistoryTimer: null,
    readingProgress: initial.readingProgress || null,
    readingProgressSaveTimer: null,
    searchQuery: '',
    searchMatches: [],
    searchIndex: -1,
    searchActiveElement: null,
    tableLayouts: initial.tableLayouts && typeof initial.tableLayouts === 'object' ? initial.tableLayouts : {},
    tableLayoutsSaveTimer: null,
    lastSavedReadingProgress: '',
    pendingDocumentSwitch: null,
    markdownFilesSignature: '',
    annotations: Array.isArray(initial.annotations) ? initial.annotations : [],
    pendingAnnotationSelection: null,
    previewContextSelection: null,
    lastPreviewCopyDetails: null,
    readingHistoryApplying: false,
    previewScrollIntent: false,
    lightboxObjectUrl: null
  };

  const els = {
    outlineTitle: document.getElementById('outlineTitle'),
    fileListTitle: document.getElementById('fileListTitle'),
    documentName: document.getElementById('documentName'),
    sourceTitle: document.getElementById('sourceTitle'),
    previewTitle: document.getElementById('previewTitle'),
    sourceStatus: document.getElementById('sourceStatus'),
    previewStatus: document.getElementById('previewStatus'),
    previewPane: document.querySelector('.preview-pane'),
    sourceToolbarHost: document.getElementById('sourceToolbarHost'),
    collapsedToolbarHost: document.getElementById('collapsedToolbarHost'),
    sourceActions: document.getElementById('sourceActions'),
    languageControl: document.getElementById('languageControl'),
    languageLabel: document.getElementById('languageLabel'),
    languageSelect: document.getElementById('languageSelect'),
    themeControl: document.getElementById('themeControl'),
    themeLabel: document.getElementById('themeLabel'),
    fontSizeControl: document.getElementById('fontSizeControl'),
    fontSizeLabel: document.getElementById('fontSizeLabel'),
    fontSizeSelect: document.getElementById('fontSizeSelect'),
    saveDocument: document.getElementById('saveDocument'),
    collapseMarkdown: document.getElementById('collapseMarkdown'),
    exportHtml: document.getElementById('exportHtml'),
    togglePreviewEdit: document.getElementById('togglePreviewEdit'),
    themeSelect: document.getElementById('themeSelect'),
    editor: document.getElementById('markdownEditor'),
    preview: document.getElementById('preview'),
    sourceAxis: document.getElementById('sourceAxis'),
    previewScroller: document.getElementById('previewScroller'),
    markdownFileList: document.getElementById('markdownFileList'),
    outlineSplitHandle: document.getElementById('outlineSplitHandle'),
    outlineTree: document.getElementById('outlineTree'),
    previewToc: document.getElementById('previewToc'),
    previewTocToggle: document.getElementById('previewTocToggle'),
    previewTocNav: document.getElementById('previewTocNav'),
    previewNotes: document.getElementById('previewNotes'),
    previewNotesToggle: document.getElementById('previewNotesToggle'),
    previewNotesList: document.getElementById('previewNotesList'),
    noteMarginPanel: document.getElementById('noteMarginPanel'),
    noteConnectorLayer: document.getElementById('noteConnectorLayer'),
    renderStats: document.getElementById('renderStats'),
    readingBack: document.getElementById('readingBack'),
    readingForward: document.getElementById('readingForward'),
    hovercard: document.getElementById('hovercard'),
    searchBox: document.getElementById('searchBox'),
    searchInput: document.getElementById('searchInput'),
    searchCount: document.getElementById('searchCount'),
    searchPrev: document.getElementById('searchPrev'),
    searchNext: document.getElementById('searchNext'),
    searchClose: document.getElementById('searchClose'),
    fileContextMenu: document.getElementById('fileContextMenu'),
    selectionToolbar: document.getElementById('selectionToolbar'),
    highlightSelection: document.getElementById('highlightSelection'),
    bookmarkSelection: document.getElementById('bookmarkSelection'),
    noteSelection: document.getElementById('noteSelection'),
    selectionNoteEditor: document.getElementById('selectionNoteEditor'),
    selectionNoteText: document.getElementById('selectionNoteText'),
    confirmSelectionNote: document.getElementById('confirmSelectionNote'),
    cancelSelectionNote: document.getElementById('cancelSelectionNote'),
    bookmarkRail: document.getElementById('bookmarkRail'),
    lightbox: document.getElementById('imageLightbox'),
    lightboxToolbar: document.getElementById('lightboxToolbar'),
    zoomOutButton: document.getElementById('zoomOutButton'),
    resetZoomButton: document.getElementById('resetZoomButton'),
    zoomInButton: document.getElementById('zoomInButton'),
    closeLightboxButton: document.getElementById('closeLightboxButton')
  };

  const lightboxStage = els.lightbox.querySelector('.lightbox-stage');
  const lightboxImg = els.lightbox.querySelector('img');
  let imageZoom = 1;
  let imagePan = { x: 0, y: 0 };
  let imagePanStart = null;
  let imagePanning = false;
  let suppressLightboxClick = false;

  if (state.previewOnly) document.body.classList.add('preview-only');

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

  function applySourceCollapsed() {
    const collapsed = !state.previewOnly && state.sourceCollapsed;
    const toolbarInPreview = state.previewOnly || collapsed;
    document.body.classList.toggle('source-collapsed', collapsed);
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

  function trimReferencePunctuation(value) {
    return String(value || '').replace(/^[\s.,;:，。；：]+|[\s.,;:，。；：]+$/g, '').trim();
  }

  const annotationBlockPattern = /(?:\r?\n){0,2}<!--\s*read-md-as-html:annotations\s*\r?\n[\s\S]*?\r?\n-->\s*$/;

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
      let html = window.marked.parse(protectInlineMathForMarked(raw));
      html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, function (_, code) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = code;
        return '<div class="mermaid">' + escapeHtml(textarea.value) + '</div>';
      });
      html = annotateInlineMathHtml(html);
      return window.DOMPurify ? window.DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'data-latex'] }) : html;
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
    return documentKind === 'latex' ? renderLatexFragment(raw, type) : renderMarkdownFragment(raw, type);
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

  function refreshPreviewBlockCache() {
    state.blockElements = Array.from(els.preview.querySelectorAll('.md-block[data-block-index]'));
    state.blockElementByIndex = new Map();
    state.blockElementBySourceStart = new Map();
    state.blockTops = [];
    state.blockHeights = [];
    state.blockTopByIndex = new Map();
    for (const element of state.blockElements) {
      const index = Number(element.dataset.blockIndex);
      const sourceStart = Number(element.dataset.sourceStart);
      if (Number.isFinite(index)) state.blockElementByIndex.set(index, element);
      if (Number.isFinite(sourceStart)) state.blockElementBySourceStart.set(sourceStart, element);
      const top = Math.round(element.offsetTop || 0);
      state.blockTops.push(top);
      state.blockHeights.push(Math.round(element.offsetHeight || 0));
      if (Number.isFinite(index)) state.blockTopByIndex.set(index, top);
    }
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

    const fragment = document.createDocumentFragment();
    const changed = [];
    for (const block of blocks) {
      const oldElement = oldByKey.get(block.key || '');
      const canReuse = oldElement &&
        oldElement.dataset.blockHash === block.hash &&
        oldElement.dataset.renderMode === blockRenderMode(block);
      if (canReuse) {
        updateBlockElementMetadata(oldElement, block);
        fragment.appendChild(oldElement);
        continue;
      }
      const nextElement = createBlockElement(block);
      if (nextElement) {
        changed.push(nextElement);
        fragment.appendChild(nextElement);
      }
    }
    els.preview.replaceChildren(fragment);
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
    initLibraries();
    const sourceMarkdown = sourceForRender();
    state.refs = collectDocumentReferences(sourceMarkdown);
    state.blocks = splitDocumentBlocks(sourceMarkdown);
    state.sectionPreviews = collectSectionPreviews(state.blocks);
    const changedBlocks = patchPreviewBlocks(state.blocks, { force: !!options.forceFull });
    refreshPreviewBlockCache();
    if (options.initialProgress) {
      els.previewScroller.scrollTop = topForReadingProgress(options.initialProgress);
    }
    updateRenderStats();
    renderOutlines();
    const renderRoots = changedBlocks.length ? changedBlocks : [];
    postProcessPreview(renderRoots);
    await runRenderers(renderRoots);
    if (renderVersion !== state.renderVersion) return false;
    refreshPreviewBlockCache();
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
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
      window.__msMermaidInitialized = true;
    }
  }

  function postProcessPreview(roots = [els.preview]) {
    wrapTables(roots);
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

  function wrapTables(roots = [els.preview]) {
    nodesInRoots(roots, 'table').forEach(table => {
      if (table.closest('.table-shell')) {
        enhanceReadingTable(table);
        return;
      }

      const existingWrap = table.parentElement && table.parentElement.classList.contains('table-wrap')
        ? table.parentElement
        : null;
      const shell = document.createElement('div');
      shell.className = 'table-shell';

      if (existingWrap) {
        existingWrap.parentNode.insertBefore(shell, existingWrap);
        shell.appendChild(existingWrap);
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        table.parentNode.insertBefore(shell, table);
        shell.appendChild(wrap);
        wrap.appendChild(table);
      }
      enhanceReadingTable(table);
    });
  }

  function tableBodyRows(table) {
    const bodies = Array.from(table.tBodies || []);
    const rows = bodies.flatMap(body => Array.from(body.rows || []));
    return rows.length ? rows : Array.from(table.rows || []).slice(1);
  }

  function tableColumnCount(table) {
    return Array.from(table.rows || []).reduce((max, row) => Math.max(max, row.cells.length), 0);
  }

  function tableHeaderCells(table) {
    const headerRow = table.tHead && table.tHead.rows.length ? table.tHead.rows[0] : table.rows[0];
    return headerRow ? Array.from(headerRow.cells || []) : [];
  }

  function tableCellText(cell) {
    if (!cell) return '';
    return (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function tableHeaderText(cell) {
    const label = cell ? cell.querySelector('.table-header-label') : null;
    return tableCellText(label || cell);
  }

  function ensureTableColgroup(table, colCount) {
    let colgroup = Array.from(table.children).find(child => child.tagName === 'COLGROUP');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      table.insertBefore(colgroup, table.firstChild);
    }
    while (colgroup.children.length < colCount) {
      colgroup.appendChild(document.createElement('col'));
    }
    while (colgroup.children.length > colCount) {
      colgroup.removeChild(colgroup.lastElementChild);
    }
    return Array.from(colgroup.children);
  }

  function naturalTableColumnWidths(table, colCount) {
    const rows = Array.from(table.rows || []).slice(0, 80);
    const widths = [];
    for (let index = 0; index < colCount; index += 1) {
      let width = index === 0 ? 150 : 128;
      for (const row of rows) {
        const cell = row.cells[index];
        if (!cell) continue;
        const textWidth = Math.min(560, Math.max(0, tableCellText(cell).length * 7.2 + 48));
        const measuredWidth = Math.min(560, Math.max(cell.scrollWidth || 0, cell.offsetWidth || 0) + 24);
        width = Math.max(width, textWidth, measuredWidth);
      }
      widths.push(Math.round(Math.min(index === 0 ? 420 : 620, Math.max(96, width))));
    }
    return widths;
  }

  function applyTableColumnWidths(table) {
    const widths = table.__columnWidths || [];
    if (!widths.length) return;
    const cols = ensureTableColgroup(table, widths.length);
    let total = 0;
    widths.forEach((width, index) => {
      const safeWidth = Math.max(72, Math.round(width));
      total += safeWidth;
      cols[index].style.width = safeWidth + 'px';
    });
    const wrap = table.closest('.table-wrap');
    const minWidth = Math.max(640, total, wrap ? wrap.clientWidth : 0);
    table.style.width = minWidth + 'px';
    table.style.minWidth = minWidth + 'px';
  }

  function initializeTableColumnWidths(table) {
    const colCount = tableColumnCount(table);
    if (!colCount) return;
    if (!Array.isArray(table.__columnWidths) || table.__columnWidths.length !== colCount) {
      table.__columnWidths = naturalTableColumnWidths(table, colCount);
    }
    applyTableColumnWidths(table);
  }

  function tableLayoutKey(table) {
    const block = table.closest('.md-block[data-block-key], .md-block[data-source-start]');
    const blockKey = block
      ? (block.dataset.blockKey || ('source-' + (block.dataset.sourceStart || '0')))
      : 'document';
    const root = block || els.preview;
    const tables = Array.from(root.querySelectorAll('table'));
    const tableIndex = Math.max(0, tables.indexOf(table));
    return blockKey + ':table:' + tableIndex;
  }

  function sanitizeClientTableLayout(layout) {
    if (!layout || typeof layout !== 'object') return null;
    const clean = {};
    const width = Number(layout.width);
    const height = Number(layout.height);
    if (Number.isFinite(width)) clean.width = Math.min(4000, Math.max(160, Math.round(width)));
    if (Number.isFinite(height)) clean.height = Math.min(3000, Math.max(100, Math.round(height)));
    if (Array.isArray(layout.columnWidths)) {
      clean.columnWidths = layout.columnWidths
        .slice(0, 80)
        .map(value => Math.min(2000, Math.max(48, Math.round(Number(value) || 0))))
        .filter(value => Number.isFinite(value));
    }
    clean.updatedAt = Math.max(0, Math.round(Number(layout.updatedAt) || Date.now()));
    return clean.width || clean.height || (clean.columnWidths && clean.columnWidths.length) ? clean : null;
  }

  function sanitizeClientTableLayouts(layouts) {
    if (!layouts || typeof layouts !== 'object' || Array.isArray(layouts)) return {};
    const clean = {};
    Object.entries(layouts).slice(0, 500).forEach(([key, layout]) => {
      const safeKey = String(key || '').slice(0, 220);
      const safeLayout = sanitizeClientTableLayout(layout);
      if (safeKey && safeLayout) clean[safeKey] = safeLayout;
    });
    return clean;
  }

  function tableLayoutFor(table) {
    const key = table.dataset.tableLayoutKey || tableLayoutKey(table);
    table.dataset.tableLayoutKey = key;
    return sanitizeClientTableLayout(state.tableLayouts[key]) || {};
  }

  function scheduleTableLayoutsSave(delay = 300) {
    clearTimeout(state.tableLayoutsSaveTimer);
    state.tableLayoutsSaveTimer = setTimeout(saveTableLayoutsNow, delay);
  }

  function saveTableLayoutsNow() {
    clearTimeout(state.tableLayoutsSaveTimer);
    state.tableLayouts = sanitizeClientTableLayouts(state.tableLayouts);
    post({
      type: 'updateTableLayouts',
      uri: state.uri,
      tableLayouts: state.tableLayouts
    });
  }

  function updateTableLayout(table, partial) {
    if (!table) return;
    const key = table.dataset.tableLayoutKey || tableLayoutKey(table);
    table.dataset.tableLayoutKey = key;
    const previous = sanitizeClientTableLayout(state.tableLayouts[key]) || {};
    const next = sanitizeClientTableLayout(Object.assign({}, previous, partial, { updatedAt: Date.now() }));
    if (!next) return;
    state.tableLayouts[key] = next;
    scheduleTableLayoutsSave();
  }

  function applyTableBoxLayout(table) {
    const wrap = table.closest('.table-wrap');
    if (!wrap) return;
    const layout = tableLayoutFor(table);
    if (layout.width) wrap.style.width = layout.width + 'px';
    if (layout.height) {
      wrap.style.height = layout.height + 'px';
      wrap.style.maxHeight = 'none';
    }
  }

  function ensureTableShellResizer(table) {
    const wrap = table.closest('.table-wrap');
    if (!wrap || wrap.querySelector('.table-shell-resizer')) return;
    const resizer = document.createElement('span');
    resizer.className = 'table-shell-resizer';
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'both');
    resizer.title = t('tableResize');
    resizer.addEventListener('pointerdown', event => beginTableBoxResize(event, table));
    wrap.appendChild(resizer);
  }

  function beginTableBoxResize(event, table) {
    const wrap = table.closest('.table-wrap');
    const shell = table.closest('.table-shell');
    if (!wrap || !shell) return;
    event.preventDefault();
    event.stopPropagation();
    hideTableFilterMenus();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = wrap.offsetWidth;
    const startHeight = wrap.offsetHeight;
    const parent = shell.parentElement || els.preview;
    const maxWidth = Math.max(220, (parent ? parent.clientWidth : els.preview.clientWidth) - 2);
    const maxHeight = 3000;
    document.body.classList.add('table-box-resizing');

    function move(pointerEvent) {
      pointerEvent.preventDefault();
      const nextWidth = Math.min(maxWidth, Math.max(180, startWidth + pointerEvent.clientX - startX));
      const nextHeight = Math.min(maxHeight, Math.max(100, startHeight + pointerEvent.clientY - startY));
      wrap.style.width = Math.round(nextWidth) + 'px';
      wrap.style.height = Math.round(nextHeight) + 'px';
      wrap.style.maxHeight = 'none';
    }

    function finish() {
      document.body.classList.remove('table-box-resizing');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      updateTableLayout(table, {
        width: wrap.offsetWidth,
        height: wrap.offsetHeight,
        columnWidths: table.__columnWidths || []
      });
      scheduleSourceAxisRender();
      scheduleBookmarkMarkersUpdate();
      scheduleNoteMarginRender();
    }

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  }

  function beginTableColumnResize(event, table, columnIndex) {
    event.preventDefault();
    event.stopPropagation();
    initializeTableColumnWidths(table);
    const widths = table.__columnWidths || [];
    const startX = event.clientX;
    const startWidth = widths[columnIndex] || 128;
    document.body.classList.add('table-resizing');

    function move(pointerEvent) {
      pointerEvent.preventDefault();
      widths[columnIndex] = Math.max(72, startWidth + pointerEvent.clientX - startX);
      applyTableColumnWidths(table);
    }

    function finish() {
      document.body.classList.remove('table-resizing');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      updateTableLayout(table, { columnWidths: widths });
      scheduleSourceAxisRender();
      scheduleBookmarkMarkersUpdate();
      scheduleNoteMarginRender();
    }

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  }

  function prepareTableHeaderCell(table, cell, columnIndex) {
    if (!cell || cell.classList.contains('table-enhanced-header')) return;
    const content = document.createElement('div');
    content.className = 'table-header-content';
    const label = document.createElement('span');
    label.className = 'table-header-label';
    while (cell.firstChild) label.appendChild(cell.firstChild);

    const filterButton = document.createElement('button');
    filterButton.type = 'button';
    filterButton.className = 'table-filter-button';
    filterButton.title = t('tableFilter');
    filterButton.setAttribute('aria-label', t('tableFilter'));
    filterButton.textContent = '▾';
    filterButton.addEventListener('pointerdown', event => event.stopPropagation());
    filterButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      showTableFilterMenu(table, columnIndex, filterButton);
    });

    const resizer = document.createElement('span');
    resizer.className = 'table-col-resizer';
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'vertical');
    resizer.addEventListener('pointerdown', event => beginTableColumnResize(event, table, columnIndex));

    content.appendChild(label);
    content.appendChild(filterButton);
    content.appendChild(resizer);
    cell.classList.add('table-enhanced-header');
    cell.dataset.columnIndex = String(columnIndex);
    cell.appendChild(content);
  }

  function tableColumnValues(table, columnIndex) {
    const values = new Map();
    tableBodyRows(table).forEach(row => {
      const text = tableCellText(row.cells[columnIndex]);
      values.set(text, (values.get(text) || 0) + 1);
    });
    return Array.from(values.entries()).map(([value, count]) => ({
      value,
      label: value || t('tableEmptyValue'),
      count
    })).sort((a, b) => a.label.localeCompare(b.label, state.language === 'zh-CN' ? 'zh-CN' : 'en', { numeric: true }));
  }

  function updateTableFilterButtons(table) {
    const filters = table.__tableFilters instanceof Map ? table.__tableFilters : new Map();
    tableHeaderCells(table).forEach((cell, index) => {
      const button = cell.querySelector('.table-filter-button');
      if (!button) return;
      const active = filters.has(index);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function applyTableFilters(table) {
    const filters = table.__tableFilters instanceof Map ? table.__tableFilters : new Map();
    const active = Array.from(filters.entries()).filter(([, filter]) => filter && filter.selected instanceof Set);
    tableBodyRows(table).forEach(row => {
      const visible = active.every(([columnIndex, filter]) => {
        const text = tableCellText(row.cells[columnIndex]);
        return filter.selected.has(text);
      });
      row.hidden = !visible;
      row.classList.toggle('table-row-hidden', !visible);
    });
    updateTableFilterButtons(table);
    scheduleSourceAxisRender();
    scheduleBookmarkMarkersUpdate();
    scheduleNoteMarginRender();
  }

  function setTableColumnFilter(table, columnIndex, selected, valueCount) {
    if (!(table.__tableFilters instanceof Map)) table.__tableFilters = new Map();
    if (!selected || selected.size === valueCount) {
      table.__tableFilters.delete(columnIndex);
    } else {
      table.__tableFilters.set(columnIndex, { selected: new Set(selected) });
    }
    applyTableFilters(table);
  }

  function hideTableFilterMenus() {
    document.querySelectorAll('.table-filter-menu').forEach(menu => menu.remove());
  }

  function positionTableFilterMenu(menu, button) {
    const shell = menu.closest('.table-shell');
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const width = Math.min(280, Math.max(220, shell.clientWidth - 16));
    menu.style.width = width + 'px';
    menu.style.left = Math.max(8, Math.min(buttonRect.right - shellRect.left - width, shell.clientWidth - width - 8)) + 'px';
    menu.style.top = (buttonRect.bottom - shellRect.top + 8) + 'px';
  }

  function showTableFilterMenu(table, columnIndex, button) {
    const shell = table.closest('.table-shell');
    if (!shell) return;
    const existing = shell.querySelector('.table-filter-menu[data-column-index="' + columnIndex + '"]');
    if (existing) {
      existing.remove();
      return;
    }
    hideTableFilterMenus();

    const values = tableColumnValues(table, columnIndex);
    const activeFilter = table.__tableFilters instanceof Map ? table.__tableFilters.get(columnIndex) : null;
    let selected = activeFilter && activeFilter.selected instanceof Set ? new Set(activeFilter.selected) : null;

    const menu = document.createElement('div');
    menu.className = 'table-filter-menu';
    menu.dataset.columnIndex = String(columnIndex);
    menu.setAttribute('role', 'menu');
    menu.addEventListener('pointerdown', event => event.stopPropagation());
    menu.addEventListener('click', event => event.stopPropagation());

    const title = document.createElement('div');
    title.className = 'table-filter-title';
    title.textContent = tableHeaderText(tableHeaderCells(table)[columnIndex]) || t('tableFilter');

    const search = document.createElement('input');
    search.className = 'table-filter-search';
    search.type = 'search';
    search.placeholder = t('tableFilterSearch');

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'table-filter-clear';
    clear.textContent = t('tableClearFilter');
    clear.addEventListener('click', () => {
      selected = null;
      setTableColumnFilter(table, columnIndex, null, values.length);
      hideTableFilterMenus();
    });

    const options = document.createElement('div');
    options.className = 'table-filter-options';
    const more = document.createElement('div');
    more.className = 'table-filter-more';

    function renderOptions() {
      const query = search.value.trim().toLowerCase();
      const filtered = values.filter(entry => !query || entry.label.toLowerCase().includes(query));
      const shown = filtered.slice(0, 260);
      options.replaceChildren();
      shown.forEach(entry => {
        const label = document.createElement('label');
        label.className = 'table-filter-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !selected || selected.has(entry.value);
        checkbox.addEventListener('change', () => {
          if (!selected) selected = new Set(values.map(value => value.value));
          if (checkbox.checked) selected.add(entry.value);
          else selected.delete(entry.value);
          setTableColumnFilter(table, columnIndex, selected, values.length);
        });
        const text = document.createElement('span');
        text.textContent = entry.label + ' (' + entry.count + ')';
        label.appendChild(checkbox);
        label.appendChild(text);
        options.appendChild(label);
      });
      const hiddenCount = filtered.length - shown.length;
      more.textContent = hiddenCount > 0 ? t('tableMoreValues', { count: String(hiddenCount) }) : '';
    }

    search.addEventListener('input', renderOptions);
    menu.appendChild(title);
    menu.appendChild(search);
    menu.appendChild(options);
    menu.appendChild(more);
    menu.appendChild(clear);
    shell.appendChild(menu);
    renderOptions();
    positionTableFilterMenu(menu, button);
    window.setTimeout(() => search.focus(), 0);
  }

  function bindTablePan(wrap) {
    if (!wrap || wrap.dataset.panBound === 'true') return;
    wrap.dataset.panBound = 'true';
    let suppressClick = false;

    wrap.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      if (event.target.closest('button, input, textarea, select, a, .table-col-resizer, .table-shell-resizer, .table-filter-menu')) return;
      if (wrap.scrollWidth <= wrap.clientWidth + 1 && wrap.scrollHeight <= wrap.clientHeight + 1) return;
      if (event.target.closest('td, th') && !event.altKey) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = wrap.scrollLeft;
      const startTop = wrap.scrollTop;
      let moved = false;

      function move(pointerEvent) {
        const dx = pointerEvent.clientX - startX;
        const dy = pointerEvent.clientY - startY;
        if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          moved = true;
          try {
            wrap.setPointerCapture(event.pointerId);
          } catch (error) {
            // Pointer capture is optional; table panning still works without it.
          }
          wrap.classList.add('table-panning');
          document.body.classList.add('table-dragging');
        }
        if (!moved) return;
        pointerEvent.preventDefault();
        wrap.scrollLeft = startLeft - dx;
        wrap.scrollTop = startTop - dy;
      }

      function finish(pointerEvent) {
        if (moved) {
          try {
            wrap.releasePointerCapture(pointerEvent.pointerId);
          } catch (error) {
            // Pointer capture can already be released by the browser.
          }
        }
        wrap.classList.remove('table-panning');
        document.body.classList.remove('table-dragging');
        wrap.removeEventListener('pointermove', move);
        wrap.removeEventListener('pointerup', finish);
        wrap.removeEventListener('pointercancel', finish);
        if (moved) {
          suppressClick = true;
          window.setTimeout(() => { suppressClick = false; }, 0);
        }
      }

      wrap.addEventListener('pointermove', move);
      wrap.addEventListener('pointerup', finish);
      wrap.addEventListener('pointercancel', finish);
    });

    wrap.addEventListener('click', event => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function enhanceReadingTable(table) {
    if (!table || table.dataset.tableEnhanced === 'true') {
      if (table) {
        applyTableBoxLayout(table);
        updateTableFilterButtons(table);
      }
      return;
    }
    const layoutKey = tableLayoutKey(table);
    table.dataset.tableLayoutKey = layoutKey;
    const savedLayout = sanitizeClientTableLayout(state.tableLayouts[layoutKey]);
    const colCount = tableColumnCount(table);
    if (savedLayout && Array.isArray(savedLayout.columnWidths) && savedLayout.columnWidths.length === colCount) {
      table.__columnWidths = savedLayout.columnWidths.slice();
    }
    table.dataset.tableEnhanced = 'true';
    table.classList.add('enhanced-table');
    if (!(table.__tableFilters instanceof Map)) table.__tableFilters = new Map();
    const headerCells = tableHeaderCells(table);
    headerCells.forEach((cell, index) => prepareTableHeaderCell(table, cell, index));
    initializeTableColumnWidths(table);
    applyTableBoxLayout(table);
    ensureTableShellResizer(table);
    bindTablePan(table.closest('.table-wrap'));
    updateTableFilterButtons(table);
  }

  function markImages(roots = [els.preview]) {
    nodesInRoots(roots, 'img').forEach(img => {
      img.classList.add('doc-image');
      img.loading = 'lazy';
      if (img.dataset.axisLoadBound !== 'true') {
        img.dataset.axisLoadBound = 'true';
        img.addEventListener('load', () => scheduleSourceAxisRender(80));
      }
      if (!img.closest('figure')) {
        const figure = document.createElement('figure');
        figure.className = 'image-figure';
        img.parentNode.insertBefore(figure, img);
        figure.appendChild(img);
        if (img.alt) {
          const caption = document.createElement('figcaption');
          caption.textContent = img.alt;
          figure.appendChild(caption);
        }
      }
    });
  }

  function isExternalUrl(src) {
    return /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('vscode-resource:') || src.startsWith('https:');
  }

  function resolvePreviewImages(roots = [els.preview]) {
    nodesInRoots(roots, 'img').forEach(img => {
      const rawSrc = img.getAttribute('src') || '';
      if (!rawSrc || isExternalUrl(rawSrc)) return;
      img.dataset.rawSrc = rawSrc;
      if (state.imageMap.has(rawSrc)) {
        img.src = state.imageMap.get(rawSrc);
        return;
      }
      post({ type: 'resolveImage', uri: state.uri, relativePath: rawSrc });
    });
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
    if (window.MathJax && window.MathJax.typesetPromise) {
      try {
        await window.MathJax.typesetPromise(renderRoots);
      } catch (error) {
        setStatus(t('mathError'));
      }
    }
  }

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
    const enabled = state.blocks.length > 0 && state.blockElements.length > 0;
    els.previewScroller.classList.toggle('has-source-axis', enabled);
    els.sourceAxis.innerHTML = '';
    state.sourceAxisItems = [];
    state.sourceAxisVisibleRange = '';
    if (!enabled) {
      els.sourceAxis.style.height = '0px';
      state.sourceAxisMarkers = new Map();
      state.activeSourceAxisMarker = null;
      state.activeSourceAxisIndex = '';
      return;
    }

    refreshPreviewBlockMetrics();
    const fragment = document.createDocumentFragment();
    const markers = new Map();
    let blockBottom = 0;
    for (let index = 0; index < state.blockTops.length; index += 1) {
      blockBottom = Math.max(blockBottom, state.blockTops[index] + (state.blockHeights[index] || 0));
    }
    const axisHeight = Math.max(els.preview.offsetHeight || 0, blockBottom + 24);
    els.sourceAxis.style.height = axisHeight + 'px';

    state.blockElements.forEach((element, elementIndex) => {
      const blockIndex = Number(element.dataset.blockIndex);
      const block = state.blocks[blockIndex];
      if (!block) return;
      const top = Math.max(0, Number(state.blockTops[elementIndex]) || Math.round(element.offsetTop || 0));
      const height = Math.max(18, Number(state.blockHeights[elementIndex]) || Math.round(element.offsetHeight || 0));
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
      return;
      marker.title = [kind + ' · ' + t('sourceLineRange', { lines }), summary].filter(Boolean).join('\n');
    });
    els.sourceAxis.appendChild(fragment);
    state.sourceAxisMarkers = markers;
    state.activeSourceAxisMarker = null;
    state.activeSourceAxisIndex = '';
    renderVisibleSourceAxisMarkers(true);
    updateSourceAxisActive();
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
    return { start, end };
  }

  function renderVisibleSourceAxisMarkers(force = false) {
    if (!els.sourceAxis) return;
    const range = sourceAxisVisibleRange();
    if (!range) return;
    const signature = range.start + ':' + range.end;
    if (!force && state.sourceAxisVisibleRange === signature) return;
    state.sourceAxisVisibleRange = signature;
    els.sourceAxis.innerHTML = '';
    state.sourceAxisMarkers = new Map();
    state.activeSourceAxisMarker = null;
    state.activeSourceAxisIndex = '';
    const fragment = document.createDocumentFragment();
    const visibleItems = (state.sourceAxisItems || []).slice(range.start, range.end);
    for (const item of visibleItems) {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = item.className;
      marker.dataset.blockIndex = String(item.blockIndex);
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
      state.sourceAxisMarkers.set(String(item.blockIndex), marker);
      fragment.appendChild(marker);
    }
    els.sourceAxis.appendChild(fragment);
    updateSourceAxisActive();
  }

  function scheduleSourceAxisRender(delay = 0) {
    clearTimeout(state.sourceAxisTimer);
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

  function scheduleSourceAxisVisibleUpdate() {
    if (!state.sourceAxisItems || !state.sourceAxisItems.length) return;
    if (state.sourceAxisVisibleRaf) return;
    state.sourceAxisVisibleRaf = window.requestAnimationFrame(() => {
      state.sourceAxisVisibleRaf = 0;
      renderVisibleSourceAxisMarkers();
    });
  }

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

  function bindImageClicks(roots = [els.preview]) {
    nodesInRoots(roots, 'img.doc-image').forEach(img => {
      if (img.dataset.lightboxBound === 'true') return;
      img.dataset.lightboxBound = 'true';
      img.addEventListener('click', () => openLightboxSource(img.currentSrc || img.src, img.alt || ''));
      img.addEventListener('load', () => {
        scheduleBookmarkMarkersUpdate();
        scheduleNoteMarginRender();
      });
    });
  }

  function bindDiagramClicks() {
    els.preview.querySelectorAll('.mermaid').forEach(diagram => {
      const svg = diagram.querySelector('svg');
      if (!svg) return;
      diagram.title = t('clickToZoom');
      if (diagram.dataset.lightboxBound === 'true') return;
      diagram.dataset.lightboxBound = 'true';
      diagram.classList.add('doc-diagram');
      diagram.setAttribute('tabindex', '0');
      diagram.setAttribute('role', 'button');
      diagram.addEventListener('click', event => {
        if (event.target.closest('a')) return;
        openSvgLightbox(svg, 'Mermaid diagram');
      });
      diagram.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openSvgLightbox(svg, 'Mermaid diagram');
      });
    });
  }

  function scheduleDiagramBinding() {
    bindDiagramClicks();
    window.setTimeout(bindDiagramClicks, 80);
    window.setTimeout(bindDiagramClicks, 300);
    window.setTimeout(bindDiagramClicks, 900);
  }

  function svgNumericLength(value) {
    const text = String(value || '').trim();
    if (!text || text.endsWith('%')) return null;
    const match = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(text);
    if (!match) return null;
    const number = Number.parseFloat(match[1]);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function svgViewBoxSize(svg) {
    const viewBox = svg.getAttribute('viewBox') || '';
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) return null;
    return parts[2] > 0 && parts[3] > 0 ? { x: parts[0], y: parts[1], width: parts[2], height: parts[3] } : null;
  }

  function serializedSvg(svg) {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const rect = svg.getBoundingClientRect();
    const viewBoxSize = svgViewBoxSize(clone);
    const width = svgNumericLength(clone.getAttribute('width')) || (viewBoxSize && viewBoxSize.width) || Math.round(rect.width) || 1200;
    const height = svgNumericLength(clone.getAttribute('height')) || (viewBoxSize && viewBoxSize.height) || Math.round(rect.height) || 800;
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    const box = svgViewBoxSize(clone) || { x: 0, y: 0, width, height };
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', String(box.x));
    background.setAttribute('y', String(box.y));
    background.setAttribute('width', String(box.width));
    background.setAttribute('height', String(box.height));
    background.setAttribute('fill', '#fffefb');
    clone.insertBefore(background, clone.firstChild);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('preserveAspectRatio', clone.getAttribute('preserveAspectRatio') || 'xMidYMid meet');
    clone.style.maxWidth = 'none';
    clone.style.width = width + 'px';
    clone.style.height = height + 'px';
    return new XMLSerializer().serializeToString(clone);
  }

  function openSvgLightbox(svg, alt) {
    const blob = new Blob([serializedSvg(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    openLightboxSource(url, alt, { revokeOnClose: true });
  }

  function clearLightboxObjectUrl() {
    if (!state.lightboxObjectUrl) return;
    URL.revokeObjectURL(state.lightboxObjectUrl);
    state.lightboxObjectUrl = null;
  }

  function applyImageTransform() {
    lightboxImg.style.transform = 'translate3d(' + imagePan.x + 'px, ' + imagePan.y + 'px, 0) scale(' + imageZoom + ')';
    els.lightbox.classList.toggle('can-pan', imageZoom > 1);
  }

  function setImageZoom(value, options = {}) {
    imageZoom = Math.min(6, Math.max(0.25, value));
    if (options.resetPan || imageZoom <= 1) imagePan = { x: 0, y: 0 };
    applyImageTransform();
  }

  function setImagePan(x, y) {
    imagePan = { x: Math.round(x), y: Math.round(y) };
    applyImageTransform();
  }

  function beginImagePan(event) {
    if (event.button !== 0 || imageZoom <= 1) return;
    event.preventDefault();
    imagePanning = true;
    suppressLightboxClick = false;
    imagePanStart = { pointerX: event.clientX, pointerY: event.clientY, panX: imagePan.x, panY: imagePan.y };
    els.lightbox.classList.add('panning');
    lightboxStage.setPointerCapture(event.pointerId);
  }

  function moveImagePan(event) {
    if (!imagePanning || !imagePanStart) return;
    event.preventDefault();
    const deltaX = event.clientX - imagePanStart.pointerX;
    const deltaY = event.clientY - imagePanStart.pointerY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) suppressLightboxClick = true;
    setImagePan(imagePanStart.panX + deltaX, imagePanStart.panY + deltaY);
  }

  function endImagePan(event) {
    if (!imagePanning) return;
    imagePanning = false;
    imagePanStart = null;
    els.lightbox.classList.remove('panning');
    if (lightboxStage.hasPointerCapture(event.pointerId)) lightboxStage.releasePointerCapture(event.pointerId);
  }

  function openLightboxSource(src, alt, options = {}) {
    clearLightboxObjectUrl();
    if (options.revokeOnClose) state.lightboxObjectUrl = src;
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    setImageZoom(1, { resetPan: true });
    els.lightbox.classList.add('open');
    els.lightbox.setAttribute('aria-hidden', 'false');
  }

  function closeLightbox() {
    imagePanning = false;
    imagePanStart = null;
    els.lightbox.classList.remove('open', 'can-pan', 'panning');
    els.lightbox.setAttribute('aria-hidden', 'true');
    lightboxImg.removeAttribute('src');
    clearLightboxObjectUrl();
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
    window.setTimeout(() => setPreviewScrollTop(topForReadingProgress(progress)), 600);
    updateReadingNavButtons();
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
      hideFileContextMenu();
      hideSelectionToolbar();
      scheduleSourceAxisVisibleUpdate();
      scheduleSourceAxisActiveUpdate();
    });
  }

  function schedulePreviewScrollIdleWork() {
    scheduleScrollSync('preview');
    scheduleReadingProgressSave();
    if (hasNoteAnnotations()) scheduleNoteMarginRender(220);
    if (!state.readingHistoryApplying && state.scrollSyncLock !== 'source' && !state.previewScrollIntent) {
      state.previewScrollIntent = true;
    }
    scheduleReadingHistoryCapture();
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

  function simpleMarkdownFromPreviewBlock(blockEl, block) {
    const heading = blockEl.querySelector('h1,h2,h3,h4,h5,h6');
    if (heading) return '#'.repeat(Number(heading.tagName.slice(1))) + ' ' + heading.textContent.trim();
    if (block.type === 'blockquote') return blockEl.textContent.trim().split(/\n+/).map(line => '> ' + line.trim()).join('\n');
    if (block.type === 'list') {
      const ordered = !!blockEl.querySelector('ol');
      return Array.from(blockEl.querySelectorAll('li')).map((li, index) => (ordered ? (index + 1) + '. ' : '- ') + li.textContent.trim()).join('\n');
    }
    return blockEl.textContent.trim().replace(/\n{3,}/g, '\n\n');
  }

  function patchMarkdownBlockFromPreview(blockEl) {
    const index = Number(blockEl.dataset.blockIndex);
    const block = state.blocks[index];
    if (!block || !block.editable) return;
    const nextMarkdown = simpleMarkdownFromPreviewBlock(blockEl, block);
    if (!nextMarkdown) return;
    const lines = state.markdown.replace(/\r\n/g, '\n').split('\n');
    lines.splice(block.start, block.end - block.start + 1, ...nextMarkdown.split('\n'));
    setMarkdown(lines.join('\n'), { skipEditorUpdate: false });
    setStatus(t('previewSynced'));
  }

  function schedulePreviewPatch(blockEl) {
    clearTimeout(state.patchTimer);
    state.patchTimer = setTimeout(() => patchMarkdownBlockFromPreview(blockEl), 500);
  }

  function setMarkdown(markdown, options = {}) {
    if (state.documentDeleted) return;
    state.markdown = markdown;
    if (!options.skipEditorUpdate) els.editor.value = markdown;
    updateSourceStatus();
    scheduleRender();
    scheduleSave();
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => renderPreview(), 180);
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    if (state.documentDeleted) return;
    if (!state.autoSave) return;
    state.saveTimer = setTimeout(() => saveMarkdown(), 650);
  }

  function saveMarkdown(options = {}) {
    if (state.documentDeleted) {
      setStatus(t('documentDeleted'));
      return;
    }
    const markdown = state.markdown;
    if (markdown === state.committedMarkdown && !options.saveToDisk) {
      els.sourceStatus.textContent = t('synced');
      return;
    }
    const saveId = ++state.saveSeq;
    state.pendingMarkdownSaves.set(saveId, markdown);
    post({
      type: 'updateMarkdown',
      uri: state.uri,
      markdown,
      baseMarkdownHash: state.markdownHash,
      saveId,
      saveToDisk: !!options.saveToDisk
    });
    els.sourceStatus.textContent = options.saveToDisk ? t('saved') : t('synced');
  }

  function updateSourceStatus() {
    const lines = state.markdown ? state.markdown.split(/\r?\n/).length : 0;
    els.sourceStatus.textContent = lines + ' ' + t('lines');
  }

  function markdownImageLine(saved) {
    if (state.documentKind === 'latex') {
      const safeCaption = saved.fileName.replace(/[{}\n\r]/g, ' ');
      return [
        '\\begin{figure}[htbp]',
        '  \\centering',
        '  \\includegraphics[width=0.9\\linewidth]{' + saved.markdownPath + '}',
        '  \\caption{' + safeCaption + '}',
        '\\end{figure}'
      ].join('\n');
    }
    return '![' + saved.fileName.replace(/[\[\]\n\r]/g, ' ') + '](' + saved.markdownPath + ')';
  }

  function insertTextInEditor(text) {
    const editor = els.editor;
    const start = editor.selectionStart || 0;
    const end = editor.selectionEnd || start;
    const before = editor.value.slice(0, start);
    const after = editor.value.slice(end);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const suffix = after && !after.startsWith('\n') ? '\n' : '';
    const insert = prefix + text + suffix;
    const next = before + insert + after;
    editor.value = next;
    editor.selectionStart = editor.selectionEnd = before.length + insert.length;
    setMarkdown(next, { skipEditorUpdate: true });
  }

  function insertMarkdownAfterActiveBlock(text) {
    const block = state.blocks[state.activeBlockIndex];
    const lines = state.markdown.replace(/\r\n/g, '\n').split('\n');
    const insertAt = block ? block.end + 1 : lines.length;
    lines.splice(insertAt, 0, '', text, '');
    setMarkdown(lines.join('\n'));
  }

  function clipboardImage(event) {
    const items = Array.from(event.clipboardData ? event.clipboardData.items : []);
    const item = items.find(entry => entry.type && entry.type.startsWith('image/'));
    return item ? item.getAsFile() : null;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleImagePaste(file, target) {
    const base64 = await fileToBase64(file);
    post({
      type: 'saveImage',
      uri: state.uri,
      mime: file.type || 'image/png',
      base64
    });
    state.pendingImageTarget = target;
  }

  function exportHtml() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script').forEach(node => node.remove());
    clone.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
    const html = '<!doctype html>\n' + clone.outerHTML;
    post({ type: 'exportHtml', uri: state.uri, html });
  }

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
      els.editor.value = state.markdown;
      els.documentName.textContent = message.fileName || state.fileName;
      updateSourceStatus();
      applyDocumentAvailability();
      renderMarkdownFiles();
      updateDocumentKindLabels();
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

    els.lightbox.addEventListener('click', event => {
      if (suppressLightboxClick) {
        suppressLightboxClick = false;
        return;
      }
      if (event.target === els.lightbox || event.target === lightboxStage) closeLightbox();
    });
    els.lightbox.addEventListener('wheel', event => {
      event.preventDefault();
      setImageZoom(imageZoom + (event.deltaY < 0 ? 0.12 : -0.12));
    }, { passive: false });
    lightboxImg.addEventListener('pointerdown', beginImagePan);
    lightboxStage.addEventListener('pointermove', moveImagePan);
    lightboxStage.addEventListener('pointerup', endImagePan);
    lightboxStage.addEventListener('pointercancel', endImagePan);
    lightboxImg.addEventListener('dblclick', event => {
      event.preventDefault();
      setImageZoom(imageZoom > 1 ? 1 : 2, { resetPan: true });
    });
    els.lightbox.querySelectorAll('button[data-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        if (action === 'zoom-in') setImageZoom(imageZoom * 1.2);
        if (action === 'zoom-out') setImageZoom(imageZoom / 1.2);
        if (action === 'reset') setImageZoom(1, { resetPan: true });
        if (action === 'close') closeLightbox();
      });
    });

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
    els.editor.value = state.markdown;
    state.annotations = sanitizeClientAnnotations(state.annotations);
    if (state.previewOnly) els.editor.disabled = true;
    setOutlineFilesHeight(state.outlineFilesHeight, false);
    renderMarkdownFiles();
    setupResizers();
    setupOutlineSplitter();
    setupEvents();
    updateSourceStatus();
    renderPreview({ initialProgress: state.readingProgress }).then(rendered => {
      if (rendered === false) return;
      restoreReadingProgress(state.readingProgress, { resetHistory: true });
      scheduleNoteMarginRender();
      if (hasNoteAnnotations()) {
        window.setTimeout(scheduleNoteMarginRender, 180);
      }
    });
    post({ type: 'ready' });
  }

  bootstrap();
})();
