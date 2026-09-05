(()=>{
'use strict';
let done=false;
function show(){
  if(done||!window.QB_DB_READY)return false;
  if(typeof window.showGradeScreen==='function'){
    done=true;
    window.showGradeScreen();
    return true;
  }
  return false;
}
function boot(){
  if(show())return;
  window.addEventListener('qb-app-ready',()=>show(),{once:true});
  let tries=0;const t=setInterval(()=>{tries++;if(show()||tries>=50)clearInterval(t)},100);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();