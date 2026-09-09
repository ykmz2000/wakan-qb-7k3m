'use strict';
// Exercise the real shared editor with synthetic DB/Auth/Storage and blocked network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),fixtureFile=path.join(__dirname,'explanation-format.browser.cjs');
const source=fs.readFileSync(fixtureFile,'utf8'),end=source.lastIndexOf('(async()=>{for(const [name,type]');
assert.ok(end>0);
const fixture=new Module(fixtureFile,module);fixture.filename=fixtureFile;fixture.paths=module.paths;
fixture._compile(source.slice(0,end)+'\nmodule.exports={setup,popup};',fixtureFile);
const {setup}=fixture.exports;
async function open(p){
  await p.locator('[data-ade-v2="choice-c1"]').click();
  const ed=p.locator('[data-ade-v2-editor="choice-c1"]');
  await ed.locator('.qbInlineRich').nth(3).waitFor();return ed;
}
async function select(field,start,end){
  await field.locator('.qbInlineRich').evaluate((root,[a,b])=>{
    root.focus();const nodes=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while(n=walker.nextNode())nodes.push(n);
    const point=pos=>{let offset=0;for(const node of nodes){if(pos<=offset+node.length)return[node,pos-offset];offset+=node.length}return[root,root.childNodes.length]};
    const [an,ao]=point(a),[bn,bo]=point(b),r=document.createRange();r.setStart(an,ao);r.setEnd(bn,bo);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(r);document.dispatchEvent(new Event('selectionchange'));
  },[start,end]);
  await field.page().waitForTimeout(60);
}
async function run(browser,name){
  const {page:p,errors}=await setup(browser);
  await p.addStyleTag({content:fs.readFileSync(path.join(root,'editor-appearance-v1.css'),'utf8')});
  await p.addScriptTag({content:fs.readFileSync(path.join(root,'inline-overview-v1.js'),'utf8')});
  const before=await p.evaluate(()=>({choice:structuredClone(testDB.choices[0]),attempts:structuredClone(testDB.attempts)}));
  const row=p.locator('#ans .exp').first(),note=row.locator(':scope > .qbPersonal');
  await note.locator('.qbPencil').click();await note.locator('textarea').fill('保存前の個人メモ');
  await row.evaluate(el=>{
    window.choiceNote=el.querySelector('.qbPersonal');window.choiceMedia=el.querySelector('.qbMediaHostV2');
    el.querySelectorAll('.qbChoiceDetail').forEach(n=>n.remove());
    window.dispatchEvent(new Event('qb-screen-change'));
  });
  await row.locator('.qbChoiceDistinction').waitFor();
  assert.equal(await row.evaluate(el=>el.lastElementChild===choiceNote&&el.querySelector('.qbMediaHostV2')===choiceMedia),true);
  assert.equal(await note.locator('textarea').inputValue(),'保存前の個人メモ');
  let ed=await open(p);
  assert.equal(await row.evaluate(el=>el.lastElementChild===choiceNote),true);
  assert.equal(await ed.evaluate(el=>el.classList.contains('qbChoiceInPlace')&&getComputedStyle(el).borderTopWidth==='0px'),true,'no detached editor panel');
  assert.equal(await row.locator(':scope > .line,:scope > .qbChoiceDetail').count(),0,'displayed text moves into its edit position without duplicate paragraphs');
  assert.equal(await row.evaluate(el=>el.querySelector('.qbMediaHostV2')===choiceMedia),true);
  assert.equal(await ed.evaluate(el=>el.getBoundingClientRect().right<=el.closest('.exp').getBoundingClientRect().right+1),true,'inline editor fits the existing row');
  assert.equal(await ed.locator('.qbInlineTools').count(),4);
  assert.equal(await ed.locator('.qbFmtPreview,textarea:visible').count(),0);
  let field=ed.locator('[data-qb-format-field="explanation"]');
  await select(field,0,2);
  for(const key of ['Meta+b','Control+u','Meta+Shift+s','Control+Shift+m','Meta+Shift+a'])await p.keyboard.press(key);
  for(const kind of ['bold','underline','strike','marker','accent'])assert.equal(await field.locator('.qbFmt-'+kind).textContent(),before.choice.explanation.slice(0,2));
  assert.equal(await p.evaluate(()=>testWrites.filter(x=>x.table==='choices').length),0);
  await field.locator('[data-qb-inline-format="clear"]').click();
  assert.equal(await field.locator('.qbInlineRich [class^="qbFmt-"]').count(),0);
  await p.keyboard.press('Control+z');assert.equal(await field.locator('.qbFmt-marker').count(),1);
  await p.keyboard.press('Control+Shift+z');assert.equal(await field.locator('.qbFmt-marker').count(),0);
  await ed.locator('.adeCancel').click();assert.deepEqual(await p.evaluate(()=>testDB.choices[0]),before.choice);
  assert.equal(await row.locator(':scope > .line').textContent(),before.choice.explanation);
  assert.equal(await row.locator(':scope > .qbChoiceDetail').count(),3);
  console.log(name+' PASS choice toolbar/shortcuts/undo/cancel; late details keep existing note and draft last');
  ed=await open(p);
  for(const key of ['explanation','correction_text','correct_for_other_context','examiner_distinction']){
    field=ed.locator('[data-qb-format-field="'+key+'"]');await select(field,0,2);
    await p.keyboard.press('Control+Shift+m');
  }
  const text=await field.locator('.qbInlineRich').textContent();await select(field,text.length,text.length);
  await p.keyboard.press('Enter');await p.keyboard.insertText('追記🙂');await p.keyboard.press('Control+s');await ed.waitFor({state:'detached'});
  const saved=await p.evaluate(()=>testDB.choices[0]);
  assert.equal(saved.choice_text,before.choice.choice_text);assert.equal(saved.is_correct,before.choice.is_correct);
  assert.equal(saved.examiner_distinction,before.choice.examiner_distinction+'\n追記🙂');
  for(const key of ['explanation','correction_text','correct_for_other_context','examiner_distinction'])assert.equal(saved.explanation_formatting[key].ranges[0].kind,'marker');
  await p.waitForFunction(()=>document.querySelector('.qbChoiceDistinction')?.textContent.includes('追記🙂'));
  assert.equal(await row.evaluate(el=>el.lastElementChild===choiceNote),true);
  ed=await open(p);assert.equal(await ed.locator('.qbInlineRich .qbFmt-marker').count(),4);
  await ed.locator('.adeCancel').click();
  console.log(name+' PASS all four fields persist text and formatting, reload, and immediately update displayed details');
  await note.locator('.qbNoteSave').click();
  await p.waitForFunction(()=>testDB.user_notes.some(n=>n.choice_id==='c1'&&n.note_text==='保存前の個人メモ'));
  ed=await open(p);await ed.locator('.oeiFile').waitFor({state:'attached'});await ed.locator('.qbInlineImageToggle').click();
  assert.equal(await ed.locator('.oeiBox').isVisible(),true);
  await ed.locator('.oeiFile').setInputFiles({name:'choice.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZuQAAAAASUVORK5CYII=','base64')});
  await p.waitForFunction(()=>testUploads===1);await ed.locator('.adeCancel').click();
  assert.equal(await row.evaluate(el=>el.lastElementChild===choiceNote),true);
  console.log(name+' PASS personal-note saving and choice-image upload remain operable');
  ed=await open(p);field=ed.locator('[data-qb-format-field="explanation"]');
  await select(field,0,2);await p.keyboard.press('Control+b');
  await p.evaluate(()=>testFailSave=true);await ed.locator('.adeSave').click();
  await p.waitForFunction(()=>document.querySelector('[data-ade-v2-editor="choice-c1"] .adeStatus')?.textContent.includes('fixture save failure'));
  assert.equal(await field.locator('.qbInlineRich').getAttribute('contenteditable'),'true');
  assert.equal(await field.locator('.qbFmt-bold').count(),1);
  await p.evaluate(()=>testFailSave=false);await ed.locator('.adeSave').click();await ed.waitFor({state:'detached'});
  ed=await open(p);field=ed.locator('[data-qb-format-field="explanation"]');await select(field,0,2);await p.keyboard.press('Control+u');
  await p.evaluate(()=>testDB.choices[0].explanation='別の更新');await ed.locator('.adeSave').click();
  await p.waitForFunction(()=>document.querySelector('[data-ade-v2-editor="choice-c1"] .adeStatus')?.textContent.includes('別の更新'));
  assert.equal(await p.evaluate(()=>testDB.choices[0].explanation),'別の更新');await ed.locator('.adeCancel').click();
  assert.deepEqual(await p.evaluate(()=>testDB.attempts),before.attempts);assert.deepEqual(errors,[]);
  ed=await open(p);field=ed.locator('[data-qb-format-field="explanation"]');await select(field,0,2);await p.keyboard.press('Control+b');
  p.once('dialog',d=>d.dismiss());await p.locator('[data-ade-v2="overview"]').click();assert.equal(await ed.count(),1,'declining discard preserves choice draft');
  p.once('dialog',d=>d.accept());await p.locator('[data-ade-v2="overview"]').click();await ed.waitFor({state:'detached'});await p.locator('.qbInlineCancel').click();
  console.log(name+' PASS inline position, no duplicate text, cancel restoration, image toggle, switching editors protects drafts');
  console.log(name+' PASS failure retains editable draft, concurrent changes are rejected, grading history is preserved');
  await p.close();
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,name)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
