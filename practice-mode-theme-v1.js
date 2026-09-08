(()=>{
'use strict';
function css(){
  if(document.getElementById('qbPracticeModeThemeCss'))return;
  const s=document.createElement('style');
  s.id='qbPracticeModeThemeCss';
  s.textContent=`
#modal .mode{border-color:var(--accent-border,var(--line))!important;background:#fff!important}
#modal .mode b{color:var(--accent)!important}
#modal .mode:active,#modal .mode:focus-visible{border-color:var(--accent)!important;background:var(--accent-soft)!important}
#modal .mode:active b,#modal .mode:focus-visible b{color:var(--accent)!important}
`;
  document.head.appendChild(s)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',css,{once:true});else css();
})();
