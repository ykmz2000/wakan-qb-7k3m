(()=>{
'use strict';
const V=document.getElementById('view'),C=document.getElementById('crumb'),H=document.getElementById('home'),M=document.getElementById('modal');
let sb=null,user=null,grade=null,subjects=[],subject=null,units=[],unitQuestionIndex=[],questions=[],qstate={},ratings={},unitProgressLoaded=false,unitProgressError=false,unitProgressToken=0,unitProgressPromise=null,screen='subjects',unitId=null,selected=new Set(),practice=[],pi=0,submitted=false,reviewOnly=false,sel=new Set(),practiceMode='ordered',sessionId=null,resumeCheckTimer=null,resumeDismissed=null;
const detailCache=new Map(),detailPending=new Map();
const LIST_SELECT='id,canonical_key,stem,study_order,unit_id,question_occurrences(id,academic_year,exam_type,original_question_number)';
const DETAIL_SELECT='id,canonical_key,stem,instruction,answer_mode,study_order,explanation_overview,examiner_intent,exam_summary,medical_verification_note,unit_id,subtopic_id,subtopics(id,name),choices(id,choice_key,choice_text,is_correct,sort_order,explanation,correction_text,correct_for_other_context,examiner_distinction),question_occurrences(id,academic_year,exam_type,original_question_number,official_answer,source_page,source_file)';
const esc=(s='')=>String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot',"'":'&#39;'}[c]));
const stateOf=id=>qstate[id]||{};
function normalizeOccurrences(xs){return [...(xs||[])].sort((a,b)=>(b.academic_year||0)-(a.academic_year||0))}
function normalizeListQuestion(x){return {...x,occ:normalizeOccurrences(x.question_occurrences),choices:[],ans:[],subtopic:'その他',_detailLoaded:false}}
function normalizeDetailQuestion(x){const occ=normalizeOccurrences(x.question_occurrences),ch=[...(x.choices||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));return {...x,occ,choices:ch,ans:ch.map((c,i)=>c.is_correct?i:null).filter(i=>i!==null),subtopic:x.subtopics?.name||'その他',_detailLoaded:true}}
function emit(){window.dispatchEvent(new CustomEvent('qb-screen-change',{detail:{screen}}))}
function setScreen(s){screen=s;render();emit();scrollTo({top:0,behavior:'smooth'});scheduleResumePrompt()}
async function waitSb(){for(let i=0;i<80;i++){if(window.qbSupabase){sb=window.qbSupabase;const r=await sb.auth.getUser();if(r.data?.user){user=r.data.user;return true}}await new Promise(r=>setTimeout(r,75))}return false}
async function loadSubjects(){
  const g=await sb.from('grades').select('id,code,name,sort_order').eq('code','M4').maybeSingle();if(g.error)throw g.error;grade=g.data;
  const r=await sb.from('subjects').select('id,slug,name,sort_order').eq('grade_id',grade.id).eq('is_active',true).order('sort_order');if(r.error)throw r.error;subjects=r.data||[];
}
async function loadUnitProgress(subjectId,ids,token){
  if(!ids.length){
    if(token!==unitProgressToken||subject?.id!==subjectId)return;
    qstate={};unitProgressLoaded=true;unitProgressError=false;
    if(screen==='units')renderUnits();
    return
  }
  const r=await sb.rpc('get_subject_question_progress_v2',{p_subject_id:subjectId});
  if(token!==unitProgressToken||subject?.id!==subjectId)return;
  if(r.error)throw r.error;
  const next={};
  (r.data||[]).forEach(x=>next[x.question_id]=x);
  qstate=next;unitProgressLoaded=true;unitProgressError=false;
  if(screen==='units')renderUnits();
  window.dispatchEvent(new CustomEvent('qb-unit-progress-loaded',{detail:{subjectId}}))
}
async function chooseSubject(id){
  subject=subjects.find(x=>x.id===id);if(!subject)return;
  detailCache.clear();detailPending.clear();
  const token=++unitProgressToken;
  V.innerHTML=`<div class="card"><div class="title">${esc(subject.name)}</div><div class="sub">単元を読み込んでいます…</div></div>`;
  const [u,q]=await Promise.all([
    sb.from('units').select('id,slug,name,sort_order').eq('subject_id',subject.id).eq('is_active',true).order('sort_order'),
    sb.from('questions').select('id,unit_id').eq('subject_id',subject.id).eq('status','published')
  ]);if(u.error)throw u.error;if(q.error)throw q.error;
  units=u.data||[];unitQuestionIndex=q.data||[];
  const ids=unitQuestionIndex.map(x=>x.id);qstate={};ratings={};unitProgressLoaded=false;unitProgressError=false;
  window.qbLoadQuestionSeries?.(subject.id).catch?.(e=>console.error('question series preload',e));
  setScreen('units');
  unitProgressPromise=loadUnitProgress(subject.id,ids,token).catch(e=>{if(token===unitProgressToken&&subject?.id===id){unitProgressLoaded=false;unitProgressError=true;if(screen==='units')renderUnits()}console.error('unit progress load',e)})
}
async function loadQuestionsForUnit(uid){
  unitId=uid;
  const expectedIds=uid==='__all__'?unitQuestionIndex.map(x=>String(x.id)):unitQuestionIndex.filter(x=>x.unit_id===uid).map(x=>String(x.id));
  if(!expectedIds.length){questions=[];selected=new Set();window.QB_QUESTIONS=questions;setScreen('problems');return}
  V.innerHTML='<div class="card"><div class="title">問題を読み込んでいます…</div><div class="sub">一覧表示に必要な情報だけ先に読み込んでいます。</div></div>';
  let z=sb.from('questions').select(LIST_SELECT).eq('subject_id',subject.id).eq('status','published').order('study_order');
  if(uid!=='__all__')z=z.eq('unit_id',uid);
  const r=await z;if(r.error)throw r.error;
  const allow=new Set(expectedIds);questions=(r.data||[]).filter(x=>allow.has(String(x.id))).map(normalizeListQuestion);
  for(let i=0;i<questions.length;i++){const cached=detailCache.get(String(questions[i].id));if(cached)questions[i]=cached}
  window.QB_QUESTIONS=questions;selected=new Set(questions.map(x=>String(x.id)));setScreen('problems');
}
async function ensureQuestionDetail(id){
  id=String(id||'');if(!id)throw new Error('問題IDがありません');
  if(detailCache.has(id))return detailCache.get(id);
  if(detailPending.has(id))return detailPending.get(id);
  const task=(async()=>{
    const r=await sb.from('questions').select(DETAIL_SELECT).eq('id',id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('問題データが見つかりません');
    const q=normalizeDetailQuestion(r.data);detailCache.set(id,q);
    const i=questions.findIndex(x=>String(x.id)===id);if(i>=0)questions[i]=q;
    window.QB_QUESTIONS=questions;return q
  })();
  detailPending.set(id,task);try{return await task}finally{detailPending.delete(id)}
}
function prefetchQuestionDetail(id){id=String(id||'');if(!id||detailCache.has(id)||detailPending.has(id))return;ensureQuestionDetail(id).catch(e=>console.warn('question prefetch',e))}
function render(){
  if(!V)return;H.classList.toggle('hidden',screen==='grades'||screen==='subjects'||screen==='practice');
  if(screen==='grades')return renderGrades();if(screen==='subjects')return renderSubjects();if(screen==='units')return renderUnits();if(screen==='problems')return renderProblems();return renderPractice();
}
function renderGrades(){C.textContent='学年を選択';V.innerHTML=`<div class="card"><div class="title">学年一覧</div><div class="sub">学年を選んでください。</div></div><button id="gradeM4" class="list"><div><div class="lt">M4</div><div class="meta">定期試験対策</div></div><div>›</div></button>`;document.getElementById('gradeM4').onclick=()=>setScreen('subjects')}
function renderSubjects(){C.textContent='M4 ＞ 科目を選択';V.innerHTML=`<div class="card"><div class="title">科目一覧</div><div class="sub">勉強する科目を選んでください。</div></div>${subjects.map(s=>`<button class="list" data-s="${s.id}"><div><div class="lt">${esc(s.name)}</div></div><div>›</div></button>`).join('')}`;V.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>chooseSubject(b.dataset.s).catch(showErr))}
function renderUnits(){
  C.textContent=`M4 ＞ ${subject.name} ＞ 単元`;const rows=[{id:'__all__',name:'すべて（収録済み）'},...units];
  V.innerHTML=`<div class="card"><div class="title">${esc(subject.name)}</div><div class="sub">学習する単元を選んでください。</div></div>`+rows.map(u=>{const ids=u.id==='__all__'?unitQuestionIndex.map(x=>x.id):unitQuestionIndex.filter(x=>x.unit_id===u.id).map(x=>x.id);const answered=ids.filter(id=>stateOf(id).has_answered).length,reviewed=ids.filter(id=>stateOf(id).has_viewed_explanation).length,meta=unitProgressError?`${ids.length}問・学習状況を取得できませんでした`:unitProgressLoaded?`${ids.length}問・解答済み ${answered}/${ids.length}・解説確認済み ${reviewed}/${ids.length}`:`${ids.length}問・学習状況を読み込み中…`;const card=`<button class="list" data-u="${u.id}"><div style="flex:1"><div class="lt">${esc(u.name)}</div><div class="meta">${meta}</div><div class="progress"><div style="width:${unitProgressLoaded&&ids.length?answered/ids.length*100:0}%"></div></div></div><div>›</div></button>`;return window.QBUnitPdf?.rowHTML(card,subject.id,u.id,u.name)||card}).join('');
  V.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>loadQuestionsForUnit(b.dataset.u).catch(showErr));
}
function renderProblems(){
  const u=unitId==='__all__'?{name:'すべて（収録済み）'}:units.find(x=>x.id===unitId);C.textContent=`${subject.name} ＞ ${u?.name||''} ＞ 問題一覧`;
  V.innerHTML=`<div class="card"><div class="title">${esc(u?.name||'')}</div><div class="meta">${questions.length}問</div></div><div class="card"><div class="row"><b>問題一覧</b><button id="toggleAll" class="btn">${selected.size===questions.length?'すべて解除':'すべて選択'}</button></div>${questions.map((q,i)=>{const st=stateOf(q.id),o=q.occ[0]||{};const status=st.has_answered?(st.last_is_correct?'正解':'不正解'):st.has_viewed_explanation?'解説のみ':'未閲覧';return `<div class="problem"><div class="qid">${i+1}</div><div><div class="qtext">${esc(q.stem)}</div><div class="meta">${q.occ.length?q.occ.map(x=>`${esc(x.academic_year||'年度不明')}｜${esc(x.exam_type||'本試・追再試不明')}｜${esc(x.original_question_number||'')}`).join(' ／ '):'年度不明｜本試・追再試不明'}｜${status}</div></div><div class="pick"><input type="checkbox" data-q="${q.id}" ${selected.has(String(q.id))?'checked':''}></div></div>`}).join('')}</div><div class="sticky"><button id="start" class="primary">演習開始（${selected.size}問）</button></div>`;
  document.getElementById('toggleAll').onclick=()=>{selected=selected.size===questions.length?new Set():new Set(questions.map(q=>String(q.id)));renderProblems()};
  V.querySelectorAll('[data-q]').forEach(x=>x.onchange=()=>{x.checked?selected.add(String(x.dataset.q)):selected.delete(String(x.dataset.q));document.getElementById('start').textContent=`演習開始（${selected.size}問）`});
  document.getElementById('start').onclick=()=>{if(!selected.size)return;M.classList.remove('hidden')};
}
function current(){return questions.find(q=>String(q.id)===String(practice[pi]))}
function renderPractice(){
  const q=current();if(!q){setScreen('problems');return}
  if(!q._detailLoaded){
    C.textContent=`${subject.name} ＞ ${units.find(u=>String(u.id)===String(q.unit_id))?.name||'単元未分類'}`;
    V.innerHTML='<div class="card"><div class="title">問題を読み込んでいます…</div><div class="sub">この1問の選択肢と解説を取得しています。</div></div>';
    const id=String(q.id);ensureQuestionDetail(id).then(()=>{if(screen==='practice'&&String(practice[pi])===id)renderPractice()}).catch(showErr);return
  }
  const o=q.occ[0]||{};C.textContent=`${subject.name} ＞ ${units.find(u=>String(u.id)===String(q.unit_id))?.name||'単元未分類'}`;
  // Reference choices in ordering/short-answer questions must not enable MCQ grading.
  const isText=q.answer_mode==='fill_blank'||!q.choices.length,official=o.official_answer;
  const referenceChoices=isText&&q.choices.length?`<div class="choices fbReferenceChoices" role="list" aria-label="参照用の選択肢">${q.choices.map(c=>`<div class="choice fbReferenceChoice" role="listitem" style="white-space:pre-wrap">${esc(c.choice_key)}. ${esc(c.choice_text)}</div>`).join('')}</div>`:'';
  V.innerHTML=`<div class="card"><div class="row"><div><span class="badge">${esc(o.academic_year||'年度不明')}</span><span class="badge gray">${esc(o.exam_type||'本試・追再試不明')}</span></div><div class="meta">${pi+1}/${practice.length}</div></div><div class="qtext" style="font-size:18px;font-weight:800;margin-top:12px">${esc(q.stem)}</div>${q.instruction?`<div class="meta">${esc(q.instruction)}</div>`:''}${referenceChoices}${isText?`<div class="card" style="margin-top:12px"><div class="meta">記述・穴埋め問題</div><button id="showTextAnswer" class="secondary">解答を見る</button></div>`:`<div class="choices">${q.choices.map((c,i)=>`<button class="choice ${sel.has(i)?'sel':''}" data-c="${i}" ${submitted?'disabled':''}>${esc(c.choice_key)}. ${esc(c.choice_text)}</button>`).join('')}</div><div style="margin-top:12px"><button id="answer" class="primary" ${submitted||!sel.size?'disabled':''}>${submitted?'もう一度解く':'解答する'}</button><button id="review" class="secondary" style="margin-top:8px" ${submitted?'disabled':''}>解答せずに解説を見る</button></div>`}<div id="ans"></div><div class="nav"><button id="prev" class="btn" ${pi===0?'disabled':''}>← 前へ</button><button id="next" class="btn">${pi===practice.length-1?'終了':'次へ →'}</button></div></div>`;
  if(isText){document.getElementById('showTextAnswer').onclick=()=>{reviewOnly=true;submitted=true;window.QBAnswerHistory?.review(q,user.id);drawTextAnswer(q,official);syncPracticeUi();afterAnswerShown()}}else{
    V.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{if(submitted)return;const i=Number(b.dataset.c);if(q.answer_mode==='single'){sel=new Set([i]);V.querySelectorAll('[data-c]').forEach(x=>x.classList.toggle('sel',Number(x.dataset.c)===i))}else{sel.has(i)?sel.delete(i):sel.add(i);b.classList.toggle('sel',sel.has(i))}const a=document.getElementById('answer');if(a)a.disabled=!sel.size;window.dispatchEvent(new CustomEvent('qb-selection-change',{detail:{questionId:q.id,selected:[...sel]}}))});
    document.getElementById('answer').onclick=()=>submitted?retryCurrent():submitAnswer(q);
    document.getElementById('review').onclick=()=>submitReview(q);
  }
  document.getElementById('prev').onclick=()=>move(-1);document.getElementById('next').onclick=()=>pi===practice.length-1?finish():move(1);
  if(submitted&&!isText){drawAnswer(q);syncPracticeUi()}
  setTimeout(()=>window.qbPrefetchQuestionAssets?.(String(q.id)),0);
  const nextId=practice[pi+1];if(nextId)setTimeout(()=>prefetchQuestionDetail(nextId),0)
}
function same(a,b){return a.length===b.length&&[...a].sort().every((x,i)=>x===[...b].sort()[i])}
function syncChoiceFeedback(){
 const q=pq();
 V.querySelectorAll('.choice[data-c]').forEach(b=>{
  const i=Number(b.dataset.c),revealed=submitted&&q?.answer_mode!=='fill_blank',correct=revealed&&q.ans.includes(i),chosen=revealed&&!reviewOnly&&sel.has(i),wrong=chosen&&!correct;
  b.classList.toggle('good',!!correct);b.classList.toggle('bad',!!wrong);
  b.classList.toggle('sel',!submitted&&sel.has(i));
  const label=correct?(chosen?'✓ 自分の回答・正解':'正解'):wrong?'× 自分の回答・不正解':'';
  if(label){b.dataset.qbChoiceFeedback=label;b.setAttribute('aria-description',label)}
  else{delete b.dataset.qbChoiceFeedback;b.removeAttribute('aria-description')}
 });
}
function syncPracticeUi(){syncChoiceFeedback();V.querySelectorAll('.choice').forEach(b=>b.disabled=submitted);const a=document.getElementById('answer');if(a){a.textContent=submitted?'もう一度解く':'解答する';a.disabled=submitted?false:!sel.size}const r=document.getElementById('review');if(r)r.disabled=submitted}
function afterAnswerShown(){document.getElementById('ans')?.classList.remove('hidden');window.dispatchEvent(new CustomEvent('qb-answer-shown'));setTimeout(()=>document.getElementById('ans')?.scrollIntoView({behavior:'smooth',block:'start'}),90)}
function resultHtml(q){const ok=!reviewOnly&&same([...sel],q.ans);return `<div class="card resultcard ${reviewOnly?'review':ok?'ok':'bad'}"><div class="result ${reviewOnly?'':ok?'oktxt':'badtxt'}">${reviewOnly?'解説モード（未解答）':ok?'✓ 正解！':'✕ 不正解'}</div><b>正解：${q.ans.map(i=>`${esc(q.choices[i]?.choice_key||'')} ${esc(q.choices[i]?.choice_text||'')}`).join('・')}</b></div>`}
function drawAnswer(q){const A=document.getElementById('ans');if(!A)return;const id=String(q.id||''),result=resultHtml(q);if(A.dataset.qbBuiltFor===id&&A.querySelector(':scope > .resultcard')){const tmp=document.createElement('div');tmp.innerHTML=result;A.querySelector(':scope > .resultcard').replaceWith(tmp.firstElementChild)}else{A.innerHTML=`${result}${q.explanation_overview?`<div class="card"><b>■ 問題文のポイント</b><div class="line">${esc(q.explanation_overview)}</div></div>`:''}${q.choices.some(c=>c.explanation)?`<div class="card"><b>■ 各選択肢</b>${q.choices.map((c,i)=>`<div class="exp"><b>${esc(c.choice_key)}. ${q.ans.includes(i)?'○':'×'} ${esc(c.choice_text)}</b><div class="line">${esc(c.explanation||'')}</div></div>`).join('')}</div>`:''}`;A.dataset.qbBuiltFor=id}A.classList.remove('hidden')}
function drawTextAnswer(q,official){const A=document.getElementById('ans');if(!A)return;let t='';if(Array.isArray(official))t=official.join('・');else if(official&&typeof official==='object')t=Object.values(official).flat().join('・');else t=official==null?'解答未登録':String(official);A.innerHTML=`<div class="card resultcard review"><div class="result">解答</div><b>${esc(t)}</b><div class="meta" style="margin-top:6px">解説のみ閲覧として扱います。</div></div>`;A.classList.remove('hidden')}
function syncAutoRating(v){document.querySelectorAll('#ans [data-qb-rate]').forEach(b=>b.classList.toggle('on',b.dataset.qbRate===v));const m=document.querySelector('#ans .qbRateMsg');if(m)m.textContent=`自動設定：${v}　（必要なら変更できます）`}
async function saveAutoRating(q,v){syncAutoRating(v);const r=await sb.from('question_ratings').upsert({user_id:user.id,question_id:q.id,rating:v,updated_at:new Date().toISOString()},{onConflict:'user_id,question_id'});if(r.error)console.error('auto rating save',r.error)}
async function submitAnswer(q){submitted=true;reviewOnly=false;const ok=same([...sel],q.ans),now=new Date().toISOString(),keys=[...sel].sort((a,b)=>a-b).map(i=>q.choices[i]?.choice_key).filter(Boolean),rating=ok?'○':'×',attempt={user_id:user.id,question_id:q.id,occurrence_id:q.occ[0]?.id||null,selected_choice_keys:keys,is_correct:ok,answered_at:now},recording=window.QBAnswerHistory?.record(q,attempt,rating);drawAnswer(q);syncPracticeUi();afterAnswerShown();if(!window.QBAnswerHistory)saveAutoRating(q,rating).catch(console.error);saveSession(false);try{const a=recording?await recording:await sb.from('attempts').insert(attempt);if(a.error)throw a.error;const payload={user_id:user.id,question_id:q.id,has_viewed_explanation:true,explanation_viewed_at:now,has_answered:true,last_answered_at:now,last_is_correct:ok,last_selected_choice_keys:keys,updated_at:now};const s=await sb.from('user_question_state').upsert(payload,{onConflict:'user_id,question_id'});if(s.error)throw s.error;qstate[q.id]=payload}catch(e){console.error('answer history save',e);alert('解答は表示しましたが、学習履歴の保存に失敗しました。通信状態を確認してください。')}}
async function submitReview(q){submitted=true;reviewOnly=true;const old=stateOf(q.id),now=new Date().toISOString(),payload={user_id:user.id,question_id:q.id,has_viewed_explanation:true,explanation_viewed_at:now,has_answered:!!old.has_answered,last_answered_at:old.last_answered_at||null,last_is_correct:typeof old.last_is_correct==='boolean'?old.last_is_correct:null,last_selected_choice_keys:old.last_selected_choice_keys||[],updated_at:now};window.QBAnswerHistory?.review(q,user.id);drawAnswer(q);syncPracticeUi();afterAnswerShown();if(!window.QBAnswerHistory)saveAutoRating(q,'-').catch(console.error);saveSession(false);try{const s=await sb.from('user_question_state').upsert(payload,{onConflict:'user_id,question_id'});if(s.error)throw s.error;qstate[q.id]=payload}catch(e){console.error(e);alert('解説は表示しましたが、閲覧履歴の保存に失敗しました。通信状態を確認してください。')}}
function retryCurrent(){submitted=false;reviewOnly=false;sel=new Set();const A=document.getElementById('ans');if(A)A.classList.add('hidden');V.querySelectorAll('.choice').forEach(b=>{b.disabled=false;b.classList.remove('sel','good','bad');delete b.dataset.qbChoiceFeedback;b.removeAttribute('aria-description')});const a=document.getElementById('answer');if(a){a.textContent='解答する';a.disabled=true}const r=document.getElementById('review');if(r)r.disabled=false;V.querySelectorAll('.fbInput').forEach(x=>{x.value='';x.dispatchEvent(new Event('input',{bubbles:true}))});window.dispatchEvent(new CustomEvent('qb-retry-current'));setTimeout(()=>V.querySelector('.qtext')?.scrollIntoView({behavior:'smooth',block:'start'}),30)}
function move(d){pi+=d;submitted=false;reviewOnly=false;sel=new Set();renderPractice();saveSession(false);scrollTo({top:0,behavior:'smooth'})}
async function finish(){await completeSession();practice=[];pi=0;submitted=false;reviewOnly=false;sel=new Set();setScreen('problems')}
function showErr(e){console.error(e);V.innerHTML=`<div class="card"><div class="title">読み込みエラー</div><div class="sub">${esc(e?.message||e)}</div></div>`}
async function saveSession(create=false){if(!sb||!user||!subject||!practice.length)return;const now=new Date().toISOString(),payload={user_id:user.id,subject_id:subject.id,unit_id:unitId==='__all__'?null:unitId,mode:practiceMode,question_ids:practice,current_index:pi,is_completed:false,last_active_at:now,metadata:{unit_scope:unitId||'__all__'}};if(create||!sessionId){const r=await sb.from('practice_sessions').insert(payload).select('id').single();if(!r.error)sessionId=r.data.id}else await sb.from('practice_sessions').update({question_ids:practice,current_index:pi,last_active_at:now,mode:practiceMode,metadata:payload.metadata}).eq('id',sessionId)}
async function completeSession(){if(!sb||!sessionId)return;const now=new Date().toISOString();await sb.from('practice_sessions').update({current_index:pi,is_completed:true,last_active_at:now,completed_at:now}).eq('id',sessionId);sessionId=null}
function resumeCss(){if(document.getElementById('qbResumeV2Css'))return;const s=document.createElement('style');s.id='qbResumeV2Css';s.textContent=`#qbResumeV2{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:86;display:flex;gap:5px;background:#fff;border:1px solid #dce3ec;border-radius:999px;box-shadow:0 6px 20px #0002;padding:5px}#qbResumeV2 button{border:0;border-radius:999px;height:36px;font-weight:900}#qbResumeV2 .x{width:32px;background:#eef1f5;color:#6f7786}#qbResumeV2 .go{padding:0 12px;background:#126fb3;color:#fff;font-size:12px}`;document.head.appendChild(s)}
function scheduleResumePrompt(){clearTimeout(resumeCheckTimer);resumeCheckTimer=setTimeout(()=>showResumePrompt().catch(console.error),100)}
async function showResumePrompt(){document.getElementById('qbResumeV2')?.remove();if(screen==='practice'||!sb||!user)return;resumeCss();const r=await sb.from('practice_sessions').select('id,subject_id,unit_id,mode,question_ids,current_index,last_active_at,metadata').eq('user_id',user.id).eq('is_completed',false).order('last_active_at',{ascending:false}).limit(1).maybeSingle();if(r.error||!r.data||resumeDismissed===r.data.id||!(r.data.question_ids||[]).length)return;const s=r.data,d=document.createElement('div');d.id='qbResumeV2';d.innerHTML=`<button class="x" aria-label="閉じる">×</button><button class="go">続きから ${Math.min((s.current_index||0)+1,s.question_ids.length)}/${s.question_ids.length} ▶</button>`;document.body.appendChild(d);d.querySelector('.x').onclick=()=>{resumeDismissed=s.id;d.remove()};d.querySelector('.go').onclick=()=>resumeSession(s).catch(showErr)}
async function resumeSession(s){document.getElementById('qbResumeV2')?.remove();const target=subjects.find(x=>x.id===s.subject_id);if(!target)throw new Error('保存された科目が見つかりません');const scope=s.metadata?.unit_scope||(s.unit_id||'__all__');if(subject?.id!==target.id)await chooseSubject(target.id);const requested=(s.question_ids||[]).map(String),availableHere=new Set(questions.map(q=>String(q.id))),canReuse=unitId===scope&&requested.every(id=>availableHere.has(id));if(!canReuse)await loadQuestionsForUnit(scope);const available=new Set(questions.map(q=>String(q.id)));practice=requested.filter(id=>available.has(id));if(!practice.length)throw new Error('保存された問題を読み込めません');selected=new Set(practice);pi=Math.max(0,Math.min(Number(s.current_index)||0,practice.length-1));practiceMode=s.mode||'ordered';sessionId=s.id;submitted=false;reviewOnly=false;sel=new Set();setScreen('practice')}
M.querySelectorAll('[data-mode]').forEach(b=>b.onclick=async()=>{const mode=b.dataset.mode||'ordered',available=questions.map(q=>String(q.id)),chosen=available.filter(id=>selected.has(id));if(!chosen.length)return;practiceMode=mode;M.querySelectorAll('[data-mode]').forEach(x=>x.disabled=true);try{practice=typeof window.qbPreparePracticeIds==='function'?await window.qbPreparePracticeIds(chosen,subject?.id,available,mode):(mode==='shuffle'?[...chosen].sort(()=>Math.random()-.5):chosen)}catch(e){console.error('series-aware practice prepare',e);practice=mode==='shuffle'?[...chosen].sort(()=>Math.random()-.5):chosen}pi=0;submitted=false;reviewOnly=false;sel=new Set();sessionId=null;M.classList.add('hidden');M.querySelectorAll('[data-mode]').forEach(x=>x.disabled=false);setScreen('practice');saveSession(true)});document.getElementById('cancel').onclick=()=>M.classList.add('hidden');
M.addEventListener('click',e=>{if(e.target===M)M.classList.add('hidden')});
H.onclick=()=>{if(screen==='subjects')return setScreen('grades');if(screen==='units')return setScreen('subjects');if(screen==='problems')return setScreen('units');return setScreen('subjects')};
window.qbGetScreen=()=>screen;window.qbOpenSubjects=()=>setScreen('subjects');window.qbOpenProblemList=()=>setScreen('problems');window.showGradeScreen=()=>setScreen('grades');window.qbRetryCurrent=retryCurrent;window.qbGetPracticeState=()=>({subjectId:subject?.id||null,unitId,questionIds:[...practice],currentIndex:pi,mode:practiceMode,sessionId});window.qbResumeSession=resumeSession;window.qbEnsureQuestionDetail=ensureQuestionDetail;
window.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='practice')saveSession(false)});window.addEventListener('beforeunload',()=>{if(screen==='practice')saveSession(false)});
window.addEventListener('qb-content-updated',e=>{const id=String(e.detail?.questionId||'');if(!id)return;detailCache.delete(id);detailPending.delete(id);const i=questions.findIndex(q=>String(q.id)===id);if(i>=0)questions[i]._detailLoaded=false});
async function boot(){V.innerHTML='<div class="card"><div class="title">読み込み中…</div><div class="sub">科目情報を読み込んでいます。</div></div>';if(!(await waitSb()))return showErr(new Error('ログイン情報を確認できませんでした'));try{await loadSubjects();window.QB_DB_READY=true;setScreen('subjects');window.dispatchEvent(new CustomEvent('qb-app-ready'));window.dispatchEvent(new CustomEvent('qb-core-loaded'))}catch(e){showErr(e)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
