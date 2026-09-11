'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><button id="origin">開く</button></body></html>');return}const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'application/javascript':'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
async function run(browser,label,url){
 const page=await browser.newPage({viewport:{width:900,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await page.evaluate(()=>{window.QBFiles={validate:async file=>file,isPDF:file=>file.type==='application/pdf',clipboardFiles:async()=>[],filesFromPaste:e=>[...(e.clipboardData?.files||[])]}});
 await page.addScriptTag({url:url+'pdf-collage-model-v1.js'});await page.addScriptTag({url:url+'pdf-collage-v1.js'});
 await page.evaluate(()=>{window.collageResult='pending';QBPDFCollage.open().then(value=>window.collageResult=value)});
 assert.equal(await page.locator('.qbPdfCollageCell').count(),2);
 await page.locator('[data-layout="2,3"]').click();assert.equal(await page.locator('.qbPdfCollageCell').count(),5);
 await page.locator('.qbPdfCollageEmpty').first().click();
 await page.locator('[data-files]').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:png},{name:'two.png',mimeType:'image/png',buffer:png}]);
 await page.waitForFunction(()=>document.querySelectorAll('.qbPdfCollageItem').length===2);
 await page.getByRole('button',{name:'フチなし',exact:true}).click();assert.equal(await page.getByRole('button',{name:'フチあり',exact:true}).getAttribute('aria-pressed'),'true');
 const item=page.locator('.qbPdfCollageItem').first(),box=await item.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(520);await page.mouse.up();await page.getByRole('dialog',{name:'資料を操作'}).waitFor();await page.getByRole('button',{name:'複製',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.qbPdfCollageItem').length===3);
 await page.locator('[data-layout="2,2"]').click();assert.equal(await page.locator('.qbPdfCollageCell').count(),4);
 await page.getByRole('button',{name:'この1ページを作成',exact:true}).click();await page.waitForFunction(()=>collageResult instanceof Blob);
 const result=await page.evaluate(async()=>{const L=await import('/vendor/pdfjs/pdf-lib.mjs'),doc=await L.PDFDocument.load(await collageResult.arrayBuffer()),p=doc.getPage(0);return{pages:doc.getPageCount(),width:p.getWidth(),height:p.getHeight(),type:collageResult.type}});
 assert.equal(result.pages,1);assert.equal(result.type,'application/pdf');assert.ok(result.width>500);assert.ok(result.height>100);assert.deepEqual(errors,[]);await page.close();console.log(label+' PASS collage layout, upload, long-press duplicate and one-page export');
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,label,`http://127.0.0.1:${server.address().port}/`)}finally{await browser.close()}}}finally{server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
