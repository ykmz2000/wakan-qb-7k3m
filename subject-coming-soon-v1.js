(()=>{
'use strict';
let timer=0;
function css(){
  if(document.getElementById('qbComingSoonCss'))return;
  const s=document.createElement('style');s.id='qbComingSoonCss';s.textContent=`
.qbComingSoonCard{background:linear-gradient(180deg,#fff,#f8fbfd);border:1px dashed #bfd3e2;border-radius:17px;padding:28px 18px;text-align:center;margin-bottom:10px}.qbComingSoonTitle{font-size:24px;font-weight:900;color:#126fb3;letter-spacing:.02em}.qbComingSoonSub{font-size:13px;color:#6f7786;line-height:1.7;margin-top:8px}
`;
  document.head.appendChild(s)
}
function render(){
  clearTimeout(timer);
  timer=setTimeout(()=>{
    if(window.qbGetScreen?.()!=='units')return;
    const V=document.getElementById('view');if(!V||V.querySelector('.qbComingSoonCard'))return;
    const unitBtns=[...V.querySelectorAll(':scope > button.list[data-u]')];
    if(unitBtns.length!==1||unitBtns[0].dataset.u!=='__all__')return;
    const meta=unitBtns[0].querySelector('.meta')?.textContent||'';
    if(!/^0問(?:・|$)/.test(meta.trim()))return;
    unitBtns[0].remove();
    const card=document.createElement('div');card.className='qbComingSoonCard';
    card.innerHTML='<div class="qbComingSoonTitle">Coming Soon</div><div class="qbComingSoonSub">この科目は現在準備中です。<br>単元・問題を順次追加していきます。</div>';
    V.appendChild(card)
  },40)
}
function boot(){css();window.addEventListener('qb-screen-change',render);window.addEventListener('qb-app-ready',render);render()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();