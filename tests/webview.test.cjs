const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const template = fs.readFileSync('media/index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]+>/g,'');
const api = esbuild.buildSync({stdin:{contents:`import * as doc from './webview/document.js'; import * as tables from './webview/tables.js'; import * as annotations from './webview/annotations.js'; import { state, els } from './webview/state.js'; window.testApi = {doc,tables,annotations,state,els};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0].text;
function setup() {
 const dom = new JSDOM(template,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://reader.test/'});
 const w=dom.window;w.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:()=>{}});
 w.DOMPurify=require('dompurify')(w);w.marked=require('marked');w.eval(api);return dom;
}
test('display formulas retain delimiters, tags and source line mapping',()=>{
 const dom=setup();try {
  const {doc}=dom.window.testApi;
  const source='# Title\n\n$$\nr_{v,0}=a_v^0\\land\\neg\\iota_v(D),\\tag{4.1}\n$$\n\nText $x_i$.';
  const blocks=doc.splitMarkdownBlocks(source);const math=blocks.find(b=>b.type==='math');
  assert.ok(math);assert.equal(math.start,2);assert.match(math.raw,/\\tag\{4\.1\}/);
  const html=doc.renderDocumentFragment(math.raw,math.type,'markdown');assert.match(html,/class="math-block"/);assert.match(html,/\$\$/);
 } finally{dom.window.close();}
});
test('Markdown and LaTeX remove active HTML and dangerous URLs; missing sanitizer fails closed',()=>{
 const dom=setup();try{
  const {doc}=dom.window.testApi;
  for(const raw of ['<img src="x" onerror="alert(1)"><script>alert(2)</script>','[click](javascript:alert%281%29)']){
   const html=doc.renderDocumentFragment(raw,'paragraph','markdown');assert.doesNotMatch(html,/onerror|<script|href="javascript:/i);
  }
  assert.doesNotMatch(doc.renderDocumentFragment('\\href{javascript:alert(1)}{click}','paragraph','latex'),/href="javascript:/i);
  dom.window.DOMPurify=null;const raw='<img src=x onerror=alert(1)>';
  assert.equal(doc.renderDocumentFragment(raw,'paragraph','markdown'),'<pre>&lt;img src=x onerror=alert(1)&gt;</pre>');
 }finally{dom.window.close();}
});
test('table filters combine columns and can be cleared',()=>{
 const dom=setup();try{
  const {tables,els}=dom.window.testApi;els.preview.innerHTML='<table><thead><tr><th>Name</th><th>Group</th></tr></thead><tbody><tr><td>Alpha</td><td>A</td></tr><tr><td>Beta</td><td>B</td></tr></tbody></table>';
  const table=els.preview.querySelector('table');tables.wrapTables();
  tables.setTableColumnFilter(table,0,['Alpha'],2);
  assert.equal(table.tBodies[0].rows[0].hidden,false);assert.equal(table.tBodies[0].rows[1].hidden,true);
  tables.setTableColumnFilter(table,0,null,2);assert.equal(table.tBodies[0].rows[1].hidden,false);
 }finally{dom.window.close();}
});
test('annotations preserve text, source location and note body',()=>{
 const dom=setup();try{
  const a=dom.window.testApi.annotations.sanitizeClientAnnotation({id:'a',type:'note',text:'selected text',note:'a note',blockIndex:3,sourceStart:12,startOffset:2,endOffset:15});
  assert.equal(a.sourceStart,12);assert.equal(a.note,'a note');assert.equal(a.endOffset,15);
  assert.equal(dom.window.testApi.annotations.sanitizeClientAnnotation({type:'script'}),null);
 }finally{dom.window.close();}
});
