import { els, state } from './state.js';
import { nodesInRoots } from './rendering.js';
import { scheduleSourceAxisRender } from './outline.js';
import { post, t } from './ui.js';
import { scheduleBookmarkMarkersUpdate, scheduleNoteMarginRender } from './annotations.js';

const lightboxStage = els.lightbox.querySelector('.lightbox-stage');

const lightboxImg = els.lightbox.querySelector('img');

let imageZoom = 1;

let imagePan = { x: 0, y: 0 };

let imagePanStart = null;

let imagePanning = false;

let suppressLightboxClick = false;

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

function setupImageEvents() {
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

export { lightboxStage, lightboxImg, imageZoom, imagePan, imagePanStart, imagePanning, suppressLightboxClick, markImages, isExternalUrl, resolvePreviewImages, setupImageEvents, bindImageClicks, bindDiagramClicks, scheduleDiagramBinding, svgNumericLength, svgViewBoxSize, serializedSvg, openSvgLightbox, clearLightboxObjectUrl, applyImageTransform, setImageZoom, setImagePan, beginImagePan, moveImagePan, endImagePan, openLightboxSource, closeLightbox };
