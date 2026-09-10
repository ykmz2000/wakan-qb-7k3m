'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const portrait='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1000"><rect width="700" height="1000" fill="white"/><rect x="20" y="20" width="660" height="960" fill="none" stroke="black"/></svg>');
async function run(browser,label){
  const page=await browser.newPage({viewport:{width:900,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<div id="ans" style="width:640px"><div class="qbMediaHostV2"><div class="qbPublicImageWrap"><img class="qbMediaImg" src="${portrait}"><div class="qbImageWriteActions"></div></div><div class="qbPublicImageWrap"><img class="qbMediaImg" src="${portrait}"><div class="qbImageWriteActions"></div></div></div></div>`);
  await page.addScriptTag({content:read('image-viewer.js')});await page.locator('.qbMediaImg').first().evaluate(img=>img.decode?.().catch(()=>{}));
  const boxes=await page.locator('.qbMediaImg').evaluateAll(xs=>xs.map(x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}));
  assert.equal(boxes.length,2);assert.ok(boxes[0].h>240&&boxes[0].h<=340.5);assert.ok(boxes[0].w>200);assert.ok(Math.abs(boxes[0].y-boxes[1].y)<1);assert.ok(boxes[1].x>boxes[0].x+boxes[0].w);assert.deepEqual(errors,[]);await page.close();console.log(label+' PASS larger portrait explanation previews wrap side by side');
}
(async()=>{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,label)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
