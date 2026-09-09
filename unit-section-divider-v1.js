(()=>{
'use strict';
let timer=0;
const screen=()=>window.qbGetScreen?.()||'';
function css(){
  if(document.getElementById('qbUnitSectionDividerCss'))return;
  const s=document.createElement('style');s.id='qbUnitSectionDividerCss';s.textContent=`
.qbUnitSectionDivider{display:flex;align-items:center;gap:12px;margin:16px 2px 12px;color:var(--muted,#6f7786);font-size:12px;font-weight:900;line-height:1;letter-spacing:.01em;pointer-events:none}
.qbUnitSectionDivider::before,.qbUnitSectionDivider::after{content:"";height:1px;background:var(--line,#dce3ec);flex:1 1 auto}
.qbUnitSectionDivider>span{flex:0 0 auto;white-space:nowrap}
@media(max-width:420px){.qbUnitSectionDivider{gap:8px;font-size:11px;margin-top:14px}}
`;
  document.head.appendChild(s)
}
function remove(){document.querySelectorAll('#view .qbUnitSectionDivider').forEach(x=>x.remove())}
function divider(text,type){const d=document.createElement('div');d.className='qbUnitSectionDivider';d.dataset.qbUnitDivider=type;d.innerHTML=`<span>${text}</span>`;return d}
function inject(){
  clearTimeout(timer);css();
  if(screen()!=='units'){remove();return}
  const V=document.getElementById('view');if(!V)return;
  const all=[...V.querySelectorAll('button.list[data-u="__all__"]')][0];
  if(!all){remove();return}
  const unit=[...V.querySelectorAll('button.list[data-u]')].find(x=>x.dataset.u!=='__all__');
  const existingAll=V.querySelector('[data-qb-unit-divider="all"]');
  if(!existingAll)(all.closest('.qbPdfUnitRow')||all).insertAdjacentElement('beforebegin',divider('すべての問題を解く','all'));
  const existingUnits=V.querySelector('[data-qb-unit-divider="units"]');
  if(unit&&!existingUnits)(unit.closest('.qbPdfUnitRow')||unit).insertAdjacentElement('beforebegin',divider('単元別に問題を解く','units'));
}
function schedule(delay=20){clearTimeout(timer);timer=setTimeout(inject,delay)}
function boot(){
  css();schedule(100);
  ['qb-screen-change','qb-app-ready','qb-unit-progress-loaded'].forEach(ev=>window.addEventListener(ev,()=>schedule(20)));
  const v=document.getElementById('view');if(v)new MutationObserver(()=>{if(screen()==='units')schedule(25)}).observe(v,{childList:true,subtree:false})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
