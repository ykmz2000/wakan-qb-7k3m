(()=>{
'use strict';
let ready=false,navigating=false,current=null,backStack=[],forwardStack=[],renderTimer=0,resumeCache=null,resumeCheckedAt=0;
const screen=()=>window.qbGetScreen?.()||'';
const practiceState=()=>window.qbGetPracticeState?.()||{};
const stateNow=()=>{
  const s=screen(),p=practiceState();
  if(s==='units')return {screen:s,subjectId:p.subjectId||null};
  if(s==='problems')return {screen:s,subjectId:p.subjectId||null,unitId:p.unitId||'__all__'};
  return {screen:s};
};
const same=(a,b)=>!!a&&!!b&&a.screen===b.screen&&(a.subjectId||null)===(b.subjectId||null)&&(a.unitId||null)===(b.unitId||null);
function css(){
  if(document.getElementById('qbGlobalDockCss'))return;
  const s=document.createElement('style');s.id='qbGlobalDockCss';s.textContent=`
body.qbGlobalDockOn .app{padding-bottom:calc(94px + env(safe-area-inset-bottom))!important}body.qbGlobalDockOn #qbResumeV2{display:none!important}
#qbGlobalDock{position:fixed;left:0;right:0;bottom:0;z-index:88;background:#fffffff2;border-top:1px solid #dce3ec;backdrop-filter:blur(14px);padding:6px max(7px,env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(7px,env(safe-area-inset-left));box-shadow:0 -6px 20px #17203314}
#qbGlobalDock .qbgdInner{max-width:850px;margin:auto;display:grid;grid-template-columns:1fr .85fr 1.4fr .85fr 1fr;gap:4px}
#qbGlobalDock button{border:0;background:transparent;color:#536174;min-height:56px;border-radius:12px;font-weight:900;font-size:10px;line-height:1.08;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:3px}
#qbGlobalDock button:disabled{opacity:.28}#qbGlobalDock .qbgdResume,#qbGlobalDock .qbgdStart{background:#eef6fb;color:#126fb3}#qbGlobalDock .qbgdIco{font-size:19px;line-height:1}#qbGlobalDock .qbgdResume .qbgdIco,#qbGlobalDock .qbgdStart .qbgdIco{font-size:20px}
@media(max-width:390px){#qbGlobalDock .qbgdInner{grid-template-columns:.95fr .78fr 1.34fr .78fr .95fr}#qbGlobalDock button{font-size:9px}}
`;
  document.head.appendChild(s)
}
function attr(v){return String(v??'').replace(/\\/g,'\\\\').replace(/"/g,'\\"')}
function waitForScreen(target,timeout=3500){return new Promise((resolve,reject)=>{const start=Date.now();const t=setInterval(()=>{if(screen()===target){clearInterval(t);resolve(true)}else if(Date.now()-start>timeout){clearInterval(t);reject(new Error('画面の切り替えに時間がかかっています'))}},35)})}
async function openState(st){
  if(!st)return;
  if(st.screen==='grades'){window.showGradeScreen?.();await waitForScreen('grades');return}
  if(st.screen==='subjects'){window.qbOpenSubjects?.();await waitForScreen('subjects');return}
  if(st.screen==='units'||st.screen==='problems'){
    window.qbOpenSubjects?.();await waitForScreen('subjects');
    const b=document.querySelector(`#view [data-s="${attr(st.subjectId)}"]`);if(!b)throw new Error('科目が見つかりません');b.click();await waitForScreen('units');
    if(st.screen==='problems'){
      const u=document.querySelector(`#view [data-u="${attr(st.unitId||'__all__')}"]`);if(!u)throw new Error('単元が見つかりません');u.click();await waitForScreen('problems')
    }
  }
}
async function go(target,mode){
  if(!target||navigating)return;navigating=true;
  const prev=current;
  try{
    if(mode==='back'){if(prev)forwardStack.push(prev)}
    else if(mode==='forward'){if(prev)backStack.push(prev)}
    else if(mode==='normal'){if(prev&&!same(prev,target))backStack.push(prev);forwardStack=[]}
    await openState(target);current=target
  }catch(e){console.error('global dock nav',e);if(mode==='back')forwardStack.pop();if(mode==='forward')backStack.pop()}finally{navigating=false;scheduleRender()}
}
async function latestResume(force=false){
  const now=Date.now();if(!force&&now-resumeCheckedAt<4000)return resumeCache;resumeCheckedAt=now;
  try{
    const sb=window.qbSupabase;if(!sb)return null;const u=await sb.auth.getUser();const uid=u.data?.user?.id;if(!uid)return null;
    const r=await sb.from('practice_sessions').select('id,subject_id,unit_id,mode,question_ids,current_index,last_active_at,metadata').eq('user_id',uid).eq('is_completed',false).order('last_active_at',{ascending:false}).limit(1).maybeSingle();
    resumeCache=r.error?null:(r.data&&(r.data.question_ids||[]).length?r.data:null);return resumeCache
  }catch(e){console.error('resume lookup',e);resumeCache=null;return null}
}
function ensureDock(){
  let d=document.getElementById('qbGlobalDock');if(d)return d;d=document.createElement('nav');d.id='qbGlobalDock';d.setAttribute('aria-label','ページナビゲーション');document.body.appendChild(d);return d
}
async function render(){
  css();const s=screen(),d=document.getElementById('qbGlobalDock');
  if(s==='practice'||!ready){document.body.classList.remove('qbGlobalDockOn');d?.remove();return}
  document.body.classList.add('qbGlobalDockOn');document.getElementById('qbResumeV2')?.remove();
  const isProblemList=s==='problems';
  const startButton=isProblemList?document.getElementById('start'):null;
  const startDisabled=!startButton||/（\s*0問\s*）/.test(startButton.textContent||'')||startButton.disabled;
  const hasResume=isProblemList?false:!!(await latestResume());if(screen()==='practice')return;
  const dock=ensureDock();dock.innerHTML=`<div class="qbgdInner">
    <button data-a="home"><span class="qbgdIco">⌂</span><span>ホーム</span></button>
    <button data-a="back" ${backStack.length?'':'disabled'}><span class="qbgdIco">‹</span><span>戻る</span></button>
    ${isProblemList
      ?`<button class="qbgdStart" data-a="start" ${startDisabled?'disabled':''}><span class="qbgdIco">▶</span><span>演習開始</span></button>`
      :`<button class="qbgdResume" data-a="resume" ${hasResume?'':'disabled'}><span class="qbgdIco">↻</span><span>前回の続きから</span></button>`}
    <button data-a="forward" ${forwardStack.length?'':'disabled'}><span class="qbgdIco">›</span><span>進む</span></button>
    <button data-a="mypage"><span class="qbgdIco">◉</span><span>マイページ</span></button>
  </div>`;
  dock.querySelector('[data-a="home"]').onclick=()=>go({screen:'grades'},'normal');
  dock.querySelector('[data-a="back"]').onclick=()=>{const t=backStack.pop();if(t)go(t,'back')};
  dock.querySelector('[data-a="forward"]').onclick=()=>{const t=forwardStack.pop();if(t)go(t,'forward')};
  const start=dock.querySelector('[data-a="start"]');if(start)start.onclick=()=>document.getElementById('start')?.click();
  const resume=dock.querySelector('[data-a="resume"]');if(resume)resume.onclick=async()=>{const r=await latestResume(true);if(r)window.qbResumeSession?.(r)};
  dock.querySelector('[data-a="mypage"]').onclick=()=>document.getElementById('acctBtn')?.click()
}
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>render().catch(console.error),20)}
function onScreen(){
  if(!ready){scheduleRender();return}const s=screen();if(s==='practice'){scheduleRender();return}if(navigating){scheduleRender();return}
  const n=stateNow();if(!current){current=n}else if(!same(current,n)){backStack.push(current);forwardStack=[];current=n}
  resumeCheckedAt=0;scheduleRender()
}
function initHistory(){ready=true;current=stateNow();backStack=[];forwardStack=[];scheduleRender()}
function boot(){
  css();window.addEventListener('qb-screen-change',onScreen);window.addEventListener('qb-app-ready',()=>setTimeout(initHistory,260));
  document.addEventListener('change',e=>{if(screen()==='problems'&&e.target?.matches?.('[data-q]'))scheduleRender()});
  document.addEventListener('click',e=>{if(screen()==='problems'&&e.target?.closest?.('#toggleAll'))setTimeout(scheduleRender,0)});
  if(window.QB_DB_READY)setTimeout(initHistory,260);else setTimeout(()=>{if(!ready&&window.qbGetScreen)initHistory()},1200)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();