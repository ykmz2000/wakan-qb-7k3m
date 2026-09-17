'use strict';
// Synthetic fixtures only. Exercises the real practice renderer and keyboard handler.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const core=fs.readFileSync(path.join(root,'qb-app.js'),'utf8');
const bootLine="if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();";
assert.equal(core.split(bootLine).length,2,'core test boot anchor must be unique');
const instrumented=core.replace(bootLine,`
window.pq=current;
window.__fixtureOpen=raws=>{
 sb=window.qbSupabase;user={id:'fixture-user'};subject={id:'fixture-subject',name:'検証科目'};
 units=[{id:'unit1',name:'検証単元'}];unitId='unit1';questions=raws.map(normalizeDetailQuestion);
 window.QB_QUESTIONS=questions;practice=questions.map(q=>String(q.id));selected=new Set(practice);
 pi=0;screen='practice';submitted=false;reviewOnly=false;sel=new Set();qstate={};sessionId=null;renderPractice();emit();
};
`);
function fixture(id,order,mode='single'){
 return {id,canonical_key:id,stem:'設問 '+id,answer_mode:mode,instruction:null,study_order:order,unit_id:'unit1',answer_fields:mode==='fill_blank'?[{key:'A',label:'A'}]:null,explanation_overview:'解説',choices:mode==='fill_blank'?[]:[{id:id+'-a',choice_key:'a',choice_text:'正答',is_correct:true,sort_order:1},{id:id+'-b',choice_key:'b',choice_text:'誤答',is_correct:false,sort_order:2},{id:id+'-c',choice_key:'c',choice_text:'誤答',is_correct:false,sort_order:3},{id:id+'-d',choice_key:'d',choice_text:'誤答',is_correct:false,sort_order:4},{id:id+'-e',choice_key:'e',choice_text:'誤答',is_correct:false,sort_order:5}],question_occurrences:[{id:'occ-'+id,academic_year:2026,exam_type:'本試',original_question_number:String(order),official_answer:mode==='fill_blank'?{A:'模範解答'}:['a']}]}
}
async function boot(browser,questions){
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push(d.message());await d.dismiss()});
 await page.route('**/*',route=>route.abort());
 await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>.hidden{display:none!important}</style></head><body tabindex="-1"><main class="app"><div id="crumb"></div><button id="home"></button><div id="view"></div></main><div id="modal" class="hidden"><button data-mode="ordered"></button><button id="cancel"></button></div></body></html>');
 await page.evaluate(()=>{
  window.__writes=[];
  window.qbSupabase={auth:{getUser:async()=>({data:{user:{id:'fixture-user'}},error:null})},from(table){
   const api={select(){return api},eq(){return api},insert(payload){write('insert',payload);return api},upsert(payload){write('upsert',payload);return api},update(payload){write('update',payload);return api},single(){return Promise.resolve({data:{id:'fixture-session'},error:null})},then(resolve,reject){return Promise.resolve({data:null,error:null}).then(resolve,reject)}};
   function write(op,payload){window.__writes.push({table,op,payload:structuredClone(payload)})}return api;
  }};
 });
 await page.addScriptTag({content:instrumented});
 for(const file of ['fill-blank-v2.js','qb-practice-dock-v2.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
 await page.evaluate(rows=>window.__fixtureOpen(rows),questions);await page.waitForSelector('#qbPracticeDockV2 .qbpdMain');
 return{page,errors}
}
async function focusPage(page){await page.evaluate(()=>document.body.focus())}
async function run(browserType,name){
 const browser=await browserType.launch({headless:true});
 try{
  {
   const {page,errors}=await boot(browser,[fixture('q1',1),fixture('q2',2)]);
   await focusPage(page);await page.keyboard.press('Shift+Enter');await page.waitForSelector('#ans .resultcard.review');
   assert.equal(await page.evaluate(()=>__writes.filter(x=>x.table==='attempts').length),0,'no-selection shortcut opens the explanation');
   await focusPage(page);await page.keyboard.press('Shift+Enter');await page.waitForFunction(()=>document.querySelector('#ans')?.classList.contains('hidden'));
   await focusPage(page);await page.keyboard.press('a');assert.equal(await page.locator('[data-c="0"].sel').count(),1,'A selects the first option');
   await page.keyboard.press('a');assert.equal(await page.locator('.choice.sel').count(),0,'pressing A again clears a single-choice selection');
   await page.keyboard.press('e');assert.equal(await page.locator('[data-c="4"].sel').count(),1,'E selects the fifth option');
   await page.keyboard.press('e');assert.equal(await page.locator('.choice.sel').count(),0,'pressing E again clears the selection');
   await page.keyboard.press('a');await page.keyboard.press('Shift+Enter');await page.waitForSelector('#ans .resultcard.ok');
   assert.equal(await page.evaluate(()=>__writes.filter(x=>x.table==='attempts').length),1,'selected answer is submitted');
   await focusPage(page);await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>qbGetPracticeState().currentIndex),0,'left is inert on the first question');
   await page.keyboard.press('Control+ArrowRight');assert.equal(await page.evaluate(()=>qbGetPracticeState().currentIndex),0,'modified arrows stay available to the browser');
   await page.evaluate(()=>{const d=document.createElement('div');d.id='fixtureDialog';d.setAttribute('role','dialog');d.textContent='dialog';document.body.append(d);document.body.focus()});
   await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>qbGetPracticeState().currentIndex),0,'visible dialogs own their keyboard input');
   await page.evaluate(()=>{document.getElementById('fixtureDialog').remove();document.body.focus()});
   await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>qbGetPracticeState().currentIndex===1);
   assert.match(await page.locator('.qtext').textContent(),/q2/);
   const input=await page.evaluateHandle(()=>{const t=document.createElement('textarea');t.id='fixtureDraft';document.body.append(t);t.focus();return t});
   await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>qbGetPracticeState().currentIndex),1,'arrows edit text instead of navigating from ordinary inputs');
   await page.keyboard.press('Shift+Enter');assert.equal(await page.locator('#ans .resultcard').count(),0,'ordinary editors do not submit practice answers');
   await input.dispose();await page.evaluate(()=>{document.getElementById('fixtureDraft').remove();document.body.focus()});
   await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>qbGetPracticeState().currentIndex===0);
   await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>qbGetPracticeState().currentIndex===1);
   await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>qbGetScreen()==='problems');
   await page.locator('#qbPracticeDockV2').waitFor({state:'detached'});
   assert.equal(await page.locator('#qbPracticeDockV2').count(),0,'right on the final question ends practice');
   assert.deepEqual(errors,[]);await page.close()
  }
  {
   const {page,errors}=await boot(browser,[fixture('multi',1,'multiple')]);await focusPage(page);
   await page.evaluate(()=>{const t=document.createElement('textarea');t.id='fixtureChoiceDraft';document.body.append(t);t.focus()});
   await page.keyboard.press('a');assert.equal(await page.locator('.choice.sel').count(),0,'letters type normally in editors');
   await page.evaluate(()=>{document.getElementById('fixtureChoiceDraft').remove();const d=document.createElement('div');d.id='fixtureChoiceDialog';d.setAttribute('role','dialog');d.textContent='dialog';document.body.append(d);document.body.focus()});
   await page.keyboard.press('a');assert.equal(await page.locator('.choice.sel').count(),0,'visible dialogs own letter shortcuts');
   await page.evaluate(()=>{document.getElementById('fixtureChoiceDialog').remove();document.body.focus()});
   const composing=await page.evaluate(()=>{const e=new KeyboardEvent('keydown',{key:'a',isComposing:true,bubbles:true,cancelable:true});document.body.dispatchEvent(e);return e.defaultPrevented});
   assert.equal(composing,false);assert.equal(await page.locator('.choice.sel').count(),0,'IME composition never selects a choice');
   await page.keyboard.press('a');await page.keyboard.press('e');
   assert.deepEqual(await page.locator('.choice.sel').evaluateAll(nodes=>nodes.map(node=>node.dataset.c)),['0','4'],'A and E select two multiple-choice options');
   await page.keyboard.press('a');assert.deepEqual(await page.locator('.choice.sel').evaluateAll(nodes=>nodes.map(node=>node.dataset.c)),['4'],'pressing A again clears only A');
   await page.keyboard.press('e');assert.equal(await page.locator('.choice.sel').count(),0,'pressing E again clears E');
   await page.keyboard.press('f');assert.equal(await page.locator('.choice.sel').count(),0,'keys outside A-E are inert');
   assert.deepEqual(errors,[]);await page.close()
  }
  {
   const {page,errors}=await boot(browser,[fixture('fill',1,'fill_blank')]);await page.waitForSelector('.fbInput');
   const input=page.locator('.fbInput');await input.fill('一行目');await input.press('Enter');await input.type('二行目');
   assert.equal(await input.inputValue(),'一行目\n二行目');assert.equal(await page.locator('#ans .resultcard').count(),0,'plain Enter remains a line break');
   const composing=await input.evaluate(node=>{const e=new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,isComposing:true,bubbles:true,cancelable:true});node.dispatchEvent(e);return e.defaultPrevented});
   assert.equal(composing,false);assert.equal(await page.locator('#ans .resultcard').count(),0,'IME composition is never submitted');
   await input.press('Shift+Enter');await page.waitForSelector('#ans .resultcard.fillblank');
   assert.equal(await input.inputValue(),'一行目\n二行目','Shift+Enter does not insert an extra line break');
   assert.equal(await page.evaluate(()=>__writes.filter(x=>x.table==='attempts').length),1);
   assert.deepEqual(errors,[]);await page.close()
  }
  console.log(name+' PASS practice keyboard shortcuts');
 }finally{await browser.close()}
}
(async()=>{await run(chromium,'Chromium');await run(webkit,'WebKit')})().catch(error=>{console.error(error);process.exitCode=1});
