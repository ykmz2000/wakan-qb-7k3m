'use strict';
// Real application entry points, synthetic accounts only, all network blocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const shell=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[\s\S]*?<\/script>/g,'').replace('class="qb-auth-pending"','');
async function boot(browser,seed=null,userId='u1'){
  const p=await browser.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(12000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
  await p.route('**/*',r=>r.request().url()==='https://qb-history.test/'?r.fulfill({contentType:'text/html',body:shell}):r.abort());
  await p.goto('https://qb-history.test/');
  await p.evaluate(({seed,userId})=>{
    const copy=x=>JSON.parse(JSON.stringify(x));
    const question=(id,mode,order)=>({id,subject_id:'s1',unit_id:'unit1',status:'published',study_order:order,answer_mode:mode,stem:mode==='fill_blank'?'入力 [A] [B]':'設問 '+id,explanation_overview:'ポイントの本文',examiner_intent:'意図',exam_summary:'まとめ',medical_verification_note:'確認',question_occurrences:[{id:'o-'+id,academic_year:2025,exam_type:'本試',original_question_number:String(order),official_answer:{A:'正答A',B:'正答B'}}],choices:mode==='fill_blank'?[]:[{id:id+'-a',choice_key:'a',choice_text:'選択肢a',is_correct:true,sort_order:0,explanation:'aの解説'},{id:id+'-b',choice_key:'b',choice_text:'選択肢b',is_correct:false,sort_order:1,explanation:'bの解説'}]});
    window.testUser=userId;window.testDelayAttempt=0;window.testFailRating=false;window.testFailHistory=false;window.testWrites=[];
    window.testDB=seed||{
      grades:[{id:'g1',code:'M4',name:'M4'}],subjects:[{id:'s1',grade_id:'g1',slug:'test',name:'検証科目',is_active:true}],units:[{id:'unit1',subject_id:'s1',name:'検証単元',is_active:true}],
      questions:[question('q1','single',1),question('q2','multiple',2),question('q3','fill_blank',3)],profiles:[{id:'u1',role:'user'}],practice_sessions:[],user_question_state:[],question_ratings:[{user_id:'u1',question_id:'q1',rating:'△'}],
      attempts:[{id:1,user_id:'u1',question_id:'q1',selected_choice_keys:['b'],is_correct:false,answered_at:'2026-09-07T00:12:00Z'},{id:2,user_id:'u1',question_id:'q1',selected_choice_keys:['a'],is_correct:true,answered_at:'2026-09-08T14:05:00Z'},{id:3,user_id:'u2',question_id:'q1',selected_choice_keys:['PRIVATE'],is_correct:false,answered_at:'2026-09-09T00:00:00Z'}],
      attempt_self_ratings:[{attempt_id:2,user_id:'u1',rating:'△',rating_source:'manual',rated_at:'2026-09-08T14:05:10Z'}]
    };
    class Query{
      constructor(table){this.table=table;this.filters=[];this.orders=[];this.mode='read';this.cols='';this.one=false;this.n=null}
      select(cols){this.cols=cols||'';return this}eq(k,v){this.filters.push(x=>x[k]===v);return this}is(k,v){this.filters.push(x=>(x[k]??null)===v);return this}lt(k,v){this.filters.push(x=>x[k]<v);return this}in(k,vs){this.filters.push(x=>vs.includes(x[k]));return this}
      order(k,{ascending=true}={}){this.orders.push([k,ascending]);return this}limit(n){this.n=n;return this}
      insert(p){this.mode='insert';this.payload=p;return this}update(p){this.mode='update';this.payload=p;return this}upsert(p){this.mode='upsert';this.payload=p;return this}
      single(){this.one=true;return this.execute()}maybeSingle(){this.one=true;return this.execute()}then(a,b){return this.execute().then(a,b)}
      async execute(){
        if(this.table==='attempts'&&this.mode==='read'&&testFailHistory)return{data:null,error:{message:'history fixture failure'}};
        if(this.table==='attempts'&&this.mode==='insert'&&testDelayAttempt)await new Promise(r=>setTimeout(r,testDelayAttempt));
        const rows=testDB[this.table]||(testDB[this.table]=[]);let found=rows.filter(x=>this.filters.every(f=>f(x)));
        if(this.mode==='insert'||this.mode==='upsert'){
          let item=this.mode==='upsert'?rows.find(x=>x.user_id===this.payload.user_id&&x.question_id===this.payload.question_id):null;
          if(item)Object.assign(item,copy(this.payload));else{item={id:1+Math.max(0,...rows.map(x=>Number(x.id)||0)),...copy(this.payload)};rows.push(item)}found=[item];
        }else if(this.mode==='update')found.forEach(x=>Object.assign(x,copy(this.payload)));
        if(this.mode!=='read')testWrites.push({table:this.table,mode:this.mode,payload:copy(this.payload)});
        found=copy(found);if(this.table==='attempts'&&this.cols.includes('attempt_self_ratings'))found.forEach(x=>x.attempt_self_ratings=copy(testDB.attempt_self_ratings.filter(r=>r.attempt_id===x.id&&r.user_id===testUser)));
        found.sort((a,b)=>{for(const [key,asc] of this.orders){if(a[key]!==b[key])return(a[key]<b[key]?-1:1)*(asc?1:-1)}return 0});
        if(this.n!==null)found=found.slice(0,this.n);return{data:this.one?found[0]||null:found,error:null};
      }
    }
    window.qbSupabase={auth:{getUser:async()=>({data:{user:{id:testUser}},error:null})},from:t=>new Query(t),rpc:async(name,args)=>{
      if(name==='get_subject_question_progress_v2')return{data:[],error:null};
      if(name!=='save_attempt_self_rating')throw new Error('Unexpected RPC '+name);
      if(testFailRating)return{data:null,error:{message:'rating fixture failure'}};
      const a=testDB.attempts.find(x=>x.id===args.p_attempt_id&&x.user_id===testUser);if(!a)return{error:{message:'owner mismatch'}};
      const latest=Math.max(...testDB.attempts.filter(x=>x.user_id===testUser&&x.question_id===a.question_id).map(x=>x.id));
      if(args.p_source==='manual'&&a.id!==latest)return{error:{message:'別の回答が保存されています'}};
      let r=testDB.attempt_self_ratings.find(x=>x.attempt_id===a.id);const change=!r||args.p_source==='manual';
      if(!r){r={attempt_id:a.id,user_id:testUser};testDB.attempt_self_ratings.push(r)}
      if(change){Object.assign(r,{rating:args.p_rating,rating_source:args.p_rating?args.p_source:null,rated_at:args.p_rating?new Date().toISOString():null});
        if(a.id===latest&&args.p_rating){let global=testDB.question_ratings.find(x=>x.user_id===testUser&&x.question_id===a.question_id);if(!global){global={user_id:testUser,question_id:a.question_id};testDB.question_ratings.push(global)}global.rating=args.p_rating;}
      }return{data:null,error:null};
    }};
  },{seed,userId});
  for(const f of ['answer-history-v1.js','qb-app.js','shared-explanation-ui.js','fill-blank-v2.js'])await p.addScriptTag({content:fs.readFileSync(path.join(root,f),'utf8')});
  await p.locator('[data-s="s1"]').click();await p.locator('[data-u="unit1"]').click();await p.locator('#start').click();await p.locator('[data-mode="ordered"]').click();await p.locator('.choice[data-c="0"]').waitFor();
  return{p,errors};
}
async function ready(p){await p.waitForFunction(()=>{const d=document.querySelector('#ans:not(.hidden) .qbSharedRating');return d&&!d.querySelector('[data-qb-rate]').disabled&&!d.querySelector('.qbAttemptPast').textContent.includes('読み込み中')});}
async function rate(p,value){await p.locator(`[data-qb-rate="${value}"]`).click();await p.waitForFunction(()=>document.querySelector('.qbRateMsg')?.textContent==='保存しました')}
async function answer(p,keys=[0]){for(const key of keys)await p.locator(`[data-c="${key}"]`).click();await p.locator('#answer').click();await ready(p)}
async function run(browser,name){
  let {p,errors}=await boot(browser);assert.equal(await p.locator('.qbAttemptPast').count(),0,'history hidden before answering');
  await p.evaluate(()=>testDelayAttempt=300);await p.locator('[data-c="0"]').click();await p.locator('#answer').click();
  await p.locator('.qbAttemptCurrent').waitFor();assert.equal(await p.locator('[data-qb-rate="△"]').isEnabled(),false,'wait for exact attempt ID before grading');await ready(p);
  assert.equal(await p.locator('.qbAttemptRow').count(),3);assert.match(await p.locator('.qbAttemptCurrent').textContent(),/今回.*自分の回答：a.*判定：正解.*○（自動設定）/s);
  const past=p.locator('.qbAttemptPast');assert.match(await past.textContent(),/前回.*2026\/09\/08 23:05.*自己評価：△.*前々回.*自己評価：記録なし/s);assert.doesNotMatch(await past.textContent(),/PRIVATE/);
  await rate(p,'◎');assert.equal(await p.evaluate(()=>testDB.attempt_self_ratings.find(x=>x.attempt_id===4).rating),'◎');assert.equal(await p.evaluate(()=>testDB.question_ratings[0].rating),'◎');assert.equal(await p.evaluate(()=>testDB.attempt_self_ratings.find(x=>x.attempt_id===2).rating),'△');
  await p.locator('#answer').click();assert.equal(await p.locator('#ans').isVisible(),false);await answer(p,[1]);await rate(p,'×');
  assert.match(await p.locator('.qbAttemptCurrent').textContent(),/自分の回答：b.*判定：不正解/s);assert.match(await past.textContent(),/前回.*自己評価：◎.*前々回.*自己評価：△/s);assert.equal(await past.locator('button').count(),0);
  const before=await p.evaluate(()=>JSON.stringify(testDB.attempt_self_ratings));const count=await p.evaluate(()=>testDB.attempts.length);
  await p.locator('#answer').click();await p.locator('#review').click();await ready(p);await rate(p,'△');assert.equal(await p.evaluate(()=>testDB.attempts.length),count);assert.equal(await p.evaluate(()=>JSON.stringify(testDB.attempt_self_ratings)),before);assert.match(await p.locator('.qbAttemptCurrent').textContent(),/今回は解説のみ/);
  const seed=await p.evaluate(()=>testDB);assert.deepEqual(errors,[]);await p.close();console.log(name+' PASS current/previous/two-back, exact JST, auto/manual rating, retry, readonly history, review-only isolation');
  ({p,errors}=await boot(browser,seed));await p.locator('#review').click();await ready(p);assert.match(await p.locator('.qbAttemptPast').textContent(),/自己評価：×.*自己評価：◎/s);assert.deepEqual(errors,[]);await p.close();
  ({p,errors}=await boot(browser,seed,'u2'));await p.locator('#review').click();await ready(p);assert.match(await p.locator('.qbAttemptPast').textContent(),/PRIVATE/);assert.equal(await p.locator('.qbAttemptPast .qbAttemptRow').count(),1);await p.close();console.log(name+' PASS reload persistence and account-specific history');
  ({p,errors}=await boot(browser));await p.locator('#next').click();await answer(p,[0,1]);assert.match(await p.locator('.qbAttemptCurrent').textContent(),/自分の回答：a・b/);assert.match(await p.locator('.qbAttemptPast').textContent(),/過去の回答はありません/);
  await p.locator('#next').click();await p.locator('.fbInput[data-k="A"]').fill('入力 <script>\n2行目');await p.locator('.fbInput[data-k="B"]').fill('Bの答え');await p.locator('#answer').click();await ready(p);
  assert.match(await p.locator('.qbAttemptCurrent').textContent(),/A：入力 <script>\n2行目\nB：Bの答え.*自動採点なし.*未評価/s);assert.equal(await p.locator('.qbAttemptCurrent script').count(),0);await rate(p,'○');
  const fill=await p.evaluate(()=>testDB.attempts.find(x=>x.question_id==='q3'));assert.equal(fill.is_correct,null);assert.equal(fill.response_payload.B,'Bの答え');
  await p.evaluate(()=>qbRetryCurrent());await p.locator('.fbInput[data-k="A"]').fill('別の答え');await p.locator('.fbInput[data-k="B"]').fill('次のB');await p.locator('#answer').click();await ready(p);assert.match(await p.locator('.qbAttemptPast').textContent(),/B：Bの答え.*自己評価：○/s);assert.equal(await p.locator('[data-qb-rate].on').count(),0,'new written attempt must not inherit previous rating');
  assert.deepEqual(errors,[]);await p.close();console.log(name+' PASS multiple choice, first attempt, multiline written response, escaping and ungraded/unrated written attempts');
  ({p,errors}=await boot(browser));await p.evaluate(()=>testFailRating=true);await answer(p);assert.match(await p.locator('.qbAttemptCurrent').textContent(),/自己評価の保存に失敗/);await p.evaluate(()=>testFailRating=false);await rate(p,'△');assert.equal(await p.evaluate(()=>testDB.attempts.filter(x=>x.user_id==='u1').length),3,'retry rating does not duplicate answer');
  await p.evaluate(()=>testFailRating=true);await p.locator('[data-qb-rate="◎"]').click();await p.waitForFunction(()=>document.querySelector('.qbRateMsg').textContent.includes('保存できませんでした'));assert.equal(await p.locator('[data-qb-rate="△"]').getAttribute('aria-pressed'),'true');
  await p.evaluate(()=>{testFailRating=false;testFailHistory=true});await p.locator('#answer').click();await p.locator('#review').click();await p.locator('.qbAttemptRetry').waitFor();await p.evaluate(()=>testFailHistory=false);await p.locator('.qbAttemptRetry').click();await ready(p);assert.equal(await p.locator('.qbAttemptPast .qbAttemptRow').count(),2);
  assert.deepEqual(errors,[]);await p.close();console.log(name+' PASS rating failures, retry without duplicate attempts, failed history reload recovery');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
