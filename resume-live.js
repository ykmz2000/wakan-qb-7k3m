(()=>{
'use strict';
const STORE='m4_qb_v7';
let lastSessionId=null,checking=false;
function inPractice(){return document.getElementById('choices')&&document.querySelector('.nav')}
function fmt(s){if(!s)return '';const d=new Date(s);return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function remove(){document.getElementById('qbLiveResume')?.remove()}
async function check(){
  if(checking||inPractice()){remove();return}
  const sb=window.qbSupabase;if(!sb)return;
  checking=true;
  try{
    const {data:{user}}=await sb.auth.getUser();if(!user)return;
    const subj=await sb.from('subjects').select('id').eq('slug','wakan').maybeSingle();
    if(!subj.data?.id)return;
    const r=await sb.from('practice_sessions').select('id,mode,current_index,last_active_at,metadata,question_ids').eq('user_id',user.id).eq('subject_id',subj.data.id).eq('is_completed',false).order('last_active_at',{ascending:false}).limit(1).maybeSingle();
    if(r.error||!r.data){remove();return}
    const s=r.data,keys=Array.isArray(s.metadata?.canonical_keys)?s.metadata.canonical_keys:[];
    if(!keys.length){remove();return}
    if(document.getElementById('qbLiveResume')&&lastSessionId===s.id)return;
    remove();lastSessionId=s.id;
    const d=document.createElement('div');d.id='qbLiveResume';d.innerHTML=`<div class="resumeBox"><div><div class="meta">${fmt(s.last_active_at)}</div><b>続きから解く</b><div class="meta">${Math.min((s.current_index||0)+1,keys.length)}/${keys.length}問目</div></div><div class="resumeBtns"><button id="qbLiveResumeClose" class="btn">×</button><button id="qbLiveResumeGo" class="primary small">▶</button></div></div>`;document.body.appendChild(d);
    d.querySelector('#qbLiveResumeClose').onclick=remove;
    d.querySelector('#qbLiveResumeGo').onclick=()=>{
      try{const old=JSON.parse(localStorage.getItem(STORE)||'{}');localStorage.setItem(STORE,JSON.stringify({...old,screen:'practice',practice:keys,pi:s.current_index||0,unitId:s.metadata?.unit_slug||'__all__',mode:s.mode||'ordered',sessionId:s.id}))}catch(e){}
      const u=new URL(location.href);u.searchParams.set('resume','1');location.href=u.toString();
    };
  }finally{checking=false}
}
function autoResumeAfterReload(){
  const u=new URL(location.href);if(u.searchParams.get('resume')!=='1')return;
  const timer=setInterval(()=>{const b=document.getElementById('qbResumeGo');if(b){clearInterval(timer);u.searchParams.delete('resume');history.replaceState(null,'',u.pathname+u.search+u.hash);b.click()}},100);
  setTimeout(()=>clearInterval(timer),12000);
}
document.addEventListener('DOMContentLoaded',()=>{autoResumeAfterReload();check();setInterval(check,1500);const mo=new MutationObserver(()=>setTimeout(check,0));mo.observe(document.body,{childList:true,subtree:true})});
})();
