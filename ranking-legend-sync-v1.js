(()=>{
'use strict';
let raf=0;
function sync(){
  raf=0;
  const me=document.querySelector('.qbLegendMe');if(!me)return;
  const inline=me.getAttribute('style')||'';
  const hasImage=inline.includes('background-image');
  const target=hasImage?'var(--accent)':'#9aa4b2';
  document.querySelectorAll('.qbLegendOther').forEach(x=>{if(x.style.background!==target)x.style.background=target});
}
function schedule(){if(raf)return;raf=requestAnimationFrame(sync)}
function boot(){
  schedule();
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
  window.addEventListener('qb-theme-change',schedule)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
