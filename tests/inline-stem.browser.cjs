'use strict';
// Synthetic DB/Auth/Storage only. Reuse existing fixture, add real identity,
// question-image and navigation scripts to cover draft interactions.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const file=path.join(__dirname,'inline-overview.browser.cjs'),source=fs.readFileSync(file,'utf8');
const end=source.lastIndexOf('(async()=>{for(const [name,type]');assert.ok(end>0);
const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;
mod._compile(source.slice(0,end)+'\nmodule.exports={boot,select,word,command,cancel,save,writes};',file);
const {boot:baseBoot,select,word,command,cancel,save,writes}=mod.exports;
async function boot(browser,options={}){
  const ctx=await baseBoot(browser,options),p=ctx.page;
  await p.evaluate(({seed,mode})=>{
    if(!seed){testDB.questions[0].stem=' \n検証用の問題 [A]。2つ選べ。🙂  \n';testDB.questions[0].stem_formatting=null;testQ.stem=testDB.questions[0].stem}
    testDB.question_occurrences=testDB.question_occurrences||[{id:'o1',question_id:'q1',exact_stem:'年度別原文 [A]',official_answer:{A:'模範解答'}}];
    if(!testDB.question_images.some(x=>x.placement==='question'))testDB.question_images.push({id:'stem-image',question_id:'q1',placement:'question',choice_id:null,image_path:'stem-image',sort_order:0});
    const card=document.querySelector('#view > .card');card.querySelector(':scope > .qtext').textContent=testQ.stem;
    if(mode!=='fill_blank'){
      const choices=document.createElement('div');choices.className='choices';
      testQ.choices.forEach(c=>{const b=document.createElement('button');b.className='choice';b.textContent=c.choice_key+'. '+c.choice_text;b.onclick=()=>b.classList.toggle('sel');choices.append(b)});
      card.insertBefore(choices,card.querySelector('#ans'));
    }
    window.testIndex=0;window.qbGetPracticeState=()=>({questionIds:['q1','q2'],currentIndex:window.testIndex});
    window.testReadyCount=0;window.addEventListener('qb-question-ready',()=>window.testReadyCount++);
    window.testAnswerCount=0;const answer=document.getElementById('answer');
    if(!answer){const b=document.createElement('button');b.id='answer';b.onclick=()=>window.testAnswerCount++;card.append(b)}
  },{seed:!!options.db,mode:options.mode||'single'});
  for(const script of ['current-question-identity-v1.js','question-stem-images-v2.js','qb-practice-dock-v2.js'])await p.addScriptTag({content:fs.readFileSync(path.join(root,script),'utf8')});
  await p.locator('.qsiImg').first().waitFor();await p.waitForTimeout(200);return ctx;
}
async function open(p){await p.locator('.adeStemBtn').click();await p.locator('.qtext .qbInlineRich[contenteditable="true"]').waitFor();return p.locator('.qtext .qbInlineRich')}
async function popup(p,selector){await p.locator(selector).first().click();await p.locator('#qbImageLightbox').waitFor();await p.locator('.qbImageLightboxClose').click();await p.locator('#qbImageLightbox').waitFor({state:'detached'})}
async function run(browser,name){
  let passed=0;const pass=s=>{passed++;console.log(name+' PASS '+s)};
  let ctx=await boot(browser),p=ctx.page;
  const raw=await p.evaluate(()=>testDB.questions[0].stem);
  const initial=await p.evaluate(()=>({occ:testDB.question_occurrences,choices:testDB.choices,overview:testDB.questions[0].explanation_overview,formats:testDB.questions[0].explanation_formatting,attempts:testDB.attempts}));
  await p.evaluate(()=>{window.beforeStem=document.querySelector('#view > .card > .qtext');window.beforeStemImage=document.querySelector('.qsiImg');window.beforeNotes=[...document.querySelectorAll('.qbPersonal')];document.getElementById('ans').classList.add('hidden')});
  await open(p);assert.equal(await p.locator('.qbInlineRich').textContent(),raw);assert.equal(await p.evaluate(()=>document.querySelector('#view > .card > .qtext')===beforeStem),true);assert.equal(await p.locator('.adeStemEditor,.qbFmtPreview').count(),0);pass('question stem edits in its existing location before answer reveal without a duplicate form');
  for(const kind of ['bold','underline','strike','marker','accent']){await word(p,'2つ選べ');await command(p,kind)}
  for(const kind of ['bold','underline','strike','marker','accent'])assert.equal(await p.locator('.qbInlineRich .qbFmt-'+kind).first().textContent(),'2つ選べ');
  assert.equal(await writes(p),0);await cancel(p);assert.equal(await p.evaluate(()=>beforeStem.textContent),raw);assert.equal(await p.evaluate(()=>testDB.questions[0].stem_formatting),null);pass('all five styles are local drafts and cancel restores original stem and formatting');
  await open(p);await word(p,'2つ選べ');await p.keyboard.press('Meta+b');await p.keyboard.press('Control+u');await p.keyboard.press('Meta+Shift+s');await p.keyboard.press('Control+Shift+m');await p.keyboard.press('Meta+Shift+a');assert.equal(await writes(p),0);
  await p.keyboard.press('Meta+s');await p.locator('.qbInlineRich').waitFor({state:'detached'});await p.waitForTimeout(200);
  assert.equal(await writes(p),1);assert.equal(await p.evaluate(()=>testDB.questions[0].stem),raw);assert.equal(await p.evaluate(()=>testDB.questions[0].stem_formatting.ranges.length),5);assert.equal(await p.evaluate(()=>testDB.questions[0].stem_formatting.origin),'admin_display');
  const payload=await p.evaluate(()=>testWrites.find(x=>x.table==='questions').p);assert.deepEqual(Object.keys(payload).sort(),['stem','stem_formatting']);pass('shortcuts match toolbar and only explicit save writes stem plus separate display metadata');
  assert.deepEqual(await p.evaluate(()=>({occ:testDB.question_occurrences,choices:testDB.choices,overview:testDB.questions[0].explanation_overview,formats:testDB.questions[0].explanation_formatting,attempts:testDB.attempts})),initial);
  assert.equal(await p.evaluate(()=>document.querySelector('.qsiImg')===beforeStemImage&&beforeNotes.every(n=>n.isConnected)),true);pass('occurrence source, official answer, choices, overview, attempts, images and private-note DOM are unchanged');
  await open(p);await word(p,'2つ選べ');await command(p,'clear');assert.equal(await p.locator('.qbInlineRich [class^="qbFmt-"]').count(),0);await p.keyboard.press('Control+z');assert.equal(await p.locator('.qbInlineRich .qbFmt-marker').count(),1);await cancel(p);pass('saved marks reload and clear/undo remain reversible');
  await open(p);const count=await p.evaluate(()=>testReadyCount);await select(p,0,0);await p.keyboard.insertText('下書き ');await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>qbCurrentQuestionId()),'q1');assert.equal(await p.evaluate(()=>testQ.stem),raw);assert.equal(await p.evaluate(()=>testDB.questions[0].stem),raw);assert.equal(await p.evaluate(()=>testReadyCount),count);
  assert.equal(await p.evaluate(()=>document.querySelector('.qsiImg')===beforeStemImage),true);pass('real identity stays q1 while typing without mutating loaded data or emitting question-ready loops');
  const draft=await p.locator('.qbInlineRich').textContent();await p.evaluate(t=>{QB_QUESTIONS.push({...testQ,id:'q2',stem:t});},draft);
  assert.equal(await p.evaluate(()=>qbCurrentQuestionId()),'q1');await popup(p,'.qsiImg');assert.equal(await p.locator('.qbInlineRich').textContent(),draft);pass('draft matching another question cannot reassign question identity or image ownership');
  await p.locator('.qbInlineImageToggle').click();const beforeImages=await p.evaluate(()=>testDB.question_images.length),beforeWrites=await writes(p);
  await p.locator('.qsiHost .qsiEditor input[type=file]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZuQAAAAASUVORK5CYII=','base64')});
  await p.waitForFunction(n=>testDB.question_images.length===n+1,beforeImages);await p.waitForTimeout(200);assert.equal(await p.locator('.qbInlineRich').textContent(),draft);assert.equal(await writes(p),beforeWrites);
  const added=await p.evaluate(()=>testDB.question_images.at(-1));assert.equal(added.question_id,'q1');assert.equal(added.placement,'question');await cancel(p);assert.equal(await p.evaluate(()=>testDB.question_images.length),beforeImages+1);pass('existing question-image upload remains separate, targets q1 and survives text cancellation');
  await p.evaluate(()=>document.getElementById('ans').classList.remove('hidden'));await open(p);await select(p,0,0);await p.keyboard.insertText('メモとは別 ');
  const note=p.locator('.qbPersonal').first();await note.locator('.qbPencil').click();await note.locator('textarea').fill('独立した個人メモ');await note.locator('.qbNoteSave').click();await p.waitForFunction(()=>testDB.user_notes[0].note_text==='独立した個人メモ');await popup(p,'.qbNoteImageGrid img');assert.ok((await p.locator('.qbInlineRich').textContent()).startsWith('メモとは別'));await cancel(p);pass('private-note saving and private-image popup do not reset an unsaved stem');
  await open(p);await select(p,0,raw.length);await p.keyboard.press('Backspace');assert.equal(await p.evaluate(()=>qbCurrentQuestionId()),'q1');await p.locator('.qbInlineSave').click();await p.waitForFunction(()=>document.querySelector('.qbInlineStatus').textContent.includes('空の問題文'));assert.equal(await p.locator('.qbInlineRich').getAttribute('contenteditable'),'true');assert.equal(await p.evaluate(()=>testDB.questions[0].stem),raw);await cancel(p);pass('empty drafts keep identity but cannot erase a question on save');
  await open(p);await select(p,0,0);await p.keyboard.insertText('未保存 ');p.once('dialog',d=>d.dismiss());await p.locator('#qbPracticeDockV2 [data-a="next"]').click();assert.equal(await p.evaluate(()=>testNavigation),0);assert.equal(await p.locator('.qbInlineRich').count(),1);
  p.once('dialog',d=>d.accept());await p.locator('#qbPracticeDockV2 [data-a="next"]').click();assert.equal(await p.evaluate(()=>testNavigation),1);assert.equal(await p.locator('.qbInlineRich').count(),0);pass('actual fixed menu navigation asks before discarding an unsaved stem');
  await open(p);await select(p,0,0);await p.keyboard.insertText('切替前 ');p.once('dialog',d=>d.dismiss());await p.locator('[data-ade-v2="overview"]').click();assert.equal(await p.locator('.qtext .qbInlineRich').count(),1);
  p.once('dialog',d=>d.accept());await p.locator('[data-ade-v2="overview"]').click();await p.locator('#ans .qbInlineRich').waitFor();await cancel(p);pass('switching between stem and overview uses the same editor with discard protection');
  await open(p);await select(p,raw.length,raw.length);await p.keyboard.press('Enter');await p.keyboard.insertText('日本語  <tag>🙂');const appended=raw+'\n日本語  <tag>🙂';await save(p);assert.equal(await p.evaluate(()=>testDB.questions[0].stem),appended);assert.equal(await p.evaluate(()=>qbCurrentQuestionId()),'q1');assert.equal(await p.locator('.qtext .qbFmt-underline').textContent(),'2つ選べ');pass('saving changed stem preserves whitespace, emoji, newline and mark positions and refreshes identity');
  await open(p);await word(p,'2つ選べ');await command(p,'underline');const backup=await p.evaluate(()=>JSON.parse(JSON.stringify(testDB.questions[0].stem_formatting)));await p.evaluate(()=>{testDB.questions[0].stem_formatting={version:1,source_text:testDB.questions[0].stem,ranges:[{kind:'bold',start:0,end:1}],origin:'admin_display'}});await p.locator('.qbInlineSave').click();await p.waitForFunction(()=>document.querySelector('.qbInlineStatus').textContent.includes('別の更新'));await cancel(p);await p.evaluate(b=>testDB.questions[0].stem_formatting=b,backup);pass('concurrent formatting-only updates cannot be overwritten');
  await open(p);await select(p,0,0);await p.keyboard.insertText('失敗しても保持 ');await p.evaluate(()=>testFailSave=true);await p.locator('.qbInlineSave').click();await p.waitForFunction(()=>document.querySelector('.qbInlineStatus').textContent.includes('fixture save failure'));assert.ok((await p.locator('.qbInlineRich').textContent()).startsWith('失敗しても保持'));await p.evaluate(()=>testFailSave=false);await save(p);pass('failed save retains editable draft and can be retried');
  await open(p);await select(p,0,0);await p.keyboard.insertText('競合 ');const textBackup=await p.evaluate(()=>testDB.questions[0].stem);await p.evaluate(()=>testDB.questions[0].stem='他担当が変更');await p.locator('.qbInlineSave').click();await p.waitForFunction(()=>document.querySelector('.qbInlineStatus').textContent.includes('別の更新'));assert.equal(await p.evaluate(()=>testDB.questions[0].stem),'他担当が変更');await cancel(p);await p.evaluate(t=>testDB.questions[0].stem=t,textBackup);pass('concurrent source-text updates remain intact on conflict');
  const data=await p.evaluate(()=>testDB);assert.deepEqual(ctx.errors,[]);await p.close();
  ctx=await boot(browser,{role:'user',db:data});p=ctx.page;await p.evaluate(()=>document.getElementById('ans').classList.add('hidden'));await p.locator('.qtext .qbFmt-underline').waitFor();assert.equal(await p.locator('.adeStemBtn,.qbInlineRich').count(),0);await popup(p,'.qsiImg');assert.deepEqual(ctx.errors,[]);await p.close();pass('general user reload shows saved formatting before answer reveal without editor controls');
  ctx=await boot(browser,{mode:'fill_blank'});p=ctx.page;await p.locator('.fbInput').fill('解答の入力途中');await p.evaluate(()=>{window.beforeInput=document.querySelector('.fbInput');window.beforeAttempts=JSON.stringify(testDB.attempts);window.beforeFields=JSON.stringify(testQ.answer_fields)});await open(p);await word(p,'2つ選べ');await command(p,'marker');await save(p);
  assert.equal(await p.locator('.fbInput').inputValue(),'解答の入力途中');assert.equal(await p.evaluate(()=>document.querySelector('.fbInput')===beforeInput&&JSON.stringify(testDB.attempts)===beforeAttempts&&JSON.stringify(testQ.answer_fields)===beforeFields),true);assert.equal(await p.evaluate(()=>testDB.attempts[0].is_correct),null);await popup(p,'.qsiImg');assert.deepEqual(ctx.errors,[]);await p.close();pass('fill-blank draft inputs, answer-field mapping and non-automatic grading remain unchanged');
  console.log(name+' '+passed+' inline-stem checks passed');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
