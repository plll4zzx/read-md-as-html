const path = require('node:path');
const crypto = require('node:crypto');
const { parseHTML } = require('linkedom');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const mimeTypes = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml', '.avif':'image/avif', '.bmp':'image/bmp' };

async function embedMathFonts(css, readBytes) {
  const matches = [...String(css || '').matchAll(/url\(["']?([^\s)'"]+)["']?\)/g)];
  const cache = new Map();
  for (const match of matches) {
    if (!cache.has(match[0])) {
      const file = /\/woff-v2\/([\w-]+\.woff)(?:[?#].*)?$/.exec(match[1]);
      if (!file) { cache.set(match[0], 'none'); continue; }
      const bytes = await readBytes(`vendor/mathjax/output/chtml/fonts/woff-v2/${file[1]}`);
      cache.set(match[0], `url("data:font/woff;base64,${Buffer.from(bytes).toString('base64')}")`);
    }
  }
  let result = String(css || '');
  for (const [from, to] of cache) result = result.split(from).join(to);
  // A style element must never be terminated by document-controlled content.
  return result.replace(/<\/style/gi, '<\\/style');
}

async function createReaderHtml(payload, { readAsset, readBytes, readImage }) {
  const { document } = parseHTML('<!doctype html><html><body><main></main></body></html>');
  const main = document.querySelector('main');
  main.innerHTML = String(payload.content || '');
  const warnings = [];
  // The snapshot has already been sanitized in the renderer. Remove active
  // document elements again at the file boundary; only our nonce script runs.
  main.querySelectorAll('script,iframe,object,embed,link,meta,base,form,input,button,textarea,select').forEach(el => el.remove());
  // Mermaid's SVG styles are part of the figure, not Webview chrome.
  main.querySelectorAll('style').forEach(el => { if (!el.closest('svg')) el.remove(); });
  for (const el of main.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || ['srcdoc','contenteditable','srcset','autofocus'].includes(attr.name)) el.removeAttribute(attr.name);
      if (['href','xlink:href'].includes(attr.name) && !/^(?:#|https?:\/\/|mailto:)/i.test(attr.value.trim())) el.removeAttribute(attr.name);
    }
    if (el.hasAttribute('style')) el.setAttribute('style', el.getAttribute('style').replace(/url\(\s*["']?(?!#)[^)]*\)/gi, 'none'));
  }
  const imageCache = new Map();
  for (const img of main.querySelectorAll('img,svg image')) {
    const source = img.getAttribute('data-raw-src') || img.getAttribute('src') || img.getAttribute('href') || img.getAttribute('xlink:href') || '';
    const attr = img.localName === 'image' ? 'href' : 'src';
    img.removeAttribute('xlink:href');
    img.removeAttribute('data-raw-src');
    if (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml|avif|bmp)[;,]/i.test(source)) { img.setAttribute(attr, source); continue; }
    if (/^(?:https?:)?\/\//i.test(source) && !/vscode-(?:resource|cdn)|vscode-webview/i.test(source)) {
      img.setAttribute(attr, source.startsWith('//') ? 'https:' + source : source);
      warnings.push(`Remote image still requires network access: ${source}`);
      continue;
    }
    try {
      const ext = path.extname(decodeURIComponent(source.split(/[?#]/)[0])).toLowerCase();
      const mime = mimeTypes[ext];
      if (!mime || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(source)) throw new Error('unsupported image path');
      if (!imageCache.has(source)) {
        imageCache.set(source, `data:${mime};base64,${Buffer.from(await readImage(source)).toString('base64')}`);
      }
      img.setAttribute(attr, imageCache.get(source));
    } catch {
      img.removeAttribute(attr);
      img.setAttribute('alt', `${img.getAttribute('alt') || 'Image'} (unavailable: ${source})`);
      warnings.push(`Could not embed image: ${source}`);
    }
  }
  const headings = Array.from(main.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const ids = new Set(Array.from(main.querySelectorAll('[id]')).map(el => el.id));
  let counter = 0;
  for (const heading of headings) {
    // Preserve source section anchors and internal references.
    if (!heading.id && heading.parentElement?.id) heading.dataset.readerAnchor = heading.parentElement.id;
    else if (!heading.id) { let id; do { id = `reader-heading-${++counter}`; } while (ids.has(id)); heading.id = id; ids.add(id); }
  }
  const toc = headings.map(h => `<a style="padding-left:${(Number(h.localName.slice(1))-1)*12}px" href="#${encodeURIComponent(h.dataset.readerAnchor || h.id)}">${escapeHtml(h.textContent)}</a>`).join('\n');
  const annotations = (Array.isArray(payload.annotations) ? payload.annotations : []).filter(a => a && a.type === 'note');
  const notes = annotations.map((a, i) => {
    const block = Array.from(main.querySelectorAll('[data-block-index]')).find(el => el.getAttribute('data-block-index') === String(a.blockIndex));
    if (block && !block.id) block.id = `reader-note-target-${i}`;
    return `<li><a href="#${encodeURIComponent(block?.id || '')}">${escapeHtml(a.text || 'Note')}</a><p>${escapeHtml(a.note)}</p></li>`;
  }).join('');
  const zh = payload.language === 'zh-CN';
  const labels = zh ? ['目录','搜索正文','上一个','下一个','打印','批注','表格筛选','关闭','缩小','放大'] : ['Contents','Search document','Previous','Next','Print','Notes','Filter table','Close','Zoom out','Zoom in'];
  const theme = ['reader-light','soft-green','dark'].includes(payload.theme) ? payload.theme : 'reader-light';
  const fontSize = Math.max(13, Math.min(24, Number(payload.fontSize) || 15));
  const [baseCss, readerCss, readerScript, mathCss] = await Promise.all([
    readAsset('styles.css'), readAsset('reader.css'), readAsset('reader.js'), embedMathFonts(payload.mathCss, readBytes)
  ]);
  const nonce = crypto.randomBytes(18).toString('base64');
  const notice = warnings.length ? `<details class="reader-warnings"><summary>${zh ? '部分图片未内嵌' : 'Some images are not embedded'} (${warnings.length})</summary><ul>${warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul></details>` : '';
  const html = `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(payload.title)}</title><style>${baseCss}\n${readerCss}\n${mathCss}</style></head>
<body class="standalone-reader theme-${theme}" style="--preview-font-size:${fontSize}px" data-filter-label="${labels[6]}">
<header class="reader-toolbar"><button id="reader-toc-toggle">${labels[0]}</button><input id="reader-search" type="search" aria-label="${labels[1]}" placeholder="${labels[1]}"><span id="reader-search-count" aria-live="polite"></span><button id="reader-prev">${labels[2]}</button><button id="reader-next">${labels[3]}</button><select id="reader-theme" aria-label="Theme"><option value="reader-light">Light</option><option value="soft-green">Green</option><option value="dark">Dark</option></select><button id="reader-smaller" aria-label="Smaller text">A−</button><button id="reader-larger" aria-label="Larger text">A+</button><button id="reader-print">${labels[4]}</button></header>
<div class="reader-layout"><nav class="reader-toc" aria-label="${labels[0]}">${toc}</nav><main id="reader-content" class="preview">${notice}${main.innerHTML}${notes ? `<section class="reader-notes"><h2>${labels[5]}</h2><ol>${notes}</ol></section>` : ''}</main></div>
<dialog id="reader-lightbox"><div class="reader-lightbox-tools"><button id="reader-zoom-out">${labels[8]}</button><button id="reader-zoom-in">${labels[9]}</button><button id="reader-close">${labels[7]}</button></div><div id="reader-image-stage"></div></dialog><div id="reader-hover" hidden></div>
<script nonce="${nonce}">${readerScript.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  return { html, warnings: [...new Set(warnings)] };
}

module.exports = { createReaderHtml, embedMathFonts };
