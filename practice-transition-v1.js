(()=>{
'use strict';
const HOST='qbPracticePositionProgress';
let pending=null,token=0;
const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const screen=()=>window.qbGetScreen?.()||'';
const state=()=>window.qbGetPracticeState?.()||{};
const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
function css(){
  if(document.getElementById('qbPracticeTransitionCss'))return;
  const s=document.createElement('style');s.id='qbPracticeTransitionCss';s.textContent=`
#view>.card.qbPracticeTransitionCard{position:relative;overflow:hidden}
.qbPracticeOldBody{position:absolute;z-index:5;left:15px;right:15px;pointer-events:none;will-change:transform,opacity}
.qbPracticeIncoming{will-change:transform,opacity}
@media(prefers-reduced-motion:reduce){.qbPracticeOldBody,.qbPracticeIncoming{transition:none!important;transform:none!important;opacity:1!important}}
`;
  document.head.appendChild(s)
}
function stripInteractive(root){
  root.querySelectorAll?.('[id]').forEach(x=>x.removeAttribute('id'));
  root.querySelectorAll?.('button,input,textarea,select,a').forEach(x=>{x.removeAttribute('id');x.setAttribute('tabindex','-1');x.setAttribute('aria-hidden','true');if('disabled'in x)x.disabled=true});
  root.querySelectorAll?.('.qbReviewPractice,.adeStemToolbar,.adeStemEditor,.adeEditor,.qbPersonal,.qsiEditor,.qsiInlineEditor').forEach(x=>x.remove())
}
function bodyNodes(card){
  if(!card)return[];
  return [...card.children].filter(x=>{
    if(x.classList?.contains('row')||x.classList?.contains(HOST)||x.id==='ans'||x.classList?.contains('nav'))return false;
    if(x.querySelector?.('#ans'))return false;
    return true
  })
}
function snapshot(card){
  const nodes=bodyNodes(card);if(!nodes.length)return null;
  const box=document.createElement('div');
  for(const n of nodes){const c=n.cloneNode(true);stripInteractive(c);box.appendChild(c)}
  return {html:box.innerHTML}
}
function currentProgress(card){
  const host=card?.querySelector('.'+HOST),fill=host?.querySelector('.qbPppFill'),track=host?.querySelector('.qbPppTrack');
  if(!host||!fill||!track)return null;
  const tw=track.getBoundingClientRect().width,fw=fill.getBoundingClientRect().width;
  const pct=tw>0?clamp(fw/tw*100):clamp(parseFloat(fill.style.width)||0);
  return {host,fill,track,pct}
}
function capture(direction){
  if(screen()!=='practice')return;
  const st=state(),ids=Array.isArray(st.questionIds)?st.questionIds:[],idx=Number(st.currentIndex)||0;
  if(direction>0&&ids.length&&idx>=ids.length-1)return;
  const card=document.querySelector('#view>.card');if(!card)return;
  const p=currentProgress(card),snap=snapshot(card);
  pending={token:++token,direction,previousIndex:idx,previousId:ids[idx]||null,progress:p?safeDetach(p):null,snapshot:snap};
}
function safeDetach(p){
  const data={host:p.host,from:p.pct};
  try{p.host.remove()}catch{}
  return data
}
function countInfo(card){
  const el=[...(card?.querySelectorAll('.row .meta')||[])].find(x=>/^\s*\d+\s*\/\s*\d+\s*$/.test(x.textContent||''));
  const m=(el?.textContent||'').match(/(\d+)\s*\/\s*(\d+)/);if(!m)return null;
  const current=Number(m[1]),total=Number(m[2]);return {el,current,total,pct:total?clamp(current/total*100):0}
}
function attachPersistentProgress(card,data,info){
  if(!data?.host||!card||!info)return;
  card.querySelectorAll('.'+HOST).forEach(x=>{if(x!==data.host)x.remove()});
  const row=info.el?.closest('.row');if(!row)return;
  row.insertAdjacentElement('afterend',data.host);
  const fill=data.host.querySelector('.qbPppFill');if(!fill)return;
  data.host.setAttribute('role','progressbar');data.host.setAttribute('aria-valuemin','1');data.host.setAttribute('aria-valuemax',String(info.total));data.host.setAttribute('aria-valuenow',String(info.current));data.host.setAttribute('aria-label',`演習進捗 ${info.current}/${info.total}`);
  const from=clamp(data.from),to=clamp(info.pct),key=to.toFixed(4);
  fill.dataset.qbProgressTarget=key;
  if(reduce()){fill.style.transition='none';fill.style.width=`${to}%`;return}
  fill.style.transition='none';fill.style.width=`${from}%`;void fill.offsetWidth;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(!fill.isConnected||fill.dataset.qbProgressTarget!==key)return;
    const dur=Math.round(Math.min(520,Math.max(280,240+Math.abs(to-from)*5)));
    fill.style.transition=`width ${dur}ms cubic-bezier(.22,.61,.36,1)`;
    fill.style.width=`${to}%`
  }))
}
function animateBody(card,snap,direction){
  if(reduce()||!snap?.html||!card)return;
  const incoming=bodyNodes(card).filter(x=>x.id!=='ans');if(!incoming.length)return;
  const first=incoming[0],top=Math.max(0,first.offsetTop),old=document.createElement('div');
  old.className='qbPracticeOldBody';old.style.top=`${top}px`;old.innerHTML=snap.html;card.classList.add('qbPracticeTransitionCard');card.appendChild(old);
  const inX=direction>0?24:-24,outX=direction>0?-22:22,dur=230;
  incoming.forEach(n=>{n.classList.add('qbPracticeIncoming');n.style.transition='none';n.style.transform=`translateX(${inX}px)`;n.style.opacity='.42'});
  old.style.transition='none';old.style.transform='translateX(0)';old.style.opacity='1';void card.offsetWidth;
  requestAnimationFrame(()=>{
    incoming.forEach(n=>{n.style.transition=`transform ${dur}ms cubic-bezier(.22,.61,.36,1),opacity ${dur}ms ease`;n.style.transform='translateX(0)';n.style.opacity='1'});
    old.style.transition=`transform ${dur}ms cubic-bezier(.22,.61,.36,1),opacity ${dur}ms ease`;
    old.style.transform=`translateX(${outX}px)`;old.style.opacity='0'
  });
  setTimeout(()=>{
    old.remove();card.classList.remove('qbPracticeTransitionCard');incoming.forEach(n=>{n.classList.remove('qbPracticeIncoming');n.style.removeProperty('transition');n.style.removeProperty('transform');n.style.removeProperty('opacity')})
  },dur+50)
}
function finishSwap(p){
  if(!p||p.token!==token||screen()!=='practice')return;
  const card=document.querySelector('#view>.card'),info=countInfo(card);if(!card||!info)return false;
  const st=state(),ids=Array.isArray(st.questionIds)?st.questionIds:[],idx=Number(st.currentIndex)||0;
  if(idx===p.previousIndex)return false;
  attachPersistentProgress(card,p.progress,info);
  animateBody(card,p.snapshot,p.direction);
  window.dispatchEvent(new CustomEvent('qb-question-change',{detail:{previousQuestionId:p.previousId||null,questionId:ids[idx]||null,previousIndex:p.previousIndex,currentIndex:idx,total:ids.length,direction:p.direction}}));
  pending=null;return true
}
function awaitSwap(p){
  let tries=0;
  const tick=()=>{
    if(!p||p.token!==token)return;
    if(finishSwap(p))return;
    if(++tries<18)requestAnimationFrame(tick);else pending=null
  };
  requestAnimationFrame(tick)
}
function clickCapture(e){
  const b=e.target?.closest?.('#prev,#next');if(!b||b.disabled||screen()!=='practice')return;
  const direction=b.id==='next'?1:-1;capture(direction);const p=pending;if(p)setTimeout(()=>awaitSwap(p),0)
}
function boot(){css();document.addEventListener('click',clickCapture,true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
