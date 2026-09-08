(()=>{
'use strict';
let cache=null,cacheAt=0,pending=null,timer=0,observer=null;
const screen=()=>window.qbGetScreen?.()||'';
const ttl=2500;
function css(){
  if(document.getElementById('qbRecentLocationCss'))return;
  const s=document.createElement('style');s.id='qbRecentLocationCss';s.textContent=`
.qbPreviousCard{background:var(--accent-soft)!important;border-color:var(--accent-border)!important}
.qbPreviousMark{display:block;color:var(--accent)!important;font-size:10px;font-weight:900;line-height:1.2;margin:0 0 4px;letter-spacing:.01em}
.qbPreviousArea{background:var(--accent-soft)!important;border-color:var(--accent-border)!important}
`;
  document.head.appendChild(s)
}
async function load(force=false){
  const now=Date.now();if(!force&&cache&&now-cacheAt<ttl)return cache;if(pending)return pending;
  pending=(async()=>{
    const sb=window.qbSupabase;if(!sb)return null;
    const a=await sb.auth.getUser();const uid=a.data?.user?.id;if(!uid)return null;
    const r=await sb.from('practice_sessions').select('id,subject_id,unit_id,metadata,last_active_at,question_ids,current_index').eq('user_id',uid).eq('is_completed',false).order('last_active_at',{ascending:false}).limit(1).maybeSingle();
    if(r.error||!r.data||!(r.data.question_ids||[]).length){cache=null;cacheAt=Date.now();return null}
    const s=r.data;
    const sr=await sb.from('subjects').select('id,grade_id').eq('id',s.subject_id).maybeSingle();
    let gradeCode=null;
    if(!sr.error&&sr.data?.grade_id){const gr=await sb.from('grades').select('code').eq('id',sr.data.grade_id).maybeSingle();if(!gr.error)gradeCode=gr.data?.code||null}
    cache={...s,gradeCode,unitScope:s.metadata?.unit_scope||(s.unit_id||'__all__'),emergencyArea:s.metadata?.emergency_area||null};cacheAt=Date.now();return cache
  })().finally(()=>pending=null);
  return pending
}
function clear(){
  document.querySelectorAll('.qbPreviousCard').forEach(x=>x.classList.remove('qbPreviousCard'));
  document.querySelectorAll('.qbPreviousArea').forEach(x=>x.classList.remove('qbPreviousArea'));
  document.querySelectorAll('.qbPreviousMark').forEach(x=>x.remove())
}
function addMark(host,before=null){
  if(!host||host.querySelector?.(':scope > .qbPreviousMark'))return;
  const m=document.createElement('span');m.className='qbPreviousMark';m.textContent='前回';
  if(before&&before.parentElement===host)host.insertBefore(m,before);else host.prepend(m)
}
function decorateGrade(last){
  const g=last?.gradeCode;if(!g)return;
  const btn=document.getElementById('gradeM4');if(!btn)return;
  const text=(btn.textContent||'').trim();if(!text.includes(g))return;
  btn.classList.add('qbPreviousCard');
  const host=btn.querySelector('div')||btn;const before=host.querySelector('.lt')||host.firstElementChild;addMark(host,before)
}
function decorateSubject(last){
  const btn=document.querySelector(`#view .list[data-s="${CSS.escape(String(last?.subject_id||''))}"]`);if(!btn)return;
  btn.classList.add('qbPreviousCard');
  const host=btn.firstElementChild||btn,title=host.querySelector?.('.lt');addMark(host,title)
}
function decorateUnit(last){
  const scope=String(last?.unitScope||'');if(!scope)return;
  const matches=[...document.querySelectorAll(`#view .list[data-u="${CSS.escape(scope)}"]`)];
  if(matches.length){
    matches.forEach(btn=>{btn.classList.add('qbPreviousCard');const host=btn.firstElementChild||btn,title=host.querySelector?.('.lt');addMark(host,title)});return
  }
  if(last?.emergencyArea){
    const head=document.querySelector(`.qbEmArea[data-type="${CSS.escape(String(last.emergencyArea))}"] .qbEmAreaHead`);
    if(head){head.classList.add('qbPreviousArea');const title=head.querySelector('.qbEmAreaTitle');addMark(head,title)}
  }
}
async function render(force=false){
  css();const last=await load(force);clear();if(!last)return;
  const s=screen();if(s==='grades')decorateGrade(last);else if(s==='subjects')decorateSubject(last);else if(s==='units')decorateUnit(last)
}
function schedule(force=false,delay=25){clearTimeout(timer);timer=setTimeout(()=>render(force).catch(e=>console.error('recent location highlight',e)),delay)}
function boot(){
  css();
  ['qb-app-ready','qb-screen-change'].forEach(ev=>window.addEventListener(ev,()=>schedule(true,20)));
  window.addEventListener('qb-answer-shown',()=>{cacheAt=0});
  const v=document.getElementById('view');if(v){observer=new MutationObserver(()=>schedule(false,35));observer.observe(v,{childList:true,subtree:true})}
  schedule(true,180)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
