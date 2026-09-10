'use strict';
// Production core/store/UI/integration; only Auth, DB and Storage are synthetic.
// SQL behavior is exercised separately by image-library.database.sql.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
async function boot(browser){
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><header class="qbAccountCluster"><button class="qbRankBtn">ランキング</button><button id="acctBtn">マイページ</button></header><main><input id="draft" value="保存していない問題文"><section class="qsiHost" data-qid="q1"><div class="qsiEditor"><div class="qsiActions"><button id="oldUpload">アップロード</button><button id="oldRecent">最近の画像</button></div></div></section><section class="adeEditor" data-ade-editor="choice-c1"><div class="oeiBox"><div class="oeiActions"></div></div></section></main></body></html>'}));
 await page.goto('https://qb.test/');
 await page.addStyleTag({content:':root{--text:#202124;--card:#fff;--line:#ddd;--accent:#3b6dcc;--muted:#666;--bg:#fafafa}body{margin:0;font-family:sans-serif}.qbAccountCluster{display:flex;justify-content:flex-end;align-items:center;gap:6px}button{min-height:44px}'});
 await page.addStyleTag({content:read('image-library-v1.css')});
 await page.addScriptTag({content:read('image-library-core-v1.js')});
 await page.evaluate(()=>{
  const clone=x=>JSON.parse(JSON.stringify(x)),C=QBImageLibraryCore;
  window.testRole='admin';window.testQuestion={id:'q1'};window.pq=()=>testQuestion;
  window.oldClicks=0;document.querySelector('#oldUpload').onclick=()=>oldClicks++;document.querySelector('#oldRecent').onclick=()=>oldClicks++;
  window.events=[];addEventListener('qb-content-updated',e=>events.push(e.detail));
  const item=(id,name,extra={})=>({id,object_path:id+'/original.png',original_path:id+'/original.png',revision:1,image_version:1,metadata:{name,subject_ids:['s1'],topics:['眼球運動'],keywords:[],aspects:['構造'],roles:['総まとめ'],aliases:[],related_keywords:[],notes:'',ocr_text:'本文には動眼神経の説明があります',visual_summary:'',analysis_status:'unprocessed',classification_status:'unknown',...extra},manual_fields:[],ai_suggestions:{},archived:false,created_at:'2026-09-10T00:00:00Z'});
  window.db={profiles:[{id:'admin',role:'admin'}],qb_image_library_config:[{singleton:true,enabled:true}],subjects:[{id:'s1',name:'眼科学',sort_order:1},{id:'s2',name:'神経学',sort_order:2}],qb_image_library_terms:[{id:'t1',canonical:'動眼神経',aliases:['どうがんしんけい'],revision:1}],qb_image_library_items:[item('i1','眼球運動の総まとめ'),item('i2','神経に絞った図',{topics:['動眼神経']})],qb_image_library_usages:[],qb_image_library_readings:[],qb_image_library_history:[],question_images:[]};
  window.objects=new Map();window.calls=[];window.fault='';window.downloadHook=null;
  const pixel=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  for(const r of db.qb_image_library_items)objects.set('qb-image-library/'+r.object_path,new Blob([pixel],{type:'image/png'}));
  class Query{
   constructor(t){this.t=t;this.filters=[];this.mode='select';this.bounds=[0,9999]}
   select(){return this}eq(k,v){this.filters.push([k,v]);return this}order(){return this}range(a,b){this.bounds=[a,b];return this}limit(n){this.bounds=[0,n-1];return this}
   insert(p){this.mode='insert';this.payload=p;return this}update(p){this.mode='update';this.payload=p;return this}
   single(){this.one=true;return this.run()}maybeSingle(){this.one=true;return this.run()}then(a,b){return this.run().then(a,b)}
   async run(){
    calls.push([this.mode,this.t]);if(this.t==='profiles')return {data:{role:testRole}};
    let rows=db[this.t]||[],matching=rows.filter(r=>this.filters.every(([k,v])=>r[k]===v));
    if(this.mode==='insert'){const r={...this.payload};if(this.t==='qb_image_library_items')Object.assign(r,{revision:1,image_version:1,manual_fields:[],ai_suggestions:{},archived:false,created_at:new Date().toISOString()});rows.push(r);matching=[r]}
    if(this.mode==='update')matching.forEach(r=>Object.assign(r,this.payload));
    matching=matching.slice(this.bounds[0],this.bounds[1]+1);return{data:clone(this.one?(matching[0]||null):matching),error:null};
   }
  }
  const err=message=>({error:{message,code:'40001'}});
  window.qbSupabase={auth:{getUser:async()=>({data:{user:{id:'admin'}}}),onAuthStateChange:f=>{window.authChanged=f}},from:t=>new Query(t),storage:{from:bucket=>({
   createSignedUrl:async p=>({data:{signedUrl:URL.createObjectURL(objects.get(bucket+'/'+p)||new Blob([pixel],{type:'image/png'}))}}),
   upload:async(p,b)=>{calls.push(['upload',bucket,p]);if(objects.has(bucket+'/'+p))return err('already exists');objects.set(bucket+'/'+p,b);if(fault==='upload-response'){fault='';return err('lost upload response')}return{data:{path:p}}},
   download:async p=>{calls.push(['download',bucket,p]);if(downloadHook){const h=downloadHook;downloadHook=null;h()}return objects.has(bucket+'/'+p)?{data:objects.get(bucket+'/'+p)}:err('missing')},
   remove:async()=>{throw Error('Destructive Storage operation attempted')}
  })},rpc:async(name,a)=>{
   calls.push(['rpc',name]);
   if(name==='qb_library_search'){
    const forms=C.searchForms(a.p_query,db.qb_image_library_terms);
    const results=db.qb_image_library_items.filter(r=>r.archived===a.p_archived&&(!a.p_subjects.length||a.p_subjects.some(s=>r.metadata.subject_ids.includes(s)))).map(r=>{const match=forms.length?Object.entries(r.metadata).find(([,v])=>forms.every(ff=>ff.some(f=>C.normalize(Array.isArray(v)?v.join('、'):v).includes(f)))):null;return (!forms.length||match)?{item:clone(r),match_source:match?.[0]||'',match_text:String(match?.[1]||''),score:1}:null}).filter(Boolean);
    return{data:results.slice(a.p_offset,a.p_offset+a.p_limit).map(r=>({...r,total_count:results.length,use_count:0}))};
   }
   const r=db.qb_image_library_items.find(r=>r.id===a.p_id);if(!r)return err('missing image');
   if(name==='qb_library_attach'){
    const old=db.qb_image_library_usages.find(x=>x.id===a.p_request_id);if(old)return{data:clone(old)};
    if(r.revision!==a.p_revision||r.archived)return err('原本が更新されています');
    if(!objects.has('question-media/'+a.p_copy_path))return err('missing copy');
    const image={id:crypto.randomUUID(),question_id:a.p_question_id,placement:a.p_placement,choice_id:a.p_choice_id,image_path:a.p_copy_path};db.question_images.push(image);
    const use={id:a.p_request_id,image_id:r.id,question_image_id:image.id,question_id:a.p_question_id,placement:a.p_placement,choice_id:a.p_choice_id,initial_copy_path:a.p_copy_path,image_version:r.image_version,created_at:new Date().toISOString()};db.qb_image_library_usages.push(use);
    if(fault==='rpc-response'){fault='';return err('lost success response')}return{data:clone(use)};
   }
   if(r.revision!==a.p_revision)return err('他の更新があります');
   if(name==='qb_library_record_reading'){
    db.qb_image_library_readings.push({id:a.p_request_id,image_id:r.id,image_version:r.image_version,...a.p_reading,created_at:new Date().toISOString()});
    a={...a,p_origin:'ai',p_patch:{...a.p_classification,ocr_text:a.p_reading.corrected_text,visual_summary:a.p_reading.visual_summary||'',analysis_status:(a.p_reading.repairs||[]).some(x=>x.confidence!=='high')?'needs_review':'processed'}};
   }
   if(name==='qb_library_save'||name==='qb_library_record_reading'){
    const before=clone(r);
    for(const [k,v] of Object.entries(a.p_patch)){if(a.p_origin==='ai'&&r.manual_fields.includes(k)){r.ai_suggestions[k]={value:v};continue}r.metadata[k]=v;if(a.p_origin!=='ai'&&!r.manual_fields.includes(k))r.manual_fields.push(k);delete r.ai_suggestions[k]}
    if(a.p_archived!=null)r.archived=a.p_archived;
    if(a.p_object_path){r.object_path=a.p_object_path;r.image_version++;r.metadata.ocr_text='';r.metadata.analysis_status='unprocessed'}r.revision++;
    db.qb_image_library_history.push({image_id:r.id,revision:r.revision,before_value:before,after_value:clone(r),origin:a.p_origin||'manual',reason:'変更',created_at:new Date().toISOString()});return{data:clone(r)};
   }
   throw Error('unexpected RPC '+name);
  }};
 });
 for(const s of ['image-library-store-v1.js','image-library-ui-v1.js','image-library-integration-v1.js'])await page.addScriptTag({content:read(s)});
 await page.locator('.qbLibraryEntry').waitFor();return{page,errors};
}
async function run(browser,name){
 const {page:p,errors}=await boot(browser);let n=0;const pass=s=>console.log(name+' '+(++n)+' '+s);
 assert.deepEqual(await p.locator('.qbAccountCluster button').evaluateAll(es=>es.map(e=>e.className||e.id)),['qbRankBtn','qbLibraryEntry','acctBtn']);
 assert.equal(await p.locator('.qbLibraryAction').count(),2);await p.locator('#oldUpload').click();await p.locator('#oldRecent').click();assert.equal(await p.evaluate(()=>oldClicks),2);
 assert.equal(await p.evaluate(()=>calls.filter(c=>c[0]==='rpc').length),0);pass('additive entry and no startup AI or mutations');
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 await p.getByRole('searchbox').fill('どうがんしんけい');await p.getByRole('button',{name:'検索',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.qbLibrarySnippet mark').length===2);
 assert.ok(await p.locator('.qbLibrarySnippet').first().textContent());pass('body alias matches visible without classification');
 await p.locator('.qbLibraryImageButton').first().click();await p.getByLabel('画像名',{exact:true}).waitFor();
 await p.getByLabel('神経学',{exact:true}).last().check();await p.getByLabel('補足・学習意図',{exact:true}).fill('比較したいところ');await p.getByLabel('読み取り本文',{exact:true}).fill('手動で直した動眼神経の本文');
 await p.getByRole('button',{name:'変更を保存',exact:true}).click();await p.waitForFunction(()=>db.qb_image_library_items[0].revision===2);await p.getByLabel('画像名',{exact:true}).waitFor();
 assert.deepEqual(await p.evaluate(()=>db.qb_image_library_items[0].metadata.subject_ids),['s1','s2']);pass('multiple subjects and editable full body');
 await p.getByLabel('画像名',{exact:true}).fill('競合中の下書き');await p.evaluate(()=>db.qb_image_library_items[0].revision++);await p.getByRole('button',{name:'変更を保存',exact:true}).click();await p.getByRole('button',{name:'最新情報を別表示'}).waitFor();
 assert.equal(await p.getByLabel('画像名',{exact:true}).inputValue(),'競合中の下書き');await p.getByRole('button',{name:'一覧へ戻る'}).click();pass('conflicting updates keep draft without overwriting');
 await p.getByRole('searchbox').fill('');await p.getByRole('button',{name:'検索',exact:true}).click();
 await p.locator('.qbLibraryTools input[type=file][multiple]').setInputFiles({name:'unprocessed.png',mimeType:'image/png',buffer:Buffer.from('independent original bytes')});await p.waitForFunction(()=>db.qb_image_library_items.length===3);
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.analysis_status),'unprocessed');
 assert.equal(await p.evaluate(()=>calls.filter(c=>c[1]==='qb_library_record_reading').length),0);
 await p.getByRole('button',{name:'閉じる',exact:true}).click();assert.equal(await p.locator('#draft').inputValue(),'保存していない問題文');assert.equal(await p.locator('main').evaluate(n=>n.inert),false);pass('upload immediately usable, no OCR, background draft preserved');
 await p.locator('.qsiEditor .qbLibraryAction').click();await p.locator('.qbLibrarySelect').first().waitFor();await p.locator('.qbLibrarySelect input').nth(1).check();await p.locator('.qbLibrarySelect input').nth(0).check();await p.getByRole('button',{name:'選択した画像を貼る'}).click();await p.locator('.qbLibraryOverlay').waitFor({state:'detached'});
 const copied=await p.evaluate(()=>({images:db.question_images,uses:db.qb_image_library_usages,events}));assert.equal(copied.images.length,2);assert.notEqual(copied.images[0].image_path,copied.images[1].image_path);assert.deepEqual(copied.uses.map(r=>r.image_id),['i2','i1']);assert.equal(copied.events.length,1);pass('selection order, independent copies and recent-image table registration');
 const faults=await p.evaluate(async()=>{
  const S=QBImageLibraryStore,sb=qbSupabase,row=await S.get(sb,'i1'),context={questionId:'q1',placement:'question',choiceId:null,alive:()=>true};
  const start=db.question_images.length,job=S.newJob(row,context);fault='rpc-response';await S.attach(sb,row,context,job);await S.attach(sb,row,context,job);
  const rpcOnce=db.question_images.length===start+1;
  const uploadJob=S.newJob(row,context);fault='upload-response';await S.attach(sb,row,context,uploadJob);
  const mismatch=S.newJob(row,context);objects.set('question-media/'+mismatch.path,new Blob(['wrong']));let collision=false;try{await S.attach(sb,row,context,mismatch)}catch{collision=true}
  let alive=true;const navContext={...context,alive:()=>alive},navJob=S.newJob(row,navContext);downloadHook=()=>{alive=false};let navigation=false;try{await S.attach(sb,row,navContext,navJob)}catch{navigation=true}
  const staleJob=S.newJob(row,context);db.qb_image_library_items[0].revision++;let stale=false;try{await S.attach(sb,row,context,staleJob)}catch{stale=true}
  const byteBefore=await objects.get('question-media/'+job.path).text();objects.set('qb-image-library/'+row.object_path,new Blob(['changed original']));const independent=(await objects.get('question-media/'+job.path).text())===byteBefore;
  return{rpcOnce,collision,navigation,stale,independent,count:db.question_images.length-start,uploads:calls.filter(c=>c[0]==='upload'&&c[2]===job.path).length};
 });assert.deepEqual(faults,{rpcOnce:true,collision:true,navigation:true,stale:true,independent:true,count:2,uploads:1});pass('lost responses, collisions, navigation and stale sources fail safely');
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();await p.locator('.qbLibraryImageButton').first().click();await p.getByLabel('画像名',{exact:true}).waitFor();
 await p.getByText('AIに依頼する・結果を取り込む',{exact:true}).click();const envelope=await p.evaluate(()=>{const r=db.qb_image_library_items[0];return{image_id:r.id,image_version:r.image_version,revision:r.revision,request_id:crypto.randomUUID(),reading:{raw_text:'動□神経',corrected_text:'AIの修正',visual_summary:'図も確認',repairs:[{before:'動□神経',after:'動眼神経',reason:'前後の文脈',confidence:'uncertain'}]}}});
 await p.getByLabel('AIから受け取った結果',{exact:true}).fill(JSON.stringify(envelope));await p.getByRole('button',{name:'結果を取り込む',exact:true}).click();await p.getByText('手動編集を保持したAIの変更案',{exact:true}).waitFor();
 assert.equal(await p.getByLabel('読み取り本文',{exact:true}).inputValue(),'手動で直した動眼神経の本文');await p.getByText('読み取り・補完結果',{exact:true}).click();await p.getByText(/画像版 1/).first().waitFor();pass('explicit AI import preserves manual text and exposes repair history');
 await p.getByRole('button',{name:'ライブラリから削除',exact:true}).click();await p.getByRole('searchbox').waitFor();await p.getByText('絞り込み',{exact:true}).click();await p.getByLabel('削除した画像を表示',{exact:true}).check();await p.waitForFunction(()=>document.querySelectorAll('.qbLibraryItem').length===1);await p.locator('.qbLibraryImageButton').click();await p.getByRole('button',{name:'ライブラリへ戻す',exact:true}).click();await p.waitForFunction(()=>!db.qb_image_library_items[0].archived);pass('archive can be reversed, copies survive');
 await p.getByRole('button',{name:'閉じる',exact:true}).click();
 await p.evaluate(()=>{testRole='user';authChanged()});await p.locator('.qbLibraryEntry').waitFor({state:'detached'});assert.equal(await p.locator('.qbLibraryAction').count(),0);assert.equal(await p.locator('#oldUpload').count(),1);pass('non-admin entry hidden and old controls retained');
 assert.deepEqual(errors,[]);await p.close();console.log(name+' '+n+' image-library browser checks passed');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,name)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
