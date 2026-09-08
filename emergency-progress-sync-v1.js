(()=>{
'use strict';
let timer=0,pending=null,cache=null,cacheId=null,cacheAt=0;
const isEmergencyUnits=()=>window.qbGetScreen?.()==='units'&&((document.getElementById('crumb')?.textContent||'').includes('救急医学'));
const subjectId=()=>String(window.qbGetPracticeState?.()?.subjectId||'');
async function rows(id,force=false){
  const now=Date.now();if(!force&&cache&&cacheId===id&&now-cacheAt<2500)return cache;if(pending)return pending;
  const sb=window.qbSupabase;if(!sb)return null;
  pending=(async()=>{const r=await sb.rpc('get_subject_question_progress_v2',{p_subject_id:id});if(r.error)throw r.error;cache=r.data||[];cacheId=id;cacheAt=Date.now();return cache})().finally(()=>pending=null);
  return pending
}
function apply(xs){
  if(!isEmergencyUnits()||!Array.isArray(xs))return;
  const byUnit=new Map();for(const x of xs){const k=String(x.unit_id||'');if(!byUnit.has(k))byUnit.set(k,[]);byUnit.get(k).push(x)}
  document.querySelectorAll('#view .list[data-u]').forEach(btn=>{
    const meta=btn.querySelector('.meta');if(!meta||!meta.textContent.includes('学習状況を読み込み中'))return;
    const uid=String(btn.dataset.u||''),group=uid==='__all__'?xs:(byUnit.get(uid)||[]),total=group.length;
    const answered=group.filter(x=>x.has_answered).length,reviewed=group.filter(x=>x.has_viewed_explanation).length;
    meta.textContent=`${total}問・解答済み ${answered}/${total}・解説確認済み ${reviewed}/${total}`;
    const fill=btn.querySelector('.progress>div');if(fill)fill.style.width=total?`${answered/total*100}%`:'0%'
  })
}
async function refresh(force=false){if(!isEmergencyUnits())return;const id=subjectId();if(!id)return;try{apply(await rows(id,force))}catch(e){console.error('emergency progress sync',e)}}
function schedule(force=false,delay=30){clearTimeout(timer);timer=setTimeout(()=>refresh(force),delay)}
function boot(){
  ['qb-app-ready','qb-screen-change','qb-unit-progress-loaded'].forEach(ev=>window.addEventListener(ev,()=>schedule(true,10)));
  const v=document.getElementById('view');if(v)new MutationObserver(()=>{if(isEmergencyUnits())schedule(false,25)}).observe(v,{childList:true,subtree:true});
  schedule(true,200)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
