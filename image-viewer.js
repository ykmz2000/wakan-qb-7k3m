(()=>{
'use strict';
const TARGET='.qbMediaImg,.qbNoteImageGrid img,.oeiGrid img,.qsiImg,.qbLibraryZoomImage';
// Match individual rendered/sortable lists, never an entire card or question.
const GROUP='.qbMediaHostV2,.qbNoteImageGrid,.oeiGrid,.qsiGrid,.qbLibraryCarousel';
let active=null;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function css(){
  if(document.getElementById('qbImageViewerCss'))return;
  const s=document.createElement('style');s.id='qbImageViewerCss';s.textContent=`
.qbMediaImg,.qbNoteImageGrid img,.oeiGrid img{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:none!important;object-fit:contain!important;object-position:center!important;margin:8px auto!important;border-radius:10px;border:1px solid #dce3ec;cursor:zoom-in;background:#fff}
.qbMediaHost,.qbNoteImageGrid,.oeiGrid{overflow:visible!important}
#ans .qbMediaHostV2{display:flex!important;flex-wrap:wrap!important;align-items:flex-start!important;gap:10px!important}
#ans .qbMediaHostV2>.qbPublicImageWrap{box-sizing:border-box;flex:0 1 320px;max-width:100%;min-width:0;margin:0!important}
#ans .qbMediaHostV2>.qbPublicImageWrap>.qbMediaImg{max-width:100%!important;max-height:240px!important;object-position:left center!important;margin:0!important}
#ans .qbMediaHostV2>.qbPublicImageWrap>.qbImageWriteActions{width:100%}
.qbImageLightbox{position:fixed;inset:0;z-index:10150;box-sizing:border-box;background:rgba(0,0,0,.94);color:#fff;display:grid;grid-template-rows:auto minmax(0,1fr) auto;padding:max(8px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));overscroll-behavior:contain;touch-action:none}
.qbImageLightboxHead,.qbImageLightboxFoot{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.qbImageLightboxTitle{font-size:13px;font-weight:700}
.qbImageLightbox button{flex-shrink:0;min-width:44px;min-height:44px;border:1px solid #ffffff40;border-radius:12px;background:#ffffff18;color:#fff;font:inherit;cursor:pointer;touch-action:manipulation}
.qbImageLightbox button:disabled{opacity:.3;cursor:default}
.qbImageLightbox button:focus-visible{outline:3px solid #fff;outline-offset:2px}
.qbImageLightbox .qbImageLightboxClose{width:44px;height:44px;border-radius:999px;font-size:28px;line-height:1}
.qbImageLightboxStage{position:relative;min-width:0;min-height:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.qbImageLightboxStage img{position:absolute;left:50%;top:50%;display:block;max-width:none;max-height:none;object-fit:contain;transform-origin:center;border-radius:4px;box-shadow:0 10px 40px #0007;will-change:transform;cursor:zoom-in;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.qbImageLightboxStage[data-zoomed="true"] img{cursor:grab}
.qbImageLightboxStage[data-zoomed="true"]:active img{cursor:grabbing}
.qbImageLightboxStatus{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:12px;font-size:13px}
.qbImageLightboxNav,.qbImageLightboxZoom{display:flex;align-items:center;gap:6px}
.qbImageLightboxCounter{min-width:52px;text-align:center;font-size:13px;font-variant-numeric:tabular-nums}
.qbImageLightboxHint{margin:6px 0 0;text-align:center;font-size:11px;color:#ffffffbb}
.qbImageLightbox [hidden]{display:none!important}
@media(max-width:360px){.qbImageLightboxZoom{gap:3px}.qbImageLightboxCounter{min-width:42px}.qbImageLightboxFoot{gap:4px}}
`;document.head.appendChild(s);
}
function groupImages(img){
  const group=img.closest(GROUP);
  const nodes=group?[...group.querySelectorAll(TARGET)].filter(x=>x.closest(GROUP)===group&&!x.closest('.sortable-fallback,.sortable-drag')&&x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden'):[img];
  // Identical URLs can belong to distinct rows. Preserve each row and its order.
  const images=nodes.map(node=>({node,src:node.currentSrc||node.src,alt:node.alt||''})).filter(x=>x.src);
  const index=images.findIndex(x=>x.node===img);
  return index<0?{images:[{node:img,src:img.currentSrc||img.src,alt:img.alt||''}],index:0}:{images,index};
}
function open(origin){
  if(active)return;
  const {images,index:startIndex}=groupImages(origin);if(!images[0]?.src)return;
  const focusBefore=document.activeElement;
  const locks=[document.documentElement,document.body].map(el=>({el,value:el.style.getPropertyValue('overflow'),priority:el.style.getPropertyPriority('overflow')}));
  const underneath=[...document.body.children].filter(el=>!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>({el,inert:el.inert}));
  const d=document.createElement('div');d.id='qbImageLightbox';d.className='qbImageLightbox';d.tabIndex=-1;
  d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','画像を拡大表示');
  d.innerHTML=`<div class="qbImageLightboxHead"><span class="qbImageLightboxTitle">画像</span><button class="qbImageLightboxClose" type="button" aria-label="閉じる">×</button></div><div class="qbImageLightboxStage"><div class="qbImageLightboxStatus" role="status"><span></span><button class="qbImageLightboxRetry" type="button" hidden>再読み込み</button></div></div><div><div class="qbImageLightboxFoot"><div class="qbImageLightboxNav"><button class="qbImageLightboxPrev" type="button" aria-label="前の画像">‹</button><span class="qbImageLightboxCounter" role="status" aria-live="polite" aria-atomic="true"></span><button class="qbImageLightboxNext" type="button" aria-label="次の画像">›</button></div><div class="qbImageLightboxZoom"><button class="qbImageLightboxOut" type="button" aria-label="縮小">−</button><button class="qbImageLightboxReset" type="button" aria-label="画像全体を表示">全体</button><button class="qbImageLightboxIn" type="button" aria-label="拡大">＋</button></div></div><p class="qbImageLightboxHint"></p></div>`;
  const get=s=>d.querySelector(s),stage=get('.qbImageLightboxStage'),status=get('.qbImageLightboxStatus'),retry=get('.qbImageLightboxRetry');
  const prev=get('.qbImageLightboxPrev'),next=get('.qbImageLightboxNext'),counter=get('.qbImageLightboxCounter');
  const zoomIn=get('.qbImageLightboxIn'),zoomOut=get('.qbImageLightboxOut'),reset=get('.qbImageLightboxReset'),closeButton=get('.qbImageLightboxClose');
  let index=startIndex,img=null,scale=1,x=0,y=0,width=0,height=0,ready=false,closed=false;
  let gesture=null,blocked=false,backdropTap=false,lastTap=null,lastTouchTime=-Infinity,suppressClickUntil=0,wheelTime=0,wheelSum=0,wheelUsed=false;
  const pointers=new Map();
  function close(){
    if(closed)return;closed=true;pointers.clear();observer.disconnect();
    document.removeEventListener('keydown',key,true);window.removeEventListener('qb-screen-change',close);window.removeEventListener('qb-retry-current',close);
    if(img){img.onload=null;img.onerror=null}d.remove();active=null;
    underneath.forEach(({el,inert})=>{el.inert=inert});
    locks.forEach(({el,value,priority})=>{if(value)el.style.setProperty('overflow',value,priority);else el.style.removeProperty('overflow')});
    if(focusBefore?.isConnected)focusBefore.focus?.({preventScroll:true});
  }
  function paint(){
    const box=stage.getBoundingClientRect();
    x=clamp(x,-Math.max(0,(width*scale-box.width)/2),Math.max(0,(width*scale-box.width)/2));
    y=clamp(y,-Math.max(0,(height*scale-box.height)/2),Math.max(0,(height*scale-box.height)/2));
    if(img)img.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px) scale(${scale})`;
    stage.dataset.zoomed=String(scale>1.01);
    zoomOut.disabled=!ready||scale<=1;zoomIn.disabled=!ready||scale>=6;reset.disabled=!ready;
    get('.qbImageLightboxHint').textContent=scale>1.01?'ドラッグで移動 · ピンチで拡大・縮小':images.length>1?'左右にスワイプで画像送り · ピンチで拡大':'ピンチ・ダブルタップで拡大';
  }
  function fit(){
    if(!ready||!img)return;
    const box=stage.getBoundingClientRect(),ratio=Math.min(1,box.width/img.naturalWidth,box.height/img.naturalHeight);
    width=img.naturalWidth*ratio;height=img.naturalHeight*ratio;
    img.style.width=width+'px';img.style.height=height+'px';paint();
  }
  function show(){
    ready=false;scale=1;x=y=0;lastTap=null;
    prev.hidden=next.hidden=images.length<2;prev.disabled=index===0;next.disabled=index===images.length-1;
    counter.textContent=`${index+1} / ${images.length}`;
    status.hidden=false;status.querySelector('span').textContent='読み込み中…';retry.hidden=true;
    if(img){img.onload=null;img.onerror=null;img.remove()}
    const current=document.createElement('img');img=current;current.alt=images[index].alt;current.draggable=false;current.hidden=true;
    current.onload=()=>{if(closed||current!==img)return;ready=true;status.hidden=true;fit();current.hidden=false};
    current.onerror=()=>{if(closed||current!==img)return;status.querySelector('span').textContent='画像を読み込めませんでした';retry.hidden=false};
    stage.prepend(current);paint();current.src=images[index].src;
  }
  function go(delta){
    if(pointers.size)return;
    const target=clamp(index+delta,0,images.length-1);if(target===index)return;
    index=target;show();
  }
  function zoom(value,center={x:0,y:0}){
    if(!ready||pointers.size)return;
    const newScale=clamp(value,1,6),ratio=newScale/scale;
    x=center.x-(center.x-x)*ratio;y=center.y-(center.y-y)*ratio;scale=newScale;paint();
  }
  function point(e){const box=stage.getBoundingClientRect();return{x:e.clientX-box.left-box.width/2,y:e.clientY-box.top-box.height/2}}
  function beginPinch(){
    const [a,b]=[...pointers.values()];
    gesture={kind:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},scale,x,y};lastTap=null;
  }
  stage.addEventListener('pointerdown',e=>{
    backdropTap=e.target===stage;
    if(e.target.closest('button')||e.button!==0||!ready)return;
    pointers.set(e.pointerId,point(e));try{stage.setPointerCapture(e.pointerId)}catch{}
    if(pointers.size>2){blocked=true;gesture=null;return}
    if(pointers.size===2){blocked=true;beginPinch();return}
    if(blocked)return;
    gesture={kind:scale>1.01?'pan':'swipe',start:point(e),x,y,time:performance.now(),axis:null,moved:false};
  });
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,point(e));
    if(!gesture)return;e.preventDefault();
    if(gesture.kind==='pinch'&&pointers.size===2){
      const [a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      scale=clamp(gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance,1,6);
      const ratio=scale/gesture.scale;x=center.x-(gesture.center.x-gesture.x)*ratio;y=center.y-(gesture.center.y-gesture.y)*ratio;paint();return;
    }
    const p=point(e),dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;
    if(Math.hypot(dx,dy)>10)gesture.moved=true;
    if(gesture.kind==='pan'){x=gesture.x+dx;y=gesture.y+dy;paint();return}
    if(!gesture.axis&&gesture.moved)gesture.axis=Math.abs(dx)>Math.abs(dy)*1.25?'x':'y';
    if(gesture.axis==='x'&&images.length>1&&!(window.visualViewport?.scale>1.01)){
      const edge=dx>0?index===0:index===images.length-1;
      img.style.transform=`translate(-50%,-50%) translateX(${dx*(edge ? .18 : .8)}px)`;
    }
  },{passive:false});
  function endPointer(e,cancelled=false){
    if(!pointers.has(e.pointerId))return;
    const g=gesture,p=point(e),wasBlocked=blocked;
    pointers.delete(e.pointerId);try{if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId)}catch{}
    if(e.pointerType==='touch')lastTouchTime=performance.now();
    if(g?.moved||wasBlocked||cancelled){backdropTap=false;suppressClickUntil=performance.now()+450}
    if(pointers.size){blocked=true;gesture=null;return}
    gesture=null;blocked=false;paint();
    if(!g||wasBlocked||cancelled){lastTap=null;return}
    const dx=p.x-g.start.x,dy=p.y-g.start.y;
    if(g.kind==='swipe'&&g.axis==='x'&&Math.abs(dx)>=Math.max(44,Math.min(100,stage.clientWidth*.12))&&Math.abs(dx)>Math.abs(dy)*1.4&&performance.now()-g.time<1000&&!(window.visualViewport?.scale>1.01)){
      go(dx<0?1:-1);lastTap=null;return;
    }
    if(e.pointerType==='touch'&&!g.moved&&performance.now()-g.time<300){
      const now=performance.now();
      if(lastTap&&now-lastTap.time<300&&Math.hypot(p.x-lastTap.x,p.y-lastTap.y)<30){zoom(scale>1.01?1:2.5,p);lastTap=null;suppressClickUntil=now+450}
      else lastTap={...p,time:now};
    }else lastTap=null;
  }
  stage.addEventListener('pointerup',e=>endPointer(e));stage.addEventListener('pointercancel',e=>endPointer(e,true));
  stage.addEventListener('lostpointercapture',e=>endPointer(e,true));
  stage.addEventListener('dblclick',e=>{if(e.target!==img&&(e.target!==stage||backdropTap))return;e.preventDefault();if(performance.now()-lastTouchTime>500)zoom(scale>1.01?1:2.5,point(e))});
  stage.addEventListener('contextmenu',e=>e.preventDefault());
  stage.addEventListener('wheel',e=>{
    e.preventDefault();if(pointers.size)return;
    if(e.ctrlKey){zoom(scale*Math.exp(-e.deltaY*.01),point(e));return}
    const unit=e.deltaMode===1?16:e.deltaMode===2?stage.clientWidth:1;
    const dx=(e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX)*unit,dy=e.deltaY*unit;
    if(scale>1.01||window.visualViewport?.scale>1.01){x-=dx;y-=e.shiftKey?0:dy;paint();return}
    const now=performance.now();if(now-wheelTime>220){wheelSum=0;wheelUsed=false}wheelTime=now;
    if(wheelUsed||(!e.shiftKey&&Math.abs(dx)<=Math.abs(dy)*1.25))return;
    if(Math.sign(wheelSum)!==Math.sign(dx))wheelSum=0;wheelSum+=dx;
    if(Math.abs(wheelSum)>=50){go(wheelSum>0?1:-1);wheelUsed=true}
  },{passive:false});
  function key(e){
    if(closed||e.isComposing)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return}
    if(e.key==='Tab'){
      const buttons=[...d.querySelectorAll('button')].filter(b=>!b.disabled&&!b.hidden);
      const i=buttons.indexOf(document.activeElement),target=e.shiftKey?(i<=0?buttons.length-1:i-1):(i+1)%buttons.length;
      e.preventDefault();e.stopImmediatePropagation();buttons[target]?.focus();return;
    }
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','+','=','-','0'].includes(e.key)){
      e.preventDefault();e.stopImmediatePropagation();if(pointers.size)return;
      if(e.key==='Home')go(-index);else if(e.key==='End')go(images.length-1-index);
      else if(e.key==='+'||e.key==='=')zoom(scale*1.5);else if(e.key==='-')zoom(scale/1.5);else if(e.key==='0')zoom(1);
      else if(scale>1.01){x+=e.key==='ArrowLeft'?50:e.key==='ArrowRight'?-50:0;y+=e.key==='ArrowUp'?50:e.key==='ArrowDown'?-50:0;paint()}
      else if(e.key==='ArrowLeft'||e.key==='ArrowRight')go(e.key==='ArrowRight'?1:-1);
    }
  }
  prev.onclick=()=>go(-1);next.onclick=()=>go(1);retry.onclick=show;
  zoomIn.onclick=()=>zoom(scale*1.5);zoomOut.onclick=()=>zoom(scale/1.5);reset.onclick=()=>zoom(1);closeButton.onclick=close;
  // Pointer capture retargets image clicks to the stage. Only a tap which
  // started on the empty backdrop may close; image taps are reserved for zoom.
  stage.addEventListener('click',e=>{if(e.target===stage&&backdropTap&&performance.now()>=suppressClickUntil)close()});
  const observer=new ResizeObserver(()=>{gesture=null;blocked=pointers.size>0;fit()});
  document.body.appendChild(d);underneath.forEach(({el})=>{el.inert=true});locks.forEach(({el})=>el.style.setProperty('overflow','hidden','important'));
  active={close};document.addEventListener('keydown',key,true);window.addEventListener('qb-screen-change',close);window.addEventListener('qb-retry-current',close);
  observer.observe(stage);show();closeButton.focus({preventScroll:true});
}
function boot(){
  css();document.addEventListener('click',e=>{
    const img=e.target?.closest?.('img');if(!img?.matches(TARGET)||active)return;
    e.preventDefault();e.stopPropagation();open(img);
  },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
