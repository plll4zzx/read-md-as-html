const vscode = require('vscode');
const path = require('path');

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('readMdAsHtml.openCurrentMarkdown', (uri) => {
      openStudio(context, uri, { previewOnly: false }).catch(showError);
    }),
    vscode.commands.registerCommand('readMdAsHtml.openPreviewOnly', (uri) => {
      openStudio(context, uri, { previewOnly: true }).catch(showError);
    }),
    vscode.commands.registerCommand('readMdAsHtml.exportCurrentMarkdownAsReaderHtml', (uri) => {
      exportCurrentMarkdown(context, uri).catch(showError);
    })
  );
}

function deactivate() {}

async function openStudio(context, uri, options) {
  const documentUri = await resolveMarkdownUri(uri);
  if (!documentUri) return;

  const workspaceRoot = workspaceRootFor(documentUri) || vscode.Uri.file(path.dirname(documentUri.fsPath));
  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
  const panel = vscode.window.createWebviewPanel(
    'readMdAsHtml',
    panelTitleFor(documentUri),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot, workspaceRoot]
    }
  );
  applyPanelIdentity(panel, mediaRoot, documentUri);

  const state = await loadDocumentState(context, documentUri, options);

  panel.webview.html = await webviewHtml(context, panel.webview, state);
  applyPanelIdentity(panel, mediaRoot, documentUri);
  wirePanelMessages(context, panel, state);
  const markdownDirectoryWatcher = watchMarkdownDirectory(panel, state);

  const watcher = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() !== state.documentUri.toString()) return;
    const next = event.document.getText();
    if (next === state.markdown) return;
    const embedded = annotationsFromMarkdown(next);
    state.markdown = next;
    state.annotations = embedded.annotations;
    panel.webview.postMessage({
      type: 'documentChanged',
      uri: state.documentUri.toString(),
      markdown: state.markdown,
      annotations: state.annotations
    });
  });

  panel.onDidDispose(() => {
    watcher.dispose();
    markdownDirectoryWatcher.dispose();
  });
}

async function resolveMarkdownUri(uri) {
  if (uri && isMarkdownUri(uri)) return uri;
  const editor = vscode.window.activeTextEditor;
  if (editor && isMarkdownUri(editor.document.uri)) return editor.document.uri;

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: {
      Markdown: ['md', 'markdown']
    },
    title: 'Open Markdown in read-md-as-html'
  });
  return picked && picked[0] ? picked[0] : null;
}

function isMarkdownUri(uri) {
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

function workspaceRootFor(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? folder.uri : null;
}

async function loadDocumentState(context, documentUri, options = {}) {
  const markdown = await readText(documentUri);
  const embedded = annotationsFromMarkdown(markdown);
  const documentCache = await documentCacheFor(context, documentUri);
  return {
    documentUri,
    markdown,
    previewOnly: !!options.previewOnly,
    documentCache,
    readingProgress: documentCache.readingProgress,
    annotations: embedded.annotations.length ? embedded.annotations : documentCache.annotations
  };
}

async function markdownFilesFor(documentUri) {
  const directory = markdownDirectoryUri(documentUri);
  const folderState = await folderStateFor(documentUri);
  const pinnedFiles = new Set(folderState.pinnedFiles);
  const pinnedRank = new Map(folderState.pinnedFiles.map((name, index) => [name, index]));
  let entries = [];
  try {
    entries = await vscode.workspace.fs.readDirectory(directory);
  } catch (error) {
    return [];
  }
  const markdownEntries = entries
    .filter(([name, type]) => {
      if (type === vscode.FileType.Directory) return false;
      const ext = path.extname(name).toLowerCase();
      return ext === '.md' || ext === '.markdown';
    })
  const files = await Promise.all(markdownEntries.map(async ([name]) => {
      const uri = vscode.Uri.joinPath(directory, name);
      let mtime = 0;
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        mtime = Number(stat.mtime) || 0;
      } catch (error) {
        // Ignore files that disappear while the directory is being read.
      }
      return {
        name,
        uri: uri.toString(),
        mtime,
        pinned: pinnedFiles.has(filePinKeyFromName(name)),
        pinRank: pinnedRank.has(filePinKeyFromName(name)) ? pinnedRank.get(filePinKeyFromName(name)) : -1,
        active: uri.toString() === documentUri.toString()
      };
    }));
  return files.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned && a.pinRank !== b.pinRank) return a.pinRank - b.pinRank;
    if (b.mtime !== a.mtime) return b.mtime - a.mtime;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
}

function watchMarkdownDirectory(panel, state) {
  const directory = markdownDirectoryUri(state.documentUri);
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(directory, '*.{md,markdown}'));
  let refreshTimer;

  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      panel.webview.postMessage({
        type: 'markdownFilesChanged',
        uri: state.documentUri.toString(),
        markdownFiles: await markdownFilesFor(state.documentUri)
      });
    }, 120);
  };

  watcher.onDidCreate(scheduleRefresh);
  watcher.onDidDelete(scheduleRefresh);
  watcher.onDidChange(scheduleRefresh);

  return {
    dispose() {
      clearTimeout(refreshTimer);
      watcher.dispose();
    }
  };
}

function panelTitleFor(uri) {
  return path.basename(uri.fsPath);
}

function applyPanelIdentity(panel, mediaRoot, documentUri) {
  panel.title = panelTitleFor(documentUri);
  const icon = vscode.Uri.joinPath(mediaRoot, 'wand-markdown-dark.svg');
  panel.iconPath = { light: icon, dark: icon };
}

async function webviewHtml(context, webview, state) {
  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
  const htmlUri = vscode.Uri.joinPath(mediaRoot, 'index.html');
  const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'styles.css'));
  const appUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'app.js'));
  const html = await readText(htmlUri);
  const nonce = nonceValue();
  const config = {
    uri: state.documentUri.toString(),
    fileName: path.basename(state.documentUri.fsPath),
    markdown: state.markdown,
    markdownFiles: await markdownFilesFor(state.documentUri),
    previewOnly: state.previewOnly,
    autoSave: vscode.workspace.getConfiguration('readMdAsHtml').get('autoSave', true),
    previewEditEnabled: vscode.workspace.getConfiguration('readMdAsHtml').get('previewEditEnabledByDefault', false),
    theme: vscode.workspace.getConfiguration('readMdAsHtml').get('theme', 'reader-light'),
    language: vscode.workspace.getConfiguration('readMdAsHtml').get('language', 'en'),
    readingProgress: state.readingProgress,
    annotations: state.annotations
  };

  return html
    .replaceAll('${cspSource}', webview.cspSource)
    .replaceAll('${nonce}', nonce)
    .replaceAll('${stylesUri}', String(stylesUri))
    .replaceAll('${appUri}', String(appUri))
    .replace('${initialState}', escapeScriptJson(config));
}

function wirePanelMessages(context, panel, state) {
  panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'ready') {
        const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
        applyPanelIdentity(panel, mediaRoot, state.documentUri);
        panel.webview.postMessage({
          type: 'documentLoaded',
          uri: state.documentUri.toString(),
          fileName: path.basename(state.documentUri.fsPath),
          markdown: state.markdown,
          markdownFiles: await markdownFilesFor(state.documentUri),
          readingProgress: state.readingProgress,
          annotations: state.annotations
        });
      }
      if (message.type === 'updateMarkdown') {
        if (message.uri !== state.documentUri.toString()) return;
        const nextMarkdown = String(message.markdown || '');
        if (nextMarkdown === state.markdown && !message.saveToDisk) return;
        const embedded = annotationsFromMarkdown(nextMarkdown);
        state.annotations = embedded.annotations;
        state.markdown = markdownForStorage(nextMarkdown, state.annotations);
        await writeMarkdown(state.documentUri, state.markdown);
        if (message.saveToDisk) {
          await saveOpenDocument(state.documentUri);
        }
      }
      if (message.type === 'switchDocument') {
        if (message.uri !== state.documentUri.toString()) return;
        const targetUri = vscode.Uri.parse(String(message.targetUri || ''));
        if (!isMarkdownUri(targetUri) || path.dirname(targetUri.fsPath) !== path.dirname(state.documentUri.fsPath)) return;
        const progress = sanitizeReadingProgress(message.readingProgress);
        if (progress) {
          state.readingProgress = progress;
          await writeDocumentCache(state.documentUri, state);
        }
        if (typeof message.markdown === 'string') {
          const currentMarkdown = String(message.markdown);
          if (currentMarkdown !== state.markdown) {
            const embedded = annotationsFromMarkdown(currentMarkdown);
            state.annotations = embedded.annotations.length ? embedded.annotations : state.annotations;
            state.markdown = markdownForStorage(currentMarkdown, state.annotations);
            await writeMarkdown(state.documentUri, state.markdown);
          }
        }
        const nextState = await loadDocumentState(context, targetUri, { previewOnly: state.previewOnly });
        state.documentUri = nextState.documentUri;
        state.markdown = nextState.markdown;
        state.documentCache = nextState.documentCache;
        state.readingProgress = nextState.readingProgress;
        state.annotations = nextState.annotations;
        const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
        applyPanelIdentity(panel, mediaRoot, state.documentUri);
        panel.webview.postMessage({
          type: 'documentLoaded',
          uri: state.documentUri.toString(),
          fileName: path.basename(state.documentUri.fsPath),
          markdown: state.markdown,
          markdownFiles: await markdownFilesFor(state.documentUri),
          readingProgress: state.readingProgress,
          annotations: state.annotations
        });
      }
      if (message.type === 'resolveImage') {
        if (message.uri !== state.documentUri.toString()) return;
        const imageUri = resolveRelativeUri(state.documentUri, String(message.relativePath || ''));
        const exists = await fileExists(imageUri);
        panel.webview.postMessage({
          type: 'imageResolved',
          relativePath: message.relativePath,
          webviewUri: exists ? String(panel.webview.asWebviewUri(imageUri)) : ''
        });
      }
      if (message.type === 'saveImage') {
        if (message.uri !== state.documentUri.toString()) return;
        const saved = await savePastedImage(panel.webview, state.documentUri, message);
        panel.webview.postMessage({
          type: 'imageSaved',
          markdownPath: saved.markdownPath,
          webviewUri: saved.webviewUri,
          fileName: saved.fileName
        });
      }
      if (message.type === 'exportHtml') {
        await saveExportHtml(state.documentUri, String(message.html || ''));
      }
      if (message.type === 'updateTheme') {
        const theme = String(message.theme || 'reader-light');
        if (['reader-light', 'soft-green', 'vscode', 'dark'].includes(theme)) {
          await vscode.workspace.getConfiguration('readMdAsHtml').update('theme', theme, vscode.ConfigurationTarget.Global);
        }
      }
      if (message.type === 'updateLanguage') {
        const language = String(message.language || 'en');
        if (['en', 'zh-CN'].includes(language)) {
          await vscode.workspace.getConfiguration('readMdAsHtml').update('language', language, vscode.ConfigurationTarget.Global);
        }
      }
      if (message.type === 'setFilePinned') {
        if (message.uri !== state.documentUri.toString()) return;
        const targetUri = vscode.Uri.parse(String(message.targetUri || ''));
        if (!isMarkdownUri(targetUri) || path.dirname(targetUri.fsPath) !== path.dirname(state.documentUri.fsPath)) return;
        const folderState = await folderStateFor(state.documentUri);
        const pinKey = filePinKeyFromName(path.basename(targetUri.fsPath));
        const pinnedFiles = folderState.pinnedFiles.filter(name => name !== pinKey);
        if (message.pinned) pinnedFiles.unshift(pinKey);
        await writeFolderState(state.documentUri, { pinnedFiles });
        panel.webview.postMessage({
          type: 'markdownFilesChanged',
          uri: state.documentUri.toString(),
          markdownFiles: await markdownFilesFor(state.documentUri)
        });
      }
      if (message.type === 'updateReadingProgress') {
        if (message.uri !== state.documentUri.toString()) return;
        const progress = sanitizeReadingProgress(message.progress);
        if (progress) {
          state.readingProgress = progress;
          await writeDocumentCache(state.documentUri, state);
          await clearLegacyState(context, state.documentUri);
        }
      }
      if (message.type === 'updateAnnotations') {
        if (message.uri !== state.documentUri.toString()) return;
        state.annotations = sanitizeAnnotations(message.annotations);
        state.markdown = markdownForStorage(state.markdown, state.annotations);
        await writeMarkdown(state.documentUri, state.markdown);
        panel.webview.postMessage({
          type: 'documentChanged',
          uri: state.documentUri.toString(),
          fileName: path.basename(state.documentUri.fsPath),
          markdown: state.markdown,
          readingProgress: state.readingProgress,
          annotations: state.annotations
        });
        await writeDocumentCache(state.documentUri, { readingProgress: state.readingProgress, annotations: [] });
        await clearLegacyState(context, state.documentUri);
      }
    } catch (error) {
      panel.webview.postMessage({ type: 'error', message: error.message || String(error) });
      showError(error);
    }
  });
}

function readingProgressKey(uri) {
  return `readMdAsHtml.readingProgress:${uri.toString()}`;
}

function annotationsKey(uri) {
  return `readMdAsHtml.annotations:${uri.toString()}`;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeReadingProgress(progress) {
  if (!progress || typeof progress !== 'object') return null;
  return {
    top: Math.max(0, Math.round(finiteNumber(progress.top))),
    ratio: Math.min(1, Math.max(0, finiteNumber(progress.ratio))),
    sourceStart: Math.round(finiteNumber(progress.sourceStart, -1)),
    blockIndex: Math.round(finiteNumber(progress.blockIndex, -1)),
    blockOffset: Math.round(finiteNumber(progress.blockOffset)),
    timestamp: Math.max(0, Math.round(finiteNumber(progress.timestamp, Date.now())))
  };
}

function trimText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeAnnotation(annotation) {
  if (!annotation || typeof annotation !== 'object') return null;
  const type = ['bookmark', 'highlight', 'note'].includes(annotation.type) ? annotation.type : '';
  if (!type) return null;
  const startOffset = Math.max(0, Math.round(finiteNumber(annotation.startOffset)));
  const endOffset = Math.max(startOffset, Math.round(finiteNumber(annotation.endOffset, startOffset)));
  const blockIndex = Math.round(finiteNumber(annotation.blockIndex, -1));
  const sourceStart = Math.round(finiteNumber(annotation.sourceStart, -1));
  if (blockIndex < 0 && sourceStart < 0) return null;
  return {
    id: trimText(annotation.id, 80) || `${type}-${Date.now()}`,
    type,
    text: trimText(annotation.text, 280),
    note: trimText(annotation.note, 1600),
    context: trimText(annotation.context, 900),
    blockIndex,
    sourceStart,
    startOffset,
    endOffset,
    blockOffset: Math.max(0, Math.round(finiteNumber(annotation.blockOffset))),
    createdAt: Math.max(0, Math.round(finiteNumber(annotation.createdAt, Date.now())))
  };
}

function sanitizeAnnotations(annotations) {
  if (!Array.isArray(annotations)) return [];
  return annotations
    .map(sanitizeAnnotation)
    .filter(Boolean)
    .slice(-500);
}

const annotationBlockPattern = /(?:\r?\n){0,2}<!--\s*read-md-as-html:annotations\s*\r?\n([\s\S]*?)\r?\n-->\s*$/;

function annotationsFromMarkdown(markdown) {
  const text = String(markdown || '');
  const match = annotationBlockPattern.exec(text);
  if (!match) return { markdown: text, annotations: [] };
  try {
    const payload = JSON.parse(match[1]);
    return {
      markdown: text.slice(0, match.index).replace(/\s+$/g, ''),
      annotations: sanitizeAnnotations(Array.isArray(payload) ? payload : payload.annotations)
    };
  } catch (error) {
    return { markdown: text, annotations: [] };
  }
}

function stripAnnotationBlock(markdown) {
  return annotationsFromMarkdown(markdown).markdown;
}

function markdownWithoutAnnotationBlock(markdown) {
  const text = String(markdown || '');
  const match = annotationBlockPattern.exec(text);
  if (!match) return text;
  const base = text.slice(0, match.index).replace(/\s+$/g, '');
  return base ? base + '\n' : '';
}

function markdownForStorage(markdown, annotations) {
  const cleanAnnotations = sanitizeAnnotations(annotations);
  if (cleanAnnotations.length) return markdownWithAnnotations(markdown, cleanAnnotations);
  return markdownWithoutAnnotationBlock(markdown);
}

function markdownWithAnnotations(markdown, annotations) {
  const cleanAnnotations = sanitizeAnnotations(annotations);
  const base = stripAnnotationBlock(markdown).replace(/\s+$/g, '');
  if (!cleanAnnotations.length) return base ? base + '\n' : '';
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    annotations: cleanAnnotations
  };
  return [
    base,
    '',
    '<!-- read-md-as-html:annotations',
    JSON.stringify(payload, null, 2),
    '-->',
    ''
  ].join('\n');
}

function fileNameSafe(value) {
  return String(value || 'document')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+$/, 'document')
    .slice(0, 180) || 'document';
}

function markdownDirectoryUri(markdownUri) {
  return vscode.Uri.file(path.dirname(markdownUri.fsPath));
}

function cacheDirectoryUri(markdownUri) {
  return vscode.Uri.joinPath(markdownDirectoryUri(markdownUri), '.md');
}

function stateCacheUri(markdownUri) {
  return vscode.Uri.joinPath(cacheDirectoryUri(markdownUri), `${fileNameSafe(path.basename(markdownUri.fsPath))}.read-md-as-html.json`);
}

function folderStateCacheUri(markdownUri) {
  return vscode.Uri.joinPath(cacheDirectoryUri(markdownUri), 'read-md-as-html.folder.json');
}

function defaultExportHtmlUri(markdownUri) {
  const basename = path.basename(markdownUri.fsPath).replace(/\.(md|markdown)$/i, '');
  return vscode.Uri.joinPath(cacheDirectoryUri(markdownUri), `${fileNameSafe(basename)}.html`);
}

function defaultDocumentCache() {
  return {
    version: 1,
    readingProgress: null,
    annotations: []
  };
}

function sanitizeDocumentCache(cache) {
  return {
    version: 1,
    readingProgress: sanitizeReadingProgress(cache && cache.readingProgress),
    annotations: sanitizeAnnotations(cache && cache.annotations)
  };
}

function filePinKeyFromName(name) {
  return String(name || '').trim().toLowerCase();
}

function defaultFolderState() {
  return {
    version: 1,
    pinnedFiles: []
  };
}

function sanitizeFolderState(state) {
  const pinnedFiles = Array.isArray(state && state.pinnedFiles) ? state.pinnedFiles : [];
  return {
    version: 1,
    pinnedFiles: Array.from(new Set(pinnedFiles.map(filePinKeyFromName).filter(Boolean))).slice(0, 500)
  };
}

async function folderStateFor(markdownUri) {
  try {
    return sanitizeFolderState(JSON.parse(await readText(folderStateCacheUri(markdownUri))));
  } catch (error) {
    return defaultFolderState();
  }
}

async function writeFolderState(markdownUri, state) {
  const folderState = sanitizeFolderState(state);
  const payload = {
    version: folderState.version,
    updatedAt: new Date().toISOString(),
    pinnedFiles: folderState.pinnedFiles
  };
  await ensureCacheDirectory(markdownUri);
  await vscode.workspace.fs.writeFile(folderStateCacheUri(markdownUri), textEncoder.encode(JSON.stringify(payload, null, 2) + '\n'));
}

async function documentCacheFor(context, uri) {
  const cacheUri = stateCacheUri(uri);
  try {
    const cache = sanitizeDocumentCache(JSON.parse(await readText(cacheUri)));
    const legacy = legacyDocumentCache(context, uri);
    if (!cache.annotations.length && legacy.annotations.length) {
      cache.annotations = legacy.annotations;
    }
    await clearLegacyState(context, uri);
    return cache;
  } catch (error) {
    // Missing or invalid sidecar state should not block opening the Markdown file.
  }

  const legacyCache = legacyDocumentCache(context, uri);
  if (legacyCache.readingProgress || legacyCache.annotations.length) {
    await writeDocumentCache(uri, legacyCache);
    await clearLegacyState(context, uri);
    return legacyCache;
  }
  await clearLegacyState(context, uri);
  return defaultDocumentCache();
}

function legacyDocumentCache(context, uri) {
  return sanitizeDocumentCache({
    readingProgress: context.workspaceState.get(readingProgressKey(uri), null),
    annotations: context.workspaceState.get(annotationsKey(uri), [])
  });
}

async function writeDocumentCache(markdownUri, state) {
  const cache = sanitizeDocumentCache({
    readingProgress: state.readingProgress,
    annotations: []
  });
  const payload = {
    version: cache.version,
    markdownFile: path.basename(markdownUri.fsPath),
    updatedAt: new Date().toISOString(),
    readingProgress: cache.readingProgress
  };
  await ensureCacheDirectory(markdownUri);
  await vscode.workspace.fs.writeFile(stateCacheUri(markdownUri), textEncoder.encode(JSON.stringify(payload, null, 2) + '\n'));
}

async function clearLegacyState(context, uri) {
  await context.workspaceState.update(readingProgressKey(uri), undefined);
  await context.workspaceState.update(annotationsKey(uri), undefined);
}

async function writeMarkdown(uri, markdown) {
  const openDoc = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  if (openDoc) {
    const current = openDoc.getText();
    if (current === markdown) return;
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(openDoc.positionAt(0), openDoc.positionAt(current.length));
    edit.replace(uri, fullRange, markdown);
    await vscode.workspace.applyEdit(edit);
    return;
  }
  try {
    const current = await readText(uri);
    if (current === markdown) return;
  } catch (error) {
    // If the file cannot be read here, let the write surface the real error.
  }
  await vscode.workspace.fs.writeFile(uri, textEncoder.encode(markdown));
}

async function saveOpenDocument(uri) {
  const openDoc = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  if (openDoc) {
    await openDoc.save();
  }
}

async function savePastedImage(webview, markdownUri, message) {
  const imageDirectoryName = vscode.workspace.getConfiguration('readMdAsHtml').get('imageDirectoryName', 'images') || 'images';
  const extension = extensionFromMime(message.mime);
  const fileName = message.fileName || imageFileName(extension);
  const markdownDir = vscode.Uri.file(path.dirname(markdownUri.fsPath));
  const imageDir = vscode.Uri.joinPath(markdownDir, imageDirectoryName);
  await ensureDirectory(imageDir);

  const imageUri = vscode.Uri.joinPath(imageDir, fileName);
  const bytes = Buffer.from(String(message.base64 || ''), 'base64');
  await vscode.workspace.fs.writeFile(imageUri, bytes);
  return {
    fileName,
    markdownPath: `${imageDirectoryName}/${fileName}`,
    webviewUri: String(webview.asWebviewUri(imageUri))
  };
}

async function saveExportHtml(markdownUri, html) {
  await ensureCacheDirectory(markdownUri);
  const target = await vscode.window.showSaveDialog({
    defaultUri: defaultExportHtmlUri(markdownUri),
    filters: {
      HTML: ['html']
    },
    title: 'Export read-md-as-html HTML'
  });
  if (!target) return;
  await ensureDirectory(vscode.Uri.file(path.dirname(target.fsPath)));
  await vscode.workspace.fs.writeFile(target, textEncoder.encode(html));
  vscode.window.showInformationMessage(`read-md-as-html exported ${path.basename(target.fsPath)}`);
}

async function exportCurrentMarkdown(context, uri) {
  const documentUri = await resolveMarkdownUri(uri);
  if (!documentUri) return;
  const markdown = await readText(documentUri);
  const title = escapeHtml(path.basename(documentUri.fsPath));
  const body = escapeHtml(markdown);
  const html = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${title}</title>`,
    '<style>body{margin:0;background:#f5f6f3;color:#1f241f;font-family:Segoe UI,Noto Sans SC,Arial,sans-serif}main{max-width:960px;margin:0 auto;padding:48px 32px;background:#fffefb;min-height:100vh}pre{white-space:pre-wrap;line-height:1.65}</style>',
    '</head><body><main>',
    `<h1>${title}</h1><pre>${body}</pre>`,
    '</main></body></html>'
  ].join('\n');
  await saveExportHtml(documentUri, html);
}

function resolveRelativeUri(markdownUri, relativePath) {
  const clean = decodeURIComponent(relativePath).replace(/\\/g, '/').split(/[?#]/)[0];
  const base = path.dirname(markdownUri.fsPath);
  return vscode.Uri.file(path.resolve(base, clean));
}

async function readText(uri) {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return textDecoder.decode(bytes);
}

async function fileExists(uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    return false;
  }
}

async function ensureDirectory(uri) {
  try {
    await vscode.workspace.fs.createDirectory(uri);
  } catch (error) {
    if (!/exist/i.test(String(error && error.message))) throw error;
  }
}

async function ensureCacheDirectory(markdownUri) {
  await ensureDirectory(cacheDirectoryUri(markdownUri));
  await ensureParentGitignoreIgnoresCache(markdownUri);
}

async function ensureParentGitignoreIgnoresCache(markdownUri) {
  const gitignoreUri = vscode.Uri.joinPath(markdownDirectoryUri(markdownUri), '.gitignore');
  let current = '';
  try {
    current = await readText(gitignoreUri);
  } catch (error) {
    // Creating the ignore file is best-effort and should not block the reader.
  }
  if (/^(?:\.\/)?\.md\/?\s*$/m.test(current)) return;
  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  const next = current + prefix + '.md/\n';
  await vscode.workspace.fs.writeFile(gitignoreUri, textEncoder.encode(next));
}

function extensionFromMime(mime) {
  const text = String(mime || '').toLowerCase();
  if (text.includes('jpeg') || text.includes('jpg')) return 'jpg';
  if (text.includes('webp')) return 'webp';
  if (text.includes('gif')) return 'gif';
  if (text.includes('svg')) return 'svg';
  return 'png';
}

function imageFileName(extension) {
  const now = new Date();
  const pad = (value, width) => String(value).padStart(width, '0');
  return [
    'pasted-',
    now.getFullYear(),
    pad(now.getMonth() + 1, 2),
    pad(now.getDate(), 2),
    '-',
    pad(now.getHours(), 2),
    pad(now.getMinutes(), 2),
    pad(now.getSeconds(), 2),
    '-',
    pad(now.getMilliseconds(), 3),
    '.',
    extension
  ].join('');
}

function nonceValue() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(error) {
  vscode.window.showErrorMessage(error && error.message ? error.message : String(error));
}

module.exports = {
  activate,
  deactivate
};
