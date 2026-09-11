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
      range(a,b){this.slice=[a,b];return this}order(k,{ascending=true}={}){this.orders.push([k,ascending]);return this}limit(n){this.n=n;return this}
      insert(p){this.mode='insert';this.payload=p;return this}update(p){this.mode='update';this.payload=p;return this}upsert(p){this.mode='upsert';this.payload=p;return this}
      single(){this.one=true;return this.execute()}maybeSingle(){this.one=true;return this.execute()}then(a,b){return this.execute().then(a,b)}
      async execute(){
        if(window.testReadDelay&&this.mode==='read')await new Promise(r=>setTimeout(r,testReadDelay));
        if(window.testReadFail&&this.mode==='read')return{error:{message:'通信テスト失敗'}};
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
        if(this.slice)found=found.slice(this.slice[0],this.slice[1]+1);if(this.n!==null)found=found.slice(0,this.n);return{data:this.one?found[0]||null:found,error:null};
      }
    }
    window.qbSupabase={auth:{onAuthStateChange:()=>{},getUser:async()=>({data:{user:{id:testUser}},error:null})},from:t=>new Query(t),rpc:async(name,args)=>{
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
  for(const f of ['answer-history-v1.js','qb-app.js','shared-explanation-ui.js','fill-blank-v2.js','pull-to-refresh-v1.js'])await p.addScriptTag({content:fs.readFileSync(path.join(root,f),'utf8')});
  await p.locator('[data-s="s1"]').click();await p.locator('[data-u="unit1"]').click();await p.locator('#start').click();await p.locator('[data-mode="ordered"]').click();await p.locator('.choice[data-c="0"]').waitFor();
  return{p,errors};
}
async function run(browser,name){
 const {p,errors}=await boot(browser);
 await p.locator('[data-c="0"]').click();
 await p.evaluate(()=>{testDB.questions[0].stem='更新後の問題';testDB.questions[0].explanation_overview='最新の解説';testWrites=[]});
 assert.equal(await p.evaluate(()=>QBDataRefresh.refresh()),true);
 assert.equal(await p.evaluate(()=>qbGetScreen()),'practice');assert.equal(await p.locator('[data-c="0"]').getAttribute('class'),'choice sel');
 assert.match(await p.locator('#view > .card > .qtext').textContent(),/更新後/);
 assert.equal(await p.evaluate(()=>testWrites.length),0);
 await p.locator('#review').click();await p.waitForFunction(()=>document.querySelector('#ans .qbSharedRating'));await p.waitForTimeout(250);
 await p.evaluate(()=>{testDB.questions[0].explanation_overview='さらに最新';testWrites=[]});
 await p.evaluate(()=>QBDataRefresh.refresh());await p.waitForFunction(()=>document.querySelector('#ans')?.textContent.includes('さらに最新'));
 assert.equal(await p.evaluate(()=>testWrites.length),0,'refresh must never create attempts, ratings or sessions');
 // The shared explanation is decorated asynchronously after the refreshed text appears.
 await p.waitForFunction(()=>document.querySelector('#ans')?.dataset.qbExplanationReady==='q1'&&document.querySelector('#ans .qbSharedRating'));
 const old=await p.locator('#view').innerHTML();await p.evaluate(()=>testReadFail=true);
 assert.equal(await p.evaluate(()=>QBDataRefresh.refresh()),false);assert.equal(await p.locator('#view').innerHTML(),old);await p.evaluate(()=>testReadFail=false);
 await p.evaluate(()=>{const e=document.createElement('textarea');e.className='adeEditor';e.value='未保存';document.querySelector('#view').append(e)});
 assert.equal(await p.evaluate(()=>QBDataRefresh.refresh()),false);assert.equal(await p.locator('.adeEditor').inputValue(),'未保存');await p.locator('.adeEditor').evaluate(e=>e.remove());
 await p.evaluate(()=>{testReadDelay=150;window.refreshPending=QBDataRefresh.refresh();document.getElementById('next').click()});assert.equal(await p.evaluate(()=>refreshPending),false);await p.evaluate(()=>testReadDelay=0);
 assert.equal(await p.evaluate(()=>qbGetPracticeState().currentIndex),1);
 await p.locator('#next').click();await p.locator('.fbInput').first().waitFor();await p.locator('.fbInput').first().fill('入力を保持');
 assert.equal(await p.evaluate(()=>QBDataRefresh.refresh()),true);assert.equal(await p.locator('.fbInput').first().inputValue(),'入力を保持');
 await p.evaluate(()=>qbOpenSubjects());await p.locator('[data-s="s1"]').waitFor();
 await p.evaluate(()=>{testDB.subjects[0].name='新しい科目名';window.scrollTo(0,0)});
 assert.equal(await p.locator('.qbDataRefresh').count(),0);
 // Touch event delivery on both engines, including threshold and pinch cancellation.
 const gesture=async(distance,count=1)=>p.evaluate(({distance,count})=>{const target=document.querySelector('#view .title');const fire=(type,y,n)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:Array.from({length:n},(_,i)=>({clientX:120+i*30,clientY:y}))});target.dispatchEvent(e)};fire('touchstart',100,count);fire('touchmove',100+distance,count);if(count===1&&distance>10){const content=document.getElementById('choices');if(!content.style.transform)throw Error('Pull must move the content');}fire('touchend',100+distance,0)},{distance,count});
 await gesture(35);assert.doesNotMatch(await p.locator('[data-s="s1"]').textContent(),/新しい/);
 await gesture(100,2);assert.doesNotMatch(await p.locator('[data-s="s1"]').textContent(),/新しい/);
 await gesture(100);await p.waitForFunction(()=>document.querySelector('[data-s="s1"]')?.textContent.includes('新しい'));
 assert.equal(await p.evaluate(()=>qbGetScreen()),'subjects');assert.deepEqual(errors,[]);
 await p.close();console.log(name+' PASS read-only refresh, same question and selection, revealed answer, fill draft, errors, editor guard, stale navigation, pull threshold and multitouch');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,name)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
