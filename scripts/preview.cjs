// Local browser smoke-test host. Never writes to the source document.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createReaderHtml } = require('../src/export-html');
const root = path.resolve(__dirname, '..');
const fixture = '# Offline reader\n\n## Formula {#formula}\n\n$$\nr_{v,0}=a_v^0\\land\\neg\\iota_v(D),\\qquad r_{v,\\ell+1}=(r_{v,\\ell}\\lor w_{v,\\ell})\\land\\neg\\iota_v(D),\\tag{4.1}\n$$\n\nA searchable paragraph with a [section link](#formula) and reference [R1].\n\n```mermaid\nflowchart LR\n A[Input] --> B[Output]\n```\n\n| Name | Value |\n| --- | --- |\n| Alpha | 12 |\n| Beta | 24 |\n\n![Local image](media/show.png)\n\n## References\n\n[R1] Example. *Local reference*. 2026. https://example.com\n';
let exported = '';
http.createServer(async (req, res) => {
 try {
  const url = new URL(req.url, 'http://127.0.0.1:8765');
  if (req.method === 'POST' && url.pathname === '/export') {
   const chunks = []; for await (const chunk of req) chunks.push(chunk);
   const payload = JSON.parse(Buffer.concat(chunks).toString());
   const sourceDir = process.argv[2] && url.searchParams.has('document') ? path.dirname(path.resolve(process.argv[2])) : root;
   const result = await createReaderHtml(payload, { readAsset: f => fs.readFile(path.join(root,'media',f),'utf8'), readBytes: f => fs.readFile(path.join(root,'media',f)), readImage: f => fs.readFile(path.resolve(sourceDir,decodeURIComponent(f.split(/[?#]/)[0]))) });
   exported = result.html;
   await fs.mkdir(path.join(root,'.md'),{recursive:true}); await fs.writeFile(path.join(root,'.md','reader-smoke.html'),exported);
   res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({warnings:result.warnings}));
  }
  if (url.pathname === '/export.html') { res.setHeader('Content-Type','text/html; charset=utf-8'); return res.end(exported); }
  if (url.pathname.startsWith('/media/')) {
   const target = path.resolve(root, '.'+decodeURIComponent(url.pathname));
   if (!target.startsWith(path.join(root,'media')+path.sep)) { res.statusCode=403; return res.end(); }
   res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.woff':'font/woff','.png':'image/png','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream');
   return res.end(await fs.readFile(target));
  }
  const markdown = url.searchParams.has('document') && process.argv[2] ? await fs.readFile(process.argv[2],'utf8') : fixture;
  const initial = { markdown, uri:'file:///smoke.md', fileName:'smoke.md', language:'zh-CN', autoSave:false, exportOnReady:url.searchParams.has('autoexport') };
  let html = await fs.readFile(path.join(root,'media/index.html'),'utf8');
  html=html.replaceAll('${cspSource}',"'self'").replaceAll('${nonce}','smoke').replaceAll('${stylesUri}','/media/styles.css').replaceAll('${appUri}','/media/app.js').replaceAll('${vendorUri}','/media/vendor').replace('${initialState}',()=>JSON.stringify(initial).replace(/</g,'\\u003c'));
  html=html.replace("default-src 'none';", "default-src 'none'; connect-src 'self';");
  html=html.replace('<script nonce="smoke">',`<script nonce="smoke">window.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:message=>{if(message.type==='exportHtml')fetch('/export${url.search}',{method:'POST',body:JSON.stringify(message)}).then(r=>r.json()).then(result=>{document.body.dataset.exportReady='true';document.body.dataset.exportWarnings=JSON.stringify(result.warnings)});if(message.type==='resolveImage')setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{data:{type:'imageResolved',relativePath:message.relativePath,webviewUri:'/'+message.relativePath}})),0);}});`);
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
 } catch(error) {res.statusCode=500;res.end(error.stack);console.error(error);}
}).listen(8765,'127.0.0.1',()=>console.log('Smoke test: http://127.0.0.1:8765 (optional ?document or ?autoexport)'));
