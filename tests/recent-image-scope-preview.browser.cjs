'use strict';
// Real picker + real stem/overview/image/note scripts; synthetic DB/Auth/Storage only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),fixturePath=path.join(__dirname,'inline-stem.browser.cjs');
const source=fs.readFileSync(fixturePath,'utf8'),end=source.lastIndexOf('(async()=>{for(const [name,type]');assert.ok(end>0);
const fixture=new Module(fixturePath,module);fixture.filename=fixturePath;fixture.paths=module.paths;
fixture._compile(source.slice(0,end)+'\nmodule.exports={boot,popup};',fixturePath);
const {boot:baseBoot,popup}=fixture.exports;
async function boot(browser){
  const ctx=await baseBoot(browser),p=ctx.page;
  await p.evaluate(()=>{
    const clone=x=>JSON.parse(JSON.stringify(x));
    testDB.questions[0].subject_id='s1';testDB.questions[0].unit_id='u11';
    Object.assign(testQ,{subject_id:'s1',unit_id:'u11'});
    testDB.questions.push({id:'q2',subject_id:'s1',unit_id:'u12'},{id:'q3',subject_id:'s2',unit_id:'u21'});
    testDB.subjects=[{id:'s1',name:'科目一',sort_order:0},{id:'s2',name:'科目二',sort_order:1},{id:'s3',name:'画像なし科目',sort_order:2}];
    testDB.units=[{id:'u11',subject_id:'s1',name:'単元一',sort_order:0},{id:'u12',subject_id:'s1',name:'単元二',sort_order:1},{id:'u21',subject_id:'s2',name:'別科目の単元',sort_order:0}];
    testDB.question_images.forEach((r,i)=>r.created_at='2026-09-01T00:00:00.000Z');
    for(let i=1;i<=45;i++)testDB.question_images.push({id:'img-'+String(i).padStart(3,'0'),image_path:'fixture-'+i+'.png',question_id:i<=25?'q2':'q3',placement:'explanation_overview',choice_id:null,created_at:i<=25?'2026-09-02T00:00:00.000Z':'2026-09-03T00:00:00.000Z'});
    testDB.question_images.push({...testDB.question_images.find(r=>r.id==='img-020'),id:'duplicate-path'});
    window.testPickerReads=[];window.testDownloads=[];window.testUploadPaths=[];window.pickerResult=null;window.failPickerImages=false;window.failPickerCatalog=false;window.slowPickerScope='';
    class ReadQuery{
      constructor(t){this.table=t;this.filters=[];this.orders=[];this.cols='';this.n=null;this.bounds=null;this.one=false}
      select(c){this.cols=c;return this}eq(k,v){this.filters.push([k,'eq',v]);return this}lt(k,v){this.filters.push([k,'lt',v]);return this}not(k,op,v){this.filters.push([k,'not',v]);return this}
      order(k,o={}){this.orders.push([k,o.ascending!==false]);return this}limit(n){this.n=n;return this}range(a,b){this.bounds=[a,b];return this}
      maybeSingle(){this.one=true;return this.execute()}then(a,b){return this.execute().then(a,b)}
      async execute(){
        const record={table:this.table,cols:this.cols,filters:clone(this.filters),orders:clone(this.orders),n:this.n,bounds:this.bounds};testPickerReads.push(record);
        if(this.table==='question_images'&&failPickerImages){failPickerImages=false;return{data:null,error:{message:'synthetic image read failure'}}}
        if(this.table==='subjects'&&failPickerCatalog){failPickerCatalog=false;return{data:null,error:{message:'synthetic catalog failure'}}}
        let rows=clone(testDB[this.table]||[]);
        if(this.cols.includes('questions!inner'))rows=rows.map(r=>({...r,questions:clone(testDB.questions.find(q=>q.id===r.question_id)||null)})).filter(r=>r.questions);
        const value=(row,k)=>k.split('.').reduce((o,key)=>o?.[key],row);
        rows=rows.filter(r=>this.filters.every(([k,op,v])=>op==='eq'?value(r,k)===v:op==='lt'?value(r,k)<v:value(r,k)!=null));
        rows.sort((a,b)=>{for(const [k,asc] of this.orders){if(a[k]===b[k])continue;return(a[k]<b[k]?-1:1)*(asc?1:-1)}return 0});
        if(this.bounds)rows=rows.slice(this.bounds[0],this.bounds[1]+1);if(this.n!=null)rows=rows.slice(0,this.n);
        if(this.table==='question_images'&&this.filters.some(([k,op,v])=>k==='questions.subject_id'&&v===slowPickerScope))await new Promise(r=>setTimeout(r,500));
        return{data:this.one?(rows[0]||null):rows,error:null};
      }
    }
    const original=qbSupabase.from.bind(qbSupabase);
    qbSupabase.from=t=>{
      if(t==='subjects'||t==='units')return new ReadQuery(t);
      const query=original(t),select=query.select;
      query.select=function(c,...args){if(t==='question_images'&&c.includes('created_at'))return new ReadQuery(t).select(c);return select.call(this,c,...args)};
      return query;
    };
    const storage=qbSupabase.storage.from.bind(qbSupabase.storage);
    qbSupabase.storage.from=bucket=>{const api=storage(bucket),upload=api.upload;return{...api,
      download:async p=>{testDownloads.push(p);return{data:new Blob(['synthetic copied image'],{type:'image/png'}),error:null}},
      upload:async(p,file,options)=>{testUploadPaths.push(p);return upload(p,file,options)}
    }};
    window.pickerOriginal=JSON.stringify(testDB);
  });
  for(const script of ['recent-image-picker-v1.js','image-library-tools-v1.js'])await p.addScriptTag({content:fs.readFileSync(path.join(root,script),'utf8')});
  await p.waitForTimeout(150);return ctx;
}
async function open(p){
  await p.evaluate(()=>{window.pickerResult=null;qbRecentImagePicker.pick({sb:qbSupabase,limit:10}).then(r=>pickerResult=r)});
  await p.locator('.qbripSubject:not(:disabled)').waitFor();await p.waitForFunction(()=>document.querySelector('.qbripGrid')?.children.length>0);await p.waitForTimeout(100);
}
async function ids(p){return p.locator('.qbripItem').evaluateAll(es=>es.map(e=>e.dataset.id))}
async function settle(p){await p.waitForFunction(()=>{const s=document.querySelector('.qbripLoader')?.dataset.state;return s==='more'||s==='end'});await p.waitForTimeout(70)}
async function finish(p){for(let n=0;n<30;n++){await settle(p);const state=await p.locator('.qbripLoader').getAttribute('data-state');if(state==='end')return;await p.locator('.qbripLoader').click()}throw new Error('pagination failed to terminate')}
// Programmatic scrollTop/focus may dispatch scroll on the next frame. Begin a
// stationary hold only after that has settled; deliberate in-gesture scroll is tested below.
async function pointer(p,selector,type,extra={}){if(type==='pointerdown')await p.waitForTimeout(100);const target=p.locator(selector).first();await target.dispatchEvent(type,{pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientX:70,clientY:350,bubbles:true,...extra})}
async function hold(p,selector='.qbripItem'){await pointer(p,selector,'pointerdown');await p.waitForTimeout(560);await p.locator('.qbripPreview').waitFor();await pointer(p,'.qbripModal','pointerup');await p.waitForTimeout(380)}
async function run(browser,name){
  let n=0;const pass=s=>{n++;console.log(name+' PASS '+s)};
  const {page:p,errors}=await boot(browser);await open(p);
  assert.equal(await p.locator('.qbripSubject').inputValue(),'s1');assert.equal(await p.locator('.qbripUnit').inputValue(),'');
  assert.deepEqual(await p.locator('.qbripUnit option').evaluateAll(es=>es.map(x=>x.value)),['','u11','u12']);
  assert.ok(!(await ids(p)).includes('img-045'));pass('defaults to the current question subject and all its units, not the newest global images');
  await finish(p);const loaded=await ids(p);const expected=await p.evaluate(()=>new Set(testDB.question_images.filter(r=>['q1','q2'].includes(r.question_id)).map(r=>r.image_path)).size);assert.equal(loaded.length,expected);
  const reads=await p.evaluate(()=>testPickerReads.filter(r=>r.table==='question_images'));
  assert.ok(reads.every(r=>r.cols.includes('questions!inner')&&r.filters.some(f=>f[0]==='questions.subject_id'&&f[2]==='s1')));
  assert.ok(reads.some(r=>r.filters.some(f=>f[0]==='id'&&f[1]==='lt')));assert.ok(reads.some(r=>r.filters.some(f=>f[0]==='created_at'&&f[1]==='lt')));
  pass('server-side scope precedes cursor pagination; equal timestamps, older pages and duplicate paths do not drop images');
  await p.locator('.qbripUnit').selectOption('u11');await settle(p);assert.ok((await ids(p)).every(id=>!id.startsWith('img-')));assert.equal((await ids(p)).length,2);pass('unit filtering returns only images on questions in that unit');
  await p.locator('.qbripSubject').selectOption('s2');await settle(p);assert.equal(await p.locator('.qbripUnit').inputValue(),'');assert.deepEqual(await p.locator('.qbripUnit option').evaluateAll(es=>es.map(x=>x.value)),['','u21']);assert.ok((await ids(p)).every(x=>x>='img-026'));pass('changing subject clears stale unit selection and replaces the unit choices');
  await p.locator('.qbripSubject').selectOption('');await finish(p);assert.equal(await p.locator('.qbripUnit').isDisabled(),true);assert.ok((await ids(p)).includes('img-045'));pass('all-subject mode includes cross-subject images and disables meaningless unit filtering');
  await p.locator('.qbripItem').first().click();assert.equal(await p.locator('.qbripItem.on').count(),1);assert.equal(await p.locator('.qbripPreview').count(),0);
  await p.locator('.qbripItem').first().click();assert.equal(await p.locator('.qbripItem.on').count(),0);pass('short tap toggles selection without opening an enlarged image or writing any data');
  await p.locator('.qbripItem').nth(1).click();
  await p.evaluate(()=>{document.querySelector('.qbripPanel').scrollTop=120;window.pickerBeforeScroll=document.querySelector('.qbripPanel').scrollTop});
  const before=await p.locator('.qbripItem.on').getAttribute('data-id');await hold(p);
  assert.equal(await p.locator('.qbripItem.on').getAttribute('data-id'),before);assert.equal(await p.locator('.qbripPreview').count(),1);
  await p.locator('.qbripPreviewClose').click();assert.equal(await p.locator('.qbripItem.on').getAttribute('data-id'),before);
  assert.equal(await p.evaluate(()=>document.querySelector('.qbripPanel').scrollTop===pickerBeforeScroll),true);assert.equal(await p.locator('.qbripSubject').inputValue(),'');pass('long press persists after release; closing preserves selection, scope and exact list scroll position');
  await pointer(p,'.qbripItem','pointerdown');await p.waitForTimeout(560);await p.locator('.qbripPreview').waitFor();
  await pointer(p,'.qbripModal','pointerup');await p.locator('.qbripPreviewClose').dispatchEvent('click',{detail:1});assert.equal(await p.locator('.qbripPreview').count(),1);
  await p.waitForTimeout(380);await p.locator('.qbripPreviewClose').click();await p.locator('.qbripItem').first().dispatchEvent('click',{detail:1});assert.equal(await p.locator('.qbripItem.on').getAttribute('data-id'),before);pass('release-generated clicks cannot close the preview or silently select its thumbnail');
  await pointer(p,'.qbripItem','pointerdown');await pointer(p,'.qbripModal','pointermove',{clientY:390});await p.waitForTimeout(560);await pointer(p,'.qbripModal','pointerup');assert.equal(await p.locator('.qbripPreview').count(),0);
  await p.locator('.qbripItem').first().dispatchEvent('click',{detail:1});assert.equal(await p.locator('.qbripItem.on').getAttribute('data-id'),before);pass('finger movement cancels long press and does not accidentally select while scrolling');
  await pointer(p,'.qbripItem','pointerdown');await pointer(p,'.qbripModal','pointercancel');await p.waitForTimeout(560);assert.equal(await p.locator('.qbripPreview').count(),0);
  await pointer(p,'.qbripItem','pointerdown');await p.locator('.qbripPanel').dispatchEvent('scroll');await p.waitForTimeout(560);assert.equal(await p.locator('.qbripPreview').count(),0);pass('browser pointer cancellation and panel scrolling clear pending long-press timers');
  await p.locator('.qbripItem').first().focus();await p.keyboard.press('Alt+Enter');await p.locator('.qbripPreview').waitFor();await p.keyboard.press('Escape');assert.equal(await p.locator('.qbripPreview').count(),0);assert.equal(await p.locator('.qbripModal').count(),1);pass('keyboard preview and Escape close only the top preview, not the picker or editor');
  await p.locator('.qbripSubject').selectOption('s3');await settle(p);assert.equal(await p.locator('.qbripEmpty').isVisible(),true);assert.equal(await p.locator('.qbripItem').count(),0);assert.equal(await p.locator('.qbripUse').isDisabled(),true);pass('empty scopes show a clear empty state; changing scope clears selections, never adds hidden images');
  await p.evaluate(()=>slowPickerScope='s1');await p.locator('.qbripSubject').selectOption('s1');await p.locator('.qbripSubject').selectOption('s2');await settle(p);await p.waitForTimeout(650);assert.ok((await ids(p)).every(x=>x>='img-026'));await p.evaluate(()=>slowPickerScope='');pass('late responses from an old scope cannot mix unrelated images into the current scope');
  await p.evaluate(()=>failPickerImages=true);await p.locator('.qbripUnit').selectOption('u21');await p.waitForFunction(()=>document.querySelector('.qbripLoader').dataset.state==='error');assert.equal(await p.locator('.qbripItem').count(),0);
  await p.locator('.qbripLoader').click();await settle(p);assert.ok((await ids(p)).length>0);pass('failed image reads stay within scope and can be retried without unrelated fallback results');
  await p.locator('.qbripItem').first().click();const colors=await p.evaluate(()=>{
    const out=[];for(const [key,t] of Object.entries(QB_THEME_PALETTE)){document.documentElement.style.setProperty('--accent',t.accent);const probe=document.createElement('span');probe.style.color='var(--accent)';document.body.appendChild(probe);out.push([key,getComputedStyle(document.querySelector('.qbripUse')).backgroundColor,getComputedStyle(document.querySelector('.qbripItem.on')).borderTopColor,getComputedStyle(probe).color]);probe.remove()}return out;
  });for(const [key,bg,border,accent] of colors){assert.equal(bg,accent,key);assert.equal(border,accent,key)}pass('selection and add controls follow all seven system colors without hardcoded blue');
  await p.locator('.qbripCancel').click();assert.deepEqual(await p.evaluate(()=>pickerResult),[]);assert.equal(await p.evaluate(()=>JSON.stringify(testDB)),await p.evaluate(()=>pickerOriginal));assert.equal(await p.evaluate(()=>testDownloads.length+testUploadPaths.length),0);pass('browsing, filtering, previewing and cancelling cause no DB or Storage writes');
  await p.evaluate(()=>failPickerCatalog=true);await p.evaluate(()=>{qbRecentImagePicker.pick({sb:qbSupabase}).then(r=>pickerResult=r)});await p.locator('.qbripFilterRetry:not(.hidden)').waitFor();assert.equal(await p.locator('.qbripItem').count(),0);await p.locator('.qbripFilterRetry').click();await p.locator('.qbripSubject:not(:disabled)').waitFor();await settle(p);assert.equal(await p.locator('.qbripSubject').inputValue(),'s1');await p.locator('.qbripCancel').click();pass('catalog errors have an explicit retry path and preserve the intended initial subject');
  // The real existing image button -> picker -> independent file copy route.
  await p.locator('.adeStemBtn').click();const rich=p.locator('.qtext .qbInlineRich[contenteditable="true"]');await rich.waitFor();await rich.press('End');await p.keyboard.insertText(' 未保存の本文');const draft=await rich.textContent();
  await p.locator('.qbInlineImageToggle').click();await p.locator('.qsiHost .qsiRecentBtn').click();await p.locator('.qbripSubject:not(:disabled)').waitFor();await settle(p);
  await hold(p);await p.locator('.qbripPreviewClose').click();assert.equal(await rich.textContent(),draft);
  const chosen=await p.locator('.qbripItem').first().getAttribute('data-id');const sourcePath=await p.evaluate(id=>testDB.question_images.find(r=>r.id===id).image_path,chosen);
  const beforeImages=await p.evaluate(()=>testDB.question_images.length);await p.locator('.qbripItem').first().click();await p.locator('.qbripUse').click();await p.waitForFunction(n=>testDB.question_images.length===n+1,beforeImages);await p.waitForTimeout(200);
  assert.equal(await rich.textContent(),draft);assert.equal(await p.evaluate(()=>testDB.questions[0].stem),await p.evaluate(()=>testQ.stem));
  const copy=await p.evaluate(()=>testDB.question_images.at(-1));assert.equal(copy.question_id,'q1');assert.equal(copy.placement,'question');assert.notEqual(copy.image_path,sourcePath);
  assert.equal(await p.evaluate(id=>testDB.question_images.find(r=>r.id===id).image_path,chosen),sourcePath);assert.ok((await p.evaluate(()=>testDownloads)).includes(sourcePath));
  await p.locator('.qbInlineCancel').click();assert.equal(await p.evaluate(()=>testDB.question_images.length),beforeImages+1);pass('real question-image reuse still creates an independent copy; dirty stem and manual cancellation are preserved');
  const note=p.locator('.qbPersonal').first();await note.locator('.qbPencil').click();await note.locator('textarea').fill('個人メモは独立');await note.locator('.qbNoteSave').click();await p.waitForFunction(()=>testDB.user_notes[0].note_text==='個人メモは独立');await popup(p,'.qbNoteImageGrid img');pass('personal-note editing and private-image enlargement remain independent');
  await p.locator('[data-ade-v2="overview"]').click();const overview=p.locator('#ans .qbInlineRich');await overview.waitFor();await overview.press('End');await p.keyboard.insertText(' 解説の下書き');const overviewDraft=await overview.textContent();await p.locator('.qbInlineImageToggle').click();await p.locator('.oeiRecentBtn').click();await p.locator('.qbripSubject:not(:disabled)').waitFor();await settle(p);await hold(p);await p.locator('.qbripPreviewClose').click();await p.locator('.qbripCancel').click();assert.equal(await overview.textContent(),overviewDraft);await p.locator('.qbInlineCancel').click();pass('same scoped picker works from overview image controls without saving or losing its draft');
  assert.deepEqual(errors,[]);await p.close();console.log(name+' '+n+' recent-image checks passed');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
