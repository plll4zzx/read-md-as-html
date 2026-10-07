const content = document.getElementById('reader-content');
const search = document.getElementById('reader-search');
const count = document.getElementById('reader-search-count');
let hits = [], hitIndex = -1;

function selectHit(delta = 0) {
  if (!hits.length) { count.textContent = '0/0'; return; }
  hitIndex = (hitIndex + delta + hits.length) % hits.length;
  hits.forEach((hit, index) => hit.classList.toggle('active', index === hitIndex));
  hits[hitIndex].scrollIntoView({ block: 'center' });
  count.textContent = `${hitIndex + 1}/${hits.length}`;
}
function searchDocument() {
  content.querySelectorAll('mark.reader-search-hit').forEach(mark => mark.replaceWith(...mark.childNodes));
  content.normalize();
  hits = []; hitIndex = 0;
  const query = search.value.trim().toLocaleLowerCase();
  if (!query) { count.textContent = ''; return; }
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement.closest('script,style,mjx-container,svg,math,input,select,button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const value = node.nodeValue, lower = value.toLocaleLowerCase();
    let at = lower.indexOf(query), start = 0;
    if (at < 0) continue;
    const fragment = document.createDocumentFragment();
    while (at >= 0) {
      fragment.append(value.slice(start, at));
      const mark = document.createElement('mark'); mark.className = 'reader-search-hit';
      mark.textContent = value.slice(at, at + query.length); fragment.append(mark); hits.push(mark);
      start = at + query.length; at = lower.indexOf(query, start);
    }
    fragment.append(value.slice(start)); node.replaceWith(fragment);
  }
  selectHit();
}
search.addEventListener('input', searchDocument);
search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); selectHit(event.shiftKey ? -1 : 1); } });
document.getElementById('reader-next').addEventListener('click', () => selectHit(1));
document.getElementById('reader-prev').addEventListener('click', () => selectHit(-1));
document.getElementById('reader-toc-toggle').addEventListener('click', () => document.body.classList.toggle('reader-hide-toc'));
document.getElementById('reader-print').addEventListener('click', () => window.print());
const themeSelect = document.getElementById('reader-theme');
themeSelect.value = ['reader-light','soft-green','dark'].find(theme => document.body.classList.contains(`theme-${theme}`)) || 'reader-light';
themeSelect.addEventListener('change', () => { document.body.classList.remove('theme-reader-light','theme-soft-green','theme-dark'); document.body.classList.add(`theme-${themeSelect.value}`); });
for (const [id, delta] of [['reader-smaller', -1], ['reader-larger', 1]]) {
  document.getElementById(id).addEventListener('click', () => {
    const size = parseFloat(getComputedStyle(content).fontSize) || 15;
    document.body.style.setProperty('--preview-font-size', `${Math.max(13, Math.min(28, size + delta))}px`);
  });
}
for (const table of content.querySelectorAll('table')) {
  const wrap = document.createElement('div'); wrap.className = 'reader-table'; table.replaceWith(wrap); wrap.append(table);
  const headings = Array.from(table.tHead?.rows[0]?.cells || []);
  const rows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows));
  const filters = headings.map((cell, index) => {
    const label = cell.textContent.trim();
    const input = document.createElement('input'); input.type = 'search'; input.className = 'reader-table-filter';
    input.placeholder = document.body.dataset.filterLabel; input.setAttribute('aria-label', `${input.placeholder}: ${label}`);
    input.addEventListener('input', () => {
      for (const row of rows) row.hidden = filters.some((filter, column) => !String(row.cells[column]?.textContent || '').toLocaleLowerCase().includes(filter.value.toLocaleLowerCase()));
    });
    cell.append(input); return input;
  });
}
const dialog = document.getElementById('reader-lightbox');
const stage = document.getElementById('reader-image-stage');
let zoom = 1, baseWidth = 0, baseHeight = 0, drag = null;
function applyZoom() { const item = stage.firstElementChild; if (item) { item.style.width = `${baseWidth * zoom}px`; item.style.height = `${baseHeight * zoom}px`; } }
content.addEventListener('click', event => {
  const visual = event.target.closest('img, .mermaid svg');
  if (!visual) return;
  event.preventDefault();
  const bounds = visual.getBoundingClientRect();
  baseWidth = Math.max(1, bounds.width); baseHeight = Math.max(1, bounds.height); zoom = 1;
  stage.replaceChildren(visual.cloneNode(true)); dialog.showModal(); applyZoom();
});
for (const [id, scale] of [['reader-zoom-in', 1.25], ['reader-zoom-out', 0.8]]) document.getElementById(id).addEventListener('click', () => { zoom = Math.max(0.25, Math.min(8, zoom * scale)); applyZoom(); });
document.getElementById('reader-close').addEventListener('click', () => dialog.close());
stage.addEventListener('wheel', event => { event.preventDefault(); zoom = Math.max(0.25, Math.min(8, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12))); applyZoom(); }, { passive: false });
stage.addEventListener('pointerdown', event => { event.preventDefault(); drag = { x:event.clientX, y:event.clientY, left:stage.scrollLeft, top:stage.scrollTop }; stage.setPointerCapture(event.pointerId); });
stage.addEventListener('pointermove', event => { if (drag) { stage.scrollLeft = drag.left - event.clientX + drag.x; stage.scrollTop = drag.top - event.clientY + drag.y; } });
stage.addEventListener('pointerup', () => { drag = null; });
stage.addEventListener('pointercancel', () => { drag = null; });
const hover = document.getElementById('reader-hover');
content.addEventListener('mouseover', event => {
  const anchor = event.target.closest('a[href^="#"]');
  if (!anchor) { hover.hidden = true; return; }
  let id; try { id = decodeURIComponent(anchor.getAttribute('href').slice(1)); } catch { return; }
  const target = document.getElementById(id); if (!target) return;
  hover.textContent = target.textContent.slice(0, 900);
  hover.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - 440))}px`;
  hover.style.top = `${Math.max(8, Math.min(event.clientY + 20, window.innerHeight - 320))}px`;
  hover.hidden = false;
});
content.addEventListener('mouseleave', () => { hover.hidden = true; });
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); search.focus(); search.select(); }
  if (event.key === 'Escape') { hover.hidden = true; if (document.activeElement === search) { search.value = ''; searchDocument(); search.blur(); } }
});
