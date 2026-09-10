'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{boot}=require('./image-library.browser.cjs');
async function run(browser,label){
 const {page:p,errors}=await boot(browser);p.setDefaultTimeout(10000);
 // Load the actual global edit-color observer: isolated library CSS missed this regression.
 for(const file of ['theme-coverage-v2.js','image-viewer.js'])await p.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..',file),'utf8')});
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 await p.locator('.qbLibraryImageButton').first().click();const edit=p.getByRole('button',{name:'編集',exact:true});await edit.waitFor();
 await p.waitForFunction(()=>document.querySelector('.qbLibraryEditButton')?.classList.contains('qbThemeEditAction'));
 const style=await edit.evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return{color:s.color,bg:s.backgroundColor,fill:s.webkitTextFillColor,w:r.width,h:r.height}});
 assert.notEqual(style.color,style.bg);assert.equal(style.fill,style.color);assert.ok(style.w>=72&&style.h>=44);
 assert.equal(await p.getByRole('button',{name:'画像を拡大',exact:true}).count(),0);
 const image=p.locator('.qbLibraryDetailImage');await image.click();const lightbox=p.getByRole('dialog',{name:'画像を拡大表示',exact:true});await lightbox.waitFor();
 assert.equal(await p.locator('.qbLibraryOverlay').first().evaluate(n=>n.inert),true);
 assert.ok(await lightbox.evaluate(n=>Number(getComputedStyle(n).zIndex))>10120);
 await lightbox.getByRole('button',{name:'閉じる',exact:true}).click();await lightbox.waitFor({state:'detached'});
 assert.equal(await p.locator('.qbLibraryOverlay').first().evaluate(n=>n.inert),false);
 await image.focus();await image.press('Enter');await lightbox.waitFor();await p.keyboard.press('Escape');await lightbox.waitFor({state:'detached'});await edit.waitFor();
 await edit.click();await p.getByLabel('画像名',{exact:true}).fill('戻るだけで保存');await p.getByLabel('キーワード',{exact:true}).fill('lung cancer');
 await p.evaluate(()=>{window.originalNavigationRpc=qbSupabase.rpc;window.navigationSaveCalls=0;qbSupabase.rpc=(n,a)=>{if(n==='qb_library_save'){navigationSaveCalls++;return new Promise(resolve=>window.releaseNavigationSave=()=>resolve(originalNavigationRpc(n,a)))}return originalNavigationRpc(n,a)}});
 const back=p.getByRole('button',{name:'一覧に戻る',exact:true});await back.click();assert.equal(await back.isDisabled(),true);
 await back.dispatchEvent('click');assert.equal(await p.evaluate(()=>navigationSaveCalls),1);
 await p.evaluate(()=>releaseNavigationSave());await p.getByRole('searchbox').waitFor();
 assert.equal(await p.getByRole('searchbox').evaluate(n=>n===document.activeElement),false);
 assert.equal(await p.evaluate(()=>db.qb_image_library_items[0].metadata.name),'戻るだけで保存');assert.deepEqual(await p.evaluate(()=>db.qb_image_library_items[0].metadata.keywords),['lung cancer']);
 await p.evaluate(()=>{qbSupabase.rpc=originalNavigationRpc});
 await p.locator('.qbLibraryImageButton').first().click();await edit.click();await p.getByLabel('画像名',{exact:true}).fill('失敗しても保持');
 await p.evaluate(()=>{let fail=true;qbSupabase.rpc=(n,a)=>{if(n==='qb_library_save'&&fail){fail=false;return Promise.resolve({error:{message:'保存に失敗しました'}})}return originalNavigationRpc(n,a)}});
 await back.click();await p.getByText('保存に失敗しました',{exact:true}).waitFor();assert.equal(await p.getByLabel('画像名',{exact:true}).inputValue(),'失敗しても保持');assert.equal(await back.isDisabled(),false);
 await back.click();await p.getByRole('searchbox').waitFor();assert.equal(await p.evaluate(()=>db.qb_image_library_items[0].metadata.name),'失敗しても保持');assert.equal(await p.getByRole('searchbox').evaluate(n=>n===document.activeElement),false);
 // Upload review's identically labelled return action saves too.
 await p.locator('.qbLibraryTools input[type=file][multiple]').setInputFiles({name:'navigation.png',mimeType:'image/png',buffer:Buffer.from('pixels')});
 const review=p.getByRole('dialog',{name:'追加した画像を確認',exact:true});await review.waitFor();await review.getByLabel('画像名',{exact:true}).fill('追加直後も戻るだけで保存');await review.getByRole('button',{name:'一覧に戻る',exact:true}).click();await review.waitFor({state:'detached'});
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.name),'追加直後も戻るだけで保存');assert.equal(await p.getByRole('searchbox').evaluate(n=>n===document.activeElement),false);
 assert.deepEqual(errors,[]);await p.close();console.log(label+' PASS theme contrast, tap/keyboard lightbox, auto-save back, pending/failed save, no search autofocus, upload-review back');
}
(async()=>{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,label)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
