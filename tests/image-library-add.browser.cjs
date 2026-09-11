'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{boot,edit,peek}=require('./image-library.browser.cjs');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
async function run(browser,name){
 const {page:p,errors}=await boot(browser);let count=0;const pass=s=>console.log(name+' '+(++count)+' '+s);
 await p.addScriptTag({content:read('recent-image-picker-v1.js')});
 // Recreate the existing theme/legacy styles which previously overrode only some buttons.
 await p.addStyleTag({content:'.oeiBtn,.qsiPick,.qsiPasteBtn,.qsiRecentBtn{border:1px solid blue;border-radius:8px;padding:7px 10px;font-weight:900;font-size:11px}.oeiActions,.qsiActions{display:flex;gap:7px;flex-wrap:wrap}'});
 await p.addStyleTag({content:read('editor-appearance-v1.css')});
 await p.evaluate(()=>{
  document.querySelector('.oeiActions').insertAdjacentHTML('afterbegin','<label class="oeiBtn">画像を選択<input type="file" hidden></label><button class="oeiBtn oeiPasteBtn">画像をコピペ</button><button class="oeiBtn oeiRecentBtn">最近のファイル</button>');
  document.querySelector('#oldUpload').className='qsiPick';document.querySelector('#oldRecent').className='qsiRecentBtn';
  document.querySelector('.qsiActions').insertAdjacentHTML('beforeend','<button class="qsiPasteBtn">画像をコピペ</button>');
 });
 for(const width of [390,1024]){
  await p.setViewportSize({width,height:844});
  for(const accent of ['#ed80ab','#126fb3']){
   await p.evaluate(color=>document.documentElement.style.setProperty('--accent',color),accent);
   for(const group of ['.qsiActions','.oeiActions']){
    const styles=await p.locator(group+' > :is(button,label)').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return{weight:s.fontWeight,size:s.fontSize,radius:s.borderRadius,color:s.color,padding:s.padding,height:e.getBoundingClientRect().height}}));
    assert.ok(styles.every(s=>s.weight===styles[0].weight&&s.size===styles[0].size&&s.color===styles[0].color&&s.padding===styles[0].padding&&s.radius==='0px'&&s.height>=44));
   }
  }
 }
 pass('shared button shape, weight, spacing and theme color on phone and tablet');
 await p.setViewportSize({width:390,height:844});
 await p.evaluate(()=>{
  window.sourceBytes=['edited image bytes','before annotation bytes'];
  const a={id:'r1',question_id:'q1',image_path:'q1/current.png',placement:'explanation_overview',annotation_base_image_path:'q1/base.png',annotation_result_image_path:'q1/current.png',created_at:'2026-09-10T00:00:00Z'};
  db.question_images.push(a);objects.set('question-media/'+a.image_path,new Blob([sourceBytes[0]],{type:'image/png'}));objects.set('question-media/'+a.annotation_base_image_path,new Blob([sourceBytes[1]],{type:'image/png'}));
  window.savedSource=JSON.stringify(db.question_images);window.outsidePastes=0;document.querySelector('main').addEventListener('paste',()=>outsidePastes++);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:async()=>{throw new DOMException('denied','NotAllowedError')}}});
 });
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 await p.locator('.qbLibraryPanel').getByRole('button',{name:'ファイルをペースト',exact:true}).click();await p.getByRole('textbox',{name:'ライブラリへのファイル貼り付け欄'}).waitFor();
 await p.locator('.qbLibraryPasteZone').evaluate(n=>{const dt=new DataTransfer();dt.items.add(new File(['pasted pixels'],'clipboard.png',{type:'image/png'}));n.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))});
 await p.waitForFunction(()=>db.qb_image_library_items.length===3);await p.getByRole('button',{name:'確定',exact:true}).click();await p.locator('.qbLibraryUploadReview').waitFor({state:'detached'});assert.equal(await p.locator('.qbLibraryPasteZone').isVisible(),false);
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.analysis_status),'unprocessed');
 pass('denied clipboard read falls back to iPad paste target and registers immediately');
 await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:async()=>[{types:['image/png'],getType:async()=>new Blob(['direct clipboard pixels'],{type:'image/png'})}]}}));
 await p.locator('.qbLibraryPanel').getByRole('button',{name:'ファイルをペースト',exact:true}).click();await p.waitForFunction(()=>db.qb_image_library_items.length===4);await p.getByRole('button',{name:'確定',exact:true}).click();await p.locator('.qbLibraryUploadReview').waitFor({state:'detached'});
 pass('clipboard button imports image bytes without typing into question editor');
 await p.locator('.qbLibraryPanel').getByRole('button',{name:'最近のファイル',exact:true}).click();await p.locator('.qbripItem').first().waitFor();
 assert.equal(await p.locator('.qbLibraryPanel').evaluate(n=>n.inert),true);
 assert.equal(await p.locator('.qbripModal').evaluate(n=>{const r=n.querySelector('.qbripPanel').getBoundingClientRect();return n.contains(document.elementFromPoint(r.left+20,r.top+20))}),true);
 await p.keyboard.press('Escape');await p.locator('.qbripModal').waitFor({state:'detached'});
 assert.equal(await p.locator('.qbLibraryPanel').evaluate(n=>n.inert),false);assert.equal(await p.locator('.qbLibraryOverlay').count(),1);
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.length),4);pass('nested recent picker is visible and cancel restores library focus with no import');
 await p.locator('.qbLibraryPanel').getByRole('button',{name:'最近のファイル',exact:true}).click();await p.locator('.qbripItem').first().waitFor();
 const before=p.locator('.qbripItem[data-id="r1:before-annotation"]');await before.focus();await p.keyboard.press('Alt+Enter');await p.locator('.qbripPreview').waitFor();
 await p.keyboard.press('Escape');await p.locator('.qbripPreview').waitFor({state:'detached'});assert.equal(await p.locator('.qbripItem.on').count(),0);
 await before.click();await p.locator('.qbripItem[data-id="r1"]').click();await p.locator('.qbripUse').click();await p.getByRole('button',{name:'別々のカードに追加（2枚）',exact:true}).click();await p.waitForFunction(()=>db.qb_image_library_items.length===6);await p.getByRole('button',{name:'確定',exact:true}).click();await p.locator('.qbLibraryUploadReview').waitFor({state:'detached'});
 const result=await p.evaluate(async()=>{const rows=db.qb_image_library_items.slice(-2);return{bytes:await Promise.all(rows.map(r=>objects.get('qb-image-library/'+r.object_path).text())),paths:rows.map(r=>r.object_path),states:rows.map(r=>[r.metadata.analysis_status,r.metadata.classification_status]),sourceUnchanged:JSON.stringify(db.question_images)===savedSource,uses:db.qb_image_library_usages.length,ai:calls.filter(c=>c[1]==='qb_library_record_reading').length}});
 assert.deepEqual(result.bytes,['before annotation bytes','edited image bytes']);assert.notEqual(result.paths[0],result.paths[1]);assert.deepEqual(result.states,[['unprocessed','unknown'],['unprocessed','unknown']]);assert.equal(result.sourceUnchanged,true);assert.equal(result.uses,0);assert.equal(result.ai,0);
 const independent=await p.evaluate(async()=>{const row=db.qb_image_library_items.at(-1);objects.set('question-media/q1/current.png',new Blob(['later edited']));return await objects.get('qb-image-library/'+row.object_path).text()});assert.equal(independent,'edited image bytes');
 pass('selected variants copied independently in selection order; no AI, question writes or bulk migration');
 await p.locator('.qbLibraryPanel').getByRole('button',{name:'最近のファイル',exact:true}).click();await p.locator('.qbripItem').first().waitFor();await p.locator('.qbripItem[data-id="r1"]').click();
 await p.evaluate(()=>objects.delete('question-media/q1/current.png'));await p.locator('.qbripUse').click();await p.getByText(/0枚を登録済み。missing/).waitFor();
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.length),6);assert.equal(await p.locator('.qbLibraryPanel').getByRole('button',{name:'ファイルをペースト',exact:true}).isEnabled(),true);pass('source download failure leaves no library record and restores controls');
 await p.locator('.qbLibraryImageButton').first().click();await p.getByRole('button',{name:'編集',exact:true}).waitFor();await edit(p);await p.getByLabel('読み取り本文',{exact:true}).fill('下書き本文');
 await p.getByLabel('読み取り本文',{exact:true}).evaluate(n=>{const dt=new DataTransfer();dt.items.add(new File(['do not import'],'text-field.png',{type:'image/png'}));n.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))});
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.length),6);assert.equal(await p.getByLabel('読み取り本文',{exact:true}).inputValue(),'下書き本文');
 await p.getByRole('button',{name:'一覧に戻る',exact:true}).click();await p.getByRole('button',{name:'閉じる',exact:true}).click();assert.equal(await p.locator('#draft').inputValue(),'保存していない問題文');assert.equal(await p.evaluate(()=>outsidePastes),0);assert.equal(await p.locator('main').evaluate(n=>n.inert),false);
 pass('metadata paste and background draft remain untouched; nested dialogs clean up');
 assert.deepEqual(errors,[]);await p.close();console.log(name+' '+count+' library-add checks passed');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,name)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});

