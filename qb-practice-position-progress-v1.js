(()=>{
'use strict';
let timer=null,lastPct=null,lastKey=null,wasPractice=false,unitObserver=null;
const HOST='qbPracticePositionProgress';
const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
const durationFor=(from,to,min=240,max=650)=>{
  const d=Math.abs(to-from);
  return Math.round(Math.min(max,Math.max(min,210+d*5.2)));
};
function css(){
  if(document.getElementById('qbPracticePositionProgressCss'))return;
  const s=document.createElement('style');s.id='qbPracticePositionProgressCss';s.textContent=`
.${HOST}{margin:8px 0 13px}.qbPppTrack{height:9px;width:100%;background:#e7ecf2;border-radius:999px;overflow:hidden}.qbPppFill{height:100%;background:var(--accent);border-radius:999px;will-change:width}
.progress>div{will-change:width;transition-property:width!important;transition-timing-function:cubic-bezier(.22,.61,.36,1)!important}
@media(prefers-reduced-motion:reduce){.qbPppFill,.progress>div{transition:none!important}}
  `;document.head.appendChild(s)
}
function removePractice(){document.querySelectorAll('.'+HOST).forEach(x=>x.remove())}
function practiceKey(){
  const st=window.qbGetPracticeState?.()||{};
  const ids=Array.isArray(st.questionIds)?st.questionIds:[];
  return [st.subjectId||'',st.unitId||'',ids.length,ids[0]||'',ids[ids.length-1]||''].join('|')
}
function setWidthSmooth(fill,from,to,{initial=false}={}){
  from=clamp(from);to=clamp(to);
  if(reduceMotion()){fill.style.transition='none';fill.style.width=`${to}%`;return}
  fill.style.transition='none';fill.style.width=`${from}%`;
  void fill.offsetWidth;
  const dur=durationFor(from,to,initial?300:220,initial?700:480);
  requestAnimationFrame(()=>{
    fill.style.transition=`width ${dur}ms cubic-bezier(.22,.61,.36,1)`;
    fill.style.width=`${to}%`
  })
}
function renderPractice(){
  const inPractice=window.qbGetScreen?.()==='practice';
  if(!inPractice){removePractice();wasPractice=false;return}
  const card=document.querySelector('#view>.card');if(!card)return;
  const countEl=[...card.querySelectorAll('.row .meta')].find(x=>/^\s*\d+\s*\/\s*\d+\s*$/.test(x.textContent||''));
  if(!countEl){removePractice();return}
  const m=(countEl.textContent||'').match(/(\d+)\s*\/\s*(\d+)/);if(!m)return;
  const current=Number(m[1]),total=Number(m[2]);
  if(!Number.isFinite(current)||!Number.isFinite(total)||total<=1){removePractice();return}
  const pct=clamp((current/total)*100),key=practiceKey();
  const entering=!wasPractice||lastKey!==key;
  let host=card.querySelector('.'+HOST),fill=host?.querySelector('.qbPppFill');
  if(!host){
    host=document.createElement('div');host.className=HOST;
    host.innerHTML='<div class="qbPppTrack"><div class="qbPppFill"></div></div>';
    countEl.closest('.row')?.insertAdjacentElement('afterend',host);fill=host.querySelector('.qbPppFill')
  }
  if(!host||!fill)return;
  host.setAttribute('role','progressbar');host.setAttribute('aria-valuemin','1');host.setAttribute('aria-valuemax',String(total));host.setAttribute('aria-valuenow',String(current));host.setAttribute('aria-label',`演習進捗 ${current}/${total}`);
  const from=entering?0:(lastPct==null?pct:lastPct);
  setWidthSmooth(fill,from,pct,{initial:entering});
  lastPct=pct;lastKey=key;wasPractice=true
}
function animateUnitFill(fill){
  if(!fill||fill.dataset.qbSmoothProgress==='1')return;
  fill.dataset.qbSmoothProgress='1';
  const raw=(fill.style.width||'').trim(),m=raw.match(/^([\d.]+)%$/);if(!m)return;
  const target=clamp(Number(m[1]));if(target<=0)return;
  if(reduceMotion())return;
  fill.style.transition='none';fill.style.width='0%';void fill.offsetWidth;
  const dur=durationFor(0,target,320,700);
  requestAnimationFrame(()=>{fill.style.transition=`width ${dur}ms cubic-bezier(.22,.61,.36,1)`;fill.style.width=`${target}%`})
}
function scanUnitProgress(root=document){
  root.querySelectorAll?.('.progress>div').forEach(animateUnitFill)
}
function schedule(delay=30){clearTimeout(timer);timer=setTimeout(renderPractice,delay)}
function boot(){
  css();scanUnitProgress();schedule(200);
  window.addEventListener('qb-screen-change',()=>{scanUnitProgress();schedule(0)});
  window.addEventListener('qb-unit-progress-loaded',()=>requestAnimationFrame(()=>scanUnitProgress()));
  window.addEventListener('qb-retry-current',()=>schedule(0));
  window.addEventListener('qb-answer-shown',()=>schedule(0));
  const v=document.getElementById('view');if(v){
    unitObserver=new MutationObserver(ms=>{
      for(const m of ms)for(const n of m.addedNodes){if(n?.nodeType===1){if(n.matches?.('.progress>div'))animateUnitFill(n);scanUnitProgress(n)}}
      schedule(20)
    });
    unitObserver.observe(v,{childList:true,subtree:true})
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
