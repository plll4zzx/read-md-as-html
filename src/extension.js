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
    options.previewOnly ? 'read-md-as-html Preview' : 'read-md-as-html',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot, workspaceRoot]
    }
  );

  const state = {
    documentUri,
    markdown: await readText(documentUri),
    previewOnly: !!options.previewOnly,
    readingProgress: readingProgressFor(context, documentUri)
  };

  panel.webview.html = await webviewHtml(context, panel.webview, state);
  wirePanelMessages(context, panel, state);

  const watcher = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() !== state.documentUri.toString()) return;
    const next = event.document.getText();
    if (next === state.markdown) return;
    state.markdown = next;
    panel.webview.postMessage({
      type: 'documentChanged',
      uri: state.documentUri.toString(),
      markdown: state.markdown
    });
  });

  panel.onDidDispose(() => watcher.dispose());
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
    previewOnly: state.previewOnly,
    autoSave: vscode.workspace.getConfiguration('readMdAsHtml').get('autoSave', true),
    previewEditEnabled: vscode.workspace.getConfiguration('readMdAsHtml').get('previewEditEnabledByDefault', false),
    theme: vscode.workspace.getConfiguration('readMdAsHtml').get('theme', 'reader-light'),
    language: vscode.workspace.getConfiguration('readMdAsHtml').get('language', 'en'),
    readingProgress: state.readingProgress
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
        panel.webview.postMessage({
          type: 'documentLoaded',
          uri: state.documentUri.toString(),
          fileName: path.basename(state.documentUri.fsPath),
          markdown: state.markdown,
          readingProgress: state.readingProgress
        });
      }
      if (message.type === 'updateMarkdown') {
        if (message.uri !== state.documentUri.toString()) return;
        state.markdown = String(message.markdown || '');
        await writeMarkdown(state.documentUri, state.markdown);
        if (message.saveToDisk) {
          await saveOpenDocument(state.documentUri);
        }
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
      if (message.type === 'updateReadingProgress') {
        if (message.uri !== state.documentUri.toString()) return;
        const progress = sanitizeReadingProgress(message.progress);
        if (progress) {
          state.readingProgress = progress;
          await context.workspaceState.update(readingProgressKey(state.documentUri), progress);
        }
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

function readingProgressFor(context, uri) {
  return context.workspaceState.get(readingProgressKey(uri), null);
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
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(markdownUri.fsPath.replace(/\.(md|markdown)$/i, '.html')),
    filters: {
      HTML: ['html']
    },
    title: 'Export read-md-as-html HTML'
  });
  if (!target) return;
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
