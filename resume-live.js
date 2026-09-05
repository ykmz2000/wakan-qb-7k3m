(()=>{
'use strict';
let dismissedSessionId=null,checking=false;
function inPractice(){return !!(document.getElementById('choices')&&document.querySelector('.nav'))}
function remove(){document.getElementById('qbLiveResume')?.remove()}
function installCss(){if(document.getElementById('qbLiveResumeCss'))return;const s=document.createElement('style');s.id='qbLiveResumeCss';s.textContent=`#qbLiveResume{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:85}#qbLiveResume .miniResume{display:flex;align-items:center;gap:5px;background:#fff;border:1px solid #dce3ec;border-radius:999px;box-shadow:0 6px 20px #0002;padding:5px}#qbLiveResume button{border:0;border-radius:999px;height:36px;font-weight:900;flex:0 0 auto}#qbLiveResume .resumeX{width:32px;background:#eef1f5;color:#6f7786;font-size:17px}#qbLiveResume .resumeGo{width:auto;min-width:106px;padding:0 12px;background:#126fb3;color:#fff;font-size:12px;white-space:nowrap}`;document.head.appendChild(s)}
async function check(){
  installCss();
  if(inPractice()){remove();return}
  const sb=window.qbSupabase;if(!sb||checking)return;
  checking=true;
  try{
    const {data:{user}}=await sb.auth.getUser();if(!user){remove();return}
    const subj=await sb.from('subjects').select('id').eq('slug','wakan').maybeSingle();if(!subj.data?.id){remove();return}
    const r=await sb.from('practice_sessions').select('id,mode,current_index,metadata,question_ids').eq('user_id',user.id).eq('subject_id',subj.data.id).eq('is_completed',false).order('last_active_at',{ascending:false}).limit(1).maybeSingle();
    if(r.error||!r.data){remove();return}
    const s=r.data,keys=Array.isArray(s.metadata?.canonical_keys)?s.metadata.canonical_keys:[];
    if(!keys.length||dismissedSessionId===s.id){remove();return}
    const existing=document.getElementById('qbLiveResume');if(existing?.dataset.sessionId===s.id)return;
    remove();
    const d=document.createElement('div');d.id='qbLiveResume';d.dataset.sessionId=s.id;d.innerHTML=`<div class="miniResume"><button class="resumeX" aria-label="閉じる">×</button><button class="resumeGo" aria-label="続きから解く">続きから ${Math.min((s.current_index||0)+1,keys.length)}/${keys.length} ▶</button></div>`;document.body.appendChild(d);
    d.querySelector('.resumeX').onclick=()=>{dismissedSessionId=s.id;remove()};
    d.querySelector('.resumeGo').onclick=()=>{
      remove();
      if(typeof window.qbResumeSession==='function'){window.qbResumeSession(s,keys);return}
      try{const old=JSON.parse(localStorage.getItem('m4_qb_v7')||'{}');localStorage.setItem('m4_qb_v7',JSON.stringify({...old,screen:'practice',practice:keys,pi:s.current_index||0,unitId:s.metadata?.unit_slug||'__all__',mode:s.mode||'ordered',sessionId:s.id}))}catch(e){}
      const u=new URL(location.href);u.searchParams.set('resume','1');location.href=u.toString();
    };
  }finally{checking=false}
}
function autoResumeAfterReload(){const u=new URL(location.href);if(u.searchParams.get('resume')!=='1')return;const timer=setInterval(()=>{const b=document.getElementById('qbResumeGo');if(b){clearInterval(timer);u.searchParams.delete('resume');history.replaceState(null,'',u.pathname+u.search+u.hash);b.click()}},100);setTimeout(()=>clearInterval(timer),12000)}
document.addEventListener('DOMContentLoaded',()=>{autoResumeAfterReload();check();setInterval(check,1500);const mo=new MutationObserver(()=>setTimeout(check,0));mo.observe(document.body,{childList:true,subtree:true})});
})();
