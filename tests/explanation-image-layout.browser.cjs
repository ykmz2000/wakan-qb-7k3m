'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const svg=(w,h)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/><rect x="20" y="20" width="${w-40}" height="${h-40}" fill="none" stroke="black" stroke-width="3"/><text x="40" y="80" font-size="40">Native ${w} x ${h} px</text><text x="40" y="145" font-size="34">Readable explanation image</text></svg>`);
async function run(browser,label){
 const page=await browser.newPage({viewport:{width:1024,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const wrap=src=>`<div class="qbPublicImageWrap"><img class="qbMediaImg" src="${src}"><div class="qbImageWriteActions"><button>トリミング</button><button>書き込み</button><button>削除</button></div></div>`;
 await page.setContent(`<style>*{box-sizing:border-box}body{font-family:sans-serif;background:#f5f7fb;margin:0}.card{background:#fff;border:1px solid #ddd;padding:16px;border-radius:12px;margin:10px}#ans{max-width:850px;margin:auto}#portraits{max-width:640px}button{min-height:36px;border:1px solid #ddd;background:white;padding:6px;color:#d56d95}</style><main id="ans"><section class="card"><h3>問題文のポイント</h3><p>横長の資料は、空いている横幅を使って表示する。</p><div class="qbMediaHostV2" id="wide">${wrap(svg(4000,1000))}</div></section><section class="card"><h3>複数の資料</h3><div class="qbMediaHostV2" id="portraits">${wrap(svg(700,1000))}${wrap(svg(700,1000))}</div></section></main>`);
 await page.addScriptTag({content:read('image-viewer.js')});await page.waitForFunction(()=>[...document.querySelectorAll('.qbMediaImg')].every(i=>i.complete&&i.naturalWidth));
 const boxes=await page.locator('#portraits img').evaluateAll(xs=>xs.map(x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}));
 assert.ok(boxes[0].h>340&&boxes[0].h<=400.5);assert.ok(boxes[0].w>260);assert.ok(Math.abs(boxes[0].y-boxes[1].y)<1);
 const wide=await page.locator('#wide img').boundingBox();assert.ok(wide.width>=700);assert.ok(wide.height<210);assert.ok(Math.abs((wide.width-2)/(wide.height-2)-4)<.05);
 fs.mkdirSync(path.join(root,'test-results/ui'),{recursive:true});await page.screenshot({path:path.join(root,`test-results/ui/${label}-wide-explanation.png`),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const mobile=await page.locator('#wide img').boundingBox();assert.ok(mobile.width>300&&mobile.width<390);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const small=await page.locator('#portraits img').evaluateAll(xs=>xs.map(i=>i.getBoundingClientRect().top));assert.ok(small[1]>small[0]);
 await page.locator('#wide img').click();await page.waitForFunction(()=>document.querySelector('.qbImageLightboxStage img')?.naturalWidth===4000);await page.locator('.qbImageLightboxClose').click();
 // Oversized transformed previews fail with 400 while the edited original is valid.
 let previewRequests=0,originalRequests=0;
 await page.route('https://media.test/**',r=>{if(r.request().url().includes('/render/')){previewRequests++;return r.fulfill({status:400,body:'source image resolution is too large'})}originalRequests++;return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><rect width="800" height="300" fill="red"/></svg>'})});
 await page.evaluate(()=>{const i=document.querySelector('#wide img');i.dataset.originalSrc='https://media.test/edited.png';i.src='https://media.test/render/edited.png'});
 await page.waitForFunction(()=>{const i=document.querySelector('#wide img');return i.src==='https://media.test/edited.png'&&i.complete&&i.naturalWidth===800});
 assert.equal(previewRequests,1);assert.equal(originalRequests,1);
 await page.locator('#wide img').click();await page.waitForFunction(()=>document.querySelector('.qbImageLightboxStage img')?.src==='https://media.test/edited.png'&&document.querySelector('.qbImageLightboxStage img')?.naturalWidth===800);await page.locator('.qbImageLightboxClose').click();
 assert.deepEqual(errors,[]);await page.close();console.log(label+' PASS 760px wide-image allowance, 400px portrait cap, horizontal flow, mobile wrapping and native enlargement');
}
(async()=>{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,label)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
