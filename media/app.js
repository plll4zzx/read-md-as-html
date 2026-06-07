(function () {
  const vscode = acquireVsCodeApi();
  const initial = window.__MARKDOWN_STUDIO_INITIAL_STATE__ || {};
  const persistedState = vscode.getState ? (vscode.getState() || {}) : {};

  const state = {
    uri: initial.uri || '',
    fileName: initial.fileName || 'document.md',
    markdown: initial.markdown || '',
    previewOnly: !!initial.previewOnly,
    autoSave: initial.autoSave !== false,
    previewEditEnabled: !!initial.previewEditEnabled,
    theme: persistedState.theme || initial.theme || 'reader-light',
    language: persistedState.language || initial.language || 'en',
    layout: Object.assign({ outline: 300, source: 580 }, persistedState.layout || {}),
    sourceCollapsed: !initial.previewOnly && !!persistedState.sourceCollapsed,
    blocks: [],
    refs: new Map(),
    sectionPreviews: new Map(),
    imageMap: new Map(),
    renderTimer: null,
    saveTimer: null,
    patchTimer: null,
    hoverTimer: null,
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
    lastSavedReadingProgress: '',
    annotations: Array.isArray(initial.annotations) ? initial.annotations : [],
    pendingAnnotationSelection: null,
    readingHistoryApplying: false,
    previewScrollIntent: false,
    lightboxObjectUrl: null
  };

  const els = {
    outlineTitle: document.getElementById('outlineTitle'),
    documentName: document.getElementById('documentName'),
    sourceTitle: document.getElementById('sourceTitle'),
    previewTitle: document.getElementById('previewTitle'),
    sourceStatus: document.getElementById('sourceStatus'),
    previewStatus: document.getElementById('previewStatus'),
    sourceToolbarHost: document.getElementById('sourceToolbarHost'),
    collapsedToolbarHost: document.getElementById('collapsedToolbarHost'),
    sourceActions: document.getElementById('sourceActions'),
    languageControl: document.getElementById('languageControl'),
    languageLabel: document.getElementById('languageLabel'),
    languageSelect: document.getElementById('languageSelect'),
    themeControl: document.getElementById('themeControl'),
    themeLabel: document.getElementById('themeLabel'),
    saveDocument: document.getElementById('saveDocument'),
    collapseMarkdown: document.getElementById('collapseMarkdown'),
    exportHtml: document.getElementById('exportHtml'),
    togglePreviewEdit: document.getElementById('togglePreviewEdit'),
    themeSelect: document.getElementById('themeSelect'),
    editor: document.getElementById('markdownEditor'),
    preview: document.getElementById('preview'),
    previewScroller: document.getElementById('previewScroller'),
    outlineTree: document.getElementById('outlineTree'),
    previewToc: document.getElementById('previewToc'),
    previewTocToggle: document.getElementById('previewTocToggle'),
    previewTocNav: document.getElementById('previewTocNav'),
    previewNotes: document.getElementById('previewNotes'),
    previewNotesToggle: document.getElementById('previewNotesToggle'),
    previewNotesList: document.getElementById('previewNotesList'),
    renderStats: document.getElementById('renderStats'),
    readingBack: document.getElementById('readingBack'),
    readingForward: document.getElementById('readingForward'),
    hovercard: document.getElementById('hovercard'),
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
      markdown: 'Markdown',
      preview: 'HTML Preview',
      language: 'Language',
      languageTitle: 'Choose UI language',
      theme: 'Theme',
      themeTitle: 'Choose read-md-as-html theme',
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
      imageSaveFailed: 'Image save failed',
      mermaidError: 'Mermaid render error',
      mathError: 'Formula render error',
      clickToZoom: 'Click to zoom',
      reference: 'Reference',
      authors: 'Authors: ',
      venue: 'Venue: ',
      info: 'Info: ',
      openSource: 'Open source',
      section: 'Section',
      highlight: 'Highlight',
      bookmark: 'Bookmark',
      note: 'Note',
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
      sectionLocation: 'Section: ',
      chapterNumber: 'Chapter: ',
      subsectionTitle: 'Title: ',
      deleteAnnotation: 'Delete',
      deleteAnnotationTitle: 'Delete this annotation'
    },
    'zh-CN': {
      outline: '目录',
      markdown: 'Markdown',
      preview: 'HTML 预览',
      language: '语言',
      languageTitle: '选择界面语言',
      theme: '主题',
      themeTitle: '选择 read-md-as-html 主题',
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
      imageSaveFailed: '图片保存失败',
      mermaidError: 'Mermaid 渲染有错误',
      mathError: '公式渲染有错误',
      clickToZoom: '点击放大查看',
      reference: '参考文献',
      authors: '作者：',
      venue: '会议/期刊：',
      info: '信息：',
      openSource: '打开来源',
      section: '小节',
      highlight: '高亮',
      bookmark: '书签',
      note: '批注',
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

  function validTheme(theme) {
    return ['reader-light', 'soft-green', 'vscode', 'dark'].includes(theme) ? theme : 'reader-light';
  }

  function persistWebviewState() {
    if (!vscode.setState) return;
    vscode.setState(Object.assign({}, vscode.getState ? (vscode.getState() || {}) : {}, {
      theme: state.theme,
      language: state.language,
      layout: state.layout,
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

  function updateRenderStats() {
    els.renderStats.textContent = state.blocks.length + ' ' + t('blocks');
  }

  function applyLanguage(language, options = {}) {
    state.language = validLanguage(language);
    document.documentElement.lang = state.language === 'zh-CN' ? 'zh-CN' : 'en';
    if (els.languageSelect) els.languageSelect.value = state.language;

    setText(els.outlineTitle, t('outline'));
    setText(els.sourceTitle, t('markdown'));
    setText(els.previewTitle, t('preview'));
    setText(els.languageLabel, t('language'));
    setText(els.themeLabel, t('theme'));
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

    document.querySelector('[data-resize-handle="outline-source"]')?.setAttribute('aria-label', t('outlineResizeLabel'));
    document.querySelector('[data-resize-handle="source-preview"]')?.setAttribute('aria-label', t('previewResizeLabel'));
    els.previewToc.setAttribute('aria-label', t('previewTocLabel'));
    els.previewNotes.setAttribute('aria-label', t('previewNotesLabel'));
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
    if (state.blocks.length) state.sectionPreviews = collectSectionPreviews(state.blocks);
    renderOutlines();
    renderNotesPanel();
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
  }

  function constrainLayout(nextOutline, nextSource) {
    const shell = document.querySelector('.studio-shell');
    const shellWidth = shell ? shell.clientWidth : window.innerWidth;
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

    window.addEventListener('resize', () => setLayout(state.layout.outline, state.layout.source, false));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function classifyBlock(raw) {
    const trimmed = raw.trim();
    if (/^---\n[\s\S]*\n---$/.test(trimmed)) return 'frontmatter';
    if (/^#{1,6}\s+/.test(trimmed)) return 'heading';
    if (/^\[R\d+\]\s+/.test(trimmed)) return 'reference';
    if (/^```/.test(trimmed)) return 'code';
    if (trimmed === '$$' || trimmed.startsWith('$$\n')) return 'math';
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
    let inMath = false;
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
      if (trimmed === '$$') {
        if (inMath) {
          inMath = false;
          flush(i);
        } else {
          inMath = true;
        }
        continue;
      }
      if (inFence || inMath) continue;
      if (!lines[i + 1] || !lines[i + 1].trim()) flush(i);
    }
    flush(lines.length - 1);
    return annotateBlocks(blocks);
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

  function isEditablePreviewBlock(type, raw) {
    if (!['heading', 'paragraph', 'blockquote', 'list'].includes(type)) return false;
    if (raw.includes('$$') || raw.includes('```')) return false;
    if (/\$[^$\n]+\$/.test(raw)) return false;
    if (/!\[[^\]]*\]\([^)]+\)/.test(raw)) return false;
    return true;
  }

  function annotateBlocks(blocks) {
    const used = new Map();
    blocks.forEach(block => {
      block.editable = isEditablePreviewBlock(block.type, block.raw);
      if (block.type !== 'heading') return;
      const info = headingInfo(block.raw, used);
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
        const text = stripMarkdown(next.raw);
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

  function renderInlineMarkdown(value) {
    let text = escapeHtml(value);
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    return text;
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
      return '<div class="math-block">' + escapeHtml(raw) + '</div>';
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
    if (type === 'math') return '<div class="math-block">' + escapeHtml(raw) + '</div>';
    if (window.marked) {
      let html = window.marked.parse(raw);
      html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, function (_, code) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = code;
        return '<div class="mermaid">' + escapeHtml(textarea.value) + '</div>';
      });
      return window.DOMPurify ? window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }) : html;
    }
    return simpleMarkdownFragment(raw, type);
  }

  function renderBlock(block) {
    const refMatch = /^\[R(\d+)\]\s+/.exec(block.raw.trim());
    const blockId = refMatch ? 'ref-r' + refMatch[1].toLowerCase() : (block.headingId || '');
    const idAttr = blockId ? ' id="' + escapeHtml(blockId) + '"' : '';
    const classes = [
      'md-block',
      block.editable && state.previewEditEnabled ? 'preview-editable' : 'preview-readonly',
      block.type === 'reference' ? 'reference-block' : '',
      block.type === 'frontmatter' ? 'frontmatter-block' : ''
    ].filter(Boolean).join(' ');
    const attrs = [
      ' data-block-index="' + block.index + '"',
      ' data-block-type="' + block.type + '"',
      ' data-source-start="' + block.start + '"',
      ' data-source-end="' + block.end + '"',
      block.editable && state.previewEditEnabled ? ' contenteditable="true" spellcheck="true"' : ''
    ].join('');
    const renderRaw = block.type === 'heading'
      ? block.raw.replace(/\s*\{#[A-Za-z0-9_.:-]+\}\s*$/, '')
      : block.raw;
    return '<section' + idAttr + ' class="' + classes + '"' + attrs + '>' + renderMarkdownFragment(renderRaw, block.type) + '</section>';
  }

  async function renderPreview() {
    initLibraries();
    const sourceMarkdown = markdownForRender();
    state.refs = collectReferences(sourceMarkdown);
    state.blocks = splitMarkdownBlocks(sourceMarkdown);
    state.sectionPreviews = collectSectionPreviews(state.blocks);
    els.preview.classList.remove('empty');
    els.preview.innerHTML = state.blocks.map(block => renderBlock(block)).join('\n') || '<div class="empty-state"><h1>' + escapeHtml(t('emptyDocument')) + '</h1></div>';
    updateRenderStats();
    renderOutlines();
    postProcessPreview();
    await runRenderers();
    applyAnnotations();
    updateBookmarkMarkers();
    renderNotesPanel();
    scheduleDiagramBinding();
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

  function postProcessPreview() {
    wrapTables();
    markImages();
    linkCitations();
    bindImageClicks();
    resolvePreviewImages();
  }

  function wrapTables() {
    els.preview.querySelectorAll('table').forEach(table => {
      if (table.parentElement && table.parentElement.classList.contains('table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function markImages() {
    els.preview.querySelectorAll('img').forEach(img => {
      img.classList.add('doc-image');
      img.loading = 'lazy';
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

  function resolvePreviewImages() {
    els.preview.querySelectorAll('img').forEach(img => {
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

  function linkCitations() {
    const walker = document.createTreeWalker(els.preview, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('a, pre, code, .mermaid, .reference-block')) return NodeFilter.FILTER_REJECT;
        return /\[R\d+\]/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
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

  async function runRenderers() {
    if (window.mermaid) {
      try {
        await window.mermaid.run({ nodes: Array.from(els.preview.querySelectorAll('.mermaid')) });
      } catch (error) {
        setStatus(t('mermaidError'));
      }
    }
    if (window.MathJax && window.MathJax.typesetPromise) {
      try {
        await window.MathJax.typesetPromise([els.preview]);
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

  function annotationHoverContent(annotation, anchor) {
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
    if (annotation.note) {
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
    const annotationId = anchor.dataset.annotationId;
    if (annotationId) {
      const annotation = state.annotations.find(entry => entry.id === annotationId);
      if (!annotation) return null;
      return annotationHoverContent(annotation, anchor);
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

  function showHovercard(anchor) {
    const html = hoverContentFor(anchor);
    if (!html) return;
    clearTimeout(state.hoverTimer);
    els.hovercard.innerHTML = html;
    els.hovercard.classList.add('visible');
    els.hovercard.setAttribute('aria-hidden', 'false');
    const rect = anchor.getBoundingClientRect();
    const cardRect = els.hovercard.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 10;
    if (left + cardRect.width > window.innerWidth - 14) left = window.innerWidth - cardRect.width - 14;
    if (top + cardRect.height > window.innerHeight - 14) top = Math.max(14, rect.top - cardRect.height - 10);
    els.hovercard.style.left = Math.max(14, left) + 'px';
    els.hovercard.style.top = Math.max(14, top) + 'px';
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
      if (selectionInfo) showSelectionToolbar(selectionInfo);
      else hideSelectionToolbar();
    }, 0);
  }

  function saveAnnotations() {
    state.annotations = sanitizeClientAnnotations(state.annotations);
    post({ type: 'updateAnnotations', uri: state.uri, annotations: state.annotations });
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
    updateBookmarkMarkers();
    renderNotesPanel();
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
    updateBookmarkMarkers();
    renderNotesPanel();
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
      const byLine = els.preview.querySelector('.md-block[data-source-start="' + sourceStart + '"]');
      if (byLine) return byLine;
    }
    const blockIndex = Number(annotation.blockIndex);
    if (Number.isFinite(blockIndex) && blockIndex >= 0) {
      return els.preview.querySelector('.md-block[data-block-index="' + blockIndex + '"]');
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

  function annotationTargetTop(annotation) {
    const target = targetAnnotationElement(annotation);
    if (!target) return 0;
    const scrollerRect = els.previewScroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return Math.max(0, els.previewScroller.scrollTop + targetRect.top - scrollerRect.top);
  }

  function jumpToAnnotation(annotation) {
    const target = targetAnnotationElement(annotation);
    if (!target) return;
    const top = annotationTargetTop(annotation) - Math.max(36, els.previewScroller.clientHeight * 0.16);
    setPreviewScrollTop(top, { recordCurrent: true, recordTarget: true });
    target.classList.add('annotation-pulse');
    window.setTimeout(() => target.classList.remove('annotation-pulse'), 1300);
    scheduleScrollSync('preview');
    scheduleReadingProgressSave(120);
  }

  function updateBookmarkMarkers() {
    if (!els.bookmarkRail) return;
    els.bookmarkRail.innerHTML = '';
    const railAnnotations = sanitizeClientAnnotations(state.annotations).filter(annotation => annotation.type === 'bookmark' || annotation.type === 'note');
    if (!railAnnotations.length) return;
    const railHeight = els.bookmarkRail.clientHeight || els.previewScroller.clientHeight;
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

  function bindImageClicks() {
    els.preview.querySelectorAll('img.doc-image').forEach(img => {
      img.addEventListener('click', () => openLightboxSource(img.currentSrc || img.src, img.alt || ''));
      img.addEventListener('load', updateBookmarkMarkers);
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
    const blocks = Array.from(els.preview.querySelectorAll('.md-block[data-source-start]'));
    if (!blocks.length) return null;
    const scrollerRect = els.previewScroller.getBoundingClientRect();
    let best = blocks[0];
    let bestDistance = Infinity;
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (rect.bottom < scrollerRect.top) continue;
      const distance = Math.abs(rect.top - scrollerRect.top - 12);
      if (distance < bestDistance) {
        best = block;
        bestDistance = distance;
      }
      if (rect.top > scrollerRect.top + scrollerRect.height * 0.45) break;
    }
    return best;
  }

  function captureReadingProgress(top = els.previewScroller.scrollTop) {
    const scrollTop = normalizedPreviewScrollTop(top);
    const maxTop = maxPreviewScrollTop();
    const blockEl = visiblePreviewBlock();
    const sourceStart = blockEl ? Number(blockEl.dataset.sourceStart) : -1;
    const blockIndex = blockEl ? Number(blockEl.dataset.blockIndex) : -1;
    return {
      top: scrollTop,
      ratio: maxTop > 0 ? Math.min(1, Math.max(0, scrollTop / maxTop)) : 0,
      sourceStart: Number.isFinite(sourceStart) ? sourceStart : -1,
      blockIndex: Number.isFinite(blockIndex) ? blockIndex : -1,
      blockOffset: blockEl ? Math.round(scrollTop - blockEl.offsetTop) : 0,
      timestamp: Date.now()
    };
  }

  function progressBlockElement(progress) {
    if (!progress) return null;
    const sourceStart = Number(progress.sourceStart);
    if (Number.isFinite(sourceStart) && sourceStart >= 0) {
      const byLine = els.preview.querySelector('.md-block[data-source-start="' + sourceStart + '"]');
      if (byLine) return byLine;
    }
    const blockIndex = Number(progress.blockIndex);
    if (Number.isFinite(blockIndex) && blockIndex >= 0) {
      return els.preview.querySelector('.md-block[data-block-index="' + blockIndex + '"]');
    }
    return null;
  }

  function topForReadingProgress(progress) {
    if (!progress) return 0;
    const blockEl = progressBlockElement(progress);
    if (blockEl) {
      return normalizedPreviewScrollTop(blockEl.offsetTop + Math.round(Number(progress.blockOffset) || 0));
    }
    const ratio = Number(progress.ratio);
    if (Number.isFinite(ratio) && ratio > 0) {
      return normalizedPreviewScrollTop(maxPreviewScrollTop() * ratio);
    }
    return normalizedPreviewScrollTop(progress.top || 0);
  }

  function restoreReadingProgress(progress) {
    const target = topForReadingProgress(progress);
    resetReadingHistory(target);
    setPreviewScrollTop(target);
    window.setTimeout(() => setPreviewScrollTop(topForReadingProgress(progress)), 120);
    window.setTimeout(() => setPreviewScrollTop(topForReadingProgress(progress)), 600);
  }

  function saveReadingProgressNow() {
    const progress = captureReadingProgress();
    const serialized = JSON.stringify(progress);
    if (serialized === state.lastSavedReadingProgress) return;
    state.lastSavedReadingProgress = serialized;
    state.readingProgress = progress;
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
    const blockEl = els.preview.querySelector('.md-block[data-block-index="' + block.index + '"]');
    if (!blockEl) return;
    state.scrollSyncLock = 'source';
    setPreviewScrollTop(blockEl.offsetTop - els.previewScroller.clientHeight * 0.12);
    clearTimeout(state.scrollLockTimer);
    state.scrollLockTimer = setTimeout(() => { state.scrollSyncLock = null; }, 180);
  }

  function scheduleScrollSync(kind) {
    clearTimeout(state.scrollDebounceTimer);
    state.scrollDebounceTimer = setTimeout(() => {
      if (kind === 'preview') syncEditorToPreviewScroll();
      if (kind === 'source') syncPreviewToEditorScroll();
    }, 35);
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
    const nextTop = normalizedPreviewScrollTop(top);
    const minDelta = options.force ? 24 : Math.max(180, Math.round(els.previewScroller.clientHeight * 0.35));
    if (state.readingHistoryIndex >= 0) {
      const currentTop = state.readingHistory[state.readingHistoryIndex];
      if (Math.abs(currentTop - nextTop) < minDelta) {
        updateReadingNavButtons();
        return false;
      }
    }
    if (state.readingHistoryIndex < state.readingHistory.length - 1) {
      state.readingHistory = state.readingHistory.slice(0, state.readingHistoryIndex + 1);
    }
    state.readingHistory.push(nextTop);
    if (state.readingHistory.length > 80) state.readingHistory.shift();
    state.readingHistoryIndex = state.readingHistory.length - 1;
    updateReadingNavButtons();
    return true;
  }

  function resetReadingHistory(top = 0) {
    clearTimeout(state.readingHistoryTimer);
    state.previewScrollIntent = false;
    state.readingHistoryApplying = true;
    state.readingHistory = [normalizedPreviewScrollTop(top)];
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
    state.readingHistoryIndex = nextIndex;
    state.previewScrollIntent = false;
    setPreviewScrollTop(state.readingHistory[nextIndex]);
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
    const blockEl = els.preview.querySelector('.md-block[data-block-index="' + blockIndex + '"]');
    if (!blockEl) return;
    state.scrollSyncLock = 'source';
    setPreviewScrollTop(blockEl.offsetTop - 24, { recordCurrent: true, recordTarget: true });
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
    if (!state.autoSave) return;
    state.saveTimer = setTimeout(() => saveMarkdown(), 650);
  }

  function saveMarkdown(options = {}) {
    post({
      type: 'updateMarkdown',
      uri: state.uri,
      markdown: state.markdown,
      saveToDisk: !!options.saveToDisk
    });
    els.sourceStatus.textContent = options.saveToDisk ? t('saved') : t('synced');
  }

  function updateSourceStatus() {
    const lines = state.markdown ? state.markdown.split(/\r?\n/).length : 0;
    els.sourceStatus.textContent = lines + ' ' + t('lines');
  }

  function markdownImageLine(saved) {
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
    if (message.type === 'documentLoaded' || message.type === 'documentChanged') {
      if (message.uri !== state.uri) return;
      const restoreProgress = message.type === 'documentLoaded'
        ? (message.readingProgress || state.readingProgress)
        : captureReadingProgress();
      state.markdown = message.markdown || '';
      if (Array.isArray(message.annotations)) state.annotations = sanitizeClientAnnotations(message.annotations);
      els.editor.value = state.markdown;
      els.documentName.textContent = message.fileName || state.fileName;
      updateSourceStatus();
      renderPreview().then(() => {
        state.readingProgress = restoreProgress || null;
        restoreReadingProgress(state.readingProgress);
      });
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
      hideSelectionToolbar();
      scheduleScrollSync('preview');
      scheduleReadingProgressSave();
      if (!state.readingHistoryApplying && state.scrollSyncLock !== 'source' && !state.previewScrollIntent) {
        state.previewScrollIntent = true;
      }
      scheduleReadingHistoryCapture();
    });
    els.previewScroller.addEventListener('wheel', () => {
      beginPreviewScrollIntent();
      scheduleScrollSync('preview');
      scheduleReadingHistoryCapture();
    });
    els.previewScroller.addEventListener('pointerdown', beginPreviewScrollIntent);
    els.previewScroller.addEventListener('pointerup', scheduleReadingHistoryCapture);
    els.previewScroller.addEventListener('pointercancel', scheduleReadingHistoryCapture);

    els.preview.addEventListener('click', event => {
      const block = event.target.closest('.md-block');
      if (!block) return;
      state.activeBlockIndex = Number(block.dataset.blockIndex);
    });
    els.preview.addEventListener('mouseup', handlePreviewSelection);
    els.preview.addEventListener('keyup', handlePreviewSelection);
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveMarkdown();
      }
      if (event.key === 'Escape') {
        hideSelectionToolbar();
        closeLightbox();
      }
    });
    document.addEventListener('pointerdown', event => {
      if (els.selectionToolbar.contains(event.target) || els.preview.contains(event.target)) return;
      hideSelectionToolbar();
    });

    window.addEventListener('message', event => handleHostMessage(event.data));
    window.addEventListener('beforeunload', saveReadingProgressNow);
    window.addEventListener('resize', () => {
      hideSelectionToolbar();
      updateBookmarkMarkers();
    });
  }

  function bootstrap() {
    applyTheme(state.theme, { silent: true });
    applyLanguage(state.language, { silent: true });
    applySourceCollapsed();
    applyLayout();
    els.documentName.textContent = state.fileName;
    els.editor.value = state.markdown;
    state.annotations = sanitizeClientAnnotations(state.annotations);
    if (state.previewOnly) els.editor.disabled = true;
    setupResizers();
    setupEvents();
    updateSourceStatus();
    renderPreview().then(() => restoreReadingProgress(state.readingProgress));
    post({ type: 'ready' });
  }

  bootstrap();
})();
