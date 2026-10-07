import { renderAllRichContent, renderPreview } from './rendering.js';
import { post, setStatus } from './ui.js';
import { els, state } from './state.js';

let exporting = false;

async function exportHtml() {
  if (exporting) return;
  exporting = true;
  els.exportHtml.disabled = true;
  const uri = state.uri;
  try {
    clearTimeout(state.renderTimer);
    // Include edits even when export is clicked before the debounced preview.
    await renderPreview();
    await renderAllRichContent();
    if (state.uri !== uri) throw new Error('Document changed during export. Please export again.');
    const clone = els.preview.cloneNode(true);
    clone.querySelectorAll('script, .table-filter-menu, .table-shell-resizer, .table-col-resizer, .table-filter-button').forEach(node => node.remove());
    clone.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
    clone.querySelectorAll('.search-hit').forEach(node => node.replaceWith(...node.childNodes));
    clone.querySelectorAll('table').forEach(table => {
      table.querySelectorAll('.table-header-content').forEach(node => {
        const label = node.querySelector('.table-header-label');
        node.replaceWith(...(label || node).childNodes);
      });
      table.querySelectorAll('tr').forEach(row => {
        row.style.removeProperty('display');
        row.removeAttribute('hidden');
        row.classList.remove('table-row-hidden');
      });
      table.querySelectorAll('.table-enhanced-header').forEach(cell => cell.classList.remove('table-enhanced-header'));
      table.classList.remove('enhanced-table');
      table.removeAttribute('data-table-enhanced');
    });
    clone.querySelectorAll('.table-shell').forEach(shell => {
      const table = shell.querySelector('table');
      if (table) shell.replaceWith(table);
    });
    const mathCss = Array.from(document.querySelectorAll('style[id^="MJX-"]')).map(style =>
      Array.from(style.sheet?.cssRules || []).map(rule => rule.cssText).join('\n')).join('\n');
    post({ type: 'exportHtml', uri, content: clone.innerHTML, mathCss,
      title: state.fileName, theme: state.theme, language: state.language,
      fontSize: state.readerFontSize, annotations: state.annotations });
  } catch (error) {
    setStatus(error.message || 'Export failed');
  } finally {
    exporting = false;
    els.exportHtml.disabled = false;
  }
}

export { exportHtml };
