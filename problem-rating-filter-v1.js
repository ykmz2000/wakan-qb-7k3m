(()=>{
'use strict';
const CATEGORIES=['◎','○','△','×','未演習'];
let active=new Set(CATEGORIES),ratingByQuestion=new Map(),fingerprint='',loadedFingerprint='',timer=0,loading=false;
let years=null,exams=null,defaultSelectionPending=false;
const EXAMS=[['main','本試'],['retry','追試・再試'],['unknown','本試・追再試不明']];
const yearOf=o=>/^\d+$/.test(String(o?.academic_year??''))&&Number(o.academic_year)>0?String(Number(o.academic_year)):'unknown';
const examOf=o=>o?.exam_type==='本試'?'main':['再試','追試','追再試','追・再試','追試・再試'].includes(o?.exam_type)?'retry':'unknown';
function occurrences(q){const xs=q?.occ||q?.question_occurrences||[];return xs.length?xs:[{}]}
function hasUnknownSource(q){return occurrences(q).some(o=>yearOf(o)==='unknown'||examOf(o)==='unknown')}
function scopedQuestions(){const ids=new Set(inputs().map(x=>x.dataset.q));return (window.QB_QUESTIONS||[]).filter(q=>ids.has(String(q.id)))}
function sourceMatches(q){return occurrences(q).some(o=>(years===null||years.has(yearOf(o)))&&(exams===null||exams.has(examOf(o))))}
function availableYears(){return [...new Set(scopedQuestions().flatMap(q=>occurrences(q).map(yearOf)))].sort((a,b)=>a==='unknown'?1:b==='unknown'?-1:Number(b)-Number(a))}
function recentYears(){
  const known=availableYears().filter(y=>y!=='unknown');
  const current=Number(new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'Asia/Tokyo'}).format(new Date()));
  return new Set(known.filter(y=>Number(y)>=current-4&&Number(y)<=current));
}
const screen=()=>window.qbGetScreen?.()||'';
const allInputs=()=>[...document.querySelectorAll('#view .problem input[data-q]')];
const inputs=()=>{
  const xs=allInputs();
  if(!xs.length)return xs;
  const visible=xs.filter(x=>x.closest('.problem')?.style?.display!=='none');
  return visible.length&&visible.length<xs.length?visible:xs;
};
const categoryOf=id=>{
  const r=ratingByQuestion.get(id);
  return ['◎','○','△','×'].includes(r)?r:'未演習';
};
function css(){
  if(document.getElementById('qbRatingFilterCss'))return;
  const s=document.createElement('style');s.id='qbRatingFilterCss';s.textContent=`
#qbRatingFilterPanel{padding:12px 13px;margin-bottom:10px;border:1px solid #cfe1ef;background:#f8fcff;border-radius:15px}
#qbRatingFilterPanel .qbrfHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
#qbRatingFilterPanel .qbrfTitle{font-size:13px;font-weight:900;color:#314055}
#qbRatingFilterPanel .qbrfCount{font-size:11px;color:#6f7786;white-space:nowrap}
#qbRatingFilterPanel .qbrfButtons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
#qbRatingFilterPanel .qbrfBtn{border:1px solid #cfd8e3;background:#fff;color:#536174;border-radius:11px;min-height:43px;padding:7px 4px;font-weight:900;font-size:15px;transition:transform .08s ease,background .12s ease,color .12s ease,border-color .12s ease}
#qbRatingFilterPanel .qbrfBtn:active{transform:scale(.97)}
#qbRatingFilterPanel .qbrfBtn.on{background:#1559ad;color:#fff;border-color:#1559ad}
#qbRatingFilterPanel .qbrfBtn[data-cat="未演習"]{font-size:12px}
#qbRatingFilterPanel .qbrfHint{margin-top:7px;font-size:10px;line-height:1.45;color:#7b8492}
#qbRatingFilterPanel .qbrfSource{border-top:1px solid var(--accent-border,var(--line));margin-top:12px;padding-top:10px}
#qbRatingFilterPanel .qbrfSourceButtons{display:flex;flex-wrap:wrap;gap:7px}
#qbRatingFilterPanel .qbrfSourceBtn{min-width:62px;padding:7px 11px;font-size:13px;background:var(--card);color:var(--text)}
#qbRatingFilterPanel .qbrfSourceBtn:disabled{opacity:.45;cursor:default}
#qbRatingFilterPanel .qbrfAll{border:0;background:transparent;color:var(--accent);font:inherit;font-size:12px;min-height:44px;padding:4px 8px}
@media(max-width:390px){#qbRatingFilterPanel{padding:10px}#qbRatingFilterPanel .qbrfButtons{gap:5px}#qbRatingFilterPanel .qbrfBtn{min-height:41px;font-size:14px}#qbRatingFilterPanel .qbrfBtn[data-cat="未演習"]{font-size:11px}}
`;
  document.head.appendChild(s);
}
function currentFingerprint(){return allInputs().map(x=>x.dataset.q).filter(Boolean).sort().join('|')}
function selectedCount(){return inputs().filter(x=>x.checked).length}
function syncCoreUi(){
  const count=selectedCount(),total=inputs().length,start=document.getElementById('start'),toggle=document.getElementById('toggleAll');
  if(start){start.textContent=`演習開始（${count}問）`;start.disabled=count===0;}
  if(toggle)toggle.textContent=count===total?'すべて解除':'すべて選択';
  const c=document.querySelector('#qbRatingFilterPanel .qbrfCount');if(c)c.textContent=`${count}/${total}問を選択`;
}
function applySelection(unknownOnly=false){
  const byId=new Map((window.QB_QUESTIONS||[]).map(q=>[String(q.id),q]));
  inputs().forEach(x=>{
    const want=active.has(categoryOf(x.dataset.q))&&(unknownOnly?hasUnknownSource(byId.get(x.dataset.q)):sourceMatches(byId.get(x.dataset.q)));
    if(x.checked===want)return;
    x.checked=want;
    x.dispatchEvent(new Event('change',{bubbles:true}));
  });
  setTimeout(syncCoreUi,0);
}
function updateButtons(){
  document.querySelectorAll('#qbRatingFilterPanel [data-cat]').forEach(b=>{
    const on=active.has(b.dataset.cat);b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
  });
  document.querySelectorAll('#qbRatingFilterPanel [data-source]').forEach(b=>{
    const selected=b.dataset.source==='year'?years:exams,on=selected===null||selected.has(b.dataset.value);
    b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
  });
  syncCoreUi();
}
function buildPanel(){
  document.getElementById('qbRatingFilterPanel')?.remove();
  const scoped=inputs(),first=scoped[0]?.closest('.problem');if(!first)return;
  const listCard=first.closest('.card');if(!listCard)return;
  const panel=document.createElement('div');panel.id='qbRatingFilterPanel';panel.innerHTML=`<div class="qbrfHead"><div class="qbrfTitle">自己評価で絞り込み</div><div class="qbrfCount"></div></div><div class="qbrfButtons">${CATEGORIES.map(c=>`<button type="button" class="qbrfBtn ${active.has(c)?'on':''}" data-cat="${c}" aria-pressed="${active.has(c)}">${c}</button>`).join('')}</div><div class="qbrfHint">複数選択できます。未演習には「-（解説のみ）」と自己評価未登録を含みます。</div>`;
  const questions=scopedQuestions();
  for(const [axis,label,options] of [['year','出題年度',availableYears().map(y=>[y,y==='unknown'?'年度不明':y])],['exam','本試・追再試',EXAMS]]){
    const group=document.createElement('div');group.className='qbrfSource';
    const head=document.createElement('div');head.className='qbrfHead';
    const title=document.createElement('div');title.className='qbrfTitle';title.textContent=label;
    const all=document.createElement('button');all.type='button';all.className='qbrfAll';all.textContent='すべて';all.dataset.sourceAll=axis;
    all.onclick=()=>{if(axis==='year')years=null;else exams=null;updateButtons();applySelection()};
    head.append(title,all);group.append(head);const buttons=document.createElement('div');buttons.className='qbrfSourceButtons';
    for(const [value,text] of options){const b=document.createElement('button');b.type='button';b.className='qbrfBtn qbrfSourceBtn';b.dataset.source=axis;b.dataset.value=value;const count=questions.filter(q=>occurrences(q).some(o=>(axis==='year'?yearOf(o):examOf(o))===value)).length;b.textContent=`${text}（${count}問）`;b.dataset.count=String(count);b.disabled=count===0;
      b.onclick=()=>{let selected=axis==='year'?years:exams;if(selected===null)selected=new Set(options.map(o=>o[0]));if(selected.has(value))selected.delete(value);else selected.add(value);if(selected.size===options.length)selected=null;if(axis==='year')years=selected;else exams=selected;updateButtons();applySelection()};buttons.append(b)}
    group.append(buttons);panel.append(group);
  }
  const unknownGroup=document.createElement('div');unknownGroup.className='qbrfSource';
  const unknownCount=questions.filter(hasUnknownSource).length;
  const unknownButton=document.createElement('button');unknownButton.type='button';unknownButton.className='qbrfBtn qbrfSourceBtn';unknownButton.dataset.sourceUnknown='only';unknownButton.textContent=`不明な問題をまとめて選択（${unknownCount}問）`;unknownButton.disabled=unknownCount===0;
  unknownButton.onclick=()=>{years=null;exams=null;updateButtons();applySelection(true)};
  const hint=document.createElement('div');hint.className='qbrfHint';hint.textContent='年度・本試／追再試のどちらかが不明な問題を選択します。年度と試験の条件を解除し、自己評価の条件は維持します。';
  unknownGroup.append(unknownButton,hint);panel.append(unknownGroup);
  const orderBar=document.getElementById('qsoBar');
  if(orderBar&&orderBar.nextElementSibling===listCard)orderBar.insertAdjacentElement('afterend',panel);else listCard.insertAdjacentElement('beforebegin',panel);
  panel.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{
    const cat=b.dataset.cat;if(active.has(cat))active.delete(cat);else active.add(cat);
    updateButtons();applySelection();
  });
  // Rebuilding controls must preserve manual checks, ★ selection and select-all.
  updateButtons();
}
async function loadRatings(ids){
  const sb=window.qbSupabase;if(!sb||!ids.length){ratingByQuestion=new Map();return}
  const a=await sb.auth.getUser(),user=a.data?.user;if(!user){ratingByQuestion=new Map();return}
  const chunks=[];for(let i=0;i<ids.length;i+=100)chunks.push(ids.slice(i,i+100));
  const result=await Promise.all(chunks.map(chunk=>sb.from('question_ratings').select('question_id,rating').eq('user_id',user.id).in('question_id',chunk)));
  const rows=[];for(const r of result){if(r.error)throw r.error;rows.push(...(r.data||[]))}
  ratingByQuestion=new Map(rows.map(x=>[String(x.question_id),x.rating]));
}
async function inject(force=false){
  clearTimeout(timer);timer=0;if(screen()!=='problems'){document.getElementById('qbRatingFilterPanel')?.remove();return}
  const xs=inputs();if(!xs.length)return;
  const fp=currentFingerprint();
  if(fp!==fingerprint){fingerprint=fp;loadedFingerprint='';active=new Set(CATEGORIES);years=recentYears();exams=null;ratingByQuestion=new Map();defaultSelectionPending=true;}
  if(loading)return;
  if(force||loadedFingerprint!==fp){
    loading=true;
    try{await loadRatings(xs.map(x=>x.dataset.q));loadedFingerprint=fp}catch(e){console.error('rating filter load',e)}finally{loading=false}
  }
  if(screen()!=='problems'||currentFingerprint()!==fp){schedule(true);return}
  if(defaultSelectionPending){defaultSelectionPending=false;applySelection();}
  buildPanel();
}
function schedule(force=false){if(timer&&!force)return;clearTimeout(timer);timer=setTimeout(()=>inject(force).catch(console.error),120)}
function boot(){
  css();schedule(true);
  window.addEventListener('qb-screen-change',()=>schedule(true));
  window.addEventListener('qb-app-ready',()=>schedule(true));
  window.addEventListener('qb-question-order-updated',()=>schedule(false));
  document.addEventListener('change',e=>{if(e.target?.matches?.('#view .problem input[data-q]'))setTimeout(syncCoreUi,0)},true);
  const v=document.getElementById('view');if(v)new MutationObserver(()=>{
    if(screen()!=='problems')return;
    const fp=currentFingerprint();
    if(!document.getElementById('qbRatingFilterPanel')||fp!==fingerprint)schedule(false);
  }).observe(v,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
