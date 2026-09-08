'use strict';
// Reuse the synthetic, network-blocked regression fixture without invoking its runner.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const fixturePath=path.join(__dirname,'explanation-format.browser.cjs');
const source=fs.readFileSync(fixturePath,'utf8'),cut=source.lastIndexOf('\n(async()=>{for(');
assert.ok(cut>0,'Regression fixture entry point must remain identifiable');
const fixtureModule={exports:{}};
new Function('require','module','exports','__dirname',source.slice(0,cut)+'\nmodule.exports={setup,openEditor,format,save,popup};')(require,fixtureModule,fixtureModule.exports,__dirname);
const {setup,openEditor,format,save,popup}=fixtureModule.exports;
const root=path.resolve(__dirname,'..');
async function init(browser,options){
  const fixture=await setup(browser,options),p=fixture.page;
  await p.addStyleTag({content:fs.readFileSync(path.join(root,'editor-appearance-v1.css'),'utf8')});
  await p.evaluate(()=>{window.testReadyCount=0;window.addEventListener('qb-question-ready',()=>testReadyCount++)});
  await p.addScriptTag({content:fs.readFileSync(path.join(root,'current-question-identity-v1.js'),'utf8')});
  await p.waitForTimeout(100);return fixture;
}
async function stemEditor(p){await p.locator('.adeStemBtn').click();const ed=p.locator('.adeStemEditor');await ed.locator('[data-qb-format-field="stem"]').waitFor();return ed}
async function run(browser,name){
  let n=0;const pass=s=>{console.log(name+' PASS '+s);n++};
  const {page:p,errors}=await init(browser);let ed=await openEditor(p,'overview');
  const styles=await ed.evaluate(el=>{
    const probe=document.createElement('span');probe.style.color='var(--accent)';probe.style.backgroundColor='var(--accent-soft-strong)';document.body.appendChild(probe);
    const expected={text:getComputedStyle(document.body).color,accent:getComputedStyle(probe).color,marker:getComputedStyle(probe).backgroundColor};probe.remove();
    const data={};for(const b of el.querySelectorAll('.qbFmtTools button')){const label=b.querySelector('.qbFmtToolLabel'),s=getComputedStyle(label);data[b.dataset.qbFormat]={color:s.color,bg:s.backgroundColor,weight:s.fontWeight,line:s.textDecorationLine}}
    return{data,expected};
  });
  for(const key of ['bold','underline','strike','marker','clear'])assert.equal(styles.data[key].color,styles.expected.text,key+' neutral label');
  assert.equal(styles.data.accent.color,styles.expected.accent);assert.ok(Number(styles.data.bold.weight)>Number(styles.data.clear.weight));assert.equal(styles.data.underline.line,'underline');assert.equal(styles.data.strike.line,'line-through');assert.equal(styles.data.marker.bg,styles.expected.marker);pass('toolbar labels visually demonstrate each style; only accent text uses theme color');
  await ed.locator('.oeiBox').waitFor();
  const colors=await ed.evaluate(el=>{const probe=document.createElement('span');probe.style.color='var(--accent)';probe.style.backgroundColor='var(--card)';document.body.appendChild(probe);const accent=getComputedStyle(probe).color,card=getComputedStyle(probe).backgroundColor;probe.style.backgroundColor='var(--bg)';const bg=getComputedStyle(probe).backgroundColor;probe.remove();return{accent,card,bg,panel:getComputedStyle(el).backgroundColor,save:getComputedStyle(el.querySelector('.adeSave')).backgroundColor,cancel:getComputedStyle(el.querySelector('.adeCancel')).color,text:getComputedStyle(document.body).color,images:getComputedStyle(el.querySelector('.oeiBox')).backgroundColor,actions:[...el.querySelectorAll('.oeiBtn')].map(x=>getComputedStyle(x).color)}});
  assert.equal(colors.panel,colors.bg);assert.equal(colors.save,colors.accent);assert.equal(colors.cancel,colors.text);assert.equal(colors.images,colors.card);assert.ok(colors.actions.length>1);assert.ok(colors.actions.every(x=>x===colors.accent));pass('save, cancel, image controls and panels use theme or neutral colors');
  await format(ed,'explanation_overview','キーワード','marker');await save(ed);await popup(p,'.qbMediaImg');await popup(p,'.qbNoteImageGrid img');pass('visual button changes preserve formatting saves and image popups');
  await p.evaluate(()=>{testDB.questions[0].stem='  検証用の問題 [A]\n2つ選べ。  ';testQ.stem=testDB.questions[0].stem;document.querySelector('.qtext').textContent=testQ.stem;testDB.question_occurrences=[{id:'o1',exact_stem:testQ.stem,official_answer:{A:'模範解答'}}];window.testOriginalOccurrence=JSON.stringify(testDB.question_occurrences);window.testImageNode=document.querySelector('.qbMediaImg');window.testNoteNode=document.querySelector('.qbPersonal');window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:'q1',type:'text',field:'stem'}}))});
  ed=await stemEditor(p);for(const k of ['bold','underline','strike','marker','accent'])await format(ed,'stem','2つ選べ',k);
  assert.equal(await ed.locator('.qbFmtPreview').textContent(),await ed.locator('textarea').inputValue());await ed.locator('.adeCancel').click();assert.equal(await p.evaluate(()=>testDB.questions[0].stem_formatting??null),null);pass('stem preview supports all five styles and cancel makes no data change');
  ed=await stemEditor(p);await format(ed,'stem','2つ選べ','underline');await format(ed,'stem','検証用','marker');await save(ed);await p.locator('.qtext .qbFmt-underline').waitFor();
  const stored=await p.evaluate(()=>({stem:testDB.questions[0].stem,format:testDB.questions[0].stem_formatting,explain:testDB.questions[0].explanation_formatting,occurrence:JSON.stringify(testDB.question_occurrences),oldOccurrence:testOriginalOccurrence,keepNodes:document.querySelector('.qbMediaImg')===testImageNode&&document.querySelector('.qbPersonal')===testNoteNode,write:testWrites.filter(x=>x.table==='questions').at(-1)}));
  assert.equal(stored.stem,'  検証用の問題 [A]\n2つ選べ。  ');assert.equal(stored.format.source_text,stored.stem);assert.equal(stored.format.origin,'admin_display');assert.ok(stored.explain.explanation_overview);assert.equal(stored.occurrence,stored.oldOccurrence);assert.equal(stored.keepNodes,true);assert.deepEqual(Object.keys(stored.write.p).sort(),['stem','stem_formatting']);pass('stem metadata is separate; exact text including whitespace, occurrence, explanation, media and notes are preserved');
  await popup(p,'.qbMediaImg');await popup(p,'.qbNoteImageGrid img');ed=await stemEditor(p);assert.equal(await ed.locator('.qbFmtPreview .qbFmt-underline').textContent(),'2つ選べ');await format(ed,'stem','2つ選べ','clear');await ed.locator('.adeCancel').click();assert.equal(await p.locator('.qtext .qbFmt-underline').textContent(),'2つ選べ');pass('stem formatting reloads, clears reversibly and keeps image interaction');
  const before=await p.evaluate(()=>testReadyCount);await p.waitForTimeout(400);assert.equal(await p.evaluate(()=>testReadyCount),before);pass('formatted spans and editor interaction do not create ready-event loops');
  ed=await stemEditor(p);await p.evaluate(()=>{testDB.questions[0].stem='別担当が更新した問題文'});await ed.locator('.adeSave').click();await ed.locator('.adeStatus').filter({hasText:'別の更新'}).waitFor();assert.equal(await ed.locator('.adeSave').isEnabled(),true);await ed.locator('.adeCancel').click();await p.evaluate(()=>{testDB.questions[0].stem=testQ.stem});pass('concurrent stem changes are not overwritten');
  const seed=await p.evaluate(()=>testDB);assert.deepEqual(errors,[]);await p.close();
  const ordinary=await init(browser,{role:'user',db:seed}),up=ordinary.page;
  await up.evaluate(()=>{document.getElementById('ans').replaceChildren();window.dispatchEvent(new CustomEvent('qb-screen-change'))});await up.locator('.qtext .qbFmt-underline').waitFor();assert.equal(await up.locator('.adeStemBtn').count(),0);assert.equal(await up.locator('#ans .resultcard').count(),0);pass('saved stem styles are visible to general users before revealing answers');
  // A new asynchronously loaded question: the real identity notifier, not a synthetic formatting event, must trigger the display.
  await up.evaluate(()=>{
    const old=testQ,stem='次の設問です。誤りを選べ。';const next={...old,id:'q2',stem,stem_formatting:{version:1,source_text:stem,origin:'admin_display',ranges:[{start:8,end:13,kind:'underline'}]}};
    testDB.questions.push({...next,choices:undefined});window.testQ=next;window.QB_QUESTIONS=[next];document.getElementById('view').innerHTML='<div class="card"><div class="qtext"></div><div id="ans"></div></div>';document.querySelector('.qtext').textContent=stem;
  });
  await up.locator('.qtext .qbFmt-underline').waitFor();assert.equal(await up.locator('.qtext').textContent(),'次の設問です。誤りを選べ。');assert.equal(await up.locator('.qtext .qbFmt-marker').count(),0);pass('asynchronously loaded questions receive their own marks without stale previous-question styling');
  assert.deepEqual(ordinary.errors,[]);await up.close();
  const fill=await init(browser,{mode:'fill_blank'});ed=await stemEditor(fill.page);await format(ed,'stem','検証用','underline');await save(ed);await fill.page.locator('.qtext .qbFmt-underline').waitFor();assert.equal(await fill.page.evaluate(()=>testDB.attempts[0].is_correct),null);assert.equal(await fill.page.evaluate(()=>testDB.attempts[0].response_payload.A),'自分の入力');await popup(fill.page,'.qbMediaImg');assert.deepEqual(fill.errors,[]);await fill.page.close();pass('fill-blank formatting keeps input, non-automatic grading and image popup');
  console.log(name+' '+n+' editor/stem checks passed');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
