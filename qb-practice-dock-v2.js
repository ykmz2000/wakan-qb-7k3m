(()=>{
'use strict';
let timer=null;
const screen=()=>window.qbGetScreen?.()||'';
const state=()=>window.qbGetPracticeState?.()||{};
const tap=id=>{const e=document.getElementById(id);if(e&&!e.disabled){e.click();return true}return false};
function css(){
  if(document.getElementById('qbPracticeDockV2Css'))return;
  const s=document.createElement('style');s.id='qbPracticeDockV2Css';s.textContent=`
#qbCompatDock{display:none!important}
body.qbPracticeDockV2On .app{padding-bottom:calc(92px + env(safe-area-inset-bottom))}
body.qbPracticeDockV2On #view #answer,
body.qbPracticeDockV2On #view #review,
body.qbPracticeDockV2On #view #showTextAnswer,
body.qbPracticeDockV2On #view .nav{display:none!important}
#qbPracticeDockV2{position:fixed;left:0;right:0;bottom:0;z-index:90;background:#fffffff2;border-top:1px solid #dce3ec;backdrop-filter:blur(14px);padding:6px max(7px,env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(7px,env(safe-area-inset-left));box-shadow:0 -6px 20px #17203314}
#qbPracticeDockV2 .qbpdInner{max-width:850px;margin:auto;display:grid;grid-template-columns:1fr .72fr 1.5fr .72fr 1fr;gap:4px;align-items:stretch}
#qbPracticeDockV2 button{border:0;background:transparent;color:#536174;min-height:54px;border-radius:12px;font-weight:900;font-size:10px;line-height:1.1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:3px}
#qbPracticeDockV2 button:disabled{opacity:.35}
#qbPracticeDockV2 button.qbpdMain{background:#126fb3;color:#fff;font-size:12px;box-shadow:0 3px 10px #126fb32b}
#qbPracticeDockV2 .qbpdIco{font-size:18px;line-height:1}
#qbPracticeDockV2 .qbpdMain .qbpdIco{font-size:20px}
@media(max-width:390px){#qbPracticeDockV2 .qbpdInner{grid-template-columns:.95fr .68fr 1.42fr .68fr .95fr}#qbPracticeDockV2 button{font-size:9px}}
`;
  document.head.appendChild(s);
}
function explanationShown(){return !!document.querySelector('#ans .resultcard')}
function hasSelection(){return !!document.querySelector('#view .choice.sel')}
function fillInputs(){return [...document.querySelectorAll('#view .fbInput')]}
function hasAnyInput(){return fillInputs().some(x=>x.value.trim())}
function allInputsComplete(){const xs=fillInputs();return !!xs.length&&xs.every(x=>x.value.trim())}
function actionState(){
  if(explanationShown())return 'retry';
  if(hasSelection()||hasAnyInput())return 'answer';
  const a=document.getElementById('answer');
  if(a&&!a.disabled)return 'answer';
  return 'review';
}
function mainLabel(){const a=actionState();return a==='retry'?'もう一度解く':a==='answer'?'解答する':'解説する'}
function mainIcon(){const a=actionState();return a==='retry'?'↻':a==='answer'?'✓':'▤'}
function goSubjects(){window.qbOpenSubjects?.()}
function goUnits(){
  const s=state();
  window.qbOpenSubjects?.();
  let tries=0;
  const t=setInterval(()=>{
    tries++;
    const b=s.subjectId?document.querySelector(`[data-s="${CSS.escape(String(s.subjectId))}"]`):null;
    if(b){clearInterval(t);b.click();return}
    if(tries>=30)clearInterval(t);
  },30);
}
function doMain(){
  const a=actionState();
  if(a==='retry'){window.qbRetryCurrent?.();return}
  if(a==='answer'){
    if(fillInputs().length&&!allInputsComplete()){
      const empty=fillInputs().find(x=>!x.value.trim());
      empty?.focus();
      return;
    }
    if(tap('answer'))return;
  }
  if(tap('review'))return;
  tap('showTextAnswer');
}
function render(){
  css();
  let d=document.getElementById('qbPracticeDockV2');
  if(screen()!=='practice'){
    document.body.classList.remove('qbPracticeDockV2On');
    d?.remove();
    return;
  }
  document.body.classList.add('qbPracticeDockV2On');
  if(!d){d=document.createElement('nav');d.id='qbPracticeDockV2';d.setAttribute('aria-label','演習ナビゲーション');document.body.appendChild(d)}
  const st=state(),i=Number(st.currentIndex)||0,n=(st.questionIds||[]).length;
  d.innerHTML=`<div class="qbpdInner">
    <button data-a="subjects"><span class="qbpdIco">⌂</span><span>科目一覧</span></button>
    <button data-a="prev" ${i<=0?'disabled':''}><span class="qbpdIco">‹</span><span>前へ</span></button>
    <button class="qbpdMain" data-a="main"><span class="qbpdIco">${mainIcon()}</span><span>${mainLabel()}</span></button>
    <button data-a="next"><span class="qbpdIco">${n&&i>=n-1?'■':'›'}</span><span>${n&&i>=n-1?'終了':'次へ'}</span></button>
    <button data-a="units"><span class="qbpdIco">☷</span><span>単元一覧</span></button>
  </div>`;
  d.querySelector('[data-a="subjects"]').onclick=goSubjects;
  d.querySelector('[data-a="prev"]').onclick=()=>tap('prev');
  d.querySelector('[data-a="main"]').onclick=doMain;
  d.querySelector('[data-a="next"]').onclick=()=>tap('next');
  d.querySelector('[data-a="units"]').onclick=goUnits;
}
function schedule(){clearTimeout(timer);timer=setTimeout(render,0)}
function boot(){
  css();schedule();
  ['qb-screen-change','qb-answer-shown','qb-retry-current','qb-app-ready'].forEach(ev=>window.addEventListener(ev,schedule));
  document.addEventListener('click',e=>{if(e.target.closest?.('#view .choice,#answer,#review,#showTextAnswer,#prev,#next'))setTimeout(schedule,20)},true);
  document.addEventListener('input',e=>{if(e.target.matches?.('.fbInput'))schedule()},true);
  const v=document.getElementById('view');if(v)new MutationObserver(schedule).observe(v,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
