(()=>{
'use strict';
function css(){
  if(document.getElementById('qbAccountUiPolishCss'))return;
  const s=document.createElement('style');s.id='qbAccountUiPolishCss';s.textContent=`
.gradeBtn{color:var(--accent)!important}
.gradeBtn .muted{color:var(--muted)!important}
#chooseAvatar{color:var(--text,#172033)!important;background:#fff!important;border-color:var(--line,#dce3ec)!important}
#removeAvatar{color:var(--accent)!important;background:var(--accent-soft,#f8eef3)!important;border-color:var(--accent-border,#e8b8cb)!important}
#logoutBtn{background:#eef1f5!important;color:var(--accent)!important;border-color:#dce3ec!important}
#closeAcct{background:#eef1f5!important;color:var(--text,#172033)!important;border-color:#dce3ec!important}
`;
  document.head.appendChild(s)
}
function boot(){
  css();
  document.addEventListener('click',e=>{
    const sheet=e.target?.closest?.('#acctSheet');
    if(sheet&&e.target===sheet)sheet.remove()
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();