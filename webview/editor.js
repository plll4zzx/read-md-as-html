import { els, state } from './state.js';
import { post, setStatus, sourceIsHidden, t } from './ui.js';
import { renderPreview } from './rendering.js';

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
  if (!options.skipEditorUpdate && !sourceIsHidden()) els.editor.value = markdown;
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

export { simpleMarkdownFromPreviewBlock, patchMarkdownBlockFromPreview, schedulePreviewPatch, setMarkdown, scheduleRender, scheduleSave, saveMarkdown, updateSourceStatus, markdownImageLine, insertTextInEditor, insertMarkdownAfterActiveBlock, clipboardImage, fileToBase64, handleImagePaste };
