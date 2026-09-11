'use strict';
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{boot,peek}=require('./image-library.browser.cjs');
async function run(browser,name){
 const {page:p,errors}=await boot(browser);p.setDefaultTimeout(10000);
 await p.evaluate(()=>{window.sorts=[];const rpc=qbSupabase.rpc;qbSupabase.rpc=(n,a)=>{if(n==='qb_library_search_v2')sorts.push(a.p_sort);return rpc(n,a)}});
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 assert.equal(await p.evaluate(()=>sorts[0]),'recent');
 assert.equal(await p.locator('.qbLibraryGrid input,.qbLibraryGrid .qbLibraryMeta,.qbLibraryGrid .qbLibrarySnippet').count(),0);
 assert.equal(await p.getByRole('button',{name:'ファイルを追加',exact:true}).count(),1);
 assert.equal(await p.getByRole('button',{name:'ファイルをペースト',exact:true}).count(),1);
 assert.equal(await p.getByRole('button',{name:'選択モード',exact:true}).count(),0);
 await p.locator('.qbLibraryImageButton').first().click();await p.getByRole('button',{name:'編集',exact:true}).waitFor();
 assert.equal(await p.locator('.qbLibraryPanel input:visible').count(),0);
 assert.equal(await p.getByRole('button',{name:'閉じる',exact:true}).count(),0);
 assert.equal(await p.getByRole('button',{name:'一覧に戻る',exact:true}).count(),1);
 await p.getByRole('button',{name:'編集',exact:true}).click();
 assert.deepEqual(await p.locator('form.qbLibraryForm > .qbLibraryField > span').allTextContents(),['ファイル名','テーマ','キーワード','科目']);
 for(const label of ['ファイル名','テーマ']){const input=p.getByLabel(label,{exact:true});const short=await input.boundingBox();await input.fill('長い入力でも折り返してすべて読めることを確認します。'.repeat(10));await p.waitForFunction(label=>{const field=[...document.querySelectorAll('form.qbLibraryForm label')].find(n=>n.querySelector('span')?.textContent===label)?.querySelector('textarea');return field&&field.clientHeight>100},label);const size=await input.evaluate(n=>({height:n.clientHeight,width:n.clientWidth,scroll:n.scrollWidth}));assert.ok(size.height>short.height);assert.ok(size.scroll<=size.width+1);await input.fill('短い入力');await p.waitForFunction(label=>{const field=[...document.querySelectorAll('form.qbLibraryForm label')].find(n=>n.querySelector('span')?.textContent===label)?.querySelector('textarea');return field&&field.clientHeight<100},label);}
 const keywords=p.getByLabel('キーワード',{exact:true});await keywords.fill('動眼神経');await keywords.press('Enter');assert.equal(await keywords.inputValue(),'');await p.getByRole('button',{name:'動眼神経を編集',exact:true}).waitFor();
 await keywords.fill('動眼神経');await keywords.press('Enter');assert.equal(await p.getByRole('button',{name:'動眼神経を編集',exact:true}).count(),1);
 await p.getByRole('button',{name:'動眼神経を編集',exact:true}).click();await keywords.fill('眼球運動');await keywords.press('Enter');assert.equal(await p.getByRole('button',{name:'動眼神経を編集',exact:true}).count(),0);
 await keywords.fill('消すタグ');await keywords.press('Enter');await p.getByRole('button',{name:'消すタグを削除',exact:true}).click();assert.equal(await p.getByRole('button',{name:'消すタグを編集',exact:true}).count(),0);
 await keywords.fill('変換中');const composing=await keywords.evaluate(n=>{n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));const e=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});n.dispatchEvent(e);n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));return e.defaultPrevented});assert.equal(composing,false);assert.equal(await keywords.inputValue(),'変換中');await p.waitForTimeout(80);
 await keywords.fill('lung');await keywords.press('Space');await keywords.pressSequentially('cancer');assert.equal(await keywords.inputValue(),'lung cancer');assert.equal(await p.getByRole('button',{name:'lungを編集',exact:true}).count(),0);await keywords.press('Enter');await p.getByRole('button',{name:'lung cancerを編集',exact:true}).waitFor();
 await keywords.fill('保存前の入力');
 const advanced=p.locator('form.qbLibraryForm > details');assert.equal(await advanced.evaluate(n=>n.open),false);
 await advanced.locator('summary').first().click();await p.getByLabel('補足・学習意図',{exact:true}).fill('畳んでも保存する');await advanced.locator('summary').first().click();await p.getByLabel('ファイル名',{exact:true}).fill('読むためのタイトル');await p.keyboard.press('Meta+s');await p.waitForFunction(()=>db.qb_image_library_items[0].metadata.notes==='畳んでも保存する');
 assert.deepEqual(await p.evaluate(()=>db.qb_image_library_items[0].metadata.keywords),['眼球運動','lung cancer','保存前の入力']);await p.getByRole('button',{name:'一覧に戻る',exact:true}).click();
 for(const query of ['lung','cancer','ancer','LUNG CANCER']){await p.getByRole('searchbox').fill(query);await p.getByRole('button',{name:'検索',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.qbLibraryImageButton').length===1);assert.equal(await p.locator('.qbLibraryName').textContent(),'読むためのタイトル');}
 await p.getByRole('searchbox').fill('');await p.getByRole('button',{name:'検索',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.qbLibraryImageButton').length===2);
 await p.getByRole('button',{name:'閉じる',exact:true}).click();await p.locator('.qsiEditor .qbLibraryAction').click();await p.locator('.qbLibraryImageButton').first().waitFor();
 const card=p.locator('.qbLibraryImageButton').first();await card.click();assert.equal(await card.getAttribute('aria-pressed'),'true');
 await peek(p,card);const preview=p.getByRole('dialog',{name:'画像のプレビュー',exact:true});
 await preview.getByText('読むためのタイトル',{exact:true}).first().waitFor();assert.equal(await p.locator('.qbLibraryFooter').first().textContent().then(t=>t.includes('1枚を選択中')),true);
 await preview.getByRole('button',{name:'一覧に戻る',exact:true}).click();
 // A synthetic click following the long press must not change the selection.
 await card.dispatchEvent('click',{detail:1});assert.equal(await card.getAttribute('aria-pressed'),'true');
 await card.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:2,clientX:20,clientY:20,button:0});await card.dispatchEvent('pointermove',{pointerType:'touch',pointerId:2,clientX:20,clientY:100});await card.dispatchEvent('pointerup',{pointerType:'touch',pointerId:2});await card.dispatchEvent('click',{detail:1});assert.equal(await card.getAttribute('aria-pressed'),'true');assert.equal(await preview.count(),0);
 await p.getByRole('button',{name:'閉じる',exact:true}).click();
 assert.deepEqual(errors,[]);await p.close();console.log(name+' PASS reading/editing, clean cards, basic fields, collapsed persistence, selection toggle, long-press and scroll cancellation');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
