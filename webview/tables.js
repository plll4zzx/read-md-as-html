import { els, state } from './state.js';
import { nodesInRoots } from './rendering.js';
import { post, t } from './ui.js';
import { scheduleSourceAxisRender } from './outline.js';
import { scheduleBookmarkMarkersUpdate, scheduleNoteMarginRender } from './annotations.js';

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

function estimatedTableTextWidth(value) {
  let width = 0;
  for (const char of String(value || '')) {
    width += char.codePointAt(0) > 255 ? 14 : 7.2;
  }
  return Math.min(560, width + 48);
}

function naturalTableColumnWidths(table, colCount) {
  const rows = Array.from(table.rows || []).slice(0, 80);
  const widths = [];
  for (let index = 0; index < colCount; index += 1) {
    let width = index === 0 ? 150 : 128;
    for (const row of rows) {
      const cell = row.cells[index];
      if (!cell) continue;
      width = Math.max(width, estimatedTableTextWidth(tableCellText(cell)));
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

export { wrapTables, tableBodyRows, tableColumnCount, tableHeaderCells, tableCellText, tableHeaderText, ensureTableColgroup, estimatedTableTextWidth, naturalTableColumnWidths, applyTableColumnWidths, initializeTableColumnWidths, tableLayoutKey, sanitizeClientTableLayout, sanitizeClientTableLayouts, tableLayoutFor, scheduleTableLayoutsSave, saveTableLayoutsNow, updateTableLayout, applyTableBoxLayout, ensureTableShellResizer, beginTableBoxResize, beginTableColumnResize, prepareTableHeaderCell, tableColumnValues, updateTableFilterButtons, applyTableFilters, setTableColumnFilter, hideTableFilterMenus, positionTableFilterMenu, showTableFilterMenu, bindTablePan, enhanceReadingTable };
