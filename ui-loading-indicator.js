(()=>{
'use strict';
let hideTimer=null;
function css(){if(document.getElementById('qbUiLoadingCss'))return;const s=document.createElement('style');s.id='qbUiLoadingCss';s.textContent='#qbUiLoading{position:fixed;right:12px;top:max(12px,env(safe-area-inset-top));z-index:120;background:#172033;color:#fff;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:800;opacity:.88;pointer-events:none}';document.head.appendChild(s)}
function show(ms=700){if(!document.getElementById('choices'))return;let d=document.getElementById('qbUiLoading');if(!d){d=document.createElement('div');d.id='qbUiLoading';d.textContent='読み込み中…';document.body.appendChild(d)}clearTimeout(hideTimer);hideTimer=setTimeout(()=>d.remove(),ms)}
function boot(){css();window.addEventListener('qb-screen-change',()=>show(500));document.addEventListener('click',e=>{if(['submit','review','reset','next','prev'].includes(e.target?.id))show(500)},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();