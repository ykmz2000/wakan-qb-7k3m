(()=>{
'use strict';
let mode='open',lastSnapshot=null,restoring=false,wireTimer=0;
const screen=()=>window.qbGetScreen?.()||'';
const listInputs=()=>[...document.querySelectorAll('#view .problem input[data-q]')];
function css(){
  if(document.getElementById('qbAdminProblemModeCss'))return;
  const s=document.createElement('style');s.id='qbAdminProblemModeCss';s.textContent=`
#qsoModeWrap{display:flex;gap:5px;padding:3px;border:1px solid #d8e2ec;border-radius:11px;background:#fff;flex:0 0 auto}
#qsoModeWrap button{border:0;background:transparent;color:#637083;border-radius:8px;min-height:34px;padding:0 10px;font-size:12px;font-weight:900}
#qsoModeWrap button.on{background:#126fb3;color:#fff}
body:not(.qbQuestionReorderMode) #view .qsoHandle{display:none!important}
body:not(.qbQuestionReorderMode) #qsoSave,body:not(.qbQuestionReorderMode) #qsoUndo{display:none!important}
body.qbQuestionReorderMode #qsoBar{background:#fffaf0;border-color:#ead7a5}
body.qbQuestionReorderMode #view .qbSingleOpenRow{cursor:default!important}
body.qbQuestionReorderMode #view .qbSingleOpenRow:hover{background:transparent!important;outline:0!important}
@media(max-width:520px){#qsoModeWrap{width:100%;display:grid;grid-template-columns:1fr 1fr}#qsoModeWrap button{min-height:38px}}
`;
  document.head.appendChild(s)
}
function snapshot(){
  return {
    selected:new Set(listInputs().filter(x=>x.checked).map(x=>String(x.dataset.q))),
    cats:new Set([...document.querySelectorAll('#qbRatingFilterPanel .qbrfBtn.on')].map(b=>b.dataset.cat).filter(Boolean))
  }
}
function restoreSnapshot(snap){
  if(!snap||screen()!=='problems')return;
  restoring=true;
  try{
    const buttons=[...document.querySelectorAll('#qbRatingFilterPanel .qbrfBtn')];
    buttons.forEach(b=>{
      const want=snap.cats.has(b.dataset.cat),on=b.classList.contains('on');
      if(want!==on)b.click()
    });
    setTimeout(()=>{
      listInputs().forEach(x=>{
        const want=snap.selected.has(String(x.dataset.q));
        if(x.checked===want)return;
        x.checked=want;x.dispatchEvent(new Event('change',{bubbles:true}))
      });
      setTimeout(()=>{restoring=false},0)
    },0)
  }catch(e){restoring=false;console.error('problem mode filter restore',e)}
}
function scheduleRestore(snap=lastSnapshot){
  if(!snap)return;
  [180,520,1100].forEach(ms=>setTimeout(()=>restoreSnapshot(snap),ms))
}
function setMode(next,{skipConfirm=false}={}){
  if(next!=='open'&&next!=='reorder')return;
  if(next==='open'&&mode==='reorder'){
    const save=document.getElementById('qsoSave');
    if(save&&!save.disabled&&!skipConfirm){
      if(!confirm('未保存の並べ替えがあります。元の順番に戻して「問題を開く」モードへ切り替えますか？'))return;
      lastSnapshot=snapshot();document.getElementById('qsoUndo')?.click();scheduleRestore(lastSnapshot)
    }
  }
  mode=next;window.QB_REORDER_MODE=mode==='reorder';window.QB_REORDER_ACTIVE=mode==='reorder';
  document.body.classList.toggle('qbQuestionReorderMode',mode==='reorder');
  if(mode==='reorder')lastSnapshot=snapshot();
  refreshUi();
  window.dispatchEvent(new CustomEvent('qb-problem-list-mode-changed',{detail:{mode}}))
}
function refreshUi(){
  const wrap=document.getElementById('qsoModeWrap');if(!wrap)return;
  wrap.querySelectorAll('button[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});
  const msg=document.querySelector('#qsoBar .qsoMsg');
  if(!msg)return;
  if(mode==='open')msg.textContent='問題を押すと、その1問だけ開きます。自己評価・★の選択状態には影響しません。';
  else if(!document.getElementById('qsoSave')?.disabled)msg.textContent='順番を変更中です。保存するまでDBには反映されません。';
  else msg.textContent='≡ をドラッグして並び替えできます。自己評価・★の選択状態は保持されます。'
}
function wireBar(){
  clearTimeout(wireTimer);
  if(screen()!=='problems'){
    mode='open';window.QB_REORDER_MODE=false;window.QB_REORDER_ACTIVE=false;document.body.classList.remove('qbQuestionReorderMode');return
  }
  const bar=document.getElementById('qsoBar');if(!bar)return;
  if(!document.getElementById('qsoModeWrap')){
    const wrap=document.createElement('div');wrap.id='qsoModeWrap';wrap.innerHTML='<button type="button" data-mode="open" aria-pressed="true">問題を開く</button><button type="button" data-mode="reorder" aria-pressed="false">並べ替え</button>';
    bar.prepend(wrap);
    wrap.querySelectorAll('button[data-mode]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();setMode(b.dataset.mode)})
  }
  if(mode!=='open'&&mode!=='reorder')mode='open';
  refreshUi()
}
function scheduleWire(){clearTimeout(wireTimer);wireTimer=setTimeout(wireBar,60)}
function boot(){
  css();window.QB_REORDER_MODE=false;scheduleWire();
  ['qb-screen-change','qb-app-ready'].forEach(ev=>window.addEventListener(ev,()=>{mode='open';window.QB_REORDER_MODE=false;window.QB_REORDER_ACTIVE=false;document.body.classList.remove('qbQuestionReorderMode');scheduleWire()}));
  window.addEventListener('qb-question-order-updated',()=>{if(mode==='reorder'){scheduleRestore(lastSnapshot);setTimeout(refreshUi,150)}});
  document.addEventListener('pointerdown',e=>{if(mode==='reorder'&&e.target.closest?.('.qsoHandle'))lastSnapshot=snapshot()},true);
  document.addEventListener('pointerup',e=>{
    if(mode!=='reorder'||!e.target.closest?.('.qsoHandle'))return;
    window.QB_REORDER_ACTIVE=true;scheduleRestore(lastSnapshot);setTimeout(refreshUi,180)
  });
  document.addEventListener('pointercancel',e=>{if(mode==='reorder'&&e.target.closest?.('.qsoHandle')){window.QB_REORDER_ACTIVE=true;scheduleRestore(lastSnapshot)}},true);
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#qbRatingFilterPanel .qbrfBtn,#qbReviewLaterPanel [data-qbrl="filter"]'))setTimeout(()=>{if(!restoring)lastSnapshot=snapshot()},180);
    if(e.target.closest?.('#qsoSave,#qsoUndo')){lastSnapshot=snapshot();scheduleRestore(lastSnapshot);setTimeout(refreshUi,220)}
  });
  document.addEventListener('change',e=>{
    if(mode==='reorder'&&!restoring&&e.target?.matches?.('#view .problem input[data-q]'))setTimeout(()=>{if(!restoring)lastSnapshot=snapshot()},0)
  },true);
  const root=document.body;new MutationObserver(()=>scheduleWire()).observe(root,{childList:true,subtree:true})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();