(()=>{
'use strict';
let timer=null;
const HOST='qbPracticePositionProgress';
function css(){
  if(document.getElementById('qbPracticePositionProgressCss'))return;
  const s=document.createElement('style');s.id='qbPracticePositionProgressCss';s.textContent=`
.${HOST}{margin:8px 0 13px}.qbPppTrack{height:9px;width:100%;background:#e7ecf2;border-radius:999px;overflow:hidden}.qbPppFill{height:100%;background:var(--accent);border-radius:999px;transition:width .18s ease}
  `;document.head.appendChild(s)
}
function remove(){document.querySelectorAll('.'+HOST).forEach(x=>x.remove())}
function render(){
  if(window.qbGetScreen?.()!=='practice'){remove();return}
  const card=document.querySelector('#view>.card');if(!card)return;
  const countEl=[...card.querySelectorAll('.row .meta')].find(x=>/^\s*\d+\s*\/\s*\d+\s*$/.test(x.textContent||''));
  if(!countEl){remove();return}
  const m=(countEl.textContent||'').match(/(\d+)\s*\/\s*(\d+)/);if(!m)return;
  const current=Number(m[1]),total=Number(m[2]);
  if(!Number.isFinite(current)||!Number.isFinite(total)||total<=1){remove();return}
  const pct=Math.max(0,Math.min(100,(current/total)*100));
  let host=card.querySelector('.'+HOST);
  if(!host){host=document.createElement('div');host.className=HOST;countEl.closest('.row')?.insertAdjacentElement('afterend',host)}
  if(!host)return;
  host.setAttribute('role','progressbar');host.setAttribute('aria-valuemin','1');host.setAttribute('aria-valuemax',String(total));host.setAttribute('aria-valuenow',String(current));host.setAttribute('aria-label',`演習進捗 ${current}/${total}`);
  host.innerHTML=`<div class="qbPppTrack"><div class="qbPppFill" style="width:${pct}%"></div></div>`
}
function schedule(delay=30){clearTimeout(timer);timer=setTimeout(render,delay)}
function boot(){
  css();schedule(200);
  window.addEventListener('qb-screen-change',()=>schedule(0));
  window.addEventListener('qb-retry-current',()=>schedule(0));
  window.addEventListener('qb-answer-shown',()=>schedule(0));
  const v=document.getElementById('view');if(v)new MutationObserver(()=>schedule(20)).observe(v,{childList:true,subtree:false})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
