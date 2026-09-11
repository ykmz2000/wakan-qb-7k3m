'use strict';
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{boot}=require('./image-library.browser.cjs');
async function run(browser,name){
 const {page:p,errors}=await boot(browser);
 await p.evaluate(()=>{db.qb_image_library_items[0].metadata.keywords=['くも膜下'];window.searches=[];const rpc=qbSupabase.rpc;qbSupabase.rpc=(n,a)=>{if(n==='qb_library_search_v2')searches.push(a.p_query);return rpc(n,a)}});
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 const search=p.getByRole('searchbox');await search.focus();
 await search.evaluate(n=>{window.originalIMEField=n;n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.value='くも膜下';n.dispatchEvent(new InputEvent('input',{inputType:'insertCompositionText',data:'くも膜下',isComposing:true,bubbles:true}))});
 await p.waitForTimeout(400);assert.deepEqual(await p.evaluate(()=>searches),['']);
 // Safari can finish composition before delivering Enter with keyCode 229.
 const result=await search.evaluate(n=>{n.dispatchEvent(new CompositionEvent('compositionend',{data:'くも膜下',bubbles:true}));const e=new KeyboardEvent('keydown',{key:'Enter',keyCode:229,bubbles:true,cancelable:true});n.dispatchEvent(e);n.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return {prevented:e.defaultPrevented,same:n===originalIMEField,value:n.value}});
 assert.deepEqual(result,{prevented:false,same:true,value:'くも膜下'});assert.deepEqual(await p.evaluate(()=>searches),['']);
 await p.waitForFunction(()=>searches.length===2);assert.deepEqual(await p.evaluate(()=>searches),['','くも膜下']);assert.equal(await search.inputValue(),'くも膜下');
 await p.locator('.qbLibraryImageButton').first().click();await p.getByRole('button',{name:'編集',exact:true}).click();
 for(const label of ['ファイル名','テーマ','キーワード']){
  const field=p.getByLabel(label,{exact:true});await field.fill('');await field.focus();
  const before=await field.evaluate(n=>n.style.height);
  await field.evaluate(n=>{window.originalIMEField=n;n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.value='くも膜下';n.dispatchEvent(new InputEvent('input',{inputType:'insertCompositionText',data:'くも膜下',isComposing:true,bubbles:true}));n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true}))});
  await p.waitForTimeout(100);assert.equal(await field.inputValue(),'くも膜下');assert.equal(await field.evaluate(n=>n.style.height),before);assert.equal(await field.evaluate(n=>n===originalIMEField),true);
  await field.evaluate(n=>{n.dispatchEvent(new CompositionEvent('compositionend',{data:'くも膜下',bubbles:true}));n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,bubbles:true,cancelable:true}));n.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertParagraph',bubbles:true,cancelable:true}));n.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
  assert.equal(await field.inputValue(),'くも膜下');assert.equal(await p.evaluate(()=>db.qb_image_library_items[0].revision),1);
  await p.waitForTimeout(80);
 }
 const keywords=p.getByLabel('キーワード',{exact:true});await keywords.press('Enter');assert.equal(await keywords.inputValue(),'');assert.equal(await p.getByRole('button',{name:'くも膜下を編集',exact:true}).count(),1);
 // Exercise Chromium's native composition pipeline, in addition to event ordering above.
 if(name==='Chromium'){
  const cdp=await p.context().newCDPSession(p);await keywords.focus();
  await cdp.send('Input.imeSetComposition',{text:'くもまくか',selectionStart:5,selectionEnd:5});
  await cdp.send('Input.imeSetComposition',{text:'くも膜下',selectionStart:4,selectionEnd:4});
  await cdp.send('Input.insertText',{text:'くも膜下'});assert.equal(await keywords.inputValue(),'くも膜下');
  await p.waitForTimeout(80);await keywords.press('Enter');assert.equal(await p.getByRole('button',{name:'くも膜下を編集',exact:true}).count(),1);await cdp.detach();
 }
 assert.deepEqual(errors,[]);await p.close();console.log(name+' PASS IME conversion Enter isolation, deferred search, stable native fields and single keyword commit');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,name)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
