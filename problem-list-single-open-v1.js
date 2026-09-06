(()=>{
'use strict';
const FAKE_SESSION_ID='00000000-0000-0000-0000-000000000000';
let opening=false,savedSelection=null,timer=null;
const screen=()=>window.qbGetScreen?.()||'';
const state=()=>window.qbGetPracticeState?.()||{};
function css(){
  if(document.getElementById('qbSingleOpenCss'))return;
  const s=document.createElement('style');s.id='qbSingleOpenCss';s.textContent=`
#view .problem.qbSingleOpenRow{cursor:pointer;border-radius:10px;transition:background .12s ease}
#view .problem.qbSingleOpenRow:hover,#view .problem.qbSingleOpenRow:focus-visible{background:#f6fbff;outline:2px solid #126fb326;outline-offset:-2px}
#qbSingleOpenMask{position:fixed;inset:0;z-index:120;background:#f5f7fbdd;backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;color:#126fb3;font-weight:900}
body.qbSingleProblemMode #qbPracticeDockV2 .qbpdInner{grid-template-columns:1fr 1fr 1.5fr 1fr!important}
body.qbSingleProblemMode #qbPracticeDockV2 [data-a="prev"],body.qbSingleProblemMode #qbPracticeDockV2 [data-a="next"]{display:none!important}
@media(max-width:390px){body.qbSingleProblemMode #qbPracticeDockV2 .qbpdInner{grid-template-columns:.95fr .95fr 1.4fr .95fr!important}}
`;
  document.head.appendChild(s)
}
function mask(on){
  document.getElementById('qbSingleOpenMask')?.remove();
  if(!on)return;
  const d=document.createElement('div');d.id='qbSingleOpenMask';d.textContent='問題を開いています…';document.body.appendChild(d)
}
function snapshotSelection(){return new Set([...document.querySelectorAll('#view .problem [data-q]')].filter(x=>x.checked).map(x=>x.dataset.q))}
function restoreSelection(){
  if(!savedSelection||screen()!=='problems')return;
  const keep=savedSelection;savedSelection=null;
  requestAnimationFrame(()=>{
    document.querySelectorAll('#view .problem [data-q]').forEach(x=>{
      const want=keep.has(x.dataset.q);
      if(x.checked===want)return;
      x.checked=want;
      x.dispatchEvent(new Event('change',{bubbles:true}))
    })
  })
}
async function openOne(id){
  if(opening||!id||screen()!=='problems'||typeof window.qbResumeSession!=='function')return;
  const st=state();if(!st.subjectId)return;
  opening=true;savedSelection=snapshotSelection();mask(true);
  try{
    await window.qbResumeSession({
      id:FAKE_SESSION_ID,
      subject_id:st.subjectId,
      unit_id:st.unitId&&st.unitId!=='__all__'?st.unitId:null,
      mode:'single',
      question_ids:[id],
      current_index:0,
      metadata:{unit_scope:st.unitId||'__all__',single_problem:true}
    });
    document.body.classList.add('qbSingleProblemMode');
    window.dispatchEvent(new CustomEvent('qb-single-problem-opened',{detail:{questionId:id}}));
    decorateDock()
  }catch(e){
    console.error(e);savedSelection=null;alert('問題を開けませんでした: '+(e?.message||'不明なエラー'))
  }finally{opening=false;mask(false)}
}
function decorateRows(){
  if(screen()!=='problems')return;
  document.querySelectorAll('#view .problem').forEach(row=>{
    if(row.dataset.qbSingleOpen==='1')return;
    row.dataset.qbSingleOpen='1';row.classList.add('qbSingleOpenRow');row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label','この問題を1問だけ開く')
  })
}
function decorateDock(){
  const st=state(),single=screen()==='practice'&&((st.questionIds||[]).length===1||st.mode==='single');
  document.body.classList.toggle('qbSingleProblemMode',single);
  if(!single)return;
  const dock=document.getElementById('qbPracticeDockV2'),inner=dock?.querySelector('.qbpdInner');if(!inner)return;
  dock.querySelector('[data-a="prev"]')?.setAttribute('aria-hidden','true');
  dock.querySelector('[data-a="next"]')?.setAttribute('aria-hidden','true');
  if(inner.querySelector('[data-a="problems"]'))return;
  const main=inner.querySelector('[data-a="main"]');if(!main)return;
  const b=document.createElement('button');b.type='button';b.dataset.a='problems';b.innerHTML='<span class="qbpdIco">☰</span><span>問題一覧</span>';b.onclick=()=>window.qbOpenProblemList?.();
  inner.insertBefore(b,main)
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{decorateRows();decorateDock();restoreSelection()},0)}
function onClick(e){
  if(screen()!=='problems')return;
  const row=e.target.closest?.('#view .problem');if(!row)return;
  if(e.target.closest?.('input,button,label,a,.pick'))return;
  const id=row.querySelector('[data-q]')?.dataset.q;if(!id)return;
  e.preventDefault();openOne(id)
}
function onKey(e){
  if(screen()!=='problems'||!['Enter',' '].includes(e.key))return;
  const row=e.target.closest?.('#view .problem.qbSingleOpenRow');if(!row||e.target.matches('input,button,a'))return;
  const id=row.querySelector('[data-q]')?.dataset.q;if(!id)return;
  e.preventDefault();openOne(id)
}
function boot(){
  css();schedule();
  document.addEventListener('click',onClick,true);document.addEventListener('keydown',onKey,true);
  ['qb-screen-change','qb-app-ready','qb-answer-shown','qb-retry-current'].forEach(ev=>window.addEventListener(ev,schedule));
  const v=document.getElementById('view');if(v)new MutationObserver(schedule).observe(v,{childList:true,subtree:true});
  new MutationObserver(m=>{if(m.some(x=>x.target?.closest?.('#qbPracticeDockV2')||[...x.addedNodes].some(n=>n?.id==='qbPracticeDockV2'||n?.querySelector?.('#qbPracticeDockV2'))))schedule()}).observe(document.body,{childList:true,subtree:true})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
