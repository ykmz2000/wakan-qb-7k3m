'use strict';
// Synthetic fixtures only. Network requests are blocked; no production DB/Auth/Storage is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const scripts=['shared-explanation-ui.js','qb-media-notes-v2.js','explanation-format-v1.js','admin-direct-edit-v2.js','qb-editor-layout-polish.js','image-viewer.js','official-edit-images.js','fill-blank-v2.js','theme-system-v1.js','theme-coverage-v2.js'];
const shell=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[\s\S]*?<\/script>/g,'').replace('class="qb-auth-pending"','');
async function setup(browser,{role='admin',mode='single',db=null}={}){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url()==='https://qb-format.test/'?route.fulfill({contentType:'text/html',body:shell}):route.abort());
  await page.goto('https://qb-format.test/');
  await page.evaluate(({role,mode,seed})=>{
    const clone=x=>JSON.parse(JSON.stringify(x));
    const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="white"/><text x="10" y="45">Test image</text></svg>');
    const stamp='2026-09-08T00:00:00.000Z';let tick=0;
    const q={id:'q1',stem:'検証用の問題 [A]',answer_mode:mode,explanation_overview:'本文のキーワードと補足 < 5。\n2行目',examiner_intent:'この設問の区別点',exam_summary:'覚えておく総括',medical_verification_note:'資料の確認事項',explanation_formatting:null,updated_at:stamp,occ:[{id:'o1',official_answer:{A:'模範解答'}}]};
    const c={id:'c1',question_id:'q1',choice_key:'a',choice_text:'選択肢原文',is_correct:true,explanation:'選択肢のキーワードを説明する。',correction_text:'誤りを正しい内容へ修正。',correct_for_other_context:'別の条件なら該当。',examiner_distinction:'似た内容との区別。',explanation_formatting:null,updated_at:stamp};
    window.testDB=seed||{questions:[q],choices:mode==='fill_blank'?[]:[c],profiles:[{id:'u1',role,theme_key:'green'}],question_ratings:[],attempts:[],user_question_state:[],user_notes:[{id:'n1',user_id:'u1',question_id:'q1',placement:'explanation_overview',choice_id:null,note_text:'以前からの個人メモ',updated_at:stamp}],user_note_images:[{id:'ni1',note_id:'n1',user_id:'u1',question_id:'q1',image_path:'note-image'}],question_images:[{id:'im1',question_id:'q1',placement:'explanation_overview',choice_id:null,image_path:'public-image',sort_order:0}]};
    window.testDB.profiles[0].role=role;window.testWrites=[];window.testUploads=0;
    class Query{
      constructor(table){this.table=table;this.filters=[];this.mode='read';this.one=false;this.cols='';this.n=null}
      select(cols){this.cols=cols;return this}eq(k,v){this.filters.push(x=>x[k]===v);return this}is(k,v){this.filters.push(x=>(x[k]??null)===v);return this}in(k,vs){this.filters.push(x=>vs.includes(x[k]));return this}order(){return this}limit(n){this.n=n;return this}
      update(p){this.mode='update';this.p=p;return this}insert(p){this.mode='insert';this.p=p;return this}upsert(p){this.mode='upsert';this.p=p;return this}delete(){this.mode='delete';return this}
      maybeSingle(){this.one=true;return this.execute()}single(){this.one=true;return this.execute()}then(resolve,reject){return this.execute().then(resolve,reject)}
      async execute(){
        if(window.testFailRead&&this.mode==='read'&&this.cols.includes('explanation_formatting'))return{data:null,error:{message:'fixture network failure'}};
        if(window.testFailSave&&this.mode==='update')return{data:null,error:{message:'fixture save failure'}};
        const rows=window.testDB[this.table]||(window.testDB[this.table]=[]);let found=rows.filter(x=>this.filters.every(f=>f(x)));
        if(this.mode==='update'){for(const x of found)Object.assign(x,clone(this.p),{updated_at:new Date(Date.parse(stamp)+(++tick)*1000).toISOString()});window.testWrites.push({table:this.table,mode:this.mode,p:clone(this.p),count:found.length})}
        if(this.mode==='delete'){window.testDB[this.table]=rows.filter(x=>!found.includes(x));window.testWrites.push({table:this.table,mode:this.mode,count:found.length})}
        if(this.mode==='insert'||this.mode==='upsert'){
          let existing=this.mode==='upsert'?rows.find(x=>x.user_id===this.p.user_id&&x.question_id===this.p.question_id):null;
          if(existing)Object.assign(existing,clone(this.p));else{existing={id:'new-'+(++tick),...clone(this.p)};rows.push(existing)}found=[existing];window.testWrites.push({table:this.table,mode:this.mode,p:clone(this.p),count:1});
        }
        let result=clone(this.n==null?found:found.slice(0,this.n));
        if(this.table==='questions'&&this.cols.includes('choices('))result=result.map(x=>({...x,choices:clone(window.testDB.choices.filter(c=>c.question_id===x.id))}));
        return{data:this.one?(result[0]||null):result,error:null};
      }
    }
    window.qbSupabase={auth:{getUser:async()=>({data:{user:{id:'u1',email:'fixture@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:t=>new Query(t),storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:image}}),createSignedUrl:async()=>({data:{signedUrl:image}}),upload:async()=>{window.testUploads++;return{data:{path:'fixture'},error:null}},remove:async()=>({error:null})})}};
    window.testQ={...clone(window.testDB.questions[0]),choices:clone(window.testDB.choices),ans:mode==='fill_blank'?[]:[0]};window.QB_QUESTIONS=[window.testQ];window.qbResolveCurrentQuestion=()=>window.testQ;window.qbGetScreen=()=> 'practice';
    const V=document.getElementById('view');V.innerHTML='<div class="card"><div class="qtext"></div>'+(mode==='fill_blank'?'<div class="card"><button id="showTextAnswer">解答を見る</button></div>':'')+'<div id="ans">'+(mode==='fill_blank'?'':'<div class="card resultcard ok"><div class="result">正解</div><b>正答：a</b></div>')+'</div></div>';
    V.querySelector('.qtext').textContent=window.testQ.stem;
  },{role,mode,seed:db});
  for(const script of scripts)await page.addScriptTag({content:fs.readFileSync(path.join(root,script),'utf8')});
  if(mode==='fill_blank'){await page.locator('.fbInput').fill('自分の入力');await page.locator('#answer').click()}
  await page.locator('.qbPersonal .qbPencil').first().waitFor();
  if(role==='admin')await page.locator('[data-ade-v2="overview"]').waitFor();
  await page.waitForTimeout(150);return{page,errors};
}
async function openEditor(page,key){await page.locator(`[data-ade-v2="${key}"]`).click();const ed=page.locator(`[data-ade-v2-editor="${key}"]`);await ed.locator('.qbFmtTools').first().waitFor();return ed}
async function format(ed,field,word,kind){const f=ed.locator(`[data-qb-format-field="${field}"]`),ta=f.locator('textarea');await ta.evaluate((el,w)=>{const start=el.value.indexOf(w);if(start<0)throw new Error('fixture word missing');el.focus();el.setSelectionRange(start,start+w.length)},word);await f.locator(`[data-qb-format="${kind}"]`).click()}
async function link(ed,field,word,label,href){const f=ed.locator(`[data-qb-format-field="${field}"]`),ta=f.locator('textarea');await ta.evaluate((el,w)=>{const start=el.value.indexOf(w);if(start<0)throw new Error('fixture word missing');el.focus();el.setSelectionRange(start,start+w.length)},word);await f.locator('[data-qb-format="link"]').click();const dialog=ed.page().locator('.qbFmtLinkDialog');await dialog.locator('[data-text]').fill(label);await dialog.locator('[data-href]').fill(href);await dialog.locator('[data-save]').click()}
async function save(ed){await ed.locator('.adeSave').click();await ed.waitFor({state:'detached'})}
async function popup(page,selector){await page.locator(selector).first().click();await page.locator('#qbImageLightbox').waitFor();await page.locator('.qbImageLightboxClose').click();assert.equal(await page.locator('#qbImageLightbox').count(),0)}
async function run(browser,name){
  const {page,errors}=await setup(browser);let passed=0;
  const pass=s=>{passed++;console.log(name+' PASS '+s)};
  const original=await page.evaluate(()=>testDB.questions[0].explanation_overview);
  await popup(page,'.qbMediaImg');await popup(page,'.qbNoteImageGrid img');pass('existing official and private images open and close');
  let ed=await openEditor(page,'overview');for(const k of ['bold','underline','strike','marker','accent'])await format(ed,'explanation_overview','キーワード',k);
  assert.equal(await ed.locator('.qbFmtPreview').textContent(),original);assert.equal(await ed.locator('.qbFmtPreview .qbFmt-marker.qbFmt-accent.qbFmt-bold.qbFmt-strike.qbFmt-underline').count(),1);
  await ed.locator('.adeCancel').click();assert.equal(await page.evaluate(()=>testDB.questions[0].explanation_formatting),null);pass('all five styles preview without changing text; cancel makes no content write');
  ed=await openEditor(page,'overview');await format(ed,'explanation_overview','キーワード','link');let dialog=page.locator('.qbFmtLinkDialog');await dialog.waitFor();await page.locator('.qbFmtLinkDialog').click({position:{x:2,y:2}});await dialog.waitFor({state:'detached'});assert.equal(await ed.locator('textarea').inputValue(),original);await link(ed,'explanation_overview','キーワード','頭蓋内圧の資料','https://example.com/guide');assert.equal(await ed.locator('.qbFmtPreview .qbFmt-link').textContent(),'🔗頭蓋内圧の資料');await save(ed);const savedLink=page.locator('#ans > .card > .line .qbFmt-link');await savedLink.waitFor();assert.equal(await savedLink.textContent(),'🔗頭蓋内圧の資料');assert.equal(await savedLink.getAttribute('href'),'https://example.com/guide');assert.equal(await savedLink.getAttribute('rel'),'noopener noreferrer');pass('link display text and target save separately; outside tap cancels the dialog');
  await page.evaluate(()=>{testDB.questions[0].explanation_overview=testQ.explanation_overview;testDB.questions[0].explanation_formatting=null;testQ.explanation_overview=testDB.questions[0].explanation_overview;testQ.explanation_formatting=null;window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:'q1',type:'text',field:'explanation_overview'}}))});await page.waitForTimeout(100);
  ed=await openEditor(page,'overview');for(const k of ['bold','underline','strike','marker','accent'])await format(ed,'explanation_overview','キーワード',k);
  await page.evaluate(()=>{window.originalImage=document.querySelector('.qbMediaImg');window.originalNote=document.querySelector('.qbPersonal')});await save(ed);
  await page.locator('#ans > .card > .line .qbFmt-marker').waitFor();
  assert.equal(await page.evaluate(()=>testDB.questions[0].explanation_overview),original);
  assert.equal(await page.evaluate(()=>testDB.questions[0].explanation_formatting.explanation_overview.ranges.length),5);
  assert.equal(await page.evaluate(()=>document.querySelector('.qbMediaImg')===window.originalImage&&document.querySelector('.qbPersonal')===window.originalNote),true);pass('save writes separate metadata, retaining text, image and personal-note DOM');
  await popup(page,'.qbMediaImg');ed=await openEditor(page,'overview');assert.equal(await ed.locator('.qbFmtPreview .qbFmt-marker').count(),1);
  await format(ed,'explanation_overview','キーワード','clear');assert.equal(await ed.locator('.qbFmtPreview [class^="qbFmt-"]').count(),0);await ed.locator('.adeCancel').click();pass('saved formatting reloads into editor; clear is cancellable');
  ed=await openEditor(page,'overview');await ed.locator('textarea').evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart'));el.value='追加 '+el.value;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText'}));el.dispatchEvent(new CompositionEvent('compositionend'))});await save(ed);
  await page.waitForTimeout(150);assert.equal(await page.locator('#ans > .card > .line .qbFmt-marker').first().textContent(),'キーワード');pass('Japanese composition/insertion preserves mark positions');
  const note=page.locator('.qbPersonal').first();await note.locator('.qbPencil').click();await note.locator('textarea').fill('個人メモの追記');await note.locator('.qbNoteSave').click();await page.waitForFunction(()=>testDB.user_notes[0].note_text==='個人メモの追記');await popup(page,'.qbNoteImageGrid img');assert.equal(await note.locator('.qbFmtTools').count(),0);pass('personal-note save and private-image popup remain independent');
  ed=await openEditor(page,'overview');await ed.locator('.oeiFile').waitFor({state:'attached'});await ed.locator('.oeiFile').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZuQAAAAASUVORK5CYII=','base64')});await page.waitForFunction(()=>testUploads===1);await popup(page,'.oeiGrid img');await ed.locator('.adeCancel').click();pass('existing official-image upload and editor image popup remain operable');
  ed=await openEditor(page,'choice-c1');assert.equal(await ed.locator('.qbFmtTools').count(),4);
  for(const [field,word] of [['explanation','キーワード'],['correction_text','誤り'],['correct_for_other_context','別の条件'],['examiner_distinction','区別']])await format(ed,field,word,'marker');
  await ed.locator('.ctruth').selectOption('false');await save(ed);await page.locator('.qbChoiceCorrection .qbFmt-marker').waitFor();assert.equal(await page.evaluate(()=>testDB.choices[0].statement_is_true),false);assert.equal(await page.evaluate(()=>testDB.choices[0].choice_text),'選択肢原文');assert.equal(await page.evaluate(()=>testDB.choices[0].is_correct),true);pass('choice explanations and all three detail fields format without changing option source or grading');
  for(const [key,field,word] of [['summary','exam_summary','総括'],['intent','examiner_intent','区別点'],['verify','medical_verification_note','確認事項']]){ed=await openEditor(page,key);await format(ed,field,word,'bold');await save(ed)}
  pass('whole-question overview, summary, intent and verification stay editable');
  await page.evaluate(()=>{document.documentElement.style.setProperty('--accent','rgb(12, 96, 42)');document.documentElement.style.setProperty('--accent-soft','rgb(228, 247, 231)')});
  const color=await page.locator('#ans > .card > .line .qbFmt-accent').first().evaluate(el=>({color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));assert.equal(color.color,'rgb(12, 96, 42)');assert.equal(color.bg,'rgb(228, 247, 231)');pass('theme variables drive marker and accent text');
  ed=await openEditor(page,'overview');await page.evaluate(()=>{testDB.questions[0].explanation_overview='別担当が更新した内容'});await ed.locator('.adeSave').click();await page.waitForFunction(()=>document.querySelector('.adeStatus')?.textContent.includes('別の更新'));assert.equal(await ed.locator('.adeSave').isEnabled(),true);await ed.locator('.adeCancel').click();pass('concurrent content updates are not overwritten');
  await page.evaluate(()=>{testDB.questions[0].explanation_overview=testQ.explanation_overview;testFailSave=true});ed=await openEditor(page,'overview');await ed.locator('.adeSave').click();await page.waitForFunction(()=>document.querySelector('.adeStatus')?.textContent.includes('fixture save failure'));assert.equal(await ed.locator('.adeSave').isEnabled(),true);await ed.locator('.adeCancel').click();await page.evaluate(()=>testFailSave=false);pass('failed saves leave inputs and cancel controls usable');
  const data=await page.evaluate(()=>testDB);assert.deepEqual(errors,[]);await page.close();
  const user=await setup(browser,{role:'user',db:data});assert.equal(await user.page.locator('.adeEditBtnV2').count(),0);await user.page.locator('.qbFmt-marker').first().waitFor();await popup(user.page,'.qbMediaImg');await user.page.locator('.qbPersonal .qbPencil').first().click();assert.equal(await user.page.locator('.qbNoteEditor').first().isVisible(),true);assert.deepEqual(user.errors,[]);await user.page.close();pass('persisted formatting displays after reload for general users without administrator controls');
  const fill=await setup(browser,{mode:'fill_blank'});assert.equal(await fill.page.locator('#ans > .card > b').filter({hasText:'問題文のポイント'}).count(),1);assert.equal(await fill.page.locator('#ans > .card > b').filter({hasText:'■ 解説'}).count(),0);
  ed=await openEditor(fill.page,'overview');await format(ed,'explanation_overview','キーワード','marker');await save(ed);await fill.page.locator('#ans > .card > .line .qbFmt-marker').waitFor();assert.equal(await fill.page.evaluate(()=>testDB.attempts[0].response_payload.A),'自分の入力');assert.equal(await fill.page.evaluate(()=>testDB.attempts[0].is_correct),null);await popup(fill.page,'.qbMediaImg');assert.deepEqual(fill.errors,[]);await fill.page.close();pass('fill-blank typing, non-automatic grading, deduplication, formatting and image popup');
  console.log(name+' '+passed+' browser checks passed');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
