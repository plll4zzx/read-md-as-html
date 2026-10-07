const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createRequire}=require('node:module');
const localRequire=createRequire(path.resolve('src/extension.js'));
function host() {
 const vscode={Uri:{joinPath:(...parts)=>parts.join('/')},workspace:{getConfiguration:()=>({get:(_,value)=>value})}};
 const ctx=vm.createContext({require:name=>name==='vscode'?vscode:localRequire(name),TextDecoder,TextEncoder,module:{exports:{}},template:fs.readFileSync('media/index.html','utf8')});
 vm.runInContext(fs.readFileSync('src/extension.js','utf8'),ctx);vm.runInContext('readText=async()=>template; markdownFilesForState=async()=>[];',ctx);return ctx;
}
test('initial Webview JSON preserves dollars and cannot terminate the script',async()=>{
 const ctx=host();const markdown='$$ x \\tag{1} $$\n$& $` $\' </script>';
 const html=await ctx.webviewHtml({extensionUri:'/extension'},{cspSource:'vscode-resource:',asWebviewUri:x=>'vscode-resource:'+x},{documentUri:{fsPath:'/doc.md',toString:()=>'/doc.md'},markdown,exportOnReady:true});
 const json=html.match(/window\.__MARKDOWN_STUDIO_INITIAL_STATE__ = (.*);/)[1];assert.equal(JSON.parse(json).markdown,markdown);assert.equal(JSON.parse(json).exportOnReady,true);assert.doesNotMatch(json,/<\/script>/);
 assert.doesNotMatch(html,/cdn\.jsdelivr/);assert.match(html,/vscode-resource:\/extension\/media\/vendor\/mathjax\/tex-chtml.js/);
});
test('command export enters the same renderer instead of exporting raw source',async()=>{
 const ctx=host();vm.runInContext('openStudio=async(context,uri,options)=>{globalThis.opened={uri,options};};',ctx);
 await ctx.exportCurrentMarkdown({},'/doc.md');assert.equal(ctx.opened.uri,'/doc.md');assert.equal(ctx.opened.options.exportOnReady,true);
});
test('opening a document preserves unsaved editor content',async()=>{
 const ctx=host();vm.runInContext(`vscode.workspace.textDocuments=[{uri:{toString:()=>'/doc.md'},isDirty:true,getText:()=>'unsaved edit'}];`,ctx);
 assert.equal(await ctx.currentMarkdownFor({toString:()=>'/doc.md'}),'unsaved edit');
});
test('offline package includes libraries, fonts, lazy TeX modules and licenses',()=>{
 for(const asset of ['purify.min.js','marked.min.js','turndown.js','mermaid.min.js','mathjax/tex-chtml.js','mathjax/input/tex/extensions/ams.js','mathjax/output/chtml/fonts/woff-v2/MathJax_Main-Regular.woff','mathjax/a11y/assistive-mml.js','mermaid-LICENSE.txt','mathjax-LICENSE.txt']) assert.ok(fs.statSync('media/vendor/'+asset).size>0,asset);
 assert.ok(fs.statSync('dist/extension.cjs').size>0);
});

test('packaged extension loads without node_modules',()=>{
 const {isBuiltin}=require('node:module');
 const ctx=vm.createContext({require:name=>{if(name==='vscode')return {};if(isBuiltin(name))return require(name);throw Error(`Unbundled dependency: ${name}`);},TextDecoder,TextEncoder,Buffer,process,module:{exports:{}}});
 vm.runInContext(fs.readFileSync('dist/extension.cjs','utf8'),ctx);
 assert.equal(typeof ctx.module.exports.activate,'function');
});
