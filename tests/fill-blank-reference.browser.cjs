'use strict';
// Synthetic fixtures only. No production question data, users, or credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'qb-app.js'), 'utf8');
const bootLine = "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();";
assert.equal(core.split(bootLine).length, 2, 'core test boot anchor must be unique');
// Expose fixture setup only in this test's in-memory copy; exercise real rendering,
// event handlers, the fill-blank module, history writes, and the practice dock.
const instrumented = core.replace(bootLine, `
window.pq=current;
window.__fixtureOpen=raw=>{
 sb=window.qbSupabase;user={id:'fixture-user'};
 subject={id:'fixture-subject',name:'Fixture subject'};
 questions=[normalizeDetailQuestion(raw)];window.QB_QUESTIONS=questions;
 practice=[raw.id];pi=0;screen='practice';submitted=false;reviewOnly=false;
 sel=new Set();qstate={};sessionId=null;renderPractice();emit();
};
`);
const scripts = ['fill-blank-v2.js', 'qb-practice-dock-v2.js'];
function fixture(mode='fill_blank', withChoices=true, fields=[{key:'A',label:'順番'}]) {
  return {
    id:'fixture-question', canonical_key:'fixture-only', stem:'Fixture prompt',
    answer_mode:mode, instruction:null, study_order:1, answer_fields:fields,
    explanation_overview:null, medical_verification_note:null,
    choices:withChoices?[
      {id:'fixture-choice-a',choice_key:'a',choice_text:'First <tag> & text',is_correct:mode!=='fill_blank',sort_order:1},
      {id:'fixture-choice-b',choice_key:'b',choice_text:'Second step',is_correct:mode==='multiple',sort_order:2},
      {id:'fixture-choice-c',choice_key:'c',choice_text:'Third step',is_correct:false,sort_order:3}
    ]:[],
    question_occurrences:[{id:'fixture-occurrence',academic_year:2024,exam_type:'本試',original_question_number:'1',official_answer:mode==='fill_blank'?{A:'b→a→c',B:'second field'}:['a']}]
  };
}
async function createPage(browser, raw, admin=false) {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.setDefaultTimeout(10000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{errors.push(d.message());await d.dismiss()});
  // Block external requests: every database interaction is an in-memory mock.
  await page.route('**/*',route=>route.abort());
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>.hidden{display:none!important}</style></head><body><main class="app"><div id="crumb"></div><button id="home"></button><div id="view"></div></main><div id="modal"><button data-mode="ordered"></button><button id="cancel"></button></div></body></html>');
  await page.evaluate(isAdmin=>{
    window.__writes=[];window.__states={};window.__admin=isAdmin;
    window.qbSupabase={
      auth:{getUser:async()=>({data:{user:{id:'fixture-user'}},error:null})},
      from(table){
        const filters={};
        const api={
          select(){return api},eq(k,v){filters[k]=v;return api},in(){return api},
          order(){return api},limit(){return api},
          insert(payload){record('insert',payload);return api},
          upsert(payload){record('upsert',payload);return api},
          update(payload){record('update',payload);return api},
          single(){return Promise.resolve(result())},
          maybeSingle(){return Promise.resolve(result())},
          then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}
        };
        function record(op,payload){
          window.__writes.push({table,op,payload:structuredClone(payload)});
          if(table==='user_question_state')window.__states[payload.question_id]=structuredClone(payload);
        }
        function result(){
          if(table==='profiles')return {data:{role:window.__admin?'admin':'user'},error:null};
          if(table==='user_question_state')return {data:window.__states[filters.question_id]||null,error:null};
          if(table==='practice_sessions')return {data:{id:'fixture-session'},error:null};
          return {data:null,error:null};
        }
        return api;
      }
    };
  },admin);
  await page.addScriptTag({content:instrumented});
  for(const file of scripts)await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(q=>window.__fixtureOpen(q),raw);
  await page.waitForSelector('#qbPracticeDockV2 .qbpdMain');
  if(raw.answer_mode==='fill_blank')await page.waitForSelector('.fbInput');
  return {page,errors};
}
async function writes(page,table){return page.evaluate(t=>window.__writes.filter(x=>x.table===t),table)}
async function mainButton(page,label){
  const btn=page.locator('#qbPracticeDockV2 .qbpdMain');
  await page.waitForFunction(text=>document.querySelector('#qbPracticeDockV2 .qbpdMain')?.textContent.includes(text),label);
  return btn;
}
async function run(browserType,name){
  const browser=await browserType.launch({headless:true});
  let checks=0;
  try{
    {
      const {page,errors}=await createPage(browser,fixture());
      assert.equal(await page.locator('.fbReferenceChoice').count(),3);
      assert.equal(await page.locator('[data-c]').count(),0,'reference options must never be selectable buttons');
      assert.deepEqual(await page.locator('.fbReferenceChoice').allTextContents(),['a. First <tag> & text','b. Second step','c. Third step']);
      assert.equal(await page.locator('.fbReferenceChoices tag').count(),0,'source option text must be escaped');
      assert.equal(await page.locator('.fbInput').count(),1);
      assert.equal(await page.locator('.fbInput').evaluate(el=>el.tagName),'TEXTAREA');
      await page.locator('.fbReferenceChoice').first().click();
      assert.equal((await writes(page,'attempts')).length,0);
      assert.equal(await page.locator('.choice.sel').count(),0);
      const answerInput=page.locator('.fbInput'),shortHeight=(await answerInput.boundingBox()).height;
      await answerInput.fill('b→a');await answerInput.press('End');await answerInput.press('Enter');await answerInput.type('c');
      await page.waitForFunction(h=>document.querySelector('.fbInput').getBoundingClientRect().height>h,shortHeight);
      await (await mainButton(page,'解答する')).click();
      await page.waitForSelector('#ans .resultcard.fillblank');
      const attempts=await writes(page,'attempts');
      assert.equal(attempts.length,1);
      assert.equal(attempts[0].payload.is_correct,null,'short answers are never automatically marked wrong');
      assert.deepEqual(attempts[0].payload.selected_choice_keys,[]);
      assert.deepEqual(attempts[0].payload.response_payload,{A:'b→a\nc'});
      assert.equal(await page.locator('#ans .fbAnswerLine strong').first().textContent(),'b→a\nc');
      assert.equal(attempts[0].payload.occurrence_id,'fixture-occurrence');
      const state=(await writes(page,'user_question_state')).at(-1).payload;
      assert.equal(state.has_answered,true);assert.equal(state.last_is_correct,null);
      assert.equal(await page.locator('.fbReferenceChoice').count(),3,'reference choices remain visible after answering');
      assert.equal(await page.locator('#ans .resultcard.bad').count(),0);
      await (await mainButton(page,'もう一度解く')).click();
      assert.equal(await page.locator('.fbInput').inputValue(),'');
      assert.equal(await page.locator('#ans').isVisible(),false);
      assert.equal(await page.locator('.fbReferenceChoice').count(),3);
      assert.deepEqual(errors,[]);await page.close();checks++;
    }
    {
      const {page,errors}=await createPage(browser,fixture());
      await (await mainButton(page,'解説を見る')).click();
      await page.waitForSelector('#ans .resultcard.review');
      assert.equal((await writes(page,'attempts')).length,0);
      const state=(await writes(page,'user_question_state')).at(-1).payload;
      assert.equal(state.has_answered,false);assert.equal(state.last_is_correct,null);
      assert.equal(state.has_viewed_explanation,true);
      await (await mainButton(page,'もう一度解く')).click();
      assert.equal(await page.locator('#ans').isVisible(),false);
      assert.equal(await page.locator('.fbInput').inputValue(),'');
      assert.deepEqual(errors,[]);await page.close();checks++;
    }
    {
      const {page,errors}=await createPage(browser,fixture('fill_blank',false,[{key:'A',label:'A'},{key:'B',label:'B'}]),true);
      assert.equal(await page.locator('.fbReferenceChoices').count(),0);
      assert.equal(await page.locator('.fbInput').count(),2);
      await page.waitForSelector('.fbAdminEdit');
      await page.locator('.fbInput').nth(0).fill('first');
      await (await mainButton(page,'解答する')).click();
      assert.equal((await writes(page,'attempts')).length,0,'partial answers must not be submitted');
      await page.locator('.fbInput').nth(1).fill('second');
      await (await mainButton(page,'解答する')).click();
      await page.waitForSelector('#ans .resultcard.fillblank');
      assert.deepEqual((await writes(page,'attempts'))[0].payload.response_payload,{A:'first',B:'second'});
      assert.deepEqual(errors,[]);await page.close();checks++;
    }
    for(const mode of ['single','multiple']){
      const {page,errors}=await createPage(browser,fixture(mode));
      assert.equal(await page.locator('.fbInput').count(),0);
      assert.equal(await page.locator('.fbReferenceChoices').count(),0);
      assert.equal(await page.locator('button[data-c]').count(),3);
      if(mode==='single')await page.locator('[data-c="1"]').click();
      await page.locator('[data-c="0"]').click();
      if(mode==='multiple')await page.locator('[data-c="1"]').click();
      assert.equal(await page.locator('.choice.sel').count(),mode==='multiple'?2:1);
      await (await mainButton(page,'解答する')).click();
      await page.waitForSelector('#ans .resultcard.ok');
      await page.waitForFunction(()=>window.__writes.some(x=>x.table==='attempts'));
      const attempt=(await writes(page,'attempts'))[0].payload;
      assert.equal(attempt.is_correct,true);
      assert.deepEqual(attempt.selected_choice_keys,mode==='multiple'?['a','b']:['a']);
      await (await mainButton(page,'もう一度解く')).click();
      assert.equal(await page.locator('.choice.sel').count(),0);
      assert.equal(await page.locator('#ans').isVisible(),false);
      assert.deepEqual(errors,[]);await page.close();checks++;
    }
    console.log(`${name}: ${checks} reference/short-answer/MCQ regression scenarios passed`);
  }finally{await browser.close()}
}
(async()=>{await run(chromium,'Chromium');await run(webkit,'WebKit')})().catch(e=>{console.error(e);process.exitCode=1});
