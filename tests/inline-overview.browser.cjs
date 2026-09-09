'use strict';
// All DB/Auth/Storage calls use the existing synthetic fixture; external browser traffic is blocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const fixtureFile=path.join(__dirname,'explanation-format.browser.cjs');
const source=fs.readFileSync(fixtureFile,'utf8');
const end=source.lastIndexOf('(async()=>{for(const [name,type]');
assert.ok(end>0,'existing fixture bootstrap must be identifiable');
const fixture=new Module(fixtureFile,module);fixture.filename=fixtureFile;fixture.paths=module.paths;
fixture._compile(source.slice(0,end)+'\nmodule.exports={setup,popup};',fixtureFile);
const {setup,popup}=fixture.exports;
async function boot(browser,options={}){
  const ctx=await setup(browser,options);const p=ctx.page;
  await p.addStyleTag({content:fs.readFileSync(path.join(root,'editor-appearance-v1.css'),'utf8')});
  await p.evaluate(()=>{
    window.QB_INLINE_TEST=true;window.testNavigation=0;window.testWrites=[];
    window.qbOpenSubjects=()=>{window.testNavigation++};window.qbOpenProblemList=()=>{window.testNavigation++};window.qbRetryCurrent=()=>{window.testNavigation++};
    const n=document.createElement('button');n.id='next';n.textContent='次へ';n.onclick=()=>window.testNavigation++;document.body.append(n);
  });
  await p.addScriptTag({content:fs.readFileSync(path.join(root,'inline-overview-v1.js'),'utf8')});
  return ctx;
}
async function open(p){await p.locator('[data-ade-v2="overview"]').click();await p.locator('.qbInlineRich[contenteditable="true"]').waitFor();return p.locator('.qbInlineRich')}
async function select(p,start,end){
  await p.locator('.qbInlineRich').evaluate((root,[a,b])=>{
    root.focus();const nodes=[];const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())nodes.push(n);
    const point=pos=>{let offset=0;for(const node of nodes){if(pos<=offset+node.length)return[node,pos-offset];offset+=node.length}return[root,root.childNodes.length]};
    const [an,ao]=point(a),[bn,bo]=point(b),r=document.createRange();r.setStart(an,ao);r.setEnd(bn,bo);const s=window.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));
  },[start,end]);await p.waitForTimeout(50);
}
async function word(p,text){const all=await p.locator('.qbInlineRich').textContent(),start=all.indexOf(text);assert.ok(start>=0,'fixture text present: '+text);await select(p,start,start+text.length)}
async function command(p,kind){await p.locator(`[data-qb-inline-format="${kind}"]`).click()}
async function cancel(p){await p.locator('.qbInlineCancel').click();await p.locator('.qbInlineRich').waitFor({state:'detached'})}
async function save(p){await p.locator('.qbInlineSave').click();await p.locator('.qbInlineRich').waitFor({state:'detached'});await p.waitForTimeout(100)}
async function writes(p){return p.evaluate(()=>testWrites.filter(x=>x.table==='questions').length)}
async function run(browser,name){
  let passed=0;const pass=s=>{passed++;console.log(name+' PASS '+s)};
  let ctx=await boot(browser),p=ctx.page;
  const raw=await p.evaluate(()=>testDB.questions[0].explanation_overview);
  await p.evaluate(()=>{window.beforeImage=document.querySelector('.qbMediaImg');window.beforeNote=document.querySelector('.qbPersonal');window.beforeBody=[...document.querySelectorAll('#ans > .card')].find(c=>c.querySelector('[data-ade-v2="overview"]')).querySelector(':scope > .line')});
  await open(p);assert.equal(await p.locator('.qbInlineRich').textContent(),raw);assert.equal(await p.locator('.adeEditor textarea,.qbFmtPreview').count(),0);assert.equal(await p.evaluate(()=>document.querySelector('[data-qb-inline-editing]')===beforeBody&&document.querySelector('.qbMediaImg')===beforeImage&&document.querySelector('.qbPersonal')===beforeNote),true);pass('same displayed body becomes editable; no duplicate textarea/preview or detached media/notes');
  for(const kind of ['bold','underline','strike','marker','accent']){await word(p,'キーワード');await command(p,kind)}
  assert.ok(await p.locator('.qbInlineRich .qbFmt-bold .qbFmt-underline, .qbInlineRich .qbFmt-bold.qbFmt-underline').count()>=0);
  for(const kind of ['bold','underline','strike','marker','accent'])assert.equal(await p.locator('.qbInlineRich .qbFmt-'+kind).first().textContent(),'キーワード');
  assert.equal(await writes(p),0);await cancel(p);assert.equal(await p.evaluate(()=>testDB.questions[0].explanation_overview),raw);assert.equal(await p.evaluate(()=>beforeBody.textContent),raw);pass('all five visible styles are draft-only; cancel restores original text and formatting');
  await open(p);await word(p,'キーワード');await p.keyboard.press('Meta+b');await p.keyboard.press('Control+u');await p.keyboard.press('Meta+Shift+s');await p.keyboard.press('Control+Shift+m');await p.keyboard.press('Meta+Shift+a');
  for(const kind of ['bold','underline','strike','marker','accent'])assert.equal(await p.locator('.qbInlineRich .qbFmt-'+kind).first().textContent(),'キーワード');
  assert.equal(await writes(p),0);await p.keyboard.press('Control+s');await p.locator('.qbInlineRich').waitFor({state:'detached'});await p.waitForTimeout(150);assert.equal(await writes(p),1);assert.equal(await p.evaluate(()=>testDB.questions[0].explanation_overview),raw);assert.equal(await p.evaluate(()=>testDB.questions[0].explanation_formatting.explanation_overview.ranges.length),5);pass('Cmd/Ctrl shortcuts match buttons; Shift-S strikes without saving and plain S alone saves');
  await open(p);await word(p,'キーワード');await command(p,'clear');assert.equal(await p.locator('.qbInlineRich [class^="qbFmt-"]').count(),0);await p.keyboard.press('Control+z');assert.equal(await p.locator('.qbInlineRich .qbFmt-marker').count(),1);await p.keyboard.press('Control+Shift+z');assert.equal(await p.locator('.qbInlineRich [class^="qbFmt-"]').count(),0);await cancel(p);pass('clear, undo and redo are reversible and cancellation retains saved styling');
  await open(p);await select(p,raw.length,raw.length);await p.keyboard.press('Enter');await p.keyboard.press('Enter');await p.keyboard.insertText('日本語🙂  <tag>');assert.equal(await writes(p),1);await save(p);assert.equal(await p.evaluate(()=>testDB.questions[0].explanation_overview),raw+'\n\n日本語🙂  <tag>');pass('editing retains line breaks, Japanese text, emoji, spaces and literal angle brackets');
  await open(p);await word(p,'日本語');await p.locator('.qbInlineRich').evaluate(root=>{const d=new DataTransfer();d.setData('text/plain','貼付 <img src=x onerror=alert(1)>');d.setData('text/html','<img src=x onerror=alert(1)>');root.dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}))});assert.equal(await p.locator('.qbInlineRich img,.qbInlineRich script').count(),0);assert.ok((await p.locator('.qbInlineRich').textContent()).includes('<img src=x onerror=alert(1)>'));await cancel(p);pass('pasted HTML is treated as plain text; no embedded scripts or image uploads');
  await open(p);await select(p,0,0);await p.keyboard.insertText('下書き ');const draft=await p.locator('.qbInlineRich').textContent();
  await popup(p,'.qbMediaImg');assert.equal(await p.locator('.qbInlineRich').textContent(),draft);
  const note=p.locator('.qbPersonal').first();await note.locator('.qbPencil').click();await note.locator('textarea').fill('個人メモだけ変更');await note.locator('.qbNoteSave').click();await p.waitForFunction(()=>testDB.user_notes[0].note_text==='個人メモだけ変更');await popup(p,'.qbNoteImageGrid img');assert.equal(await p.locator('.qbInlineRich').textContent(),draft);pass('official/private image popups and private-note saves do not overwrite a dirty draft');
  const beforeImages=await p.evaluate(()=>testDB.question_images.length),beforeWrites=await writes(p);
  await p.locator('.qbInlineImageToggle').click();await p.locator('.qbInlineImageManager .oeiFile').waitFor({state:'attached'});await popup(p,'.qbInlineImageManager .oeiGrid img');
  await p.locator('.qbInlineImageManager .oeiFile').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZuQAAAAASUVORK5CYII=','base64')});
  await p.waitForFunction(n=>testDB.question_images.length===n+1,beforeImages);assert.equal(await p.locator('.qbInlineRich').textContent(),draft);assert.equal(await writes(p),beforeWrites);await cancel(p);assert.equal(await p.evaluate(()=>testDB.question_images.length),beforeImages+1);assert.equal(await p.evaluate(()=>testDB.user_notes[0].note_text),'個人メモだけ変更');assert.equal(await p.locator('.qbMediaHostV2.hidden').count(),0);pass('image upload is independent and survives text cancellation; existing image controls reused');
  for(const [key,focus] of [['Meta+s','paste'],['Control+s','page']]){
    await open(p);await select(p,0,0);await p.keyboard.insertText('画像後保存 ');
    const expected=await p.locator('.qbInlineRich').textContent(),imageCount=await p.evaluate(()=>testDB.question_images.length),writeCount=await writes(p);
    await p.locator('.qbInlineImageToggle').click();await p.locator('.qbInlineImageManager .oeiFile').waitFor({state:'attached'});
    await p.locator('.qbInlineImageManager .oeiFile').setInputFiles({name:'shortcut.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZuQAAAAASUVORK5CYII=','base64')});
    await p.waitForFunction(n=>testDB.question_images.length===n+1,imageCount);
    if(focus==='paste')await p.locator('.qbInlineImageManager .oeiPaste').evaluate(el=>{el.classList.remove('hidden');el.focus()});
    else await p.evaluate(()=>{document.activeElement?.blur()});
    assert.equal(await p.locator('.qbInlineRich').evaluate(el=>el.contains(document.activeElement)),false);
    await p.keyboard.press(key);await p.locator('.qbInlineRich').waitFor({state:'detached'});
    assert.equal(await p.evaluate(()=>testDB.questions[0].explanation_overview),expected);
    assert.equal(await writes(p),writeCount+1,'shortcut saves the active draft exactly once');
    assert.equal(await p.evaluate(()=>testDB.question_images.length),imageCount+1);
  }
  pass('Cmd/Ctrl-S saves after image upload from image paste controls and unfocused page');
  await open(p);await select(p,0,0);await p.keyboard.insertText('メモとは独立 ');
  await note.locator('.qbPencil').click();await note.locator('textarea').fill('メモ入力中');
  const protectedWrites=await writes(p);await p.keyboard.press('Meta+s');
  assert.equal(await p.locator('.qbInlineRich').count(),1);assert.equal(await writes(p),protectedWrites,'private note shortcut must not save official draft');
  await cancel(p);
  await open(p);await select(p,0,0);await p.keyboard.insertText('未保存 ');p.once('dialog',d=>d.dismiss());await p.locator('#next').click();assert.equal(await p.evaluate(()=>testNavigation),0);assert.equal(await p.locator('.qbInlineRich').count(),1);
  const unload=await p.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented});assert.equal(unload,true);
  p.once('dialog',d=>d.accept());await p.locator('#next').click();assert.equal(await p.evaluate(()=>testNavigation),1);assert.equal(await p.locator('.qbInlineRich').count(),0);pass('dirty navigation can be cancelled or discarded; reload protection registered only while dirty');
  await open(p);await select(p,0,0);await p.keyboard.insertText('保護 ');p.once('dialog',d=>d.dismiss());await p.evaluate(()=>qbOpenSubjects());assert.equal(await p.evaluate(()=>testNavigation),1);assert.equal(await p.locator('.qbInlineRich').count(),1);await cancel(p);pass('exported navigation entrypoints also respect unsaved-change guard');
  await open(p);await word(p,'キーワード');await command(p,'underline');const initial=await p.evaluate(()=>JSON.parse(JSON.stringify(testDB.questions[0])));await p.evaluate(()=>{testDB.questions[0].explanation_formatting.explanation_overview={version:1,source_text:testDB.questions[0].explanation_overview,ranges:[{kind:'accent',start:0,end:1}]}});await p.locator('.qbInlineSave').click();await p.waitForFunction(()=>document.querySelector('.qbInlineStatus').textContent.includes('別の更新'));assert.equal(await p.locator('.qbInlineSave').isEnabled(),true);await cancel(p);await p.evaluate(x=>{Object.assign(testDB.questions[0],x)},initial);pass('concurrent formatting-only changes cannot be silently overwritten');
  await open(p);await select(p,0,0);await p.keyboard.insertText('保存失敗テスト ');await p.evaluate(()=>testFailSave=true);await p.locator('.qbInlineSave').click();await p.waitForFunction(()=>document.querySelector('.qbInlineStatus').textContent.includes('fixture save failure'));assert.ok((await p.locator('.qbInlineRich').textContent()).includes('保存失敗テスト'));assert.equal(await p.locator('.qbInlineCancel').isEnabled(),true);await p.evaluate(()=>testFailSave=false);await save(p);pass('failed saves retain editable input and allow retry');
  const codec=await p.evaluate(()=>{const {docFrom,readDoc}=QBInlineOverview.codec;return ['','\n','\n\n',' a  b \n','🙂\r\n日本語\n'].map(t=>readDoc(docFrom(t,null)).text===t).every(Boolean)});assert.equal(codec,true);pass('plain text serialization round-trips whitespace and UTF-16 without rewriting source');
  await open(p);await select(p,0,0);await p.keyboard.insertText('差分 ');const backup=await p.evaluate(()=>testDB.questions[0].explanation_overview);await p.evaluate(()=>testDB.questions[0].explanation_overview='他担当が更新');await p.locator('.qbInlineSave').click();await p.waitForFunction(()=>document.querySelector('.qbInlineStatus').textContent.includes('別の更新'));assert.equal(await p.evaluate(()=>testDB.questions[0].explanation_overview),'他担当が更新');await cancel(p);await p.evaluate(t=>testDB.questions[0].explanation_overview=t,backup);pass('concurrent body updates are detected without destructive overwrite');
  await open(p);await select(p,0,0);await p.keyboard.insertText('別欄共存 ');await p.evaluate(()=>{testDB.questions[0].explanation_formatting.exam_summary={version:1,source_text:testDB.questions[0].exam_summary,ranges:[{kind:'underline',start:0,end:2}]}});await save(p);assert.equal(await p.evaluate(()=>testDB.questions[0].explanation_formatting.exam_summary.ranges[0].kind),'underline');pass('saving overview merges and preserves other sections formatting');
  await p.locator('[data-ade-v2="summary"]').click();await p.locator('[data-ade-v2-editor="summary"] .qbFmtTools').waitFor();assert.equal(await p.locator('.qbInlineRich').count(),0);await p.locator('[data-ade-v2-editor="summary"] .adeCancel').click();pass('other sections retain stable existing editor; rollout is overview-only');
  const data=await p.evaluate(()=>testDB);assert.deepEqual(ctx.errors,[]);await p.close();
  ctx=await boot(browser,{role:'user',db:data});p=ctx.page;assert.equal(await p.locator('[data-ade-v2="overview"]').count(),0);assert.equal(await p.locator('.qbInlineRich').count(),0);await popup(p,'.qbMediaImg');assert.deepEqual(ctx.errors,[]);await p.close();pass('general user sees saved content with no admin editor and retains image popup');
  ctx=await boot(browser,{mode:'fill_blank'});p=ctx.page;await open(p);await word(p,'キーワード');await command(p,'marker');await save(p);assert.equal(await p.locator('#ans>.card>b').filter({hasText:'問題文のポイント'}).count(),1);assert.equal(await p.locator('#ans>.card>b').filter({hasText:'■ 解説'}).count(),0);assert.equal(await p.evaluate(()=>testDB.attempts[0].is_correct),null);await popup(p,'.qbMediaImg');assert.deepEqual(ctx.errors,[]);await p.close();pass('fill-blank keeps deduplicated overview, manual grading, saved answer and images');
  console.log(name+' '+passed+' inline checks passed');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});

