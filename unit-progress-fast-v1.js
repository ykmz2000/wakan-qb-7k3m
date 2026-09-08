(()=>{
'use strict';
let timer=0,seq=0,pending=null,lastSubject=null,lastRows=null,lastLoadedAt=0;
const screen=()=>window.qbGetScreen?.()||'';
const subjectId=()=>String(window.qbGetPracticeState?.()?.subjectId||'');
async function load(id,force=false){
  const now=Date.now();
  if(!force&&id===lastSubject&&lastRows&&now-lastLoadedAt<2500)return lastRows;
  if(pending&&pending.id===id)return pending.promise;
  const sb=window.qbSupabase;if(!sb)return null;
  const promise=(async()=>{
    const r=await sb.rpc('get_subject_question_progress_v2',{p_subject_id:id});
    if(r.error)throw r.error;
    lastSubject=id;lastRows=r.data||[];lastLoadedAt=Date.now();return lastRows
  })().finally(()=>{if(pending?.promise===promise)pending=null});
  pending={id,promise};return promise
}
function paint(rows,id){
  if(screen()!=='units'||subjectId()!==id||!Array.isArray(rows))return;
  const buttons=[...document.querySelectorAll('#view [data-u]')];if(!buttons.length)return;
  const byUnit=new Map();
  for(const x of rows){const k=String(x.unit_id||'');if(!byUnit.has(k))byUnit.set(k,[]);byUnit.get(k).push(x)}
  for(const b of buttons){
    const uid=String(b.dataset.u||'');
    const xs=uid==='__all__'?rows:(byUnit.get(uid)||[]);
    const total=xs.length,answered=xs.filter(x=>x.has_answered).length,reviewed=xs.filter(x=>x.has_viewed_explanation).length;
    const meta=b.querySelector('.meta');if(meta)meta.textContent=`${total}問・解答済み ${answered}/${total}・解説確認済み ${reviewed}/${total}`;
    const fill=b.querySelector('.progress>div');if(fill)fill.style.width=total?`${answered/total*100}%`:'0%';
    b.dataset.qbFastProgress='1'
  }
}
async function refresh(force=false){
  if(screen()!=='units')return;
  const id=subjectId();if(!id)return;
  const mine=++seq;
  try{const rows=await load(id,force);if(mine===seq)paint(rows,id)}catch(e){console.error('fast unit progress',e)}
}
function schedule(force=false,delay=20){clearTimeout(timer);timer=setTimeout(()=>refresh(force),delay)}
function boot(){
  window.addEventListener('qb-screen-change',()=>schedule(true,10));
  window.addEventListener('qb-app-ready',()=>schedule(true,30));
  window.addEventListener('qb-answer-shown',()=>{lastLoadedAt=0});
  const v=document.getElementById('view');if(v)new MutationObserver(()=>{if(screen()==='units'&&lastRows&&subjectId()===lastSubject)paint(lastRows,lastSubject)}).observe(v,{childList:true,subtree:true});
  schedule(true,120)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
