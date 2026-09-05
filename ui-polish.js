(()=>{
'use strict';
let initialGradeShown=false;
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
function run(){clean();showGrade()}
function boot(){
  run();
  window.addEventListener('qb-app-ready',run,{once:true});
  window.addEventListener('qb-screen-change',clean);
  let tries=0;const t=setInterval(()=>{tries++;if(showGrade()||tries>=50)clearInterval(t)},100);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
