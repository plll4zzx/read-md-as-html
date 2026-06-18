const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');

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

  const state = await loadDocumentState(context, documentUri, Object.assign({}, options, { projectRoot: workspaceRoot }));

  panel.webview.html = await webviewHtml(context, panel.webview, state);
  applyPanelIdentity(panel, mediaRoot, documentUri);
  wirePanelMessages(context, panel, state);
  const markdownDirectoryWatcher = watchMarkdownDirectory(panel, state);

  const watcher = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() !== state.documentUri.toString()) return;
    const next = event.document.getText();
    if (next === state.markdown) return;
    const embedded = annotationsFromSource(next, state.documentKind);
    state.markdown = next;
    state.markdownHash = hashText(state.markdown);
    state.annotations = state.documentKind === 'markdown' ? embedded.annotations : state.annotations;
    panel.webview.postMessage({
      type: 'documentChanged',
      uri: state.documentUri.toString(),
      fileName: path.basename(state.documentUri.fsPath),
      documentKind: state.documentKind,
      markdown: state.markdown,
      markdownHash: state.markdownHash,
      changeReason: 'editor',
      annotations: state.annotations,
      tableLayouts: state.tableLayouts
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
      Documents: ['md', 'markdown', 'tex'],
      Markdown: ['md', 'markdown'],
      LaTeX: ['tex']
    },
    title: 'Open Markdown or LaTeX in read-md-as-html'
  });
  return picked && picked[0] ? picked[0] : null;
}

function isMarkdownUri(uri) {
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext === '.md' || ext === '.markdown' || ext === '.tex';
}

function documentKindForUri(uri) {
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext === '.tex' ? 'latex' : 'markdown';
}

function workspaceRootFor(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? folder.uri : null;
}

function projectRootFor(uri) {
  return workspaceRootFor(uri) || markdownDirectoryUri(uri);
}

function relativePathFromProject(rootUri, targetUri) {
  return path.relative(rootUri.fsPath, targetUri.fsPath).replace(/\\/g, '/');
}

function uriIsInsideDirectory(rootUri, targetUri) {
  const relative = path.relative(rootUri.fsPath, targetUri.fsPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function loadDocumentState(context, documentUri, options = {}) {
  const projectRoot = options.projectRoot || projectRootFor(documentUri);
  const markdown = await readText(documentUri);
  const documentKind = documentKindForUri(documentUri);
  const embedded = annotationsFromSource(markdown, documentKind);
  const documentCache = await documentCacheFor(context, documentUri, projectRoot);
  return {
    documentUri,
    projectRoot,
    documentKind,
    markdown,
    markdownHash: hashText(markdown),
    previewOnly: !!options.previewOnly,
    markdownFilesCache: Array.isArray(options.markdownFilesCache) ? options.markdownFilesCache : null,
    markdownFilesCacheRoot: options.markdownFilesCacheRoot || '',
    documentCache,
    readingProgress: documentCache.readingProgress,
    annotations: embedded.annotations.length ? embedded.annotations : documentCache.annotations,
    tableLayouts: documentCache.tableLayouts
  };
}

function activeMarkdownFileList(files, documentUri) {
  const activeUri = documentUri.toString();
  return Array.isArray(files)
    ? files.map(file => Object.assign({}, file, { active: file.uri === activeUri }))
    : [];
}

async function markdownFilesForState(state, options = {}) {
  const root = state.projectRoot || projectRootFor(state.documentUri);
  const rootKey = root.toString();
  if (!options.force && Array.isArray(state.markdownFilesCache) && state.markdownFilesCacheRoot === rootKey) {
    return activeMarkdownFileList(state.markdownFilesCache, state.documentUri);
  }
  const files = await markdownFilesFor(state.documentUri, root);
  state.markdownFilesCache = files.map(file => Object.assign({}, file, { active: false }));
  state.markdownFilesCacheRoot = rootKey;
  return activeMarkdownFileList(state.markdownFilesCache, state.documentUri);
}

async function markdownFilesFor(documentUri, projectRoot = projectRootFor(documentUri)) {
  const root = projectRoot;
  const folderState = await folderStateFor(documentUri, root);
  const pinnedFiles = new Set(folderState.pinnedFiles);
  const pinnedRank = new Map(folderState.pinnedFiles.map((name, index) => [name, index]));
  let uris = [];
  try {
    uris = await collectProjectMarkdownUris(root);
  } catch (error) {
    return [];
  }
  const files = await Promise.all(uris
    .filter(uri => isMarkdownUri(uri) && uriIsInsideDirectory(root, uri))
    .map(async (uri) => {
      const name = path.basename(uri.fsPath);
      const relativePath = relativePathFromProject(root, uri);
      const directory = path.posix.dirname(relativePath);
      const pinKey = filePinKeyFromName(relativePath);
      const legacyPinKey = filePinKeyFromName(name);
      let mtime = 0;
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        mtime = Number(stat.mtime) || 0;
      } catch (error) {
        // Ignore files that disappear while the directory is being read.
      }
      return {
        name,
        relativePath,
        directory: directory === '.' ? '' : directory,
        depth: relativePath.split('/').length - 1,
        uri: uri.toString(),
        documentKind: documentKindForUri(uri),
        mtime,
        fsPath: uri.fsPath,
        pinned: pinnedFiles.has(pinKey) || pinnedFiles.has(legacyPinKey),
        pinRank: pinnedRank.has(pinKey) ? pinnedRank.get(pinKey) : (pinnedRank.has(legacyPinKey) ? pinnedRank.get(legacyPinKey) : -1),
        active: uri.toString() === documentUri.toString()
      };
    }));
  return files.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned && a.pinRank !== b.pinRank) return a.pinRank - b.pinRank;
    if (b.mtime !== a.mtime) return b.mtime - a.mtime;
    return String(a.relativePath || a.name).localeCompare(String(b.relativePath || b.name), undefined, { sensitivity: 'base', numeric: true });
  });
}

const ignoredProjectDirectoryNames = new Set([
  '.git',
  '.hg',
  '.svn',
  '.md',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '.venv',
  'venv'
]);

function shouldIgnoreProjectDirectory(name) {
  const normalized = String(name || '').normalize('NFC').toLowerCase();
  return ignoredProjectDirectoryNames.has(normalized);
}

async function collectProjectMarkdownUris(rootUri, limit = 3000) {
  const files = [];
  const pending = [rootUri];
  while (pending.length && files.length < limit) {
    const directory = pending.shift();
    let entries = [];
    try {
      entries = await vscode.workspace.fs.readDirectory(directory);
    } catch (error) {
      continue;
    }
    for (const [name, type] of entries) {
      if (files.length >= limit) break;
      const uri = vscode.Uri.joinPath(directory, name);
      if ((type & vscode.FileType.Directory) === vscode.FileType.Directory) {
        if (!shouldIgnoreProjectDirectory(name)) pending.push(uri);
        continue;
      }
      if ((type & vscode.FileType.File) !== vscode.FileType.File) continue;
      if (isMarkdownUri(uri)) files.push(uri);
    }
  }
  return files;
}

function watchMarkdownDirectory(panel, state) {
  const root = state.projectRoot || projectRootFor(state.documentUri);
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root.fsPath, '**/*.{md,markdown,tex}'));
  let refreshTimer;
  let activeReloadTimer;

  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      panel.webview.postMessage({
        type: 'markdownFilesChanged',
        uri: state.documentUri.toString(),
        markdownFiles: await markdownFilesForState(state, { force: true })
      });
    }, 120);
  };

  const scheduleActiveReload = (uri) => {
    if (!uri || uri.toString() !== state.documentUri.toString()) return;
    clearTimeout(activeReloadTimer);
    activeReloadTimer = setTimeout(() => {
      reloadMarkdownFromDisk(panel, state, { reason: 'external' }).catch(showError);
    }, 180);
  };

  watcher.onDidCreate(scheduleRefresh);
  watcher.onDidDelete(scheduleRefresh);
  watcher.onDidChange((uri) => {
    scheduleRefresh();
    scheduleActiveReload(uri);
  });

  return {
    dispose() {
      clearTimeout(refreshTimer);
      clearTimeout(activeReloadTimer);
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

function relativePathForClipboard(currentUri, targetUri, projectRoot) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetUri);
  const base = projectRoot ? projectRoot.fsPath : (workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(currentUri.fsPath));
  const relative = path.relative(base, targetUri.fsPath) || path.basename(targetUri.fsPath);
  return relative.replace(/\\/g, '/');
}

function comparableFsPath(value) {
  const normalized = String(value || '').normalize('NFC');
  return process.platform === 'win32' || process.platform === 'darwin' ? normalized.toLowerCase() : normalized;
}

function sameDirectory(leftUri, rightUri) {
  return comparableFsPath(path.dirname(leftUri.fsPath)) === comparableFsPath(path.dirname(rightUri.fsPath));
}

function resolveFileListTargetUri(currentUri, message, projectRoot) {
  const root = projectRoot || projectRootFor(currentUri);
  const rawPath = String(message.targetFsPath || '').trim();
  if (rawPath) return vscode.Uri.file(rawPath);

  const rawRelativePath = String(message.targetRelativePath || '').trim();
  if (rawRelativePath && !path.isAbsolute(rawRelativePath) && !rawRelativePath.split(/[\\/]+/).includes('..')) {
    return vscode.Uri.joinPath(root, ...rawRelativePath.split(/[\\/]+/).filter(Boolean));
  }

  const rawUri = String(message.targetUri || '').trim();
  if (rawUri) {
    try {
      const parsed = vscode.Uri.parse(rawUri);
      if (parsed && parsed.fsPath) return parsed;
    } catch (error) {
      // Fall through to the same-folder name fallback.
    }
  }

  const targetName = String(message.targetName || '').trim();
  if (!targetName || targetName.includes('/') || targetName.includes('\\')) return null;
  return vscode.Uri.joinPath(markdownDirectoryUri(currentUri), targetName);
}

async function resolveLinkedMarkdownUri(currentUri, href) {
  const raw = String(href || '').trim();
  if (!raw || raw.startsWith('#')) return null;
  if (/^(?:https?|mailto|data|blob|javascript|command|vscode):/i.test(raw)) return null;
  const withoutFragment = raw.split('#')[0].split('?')[0];
  if (!withoutFragment) return null;
  let targetUri;
  try {
    if (/^file:/i.test(withoutFragment)) {
      targetUri = vscode.Uri.parse(withoutFragment);
    } else {
      targetUri = resolveRelativeUri(currentUri, withoutFragment);
    }
  } catch (error) {
    return null;
  }
  if (!isMarkdownUri(targetUri)) return null;
  if (!(await fileExists(targetUri))) return null;
  return targetUri;
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
    documentKind: state.documentKind,
    markdown: state.markdown,
    markdownHash: state.markdownHash,
    markdownFiles: await markdownFilesForState(state),
    previewOnly: state.previewOnly,
    autoSave: vscode.workspace.getConfiguration('readMdAsHtml').get('autoSave', true),
    previewEditEnabled: vscode.workspace.getConfiguration('readMdAsHtml').get('previewEditEnabledByDefault', false),
    theme: vscode.workspace.getConfiguration('readMdAsHtml').get('theme', 'reader-light'),
    language: vscode.workspace.getConfiguration('readMdAsHtml').get('language', 'en'),
    readingProgress: state.readingProgress,
    annotations: state.annotations,
    tableLayouts: state.tableLayouts
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
          documentKind: state.documentKind,
          markdown: state.markdown,
          markdownHash: state.markdownHash,
          markdownFiles: await markdownFilesForState(state),
          readingProgress: state.readingProgress,
          annotations: state.annotations,
          tableLayouts: state.tableLayouts
        });
      }
      if (message.type === 'updateMarkdown') {
        if (message.uri !== state.documentUri.toString()) return;
        const nextMarkdown = String(message.markdown || '');
        if (nextMarkdown === state.markdown && !message.saveToDisk) return;
        const embedded = annotationsFromSource(nextMarkdown, state.documentKind);
        const nextAnnotations = state.documentKind === 'markdown' ? embedded.annotations : state.annotations;
        const nextStoredMarkdown = sourceForStorage(nextMarkdown, nextAnnotations, state.documentKind);
        if (!(await canWriteMarkdown(panel, state, message, nextStoredMarkdown))) return;
        state.annotations = nextAnnotations;
        state.markdown = nextStoredMarkdown;
        await writeMarkdown(state.documentUri, state.markdown, { save: true });
        state.markdownHash = hashText(state.markdown);
        panel.webview.postMessage({
          type: 'markdownCommitted',
          uri: state.documentUri.toString(),
          documentKind: state.documentKind,
          markdownHash: state.markdownHash,
          markdown: state.markdown,
          saveId: message.saveId
        });
      }
      if (message.type === 'switchDocument') {
        if (message.uri !== state.documentUri.toString()) return;
        const targetUri = vscode.Uri.parse(String(message.targetUri || ''));
        if (!isMarkdownUri(targetUri) || !uriIsInsideDirectory(state.projectRoot || projectRootFor(state.documentUri), targetUri)) return;
        const progress = sanitizeReadingProgress(message.readingProgress);
        const tableLayouts = sanitizeTableLayouts(message.tableLayouts);
        state.tableLayouts = tableLayouts;
        if (progress || Object.keys(tableLayouts).length) {
          state.readingProgress = progress;
          await writeDocumentCache(state.documentUri, state, state.projectRoot);
        }
        if (typeof message.markdown === 'string') {
          const currentMarkdown = String(message.markdown);
          if (currentMarkdown !== state.markdown) {
            const embedded = annotationsFromSource(currentMarkdown, state.documentKind);
            const nextAnnotations = state.documentKind === 'markdown'
              ? (embedded.annotations.length ? embedded.annotations : state.annotations)
              : state.annotations;
            const nextStoredMarkdown = sourceForStorage(currentMarkdown, nextAnnotations, state.documentKind);
            if (!(await canWriteMarkdown(panel, state, message, nextStoredMarkdown))) return;
            state.annotations = nextAnnotations;
            state.markdown = nextStoredMarkdown;
            await writeMarkdown(state.documentUri, state.markdown, { save: true });
            state.markdownHash = hashText(state.markdown);
          }
        }
        const nextState = await loadDocumentState(context, targetUri, {
          previewOnly: state.previewOnly,
          projectRoot: state.projectRoot,
          markdownFilesCache: state.markdownFilesCache,
          markdownFilesCacheRoot: state.markdownFilesCacheRoot
        });
        state.documentUri = nextState.documentUri;
        state.projectRoot = nextState.projectRoot;
        state.documentKind = nextState.documentKind;
        state.markdown = nextState.markdown;
        state.markdownHash = nextState.markdownHash;
        state.documentCache = nextState.documentCache;
        state.readingProgress = nextState.readingProgress;
        state.annotations = nextState.annotations;
        state.tableLayouts = nextState.tableLayouts;
        const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
        applyPanelIdentity(panel, mediaRoot, state.documentUri);
        panel.webview.postMessage({
          type: 'documentLoaded',
          uri: state.documentUri.toString(),
          fileName: path.basename(state.documentUri.fsPath),
          documentKind: state.documentKind,
          markdown: state.markdown,
          markdownHash: state.markdownHash,
          markdownFiles: await markdownFilesForState(state),
          readingProgress: state.readingProgress,
          annotations: state.annotations,
          tableLayouts: state.tableLayouts
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
      if (message.type === 'copyFilePath') {
        if (message.uri !== state.documentUri.toString()) return;
        const targetUri = resolveFileListTargetUri(state.documentUri, message, state.projectRoot);
        if (!targetUri || !isMarkdownUri(targetUri) || !uriIsInsideDirectory(state.projectRoot || projectRootFor(state.documentUri), targetUri)) return;
        const pathKind = String(message.pathKind || 'absolute');
        const clipboardText = pathKind === 'relative'
          ? relativePathForClipboard(state.documentUri, targetUri, state.projectRoot)
          : targetUri.fsPath;
        await vscode.env.clipboard.writeText(clipboardText);
        panel.webview.postMessage({
          type: 'filePathCopied',
          uri: state.documentUri.toString(),
          pathKind
        });
      }
      if (message.type === 'openLinkedMarkdown') {
        if (message.uri !== state.documentUri.toString()) return;
        const targetUri = await resolveLinkedMarkdownUri(state.documentUri, String(message.href || ''));
        if (!targetUri) return;
        if (path.dirname(targetUri.fsPath) === path.dirname(state.documentUri.fsPath)) {
          panel.webview.postMessage({
            type: 'linkedMarkdownResolved',
            uri: state.documentUri.toString(),
            targetUri: targetUri.toString()
          });
        } else {
          await openStudio(context, targetUri, { previewOnly: state.previewOnly });
        }
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
        await saveExportHtml(state.documentUri, String(message.html || ''), state.projectRoot);
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
        if (!isMarkdownUri(targetUri) || !uriIsInsideDirectory(state.projectRoot || projectRootFor(state.documentUri), targetUri)) return;
        const folderState = await folderStateFor(state.documentUri, state.projectRoot);
        const pinKey = filePinKeyFromName(relativePathFromProject(state.projectRoot || projectRootFor(state.documentUri), targetUri));
        const pinnedFiles = folderState.pinnedFiles.filter(name => name !== pinKey);
        if (message.pinned) pinnedFiles.unshift(pinKey);
        await writeFolderState(state.documentUri, { pinnedFiles }, state.projectRoot);
        panel.webview.postMessage({
          type: 'markdownFilesChanged',
          uri: state.documentUri.toString(),
          markdownFiles: await markdownFilesForState(state, { force: true })
        });
      }
      if (message.type === 'updateReadingProgress') {
        if (message.uri !== state.documentUri.toString()) return;
        const progress = sanitizeReadingProgress(message.progress);
        if (progress) {
          state.readingProgress = progress;
          await writeDocumentCache(state.documentUri, state, state.projectRoot);
          await clearLegacyState(context, state.documentUri);
        }
      }
      if (message.type === 'updateAnnotations') {
        if (message.uri !== state.documentUri.toString()) return;
        const nextAnnotations = sanitizeAnnotations(message.annotations);
        const currentMarkdown = typeof message.markdown === 'string'
          ? String(message.markdown)
          : await currentMarkdownFor(state.documentUri);
        const nextStoredMarkdown = sourceForStorage(currentMarkdown || state.markdown, nextAnnotations, state.documentKind);
        if (!(await canWriteMarkdown(panel, state, message, nextStoredMarkdown))) return;
        state.annotations = nextAnnotations;
        state.markdown = nextStoredMarkdown;
        if (state.documentKind === 'markdown') {
          await writeMarkdown(state.documentUri, state.markdown, { save: true });
        }
        state.markdownHash = hashText(state.markdown);
        panel.webview.postMessage({
          type: 'documentChanged',
          uri: state.documentUri.toString(),
          fileName: path.basename(state.documentUri.fsPath),
          documentKind: state.documentKind,
          markdown: state.markdown,
          markdownHash: state.markdownHash,
          changeReason: 'annotation',
          readingProgress: state.readingProgress,
          annotations: state.annotations,
          tableLayouts: state.tableLayouts
        });
        await writeDocumentCache(state.documentUri, {
          readingProgress: state.readingProgress,
          annotations: state.annotations,
          tableLayouts: state.tableLayouts
        }, state.projectRoot);
        await clearLegacyState(context, state.documentUri);
      }
      if (message.type === 'updateTableLayouts') {
        if (message.uri !== state.documentUri.toString()) return;
        state.tableLayouts = sanitizeTableLayouts(message.tableLayouts);
        await writeDocumentCache(state.documentUri, state, state.projectRoot);
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

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(finiteNumber(value))));
}

function sanitizeTableLayouts(layouts) {
  if (!layouts || typeof layouts !== 'object' || Array.isArray(layouts)) return {};
  const clean = {};
  for (const [rawKey, rawLayout] of Object.entries(layouts).slice(0, 500)) {
    const key = String(rawKey || '').slice(0, 220);
    if (!key || !rawLayout || typeof rawLayout !== 'object' || Array.isArray(rawLayout)) continue;
    const layout = {};
    if (Number.isFinite(Number(rawLayout.width))) layout.width = clampNumber(rawLayout.width, 160, 4000);
    if (Number.isFinite(Number(rawLayout.height))) layout.height = clampNumber(rawLayout.height, 100, 3000);
    if (Array.isArray(rawLayout.columnWidths)) {
      layout.columnWidths = rawLayout.columnWidths
        .slice(0, 80)
        .map(width => clampNumber(width, 48, 2000));
    }
    if (Number.isFinite(Number(rawLayout.updatedAt))) {
      layout.updatedAt = Math.max(0, Math.round(Number(rawLayout.updatedAt)));
    }
    if (layout.width || layout.height || (layout.columnWidths && layout.columnWidths.length)) {
      clean[key] = layout;
    }
  }
  return clean;
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

function annotationsFromSource(source, documentKind) {
  if (documentKind === 'markdown') return annotationsFromMarkdown(source);
  return { markdown: String(source || ''), annotations: [] };
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

function sourceForStorage(source, annotations, documentKind) {
  if (documentKind === 'markdown') return markdownForStorage(source, annotations);
  return String(source || '');
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

function cacheDirectoryUri(markdownUri, projectRoot = projectRootFor(markdownUri)) {
  return vscode.Uri.joinPath(projectRoot, '.md');
}

function projectCacheDirectoryUri(markdownUri, projectRoot = projectRootFor(markdownUri)) {
  return vscode.Uri.joinPath(projectRoot, '.md');
}

function markdownCacheFileStem(markdownUri, projectRoot = projectRootFor(markdownUri)) {
  const relativePath = uriIsInsideDirectory(projectRoot, markdownUri)
    ? relativePathFromProject(projectRoot, markdownUri)
    : path.basename(markdownUri.fsPath);
  return fileNameSafe(relativePath.replace(/\.(md|markdown|tex)$/i, ''));
}

function stateCacheUri(markdownUri, projectRoot = projectRootFor(markdownUri)) {
  return vscode.Uri.joinPath(cacheDirectoryUri(markdownUri, projectRoot), `${markdownCacheFileStem(markdownUri, projectRoot)}.read-md-as-html.json`);
}

function legacyStateCacheUri(markdownUri) {
  return vscode.Uri.joinPath(vscode.Uri.joinPath(markdownDirectoryUri(markdownUri), '.md'), `${fileNameSafe(path.basename(markdownUri.fsPath))}.read-md-as-html.json`);
}

function legacyFolderStateCacheUri(markdownUri) {
  return vscode.Uri.joinPath(vscode.Uri.joinPath(markdownDirectoryUri(markdownUri), '.md'), 'read-md-as-html.folder.json');
}

function folderStateCacheUri(markdownUri, projectRoot = projectRootFor(markdownUri)) {
  return vscode.Uri.joinPath(projectCacheDirectoryUri(markdownUri, projectRoot), 'read-md-as-html.folder.json');
}

function defaultExportHtmlUri(markdownUri, projectRoot = projectRootFor(markdownUri)) {
  return vscode.Uri.joinPath(cacheDirectoryUri(markdownUri, projectRoot), `${markdownCacheFileStem(markdownUri, projectRoot)}.html`);
}

function defaultDocumentCache() {
  return {
    version: 1,
    readingProgress: null,
    annotations: [],
    tableLayouts: {}
  };
}

function sanitizeDocumentCache(cache) {
  return {
    version: 1,
    readingProgress: sanitizeReadingProgress(cache && cache.readingProgress),
    annotations: sanitizeAnnotations(cache && cache.annotations),
    tableLayouts: sanitizeTableLayouts(cache && cache.tableLayouts)
  };
}

function filePinKeyFromName(name) {
  const text = String(name || '');
  const normalized = typeof text.normalize === 'function' ? text.normalize('NFC') : text;
  return normalized.trim().toLowerCase();
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

async function folderStateFor(markdownUri, projectRoot = projectRootFor(markdownUri)) {
  let current = defaultFolderState();
  try {
    current = sanitizeFolderState(JSON.parse(await readText(folderStateCacheUri(markdownUri, projectRoot))));
  } catch (error) {
    // Missing project-level folder state is fine; older versions may have stored it beside the Markdown file.
  }
  if (current.pinnedFiles.length) return current;

  try {
    const legacy = sanitizeFolderState(JSON.parse(await readText(legacyFolderStateCacheUri(markdownUri))));
    if (legacy.pinnedFiles.length) {
      await writeFolderState(markdownUri, legacy, projectRoot);
      return legacy;
    }
  } catch (error) {
    // Legacy per-folder state is optional.
  }
  return current;
}

async function writeFolderState(markdownUri, state, projectRoot = projectRootFor(markdownUri)) {
  const folderState = sanitizeFolderState(state);
  const payload = {
    version: folderState.version,
    updatedAt: new Date().toISOString(),
    pinnedFiles: folderState.pinnedFiles
  };
  await ensureProjectCacheDirectory(markdownUri, projectRoot);
  await vscode.workspace.fs.writeFile(folderStateCacheUri(markdownUri, projectRoot), textEncoder.encode(JSON.stringify(payload, null, 2) + '\n'));
}

function documentCacheHasContent(cache) {
  return !!(cache && (cache.readingProgress || cache.annotations.length || Object.keys(cache.tableLayouts || {}).length));
}

async function documentCacheFor(context, uri, projectRoot = projectRootFor(uri)) {
  const cacheUri = stateCacheUri(uri, projectRoot);
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

  try {
    const legacySidecar = sanitizeDocumentCache(JSON.parse(await readText(legacyStateCacheUri(uri))));
    if (documentCacheHasContent(legacySidecar)) {
      await writeDocumentCache(uri, legacySidecar, projectRoot);
      await clearLegacyState(context, uri);
      return legacySidecar;
    }
  } catch (error) {
    // Older per-folder sidecar state is optional.
  }

  const legacyCache = legacyDocumentCache(context, uri);
  if (documentCacheHasContent(legacyCache)) {
    await writeDocumentCache(uri, legacyCache, projectRoot);
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

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

async function currentMarkdownFor(uri) {
  const openDoc = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  if (openDoc && openDoc.isDirty) return openDoc.getText();
  try {
    return await readText(uri);
  } catch (error) {
    if (openDoc) return openDoc.getText();
    throw error;
  }
}

async function reloadMarkdownFromDisk(panel, state, options = {}) {
  const currentMarkdown = await currentMarkdownFor(state.documentUri);
  const currentHash = hashText(currentMarkdown);
  if (currentHash === state.markdownHash && !options.force) return;
  const embedded = annotationsFromSource(currentMarkdown, state.documentKind);
  state.markdown = currentMarkdown;
  state.markdownHash = currentHash;
  state.annotations = state.documentKind === 'markdown' ? embedded.annotations : state.annotations;
  panel.webview.postMessage({
    type: 'documentChanged',
    uri: state.documentUri.toString(),
    fileName: path.basename(state.documentUri.fsPath),
    documentKind: state.documentKind,
    markdown: state.markdown,
    markdownHash: state.markdownHash,
    changeReason: options.reason || 'external',
    forceReload: !!options.force,
    readingProgress: state.readingProgress,
    annotations: state.annotations,
    tableLayouts: state.tableLayouts
  });
}

async function canWriteMarkdown(panel, state, message, nextMarkdown) {
  const currentMarkdown = await currentMarkdownFor(state.documentUri);
  const currentHash = hashText(currentMarkdown);
  const baseHash = String(message.baseMarkdownHash || state.markdownHash || '');
  if (currentHash === baseHash || currentHash === hashText(nextMarkdown)) return true;
  await reloadMarkdownFromDisk(panel, state, { force: true, reason: 'conflict' });
  panel.webview.postMessage({
    type: 'error',
    message: 'The Markdown file changed outside read-md-as-html. Reloaded the latest disk version instead of overwriting it.'
  });
  return false;
}

async function writeDocumentCache(markdownUri, state, projectRoot = projectRootFor(markdownUri)) {
  const storeAnnotationsInCache = documentKindForUri(markdownUri) !== 'markdown';
  const cache = sanitizeDocumentCache({
    readingProgress: state.readingProgress,
    annotations: storeAnnotationsInCache ? state.annotations : [],
    tableLayouts: state.tableLayouts
  });
  const payload = {
    version: cache.version,
    markdownFile: path.basename(markdownUri.fsPath),
    markdownPath: uriIsInsideDirectory(projectRoot, markdownUri)
      ? relativePathFromProject(projectRoot, markdownUri)
      : path.basename(markdownUri.fsPath),
    updatedAt: new Date().toISOString(),
    readingProgress: cache.readingProgress,
    tableLayouts: cache.tableLayouts
  };
  if (cache.annotations.length) payload.annotations = cache.annotations;
  await ensureCacheDirectory(markdownUri, projectRoot);
  await vscode.workspace.fs.writeFile(stateCacheUri(markdownUri, projectRoot), textEncoder.encode(JSON.stringify(payload, null, 2) + '\n'));
}

async function clearLegacyState(context, uri) {
  await context.workspaceState.update(readingProgressKey(uri), undefined);
  await context.workspaceState.update(annotationsKey(uri), undefined);
}

async function writeMarkdown(uri, markdown, options = {}) {
  const openDoc = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  if (openDoc) {
    const current = openDoc.getText();
    if (current !== markdown) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(openDoc.positionAt(0), openDoc.positionAt(current.length));
      edit.replace(uri, fullRange, markdown);
      await vscode.workspace.applyEdit(edit);
    }
    if (options.save) {
      const saved = await openDoc.save();
      if (!saved) throw new Error('VS Code did not save the Markdown document.');
    }
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

async function saveExportHtml(markdownUri, html, projectRoot = projectRootFor(markdownUri)) {
  await ensureCacheDirectory(markdownUri, projectRoot);
  const target = await vscode.window.showSaveDialog({
    defaultUri: defaultExportHtmlUri(markdownUri, projectRoot),
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
  await saveExportHtml(documentUri, html, projectRootFor(documentUri));
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

async function ensureCacheDirectory(markdownUri, projectRoot = projectRootFor(markdownUri)) {
  await ensureDirectory(cacheDirectoryUri(markdownUri, projectRoot));
  await ensureDirectoryGitignoreIgnoresCache(projectRoot);
}

async function ensureProjectCacheDirectory(markdownUri, projectRoot = projectRootFor(markdownUri)) {
  const root = projectRoot;
  await ensureDirectory(projectCacheDirectoryUri(markdownUri, root));
  await ensureDirectoryGitignoreIgnoresCache(root);
}

async function ensureDirectoryGitignoreIgnoresCache(directoryUri) {
  const gitignoreUri = vscode.Uri.joinPath(directoryUri, '.gitignore');
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
