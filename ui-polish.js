(()=>{
'use strict';
let initialGradeShown=false;
function visualCss(){
  if(document.getElementById('qbVisualPolishCss'))return;
  const s=document.createElement('style');s.id='qbVisualPolishCss';s.textContent=`
:root{--accent-gradient-start:color-mix(in srgb,var(--accent) 84%,white);--accent-gradient-end:var(--accent)}
.progress>div,.qbPppFill{background:linear-gradient(90deg,var(--accent-gradient-start),var(--accent-gradient-end))!important}
.qbNextExamDate,.qbNextExamPeriod,.qbSubjectExamBadge{background:none;border-radius:0;padding:0;color:var(--muted)}
.qbUnitSectionHeading{display:flex;align-items:center;gap:10px;margin:17px 2px 10px;color:var(--muted);font-size:12px;font-weight:900;line-height:1.2;white-space:nowrap}
.qbUnitSectionHeading::before,.qbUnitSectionHeading::after{content:"";height:1px;background:var(--line);flex:1;min-width:18px}
.qbUnitSectionHeading.qbUnitSectionHeadingFirst{margin-top:13px}
`;
  document.head.appendChild(s)
}
function unitHeading(text,extra=''){
  const d=document.createElement('div');d.className=`qbUnitSectionHeading ${extra}`.trim();d.textContent=text;return d
}
function decorateUnits(root){
  if(!root?.querySelectorAll)return;
  root.querySelectorAll('.qbUnitSectionHeading').forEach(x=>x.remove());
  const all=root.querySelector('[data-u="__all__"]');
  if(!all)return;
  (all.closest('.qbPdfUnitRow')||all).insertAdjacentElement('beforebegin',unitHeading('すべての問題を解く','qbUnitSectionHeadingFirst'));
  const regular=[...root.querySelectorAll('[data-u]')].find(x=>x.dataset.u!=='__all__');
  if(regular)(regular.closest('.qbPdfUnitRow')||regular).insertAdjacentElement('beforebegin',unitHeading('単元別に問題を解く'))
}
function clean(root=document.getElementById('view')||document){
  if(!root)return;
  const els=root.querySelectorAll?.('.sub,.meta,.crumb')||[];
  for(const e of els){
    let t=e.textContent||'';
    t=t.replace(/Supabase収録\s*/g,'収録 ')
       .replace('Supabaseの正式データを表示しています。','学習する単元を選んでください。')
       .replace('Supabaseから問題と学習履歴を取得しています。','問題と学習履歴を読み込んでいます。');
    if(e.textContent!==t)e.textContent=t;
  }
  decorateUnits(root)
}
function showGrade(){
  if(initialGradeShown||!window.QB_DB_READY)return false;
  if(typeof window.showGradeScreen==='function'){
    initialGradeShown=true;
    window.showGradeScreen();
    clean();
    return true;
  }
  return false;
}
function run(){visualCss();clean();showGrade()}
function boot(){
  run();
  window.addEventListener('qb-app-ready',run,{once:true});
  window.addEventListener('qb-screen-change',()=>clean());
  let tries=0;const t=setInterval(()=>{tries++;if(showGrade()||tries>=50)clearInterval(t)},100);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();