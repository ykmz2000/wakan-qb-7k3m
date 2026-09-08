(()=>{
'use strict';
let raf=0;
function css(){
  if(document.getElementById('qbThemeCoverageV2Css'))return;
  const s=document.createElement('style');s.id='qbThemeCoverageV2Css';s.textContent=`
#gradeM4{color:var(--accent)!important}
#gradeM4 .lt,#gradeM4>div>div:first-child,.gradeBtn>span:first-child{color:var(--accent)!important}
#gradeM4 .meta,#gradeM4 .muted,.gradeBtn .muted{color:var(--muted)!important}
.qbThemeEditAction,.adeEditBtnV2,.adeStemBtn{color:var(--accent)!important}
.qbSharedRating .rate:not(.on),#ans .rate[data-qb-rate]:not(.on){color:var(--accent)!important;border-color:var(--accent-border)!important;background:#fff!important}
`;
  document.head.appendChild(s)
}
function markEdits(root=document){
  const els=root.querySelectorAll?.('button,a')||[];
  for(const el of els){
    const t=(el.textContent||'').replace(/\s+/g,'').trim();
    if(!t||!t.includes('編集'))continue;
    if(t.includes('編集モードを終了'))continue;
    el.classList.add('qbThemeEditAction')
  }
}
function run(){raf=0;css();markEdits()}
function schedule(){if(raf)return;raf=requestAnimationFrame(run)}
function boot(){
  run();
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  ['qb-app-ready','qb-screen-change','qb-answer-shown','qb-explanation-ready','qb-theme-change'].forEach(ev=>window.addEventListener(ev,schedule))
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
