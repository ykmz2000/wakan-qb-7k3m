/* Read-only refresh. Browser reload remains available for application updates. */
(()=>{
'use strict';
let busy=false,pull=null,resetTimer=0;
const TOP_TOLERANCE=2,AXIS_SLOP=6,PULL_START=10,PULL_THRESHOLD=80;
const visible=n=>!!n?.getClientRects().length;
function blocked(){
  return [...document.querySelectorAll('.adeEditor,.fbAdminPanel,.qbNoteEditor,[contenteditable="true"],.qbDrawModal,.qbCropModal,[role="dialog"],.authOverlay,#modal:not(.hidden)')].some(visible);
}
function boot(){
  const head=document.querySelector('.header');if(!head)return;
  const style=document.createElement('style');style.textContent=`
html.qbPullReady,html.qbPullReady body{overscroll-behavior-y:none}

.qbRefreshStatus{position:fixed;top:var(--qb-header-scroll-padding,100px);left:50%;transform:translateX(-50%);z-index:99;max-width:85vw;padding:9px 14px;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:20px;box-shadow:0 2px 10px #0002;font-size:13px;pointer-events:none}
.qbRefreshStatus[hidden]{display:none}.qbRefreshStatus[data-busy="true"]::before{content:'';display:inline-block;width:12px;height:12px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;margin-right:8px;vertical-align:-2px;animation:qbRefreshSpin .8s linear infinite}
@keyframes qbRefreshSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.qbRefreshStatus[data-busy="true"]::before{animation:none}}
`;document.head.append(style);document.documentElement.classList.add('qbPullReady');
  const content=document.getElementById('choices')||document.getElementById('view');
  const move=(distance,animate=false)=>{if(content){content.style.transition=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'transform 180ms ease-out':'';content.style.transform=distance?'translateY('+distance+'px)':'';}}
  const status=document.createElement('div');status.className='qbRefreshStatus';status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);
  function message(text){clearTimeout(resetTimer);status.hidden=false;status.textContent=text;status.dataset.busy=String(busy)}
  function hideLater(){clearTimeout(resetTimer);resetTimer=setTimeout(()=>{status.hidden=true},3000)}
  async function refresh(){
    if(busy)return false;
    if(blocked()){message('編集中の内容を保存し、編集画面を閉じてから更新してください。');hideLater();return false}
    if(!window.qbRefreshCurrentScreen)return false;
    move(64,true);busy=true;message('最新情報を取得中…');
    try{await window.qbRefreshCurrentScreen();message('最新情報に更新しました');return true}
    catch(e){message(e?.message||'更新できませんでした。通信状態を確認して、もう一度お試しください。');return false}
    finally{move(0,true);busy=false;status.dataset.busy='false';hideLater()}
  }
  function cancel(){pull=null;if(!busy)move(0,true);if(!busy)status.hidden=true}
  function scrollTop(){return Math.max(0,window.scrollY||document.scrollingElement?.scrollTop||0)}
  function scrollOwner(target){
    for(let n=target;n&&n!==document.body&&n!==document.documentElement;n=n.parentElement){
      const s=getComputedStyle(n);if(/auto|scroll|overlay/.test(s.overflowY)&&n.scrollHeight>n.clientHeight+1)return n;
    }
    return null;
  }
  function eligible(target){
    if(blocked()||busy||window.visualViewport?.scale>1.01||!(target instanceof Element))return false;
    return !target.closest('input,textarea,select,[contenteditable],[data-qb-no-pull]');
  }
  function atTop(owner){return scrollTop()<=TOP_TOLERANCE&&(!owner||owner.scrollTop<=TOP_TOLERANCE)}
  document.addEventListener('touchstart',e=>{
    cancel();if(e.touches.length!==1||!eligible(e.target))return;
    const t=e.touches[0],owner=scrollOwner(e.target);
    pull={x:t.clientX,y:t.clientY,anchorY:atTop(owner)?t.clientY:null,distance:0,active:false,axis:null,owner};
  },{passive:true,capture:true});
  document.addEventListener('touchmove',e=>{
    if(!pull)return;if(e.touches.length!==1||blocked()||window.visualViewport?.scale>1.01){cancel();return}
    const t=e.touches[0],dx=t.clientX-pull.x,totalDy=t.clientY-pull.y;
    if(!pull.axis&&Math.hypot(dx,totalDy)>=AXIS_SLOP)pull.axis=totalDy>0&&Math.abs(totalDy)>Math.abs(dx)*1.25?'vertical':'other';
    if(pull.axis==='other'||totalDy<0){cancel();return}if(pull.axis!=='vertical')return;
    if(!atTop(pull.owner)){pull.anchorY=null;pull.distance=0;pull.active=false;return}
    if(pull.anchorY===null){pull.anchorY=t.clientY;return}
    const distance=Math.max(0,t.clientY-pull.anchorY);
    pull.distance=distance;
    if(distance<PULL_START){if(pull.active){pull.active=false;move(0);status.hidden=true}return}
    if(e.cancelable)e.preventDefault();pull.active=true;
    move(Math.min(140,distance*.5));message(distance>=PULL_THRESHOLD?'離して最新情報を取得':'下に引っ張って更新');
  },{passive:false,capture:true});
  document.addEventListener('touchend',e=>{if(!pull)return;const go=pull.active&&pull.distance>=PULL_THRESHOLD&&!e.touches.length;pull=null;if(go)refresh();else if(!busy){move(0);status.hidden=true}},{passive:true,capture:true});
  document.addEventListener('touchcancel',cancel,{passive:true,capture:true});window.addEventListener('blur',cancel);window.addEventListener('qb-screen-change',cancel);
  window.QBDataRefresh.refresh=refresh;
}
window.QBDataRefresh={blocked};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
