'use strict';
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{boot,peek}=require('./image-library.browser.cjs');
async function run(browser,name){
 const {page:p,errors}=await boot(browser);p.setDefaultTimeout(10000);
 await p.evaluate(()=>{window.sorts=[];const rpc=qbSupabase.rpc;qbSupabase.rpc=(n,a)=>{if(n==='qb_library_search_v2')sorts.push(a.p_sort);return rpc(n,a)}});
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 assert.equal(await p.evaluate(()=>sorts[0]),'recent');
 assert.equal(await p.locator('.qbLibraryGrid input,.qbLibraryGrid .qbLibraryMeta,.qbLibraryGrid .qbLibrarySnippet').count(),0);
 assert.equal(await p.getByRole('button',{name:'画像を追加',exact:true}).count(),1);
 assert.equal(await p.getByRole('button',{name:'コピペで追加',exact:true}).count(),1);
 const toggle=p.getByRole('button',{name:'選択モード',exact:true});assert.equal(await toggle.getAttribute('aria-pressed'),'false');
 await p.locator('.qbLibraryImageButton').first().click();await p.getByRole('button',{name:'編集',exact:true}).waitFor();
 assert.equal(await p.locator('input:visible').count(),0);
 assert.equal(await p.getByRole('button',{name:'閉じる',exact:true}).count(),0);
 assert.equal(await p.getByRole('button',{name:'一覧に戻る',exact:true}).count(),1);
 await p.getByRole('button',{name:'編集',exact:true}).click();
 assert.deepEqual(await p.locator('form.qbLibraryForm > .qbLibraryField > span').allTextContents(),['画像名','テーマ','キーワード','科目']);
 const advanced=p.locator('form.qbLibraryForm > details');assert.equal(await advanced.evaluate(n=>n.open),false);
 await advanced.locator('summary').first().click();await p.getByLabel('補足・学習意図',{exact:true}).fill('畳んでも保存する');await advanced.locator('summary').first().click();await p.getByLabel('画像名',{exact:true}).fill('読むためのタイトル');await p.keyboard.press('Meta+s');await p.waitForFunction(()=>db.qb_image_library_items[0].metadata.notes==='畳んでも保存する');
 await p.getByRole('button',{name:'一覧に戻る',exact:true}).click();assert.equal(await toggle.getAttribute('aria-pressed'),'false');
 await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
 const card=p.locator('.qbLibraryImageButton').first();await card.click();assert.equal(await card.getAttribute('aria-pressed'),'true');
 await peek(p,card);const preview=p.getByRole('dialog',{name:'画像のプレビュー',exact:true});
 await preview.getByText('読むためのタイトル',{exact:true}).first().waitFor();assert.equal(await p.locator('.qbLibraryFooter').first().textContent().then(t=>t.includes('1枚を選択中')),true);
 await preview.getByRole('button',{name:'一覧に戻る',exact:true}).click();
 // A synthetic click following the long press must not change the selection.
 await card.dispatchEvent('click',{detail:1});assert.equal(await card.getAttribute('aria-pressed'),'true');
 await card.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:2,clientX:20,clientY:20,button:0});await card.dispatchEvent('pointermove',{pointerType:'touch',pointerId:2,clientX:20,clientY:100});await card.dispatchEvent('pointerup',{pointerType:'touch',pointerId:2});await card.dispatchEvent('click',{detail:1});assert.equal(await card.getAttribute('aria-pressed'),'true');assert.equal(await preview.count(),0);
 await toggle.click();await card.click();await p.getByRole('button',{name:'編集',exact:true}).waitFor();
 assert.deepEqual(errors,[]);await p.close();console.log(name+' PASS reading/editing, clean cards, basic fields, collapsed persistence, selection toggle, long-press and scroll cancellation');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
