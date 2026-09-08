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
.qbEmArea[data-type="new"] .qbEmAreaHead{border-color:var(--accent-border)!important;background:var(--accent-soft)!important}
.qbEmArea[data-type="new"] .qbEmAreaPriority{background:var(--accent-soft-strong)!important;color:var(--accent)!important}
.qbEmAreaAll,.qbEmMask{color:var(--accent)!important}.qbEmAreaAll{border-color:var(--accent-border)!important}
.qbGeneratedBanner{background:var(--accent-soft)!important;border-color:var(--accent-border)!important}
#qsoBar{border-color:var(--accent-border)!important;background:var(--accent-soft)!important}
#qsoModeWrap{border-color:var(--accent-border)!important}
#qsoModeWrap button.on,#qsoSave{background:var(--accent)!important;color:#fff!important}
.qsoHandle{color:var(--accent)!important;background:var(--accent-soft)!important}
.problem.qsoDropTarget{box-shadow:inset 0 2px 0 var(--accent)!important}
.problem.qsoDragging{background:var(--accent-soft)!important}
#qbRatingFilterPanel{border-color:var(--accent-border)!important;background:var(--accent-soft)!important}
#qbRatingFilterPanel .qbrfBtn{border-color:var(--accent-border)!important}
#qbRatingFilterPanel .qbrfBtn.on{background:var(--accent)!important;border-color:var(--accent)!important;color:#fff!important}
#qbRatingFilterPanel .qbrfTitle{color:var(--text,#172033)!important}
#view .problem input[data-q],#toggleAll{accent-color:var(--accent)!important}
#toggleAll,.qbSingleOpenRow .qid,#view .problem .qid{color:var(--accent)!important}
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