'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
async function run(browser,label){
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html><head><style>:root{--card:#fff;--text:#172033;--muted:#6f7786;--line:#dce3ec;--accent:#126fb3;--accent-soft:#eaf4fb}</style></head><body></body></html>');
  await page.evaluate(()=>{if(!crypto.randomUUID)crypto.randomUUID=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('')});
  await page.addStyleTag({content:read('image-annotation-v1.css')});
  await page.addScriptTag({content:read('image-annotation-model-v1.js')});
  await page.evaluate(()=>{const H=QBImageModel.History;QBImageModel.History=class extends H{constructor(s){super(s);if(s.items)window.sceneHistory=this}}});
  await page.addScriptTag({content:read('image-editor-source-picker-v1.js')});
  await page.addScriptTag({content:read('image-annotation-editor-v1.js')});
  await page.evaluate(()=>{try{localStorage.setItem('qb-image-editor-settings-v1','{}')}catch{};window.pq=()=>({id:'q-test'});const c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').fillRect(0,0,1,1);window.QBQuestionExport={render:async()=>({blob:await new Promise(r=>c.toBlob(r,'image/png'))})};QBImageEditor.open(c.toDataURL())});
  await page.locator('.qbDrawSave:enabled').waitFor();
  await page.getByRole('button',{name:'黒',exact:true}).waitFor();await page.getByRole('button',{name:'白',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/スナップ/}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:/スナップ/}).click();assert.equal(await page.getByRole('button',{name:/スナップ/}).getAttribute('aria-pressed'),'false');await page.getByRole('button',{name:/スナップ/}).click();
  await page.getByRole('button',{name:'四角い枠',exact:true}).click();await page.getByRole('button',{name:'全体表示',exact:true}).click();
  const stage=await page.locator('.qbDrawStage').boundingBox(),z=Math.min((stage.width-32)/800,(stage.height-32)/600),at=(x,y)=>({x:stage.x+(stage.width-800*z)/2+x*z,y:stage.y+(stage.height-600*z)/2+y*z});
  await page.getByRole('button',{name:'四角い枠',exact:true}).click();let a=at(100,100),b=at(260,220);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();assert.equal(await page.evaluate(()=>sceneHistory.current.items.length),1);
  // The rectangle tool remains active: dragging the existing border moves it instead of creating a new frame.
  a=at(100,160);b=at(150,190);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();const rect=await page.evaluate(()=>sceneHistory.current.items[0]);assert.equal((await page.evaluate(()=>sceneHistory.current.items.length)),1);assert.ok(rect.x>100&&rect.y>100);
  for(const name of ['最前面へ','一つ前面へ','一つ背面へ','最背面へ'])assert.equal(await page.getByRole('button',{name,exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'画像追加',exact:true}).click();for(const name of ['端末から選ぶ','最近の画像から','画像ライブラリから','この問題を画像化'])await page.getByRole('button',{name,exact:true}).waitFor();await page.locator('.qbeSourceClose').click();
  assert.deepEqual(errors,[]);await page.close();console.log(label+' PASS nine colors, snap toggle, same-tool movement, layer actions and image source menu');
}
(async()=>{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,label)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
