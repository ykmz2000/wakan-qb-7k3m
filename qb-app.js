(()=>{
'use strict';
const V=document.getElementById('view'),C=document.getElementById('crumb'),H=document.getElementById('home'),M=document.getElementById('modal');
let sb=null,user=null,grade=null,subjects=[],subject=null,units=[],unitQuestionIndex=[],questions=[],qstate={},ratings={},screen='subjects',unitId=null,selected=new Set(),practice=[],pi=0,submitted=false,reviewOnly=false,sel=new Set(),practiceMode='ordered',sessionId=null,resumeCheckTimer=null,resumeDismissed=null;
const esc=(s='')=>String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot',"'":'&#39;'}[c]));
const stateOf=id=>qstate[id]||{};
function emit(){window.dispatchEvent(new CustomEvent('qb-screen-change',{detail:{screen}}))}
function setScreen(s){screen=s;render();emit();scrollTo({top:0,behavior:'smooth'});scheduleResumePrompt()}
async function waitSb(){for(let i=0;i<80;i++){if(window.qbSupabase){sb=window.qbSupabase;const r=await sb.auth.getUser();if(r.data?.user){user=r.data.user;return true}}await new Promise(r=>setTimeout(r,75))}return false}
async function loadSubjects(){
  const g=await sb.from('grades').select('id,code,name,sort_order').eq('code','M4').maybeSingle();if(g.error)throw g.error;grade=g.data;
  const r=await sb.from('subjects').select('id,slug,name,sort_order').eq('grade_id',grade.id).eq('is_active',true).order('sort_order');if(r.error)throw r.error;subjects=r.data||[];
}
async function chooseSubject(id){
  subject=subjects.find(x=>x.id===id);if(!subject)return;
  V.innerHTML=`<div class="card"><div class="title">${esc(subject.name)}</div><div class="sub">単元を読み込んでいます…</div></div>`;
  const [u,q]=await Promise.all([
    sb.from('units').select('id,slug,name,sort_order').eq('subject_id',subject.id).eq('is_active',true).order('sort_order'),
    sb.from('questions').select('id,unit_id').eq('subject_id',subject.id).eq('status','published')
  ]);if(u.error)throw u.error;if(q.error)throw q.error;
  units=u.data||[];unitQuestionIndex=q.data||[];
  const ids=unitQuestionIndex.map(x=>x.id);qstate={};ratings={};
  if(ids.length){
    const [st,rt]=await Promise.all([
      sb.from('user_question_state').select('question_id,has_viewed_explanation,has_answered,last_is_correct,last_answered_at').eq('user_id',user.id).in('question_id',ids),
      sb.from('question_ratings').select('question_id,rating').eq('user_id',user.id).in('question_id',ids)
    ]);
    (st.data||[]).forEach(x=>qstate[x.question_id]=x);(rt.data||[]).forEach(x=>ratings[x.question_id]=x.rating);
  }
  setScreen('units');
}
async function loadQuestionsForUnit(uid){
  unitId=uid;const ids=uid==='__all__'?unitQuestionIndex.map(x=>x.id):unitQuestionIndex.filter(x=>x.unit_id===uid).map(x=>x.id);
  if(!ids.length){questions=[];selected=new Set();setScreen('problems');return}
  V.innerHTML='<div class="card"><div class="title">問題を読み込んでいます…</div></div>';
  const r=await sb.from('questions').select('id,canonical_key,stem,instruction,answer_mode,study_order,explanation_overview,examiner_intent,exam_summary,medical_verification_note,unit_id,subtopic_id,subtopics(id,name),choices(id,choice_key,choice_text,is_correct,sort_order,explanation,correction_text,correct_for_other_context,examiner_distinction),question_occurrences(id,academic_year,exam_type,original_question_number,official_answer,source_page,source_file)').in('id',ids).order('study_order');
  if(r.error)throw r.error;
  questions=(r.data||[]).map(x=>{const occ=[...(x.question_occurrences||[])].sort((a,b)=>(b.academic_year||0)-(a.academic_year||0));const ch=[...(x.choices||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));return {...x,occ,choices:ch,ans:ch.map((c,i)=>c.is_correct?i:null).filter(i=>i!==null),subtopic:x.subtopics?.name||'その他'}});
  window.QB_QUESTIONS=questions;selected=new Set(questions.map(x=>x.id));setScreen('problems');
}
function render(){
  if(!V)return;H.classList.toggle('hidden',screen==='grades'||screen==='subjects'||screen==='practice');
  if(screen==='grades')return renderGrades();if(screen==='subjects')return renderSubjects();if(screen==='units')return renderUnits();if(screen==='problems')return renderProblems();return renderPractice();
}
function renderGrades(){C.textContent='学年を選択';V.innerHTML=`<div class="card"><div class="title">学年一覧</div><div class="sub">学年を選んでください。</div></div><button id="gradeM4" class="list"><div><div class="lt">M4</div><div class="meta">定期試験対策</div></div><div>›</div></button>`;document.getElementById('gradeM4').onclick=()=>setScreen('subjects')}
function renderSubjects(){C.textContent='M4 ＞ 科目を選択';V.innerHTML=`<div class="card"><div class="title">科目一覧</div><div class="sub">勉強する科目を選んでください。</div></div>${subjects.map(s=>`<button class="list" data-s="${s.id}"><div><div class="lt">${esc(s.name)}</div></div><div>›</div></button>`).join('')}`;V.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>chooseSubject(b.dataset.s).catch(showErr))}
function renderUnits(){
  C.textContent=`M4 ＞ ${subject.name} ＞ 単元`;const rows=[{id:'__all__',name:'すべて（収録済み）'},...units];
  V.innerHTML=`<div class="card"><div class="title">${esc(subject.name)}</div><div class="sub">学習する単元を選んでください。</div></div>`+rows.map(u=>{const ids=u.id==='__all__'?unitQuestionIndex.map(x=>x.id):unitQuestionIndex.filter(x=>x.unit_id===u.id).map(x=>x.id);const answered=ids.filter(id=>stateOf(id).has_answered).length,reviewed=ids.filter(id=>stateOf(id).has_viewed_explanation).length;return `<button class="list" data-u="${u.id}"><div style="flex:1"><div class="lt">${esc(u.name)}</div><div class="meta">${ids.length}問・解答済み ${answered}/${ids.length}・解説確認済み ${reviewed}/${ids.length}</div><div class="progress"><div style="width:${ids.length?answered/ids.length*100:0}%"></div></div></div><div>›</div></button>`}).join('');
  V.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>loadQuestionsForUnit(b.dataset.u).catch(showErr));
}
function renderProblems(){
  const u=unitId==='__all__'?{name:'すべて（収録済み）'}:units.find(x=>x.id===unitId);C.textContent=`${subject.name} ＞ ${u?.name||''} ＞ 問題一覧`;
  V.innerHTML=`<div class="card"><div class="title">${esc(u?.name||'')}</div><div class="meta">${questions.length}問</div></div><div class="card"><div class="row"><b>問題一覧</b><button id="toggleAll" class="btn">${selected.size===questions.length?'すべて解除':'すべて選択'}</button></div>${questions.map((q,i)=>{const st=stateOf(q.id),o=q.occ[0]||{};const status=st.has_answered?(st.last_is_correct?'正解':'不正解'):st.has_viewed_explanation?'解説のみ':'未閲覧';return `<div class="problem"><div class="qid">${i+1}</div><div><div class="qtext">${esc(q.stem)}</div><div class="meta">${q.occ.map(x=>x.academic_year).filter(Boolean).join('・')}｜${esc(o.exam_type||'')}｜${esc(o.original_question_number||'')}｜${status}</div></div><div class="pick"><input type="checkbox" data-q="${q.id}" ${selected.has(q.id)?'checked':''}></div></div>`}).join('')}</div><div class="sticky"><button id="start" class="primary">演習開始（${selected.size}問）</button></div>`;
  document.getElementById('toggleAll').onclick=()=>{selected=selected.size===questions.length?new Set():new Set(questions.map(q=>q.id));renderProblems()};
  V.querySelectorAll('[data-q]').forEach(x=>x.onchange=()=>{x.checked?selected.add(x.dataset.q):selected.delete(x.dataset.q);document.getElementById('start').textContent=`演習開始（${selected.size}問）`});
  document.getElementById('start').onclick=()=>{if(!selected.size)return;M.classList.remove('hidden')};
}
function current(){return questions.find(q=>q.id===practice[pi])}
function renderPractice(){
  const q=current();if(!q){setScreen('problems');return}const o=q.occ[0]||{};C.textContent=`${subject.name} ＞ 演習 ${pi+1}/${practice.length}`;
  const isText=!q.choices.length,official=o.official_answer;
  V.innerHTML=`<div class="card"><div class="row"><div><span class="badge">${esc(o.academic_year||'年度不明')}</span><span class="badge gray">${esc(o.exam_type||'')}</span></div><div class="meta">${pi+1}/${practice.length}</div></div><div class="qtext" style="font-size:18px;font-weight:800;margin-top:12px">${esc(q.stem)}</div>${q.instruction?`<div class="meta">${esc(q.instruction)}</div>`:''}${isText?`<div class="card" style="margin-top:12px"><div class="meta">記述・穴埋め問題</div><button id="showTextAnswer" class="secondary">解答を見る</button></div>`:`<div class="choices">${q.choices.map((c,i)=>`<button class="choice ${sel.has(i)?'sel':''}" data-c="${i}" ${submitted?'disabled':''}>${esc(c.choice_key)}. ${esc(c.choice_text)}</button>`).join('')}</div><div style="margin-top:12px"><button id="answer" class="primary" ${submitted||!sel.size?'disabled':''}>${submitted?'もう一度解く':'解答する'}</button><button id="review" class="secondary" style="margin-top:8px" ${submitted?'disabled':''}>解答せずに解説を見る</button></div>`}<div id="ans"></div><div class="nav"><button id="prev" class="btn" ${pi===0?'disabled':''}>← 前へ</button><button id="next" class="btn">${pi===practice.length-1?'終了':'次へ →'}</button></div></div>`;
  if(isText){document.getElementById('showTextAnswer').onclick=()=>{reviewOnly=true;submitted=true;drawTextAnswer(q,official);afterAnswerShown()}}else{
    V.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{if(submitted)return;const i=Number(b.dataset.c);if(q.answer_mode==='single'){sel=new Set([i]);V.querySelectorAll('[data-c]').forEach(x=>x.classList.toggle('sel',Number(x.dataset.c)===i))}else{sel.has(i)?sel.delete(i):sel.add(i);b.classList.toggle('sel',sel.has(i))}const a=document.getElementById('answer');if(a)a.disabled=!sel.size;window.dispatchEvent(new CustomEvent('qb-selection-change',{detail:{questionId:q.id,selected:[...sel]}}))});
    document.getElementById('answer').onclick=()=>submitted?retryCurrent():submitAnswer(q);
    document.getElementById('review').onclick=()=>submitReview(q);
  }
  document.getElementById('prev').onclick=()=>move(-1);document.getElementById('next').onclick=()=>pi===practice.length-1?finish():move(1);
  if(submitted&&!isText)drawAnswer(q);
}
function same(a,b){return a.length===b.length&&[...a].sort().every((x,i)=>x===[...b].sort()[i])}
function afterAnswerShown(){window.dispatchEvent(new CustomEvent('qb-answer-shown'));setTimeout(()=>document.getElementById('ans')?.scrollIntoView({behavior:'smooth',block:'start'}),90)}
async function submitAnswer(q){submitted=true;reviewOnly=false;const ok=same([...sel],q.ans);const now=new Date().toISOString(),keys=[...sel].sort((a,b)=>a-b).map(i=>q.choices[i]?.choice_key).filter(Boolean);await sb.from('attempts').insert({user_id:user.id,question_id:q.id,occurrence_id:q.occ[0]?.id||null,selected_choice_keys:keys,is_correct:ok,answered_at:now});const payload={user_id:user.id,question_id:q.id,has_viewed_explanation:true,explanation_viewed_at:now,has_answered:true,last_answered_at:now,last_is_correct:ok,last_selected_choice_keys:keys,updated_at:now};await sb.from('user_question_state').upsert(payload,{onConflict:'user_id,question_id'});qstate[q.id]=payload;renderPractice();afterAnswerShown();saveSession(false)}
async function submitReview(q){submitted=true;reviewOnly=true;const old=stateOf(q.id),now=new Date().toISOString(),payload={user_id:user.id,question_id:q.id,has_viewed_explanation:true,explanation_viewed_at:now,has_answered:!!old.has_answered,last_answered_at:old.last_answered_at||null,last_is_correct:typeof old.last_is_correct==='boolean'?old.last_is_correct:null,last_selected_choice_keys:old.last_selected_choice_keys||[],updated_at:now};await sb.from('user_question_state').upsert(payload,{onConflict:'user_id,question_id'});qstate[q.id]=payload;renderPractice();afterAnswerShown();saveSession(false)}
function drawAnswer(q){const A=document.getElementById('ans');if(!A)return;const ok=!reviewOnly&&same([...sel],q.ans);A.innerHTML=`<div class="card resultcard ${reviewOnly?'review':ok?'ok':'bad'}"><div class="result ${reviewOnly?'':ok?'oktxt':'badtxt'}">${reviewOnly?'解説モード（未解答）':ok?'✓ 正解！':'✕ 不正解'}</div><b>正解：${q.ans.map(i=>`${esc(q.choices[i]?.choice_key||'')} ${esc(q.choices[i]?.choice_text||'')}`).join('・')}</b></div>${q.explanation_overview?`<div class="card"><b>■ 問題文のポイント</b><div class="line">${esc(q.explanation_overview)}</div></div>`:''}${q.choices.some(c=>c.explanation)?`<div class="card"><b>■ 各選択肢</b>${q.choices.map((c,i)=>`<div class="exp"><b>${esc(c.choice_key)}. ${q.ans.includes(i)?'○':'×'} ${esc(c.choice_text)}</b><div class="line">${esc(c.explanation||'')}</div></div>`).join('')}</div>`:''}`}
function drawTextAnswer(q,official){const A=document.getElementById('ans');if(!A)return;let t='';if(Array.isArray(official))t=official.join('・');else if(official&&typeof official==='object')t=Object.values(official).flat().join('・');else t=official==null?'解答未登録':String(official);A.innerHTML=`<div class="card resultcard review"><div class="result">解答</div><b>${esc(t)}</b><div class="meta" style="margin-top:6px">解説のみ閲覧として扱います。</div></div>`}
function retryCurrent(){submitted=false;reviewOnly=false;sel=new Set();renderPractice();window.dispatchEvent(new CustomEvent('qb-retry-current'));setTimeout(()=>V.querySelector('.qtext')?.scrollIntoView({behavior:'smooth',block:'start'}),30)}
function move(d){pi+=d;submitted=false;reviewOnly=false;sel=new Set();renderPractice();saveSession(false);scrollTo({top:0,behavior:'smooth'})}
async function finish(){await completeSession();practice=[];pi=0;submitted=false;reviewOnly=false;sel=new Set();setScreen('problems')}
function showErr(e){console.error(e);V.innerHTML=`<div class="card"><div class="title">読み込みエラー</div><div class="sub">${esc(e?.message||e)}</div></div>`}
async function saveSession(create=false){if(!sb||!user||!subject||!practice.length)return;const now=new Date().toISOString(),payload={user_id:user.id,subject_id:subject.id,unit_id:unitId==='__all__'?null:unitId,mode:practiceMode,question_ids:practice,current_index:pi,is_completed:false,last_active_at:now,metadata:{unit_scope:unitId||'__all__'}};if(create||!sessionId){const r=await sb.from('practice_sessions').insert(payload).select('id').single();if(!r.error)sessionId=r.data.id}else await sb.from('practice_sessions').update({question_ids:practice,current_index:pi,last_active_at:now,mode:practiceMode,metadata:payload.metadata}).eq('id',sessionId)}
async function completeSession(){if(!sb||!sessionId)return;const now=new Date().toISOString();await sb.from('practice_sessions').update({current_index:pi,is_completed:true,last_active_at:now,completed_at:now}).eq('id',sessionId);sessionId=null}
function resumeCss(){if(document.getElementById('qbResumeV2Css'))return;const s=document.createElement('style');s.id='qbResumeV2Css';s.textContent=`#qbResumeV2{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:86;display:flex;gap:5px;background:#fff;border:1px solid #dce3ec;border-radius:999px;box-shadow:0 6px 20px #0002;padding:5px}#qbResumeV2 button{border:0;border-radius:999px;height:36px;font-weight:900}#qbResumeV2 .x{width:32px;background:#eef1f5;color:#6f7786}#qbResumeV2 .go{padding:0 12px;background:#126fb3;color:#fff;font-size:12px}`;document.head.appendChild(s)}
function scheduleResumePrompt(){clearTimeout(resumeCheckTimer);resumeCheckTimer=setTimeout(()=>showResumePrompt().catch(console.error),100)}
async function showResumePrompt(){document.getElementById('qbResumeV2')?.remove();if(screen==='practice'||!sb||!user)return;resumeCss();const r=await sb.from('practice_sessions').select('id,subject_id,unit_id,mode,question_ids,current_index,last_active_at,metadata').eq('user_id',user.id).eq('is_completed',false).order('last_active_at',{ascending:false}).limit(1).maybeSingle();if(r.error||!r.data||resumeDismissed===r.data.id||!(r.data.question_ids||[]).length)return;const s=r.data,d=document.createElement('div');d.id='qbResumeV2';d.innerHTML=`<button class="x" aria-label="閉じる">×</button><button class="go">続きから ${Math.min((s.current_index||0)+1,s.question_ids.length)}/${s.question_ids.length} ▶</button>`;document.body.appendChild(d);d.querySelector('.x').onclick=()=>{resumeDismissed=s.id;d.remove()};d.querySelector('.go').onclick=()=>resumeSession(s).catch(showErr)}
async function resumeSession(s){document.getElementById('qbResumeV2')?.remove();const target=subjects.find(x=>x.id===s.subject_id);if(!target)throw new Error('保存された科目が見つかりません');await chooseSubject(target.id);const scope=s.metadata?.unit_scope||(s.unit_id||'__all__');await loadQuestionsForUnit(scope);const available=new Set(questions.map(q=>q.id));practice=(s.question_ids||[]).filter(id=>available.has(id));if(!practice.length)throw new Error('保存された問題を読み込めません');selected=new Set(practice);pi=Math.max(0,Math.min(Number(s.current_index)||0,practice.length-1));practiceMode=s.mode||'ordered';sessionId=s.id;submitted=false;reviewOnly=false;sel=new Set();setScreen('practice')}
M.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{const ids=[...selected];practiceMode=b.dataset.mode||'ordered';practice=practiceMode==='shuffle'?ids.sort(()=>Math.random()-.5):ids;pi=0;submitted=false;reviewOnly=false;sel=new Set();sessionId=null;M.classList.add('hidden');setScreen('practice');saveSession(true)});document.getElementById('cancel').onclick=()=>M.classList.add('hidden');
H.onclick=()=>{if(screen==='subjects')return setScreen('grades');if(screen==='units')return setScreen('subjects');if(screen==='problems')return setScreen('units');return setScreen('subjects')};
window.qbGetScreen=()=>screen;window.qbOpenSubjects=()=>setScreen('subjects');window.qbOpenProblemList=()=>setScreen('problems');window.showGradeScreen=()=>setScreen('grades');window.qbRetryCurrent=retryCurrent;window.qbGetPracticeState=()=>({subjectId:subject?.id||null,unitId,questionIds:[...practice],currentIndex:pi,mode:practiceMode,sessionId});window.qbResumeSession=resumeSession;
window.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='practice')saveSession(false)});window.addEventListener('beforeunload',()=>{if(screen==='practice')saveSession(false)});
async function boot(){V.innerHTML='<div class="card"><div class="title">読み込み中…</div><div class="sub">科目情報を読み込んでいます。</div></div>';if(!(await waitSb()))return showErr(new Error('ログイン情報を確認できませんでした'));try{await loadSubjects();window.QB_DB_READY=true;setScreen('subjects');window.dispatchEvent(new CustomEvent('qb-app-ready'));window.dispatchEvent(new CustomEvent('qb-core-loaded'))}catch(e){showErr(e)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();