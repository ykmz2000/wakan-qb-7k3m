(()=>{
'use strict';
let queued=false;
function cleanPersonalNotes(root=document){
  const parents=new Set();
  root.querySelectorAll?.('.qbPersonal')?.forEach(n=>{if(n.parentElement)parents.add(n.parentElement)});
  parents.forEach(parent=>{
    const seen=new Set();
    [...parent.children].filter(x=>x.classList?.contains('qbPersonal')).forEach(n=>{
      const key=n.dataset.noteKey||'';
      if(seen.has(key))n.remove();else seen.add(key);
    });
  });
}
function placeEditButtons(root=document){
  root.querySelectorAll?.('.adeEditBtn')?.forEach(b=>{
    const host=b.parentElement;
    if(!host)return;
    host.classList.add('adeHasEdit');
    if(host.classList.contains('exp'))host.classList.add('adeChoiceHost');
  });
}
function run(){queued=false;cleanPersonalNotes(document);placeEditButtons(document)}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(run)}
function css(){if(document.getElementById('qbUiHotfixCss'))return;const s=document.createElement('style');s.id='qbUiHotfixCss';s.textContent=`
.adeHasEdit{position:relative!important;padding-right:76px!important}
.adeHasEdit>.adeEditBtn{position:absolute!important;top:10px!important;right:12px!important;float:none!important;margin:0!important;padding:3px 0!important;z-index:2!important;background:transparent!important}
.exp.adeHasEdit{padding-right:76px!important}
.exp.adeHasEdit>.adeEditBtn{top:9px!important;right:0!important}
.qbPersonal{position:relative}
`;
document.head.appendChild(s)}
function boot(){css();schedule();['qb-screen-change','qb-answer-shown','qb-explanation-ready'].forEach(ev=>window.addEventListener(ev,()=>setTimeout(schedule,0)));document.addEventListener('click',e=>{if(e.target?.closest?.('.adeEditBtn,.qbPencil,#answer,#review,#next,#prev'))setTimeout(schedule,0)},true);const ans=document.getElementById('ans')||document.getElementById('view');if(ans)new MutationObserver(schedule).observe(ans,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();