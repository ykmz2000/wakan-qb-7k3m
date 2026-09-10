'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{boot}=require('./image-library.browser.cjs');
const read=f=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');
async function run(browser,label){
 const {page:p,errors}=await boot(browser);p.setDefaultTimeout(15000);await p.setViewportSize({width:1024,height:900});
 await p.addStyleTag({content:read('image-annotation-v1.css')});
 for(const file of ['image-annotation-model-v1.js','image-editor-source-picker-v1.js','recent-image-picker-v1.js'])await p.addScriptTag({content:read(file)});
 await p.evaluate(()=>{const H=QBImageModel.History;QBImageModel.History=class extends H{constructor(s){super(s);if(s.items)window.sceneHistory=this}}});
 await p.addScriptTag({content:read('image-annotation-editor-v1.js')});await p.addScriptTag({content:read('question-image-export-v1.js')});
 await p.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,600);window.sourceBlob=await new Promise(r=>c.toBlob(r));window.sourceURL=c.toDataURL();
  db.questions=[{id:'q1',stem:'この問題の本文',stem_formatting:null}];db.units=[];
  db.question_images=[{id:'recent1',question_id:'q1',placement:'explanation_overview',choice_id:null,image_path:'q1/edited.png',annotation_base_image_path:'q1/before.png',annotation_result_image_path:'q1/edited.png',created_at:'2026-09-10T00:00:00Z'}];
  objects.set('question-media/q1/edited.png',sourceBlob);objects.set('question-media/q1/before.png',sourceBlob);
  for(const r of db.qb_image_library_items)objects.set('qb-image-library/'+r.object_path,sourceBlob);
  const from=qbSupabase.from;qbSupabase.from=t=>{const q=from(t);q.is=(k,v)=>q.eq(k,v);return q};
  const rpc=qbSupabase.rpc;window.searchCalls=[];qbSupabase.rpc=(name,args)=>{if(name==='qb_library_search_v2')searchCalls.push(args);return rpc(name,args)};
  window.testQuestion={id:'q1',stem:'この問題の本文',choices:[],occ:[{official_answer:'テスト正答'}]};window.beforeDB=JSON.stringify(db);window.beforeKeys=[...objects.keys()];
 });
 // Exercise the previously troublesome reverse stack: library -> editor -> source picker.
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryImageButton').first().waitFor();
 await p.evaluate(()=>{localStorage.setItem('qb-image-editor-settings-v1','{}');QBImageEditor.open(sourceURL)});
 await p.locator('.qbDrawSave:enabled').waitFor();
 const menu=async name=>{await p.locator('.qbDrawPanel').getByRole('button',{name:'画像追加',exact:true}).click();await p.locator('.qbeSourcePanel').getByRole('button',{name,exact:true}).click()};
 await menu('画像ライブラリから');await p.locator('.qbeLibraryItem').nth(1).waitFor();
 assert.equal(await p.locator('.qbeLibraryName').first().textContent(),'眼球運動の総まとめ');assert.equal(await p.evaluate(()=>searchCalls.at(-1).p_view),'images');
 assert.equal(await p.locator('.qbDrawPanel').evaluate(n=>n.inert),true);
 await p.locator('.qbeLibraryItem').nth(1).click();await p.locator('.qbeLibraryItem').nth(0).click();
 assert.deepEqual(await p.locator('.qbeLibraryOrder').allTextContents(),['2','1']);await p.locator('.qbeUse').click();
 await p.waitForFunction(()=>sceneHistory.current.items.length===2);assert.equal(await p.locator('[data-tool=image]').getAttribute('aria-pressed'),'true');
 await p.keyboard.press('Meta+z');assert.equal(await p.evaluate(()=>sceneHistory.current.items.length),0);await p.keyboard.press('Meta+Shift+z');assert.equal(await p.evaluate(()=>sceneHistory.current.items.length),2);
 await menu('最近の画像から');await p.locator('.qbripItem').nth(1).waitFor();
 assert.equal(await p.locator('.qbripModal').evaluate(n=>!!n.parentElement.closest('.qbDrawModal')),true);
 assert.equal(await p.locator('.qbripUse').evaluate(n=>{const r=n.getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.qbripModal')}),true);
 await p.locator('.qbripItem').nth(1).click();await p.locator('.qbripUse').click();await p.waitForFunction(()=>sceneHistory.current.items.length===3);
 assert.ok(await p.evaluate(()=>calls.some(c=>c[0]==='download'&&c[2]==='q1/before.png')));
 await menu('この問題を画像化');await p.waitForFunction(()=>sceneHistory.current.items.length===4,null,{timeout:60000});
 await p.locator('[data-tool=image]').click();const chooser=p.waitForEvent('filechooser');await p.locator('[data-source=device]').click();const dialog=await chooser;
 const png=await p.evaluate(()=>sourceURL.split(',')[1]);await dialog.setFiles({name:'device.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await p.waitForFunction(()=>sceneHistory.current.items.length===5);
 const draft=await p.evaluate(()=>JSON.stringify(sceneHistory.current));await p.locator('[data-tool=image]').click();await p.locator('.qbeSourceClose').click();assert.equal(await p.evaluate(()=>JSON.stringify(sceneHistory.current)),draft);
 assert.equal(await p.evaluate(()=>JSON.stringify(db)),await p.evaluate(()=>beforeDB));assert.deepEqual(await p.evaluate(()=>[...objects.keys()]),await p.evaluate(()=>beforeKeys));
 assert.equal(await p.evaluate(()=>calls.some(c=>c[0]==='upload'||c[0]==='insert'||c[0]==='update'||c[1]==='qb_library_attach')),false);
 await p.locator('.qbDrawPanel').getByRole('button',{name:'キャンセル',exact:true}).click();await p.locator('.qbDrawModal').waitFor({state:'detached'});assert.equal(await p.locator('.qbLibraryOverlay').evaluate(n=>n.inert),false);
 assert.deepEqual(errors,[]);await p.close();console.log(label+' PASS four real source routes, RPC row envelopes, independent pixels, selection order, nested layers, cancelled draft and zero DB/Storage mutations');
}
(async()=>{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,label)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
