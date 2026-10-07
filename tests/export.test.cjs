const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { JSDOM } = require('jsdom');
const { createReaderHtml, embedMathFonts } = require('../src/export-html');
const assets = {readAsset:f=>fs.readFile('media/'+f,'utf8'),readBytes:f=>fs.readFile('media/'+f),readImage:async()=>Buffer.from('image-bytes')};
test('standalone export embeds local images and fonts and preserves SVG styles, anchors and notes',async()=>{
 const result=await createReaderHtml({title:'test <doc>',content:'<section id="intro" data-block-index="0"><h1>Title</h1><p>Find Alpha and Beta.</p><img data-raw-src="img/local.png" src="https://file.vscode-resource.vscode-cdn.net/local.png"><svg><style>.node{fill:red}</style><rect class="node" width="10" height="10"/></svg></section>',mathCss:'@font-face{font-family:MJX;src:url("https://vscode-resource/woff-v2/MathJax_Main-Regular.woff")}',annotations:[{type:'note',blockIndex:0,text:'Alpha',note:'A note'}]},assets);
 assert.equal(result.warnings.length,0);assert.doesNotMatch(result.html,/vscode-resource|<script[^>]+src=/);
 assert.match(result.html,/data:image\/png;base64/);assert.match(result.html,/data:font\/woff;base64/);
 const dom=new JSDOM(result.html,{runScripts:'outside-only'});try{
  const d=dom.window.document;assert.equal(d.querySelector('svg style').textContent,'.node{fill:red}');assert.equal(d.querySelector('.reader-toc a').getAttribute('href'),'#intro');assert.match(d.querySelector('.reader-notes').textContent,/A note/);
 }finally{dom.window.close();}
});
test('export reports missing and remote images without silent broken Webview URLs',async()=>{
 const result=await createReaderHtml({content:'<img src="missing.png"><img src="https://example.com/image.png">'}, {...assets,readImage:async()=>{throw Error('missing')}});
 assert.equal(result.warnings.length,2);assert.match(result.html,/unavailable: missing.png/);assert.match(result.html,/Remote image still requires network/);
});
test('export strips document scripts, handlers and unsafe links',async()=>{
 const result=await createReaderHtml({content:'<script>alert(1)</script><iframe src="https://evil.test"></iframe><p onclick="alert(2)">Safe</p><a href="javascript:alert(3)">bad</a><img src="x.png" onerror="alert(4)">'},assets);
 const dom=new JSDOM(result.html);try{const d=dom.window.document;assert.equal(d.scripts.length,1);assert.equal(d.querySelectorAll('[onclick],[onerror],iframe').length,0);assert.equal(d.querySelector('#reader-content a').hasAttribute('href'),false);}finally{dom.window.close();}
});
test('standalone search, table filtering, theme and text size work without host APIs',async()=>{
 const {html}=await createReaderHtml({content:'<h1>Document</h1><p>Alpha Beta Alpha</p><table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alpha</td></tr><tr><td>Beta</td></tr></tbody></table>'},assets);
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true});try{
  const w=dom.window,d=w.document;w.HTMLElement.prototype.scrollIntoView=function(){};w.eval(d.scripts[0].textContent);
  const search=d.querySelector('#reader-search');search.value='Alpha';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.reader-search-hit').length,3);assert.equal(d.querySelector('#reader-search-count').textContent,'1/3');
  d.querySelector('#reader-next').click();assert.equal(d.querySelector('#reader-search-count').textContent,'2/3');
  const filter=d.querySelector('.reader-table-filter');filter.value='Beta';filter.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('tbody tr[hidden]').length,1);
  const theme=d.querySelector('#reader-theme');theme.value='dark';theme.dispatchEvent(new w.Event('change'));assert.ok(d.body.classList.contains('theme-dark'));
 }finally{dom.window.close();}
});
test('font embedding rejects unrelated remote font URLs',async()=>{
 const css=await embedMathFonts('@font-face{src:url("https://example.com/font.woff")}',async()=>{throw Error('should not read')});assert.doesNotMatch(css,/example\.com/);
});
