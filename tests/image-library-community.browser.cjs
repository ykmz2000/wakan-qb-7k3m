'use strict';
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{boot,edit,peek}=require('./image-library.browser.cjs');
async function run(browser,label){
 const {page:p,errors}=await boot(browser);
 await p.evaluate(()=>{testRole='user';testUserId='member';db.qb_image_library_items[1].created_by='member';authChanged()});
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 assert.equal(await p.getByRole('button',{name:'画像を追加',exact:true}).count(),1);
 assert.equal(await p.getByRole('button',{name:'科目・単元を管理',exact:true}).count(),0);
 assert.equal(await p.locator('.qbLibraryAuthor').count(),2);
 assert.ok(await p.locator('.qbLibraryAuthor').first().evaluate(el=>el.nextElementSibling.classList.contains('qbLibraryImageButton')));
 await p.locator('.qbLibraryImageButton').first().click();await p.locator('.qbLibraryReadOnly').first().waitFor();assert.equal(await p.getByRole('button',{name:'編集',exact:true}).count(),0);
 for(const name of ['変更を保存','トリミング','書き込み','ライブラリから削除'])assert.equal(await p.getByRole('button',{name,exact:true}).count(),0);
 assert.ok((await p.locator('.qbLibraryReadOnly').last().textContent()).includes('本文には動眼神経'));
 const denied=await p.evaluate(async()=>{try{await QBImageLibraryStore.save(qbSupabase,db.qb_image_library_items[0],{name:'bad'});return false}catch{return true}});assert.equal(denied,true);
 await p.keyboard.press('Meta+s');assert.equal(await p.evaluate(()=>db.qb_image_library_items[0].revision),1);
 await p.getByRole('button',{name:'一覧に戻る'}).click();await p.locator('.qbLibraryImageButton').nth(1).click();await p.getByRole('button',{name:'編集',exact:true}).waitFor();await edit(p);await p.getByLabel('画像名',{exact:true}).fill('本人が変更');await p.keyboard.press('Meta+s');await p.waitForFunction(()=>db.qb_image_library_items[1].revision===2);
 assert.equal(await p.getByLabel('画像名',{exact:true}).inputValue(),'本人が変更');
 // Reproduce the extra native insertion some external keyboards deliver after
 // keydown was consumed. Ordinary s, shifted chords and IME must remain intact.
 const guarded=await p.getByLabel('画像名',{exact:true}).evaluate(t=>{
  t.focus();t.dispatchEvent(new KeyboardEvent('keydown',{key:'s',code:'KeyS',metaKey:true,bubbles:true,cancelable:true}));
  const e=new InputEvent('beforeinput',{inputType:'insertText',data:'s',bubbles:true,cancelable:true});t.dispatchEvent(e);
  t.dispatchEvent(new KeyboardEvent('keydown',{key:'s',code:'KeyS',bubbles:true,cancelable:true}));
  const normal=new InputEvent('beforeinput',{inputType:'insertText',data:'s',bubbles:true,cancelable:true});t.dispatchEvent(normal);
  t.dispatchEvent(new KeyboardEvent('keydown',{key:'s',code:'KeyS',metaKey:true,bubbles:true,cancelable:true}));
  const ime=new InputEvent('beforeinput',{inputType:'insertCompositionText',data:'s',isComposing:true,bubbles:true,cancelable:true});t.dispatchEvent(ime);
  return {saved:e.defaultPrevented,normal:normal.defaultPrevented,ime:ime.defaultPrevented};
 });assert.deepEqual(guarded,{saved:true,normal:false,ime:false});
 await p.getByLabel('画像名',{exact:true}).press('s');assert.equal(await p.getByLabel('画像名',{exact:true}).inputValue(),'本人が変更s');
 // Non-cancellable native input is restored only for the exact insertion.
 const restored=await p.getByLabel('画像名',{exact:true}).evaluate(t=>{
  const before=t.value;t.setSelectionRange(1,2);t.dispatchEvent(new KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true}));
  t.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'s',bubbles:true,cancelable:false}));
  t.value=before.slice(0,1)+'s'+before.slice(2);t.dispatchEvent(new InputEvent('input',{inputType:'insertText',data:'s',bubbles:true}));return t.value===before&&t.selectionStart===1&&t.selectionEnd===2;
 });assert.equal(restored,true);
 await p.waitForFunction(()=>!document.querySelector('.qbLibraryBody > div:last-child').inert);await p.evaluate(()=>{testUserId='admin';testRole='admin';authChanged()});await p.locator('.qbLibraryOverlay').waitFor({state:'detached'});
 assert.deepEqual(errors,[]);await p.close();console.log(label+' community ownership, author attribution and save-input checks passed');
}
(async()=>{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,label)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
