(()=>{
'use strict';
const TARGET='.qbMediaImg,.qbNoteImageGrid img,.oeiGrid img,.qsiImg,.qbLibraryZoomImage';
const MEDIA=TARGET+',.qbPdfCard';
// Match individual rendered/sortable lists, never an entire card or question.
const GROUP='.qbMediaHostV2,.qbNoteImageGrid,.oeiGrid,.qsiGrid,.qbLibraryCarousel';
let active=null;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function questionPreviewData(){
  if(window.qbGetScreen?.()!=='practice')return null;
  const stem=document.querySelector('#view > .card > .qtext');
  let question=null;try{question=window.qbResolveCurrentQuestion?.()||window.pq?.()||null}catch{}
  if(!stem||!question)return null;
  const media=[];
  for(const wrap of document.querySelectorAll('.qsiHost .qsiGrid > .qsiImgWrap')){
    const image=wrap.querySelector('.qsiImg');
    if(image?.src){media.push({src:image.currentSrc||image.src,alt:image.alt||'問題画像',pdf:false});continue}
    const pdf=wrap.querySelector('.qbPdfCard');if(!pdf)continue;
    let src='';try{src=pdf.querySelector('canvas')?.toDataURL('image/png')||''}catch{}
    media.push({src,alt:'問題PDF',pdf:true});
  }
  return {stemHtml:stem.innerHTML,media,question};
}
function previewAnswer(question){
  let answer='解答未登録';const indices=Array.isArray(question?.ans)?question.ans:[],correct=(question?.choices||[]).filter((choice,index)=>choice?.is_correct||indices.includes(index)).map(choice=>`${choice.choice_key||''} ${choice.choice_text||''}`.trim());if(correct.length&&question?.answer_mode!=='fill_blank')answer=correct.join('・');else try{answer=window.QBQuestionExport?.answers?.(question)||answer}catch{}
  const body=document.createElement('div');body.className='qbQuestionPreviewAnswer';const result=document.createElement('section');result.className='qbQuestionPreviewAnswerResult';const label=document.createElement('b');label.textContent='解答';const value=document.createElement('div');value.textContent=answer;result.append(label,value);body.append(result);
  if(question?.explanation_overview){const section=document.createElement('section');const title=document.createElement('b');title.textContent='問題文のポイント';const text=document.createElement('div');text.textContent=question.explanation_overview;section.append(title,text);body.append(section)}
  const choices=(question?.choices||[]).filter(choice=>choice?.explanation);if(choices.length){const section=document.createElement('section');const title=document.createElement('b');title.textContent='選択肢の解説';section.append(title);for(const choice of choices){const row=document.createElement('div');row.className='qbQuestionPreviewChoice';const name=document.createElement('strong');name.textContent=`${choice.choice_key||''}. ${choice.choice_text||''}`;const text=document.createElement('div');text.textContent=choice.explanation;row.append(name,text);section.append(row)}body.append(section)}
  return body;
}
function attachQuestionPreview(root,toolbar,{before=null}={}){
  const data=questionPreviewData();if(!data)return null;
  const button=document.createElement('button');button.type='button';button.className='qbQuestionPreviewButton';button.textContent='問題を確認';button.setAttribute('aria-expanded','false');
  const panel=document.createElement('section');panel.className='qbQuestionPreviewPanel';panel.hidden=true;panel.setAttribute('aria-label','問題のプレビュー');
  const head=document.createElement('div');head.className='qbQuestionPreviewHead';const title=document.createElement('b');title.textContent='問題';const close=document.createElement('button');close.type='button';close.textContent='閉じる';head.append(title,close);
  const token=Math.random().toString(36).slice(2),tabs=document.createElement('div');tabs.className='qbQuestionPreviewTabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','表示内容');const problemTab=document.createElement('button'),answerTab=document.createElement('button');problemTab.type=answerTab.type='button';problemTab.textContent='問題';answerTab.textContent='解答';problemTab.id=`qbQuestionTab-${token}-problem`;answerTab.id=`qbQuestionTab-${token}-answer`;problemTab.setAttribute('role','tab');answerTab.setAttribute('role','tab');tabs.append(problemTab,answerTab);
  const problem=document.createElement('div');problem.id=`qbQuestionPanel-${token}-problem`;problem.className='qbQuestionPreviewProblem';problem.setAttribute('role','tabpanel');problem.setAttribute('aria-labelledby',problemTab.id);problemTab.setAttribute('aria-controls',problem.id);const stem=document.createElement('div');stem.className='qbQuestionPreviewStem';stem.innerHTML=data.stemHtml;problem.append(stem);
  if(data.media.length){const grid=document.createElement('div');grid.className='qbQuestionPreviewMedia';for(const item of data.media){const cell=document.createElement('div');cell.className='qbQuestionPreviewMediaItem';if(item.src){const img=document.createElement('img');img.src=item.src;img.alt=item.alt;cell.append(img)}else cell.textContent='PDF';if(item.pdf)cell.dataset.pdf='true';grid.append(cell)}problem.append(grid)}
  const answer=previewAnswer(data.question);answer.id=`qbQuestionPanel-${token}-answer`;answer.setAttribute('role','tabpanel');answer.setAttribute('aria-labelledby',answerTab.id);answerTab.setAttribute('aria-controls',answer.id);panel.append(head,tabs,problem,answer);const showTab=(name,focus=false)=>{const showAnswer=name==='answer';problem.hidden=showAnswer;answer.hidden=!showAnswer;problemTab.setAttribute('aria-selected',String(!showAnswer));answerTab.setAttribute('aria-selected',String(showAnswer));problemTab.tabIndex=showAnswer?-1:0;answerTab.tabIndex=showAnswer?0:-1;title.textContent=showAnswer?'解答':'問題';if(focus)(showAnswer?answerTab:problemTab).focus()};problemTab.onclick=()=>showTab('problem');answerTab.onclick=()=>showTab('answer');tabs.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();showTab(problem.hidden?'problem':'answer',true)};showTab('problem');
  root.append(panel);if(before?.parentElement===toolbar)toolbar.insertBefore(button,before);else toolbar.append(button);
  const set=open=>{panel.hidden=!open;button.setAttribute('aria-expanded',String(open));button.textContent=open?'問題を閉じる':'問題を確認';if(open)close.focus({preventScroll:true})};
  button.onclick=()=>set(panel.hidden);close.onclick=()=>{set(false);button.focus({preventScroll:true})};
  root.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&e.target!==button)set(false)});
  return {closeIfOpen(){if(panel.hidden)return false;set(false);button.focus({preventScroll:true});return true}};
}
window.QBQuestionPreview={attach:attachQuestionPreview};
function css(){
  if(document.getElementById('qbImageViewerCss'))return;
  const s=document.createElement('style');s.id='qbImageViewerCss';s.textContent=`
.qbMediaImg,.qbNoteImageGrid img,.oeiGrid img{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:none!important;object-fit:contain!important;object-position:center!important;margin:8px auto!important;border-radius:10px;border:1px solid #dce3ec;cursor:zoom-in;background:#fff}
.qbMediaHost,.qbNoteImageGrid,.oeiGrid{overflow:visible!important}
#ans .qbMediaImg{max-height:240px!important;object-position:left center!important;margin:8px 0!important}
#ans .qbMediaHostV2:has(>.qbPublicImageWrap){display:flex!important;flex-wrap:wrap!important;align-items:flex-start!important;gap:12px!important}
#ans .qbMediaHostV2>.qbPublicImageWrap{box-sizing:border-box;flex:0 1 var(--qb-preview-width,380px);max-width:100%;min-width:0;margin:0!important}
#ans .qbMediaHostV2>.qbPublicImageWrap>.qbMediaImg{max-width:100%!important;max-height:400px!important;margin:0!important}
#ans .qbMediaHostV2>.qbPublicImageWrap>.qbImageWriteActions{width:100%}
#ans .qbMediaHostV2>.qbPublicImageWrap:only-child,#ans .qbMediaHostV2>.qbPublicImageWrap[data-qb-wide="true"]{flex-basis:760px}
#ans .qbMediaHostV2>.qbPublicImageWrap>.qbMediaImg{box-sizing:border-box}
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
.qbQuestionPreviewPanel{position:fixed;z-index:10550;top:max(66px,calc(env(safe-area-inset-top) + 56px));right:max(12px,env(safe-area-inset-right));box-sizing:border-box;width:min(440px,calc(100% - 24px));max-height:min(62dvh,560px);overflow:auto;padding:14px;background:var(--card,#fff);color:var(--text,#172033);border:1px solid var(--line,#dce3ec);border-radius:14px;box-shadow:0 14px 48px #0008;text-align:left;touch-action:pan-y;overscroll-behavior:contain}
.qbQuestionPreviewPanel[hidden]{display:none!important}.qbQuestionPreviewHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.qbQuestionPreviewHead>b{font-size:15px}.qbQuestionPreviewHead button,.qbQuestionPreviewButton{min-width:44px;min-height:44px;padding:7px 11px;border:1px solid var(--accent-border,var(--line,#dce3ec));border-radius:10px;background:var(--card,#fff);color:var(--accent,#126fb3);font:inherit;font-weight:800;touch-action:manipulation}
.qbQuestionPreviewTabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:12px;padding:4px;border-radius:11px;background:var(--bg,#f5f7fb)}.qbQuestionPreviewTabs button{min-height:40px;border:0;border-radius:8px;background:transparent;color:var(--muted,#6f7786);font:inherit;font-weight:800}.qbQuestionPreviewTabs button[aria-selected=true]{background:var(--card,#fff);color:var(--accent,#126fb3);box-shadow:0 1px 5px #0002}.qbQuestionPreviewAnswer{font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.qbQuestionPreviewAnswer>section{padding:10px 0;border-top:1px solid var(--line,#dce3ec)}.qbQuestionPreviewAnswer>section:first-child{padding-top:0;border-top:0}.qbQuestionPreviewAnswerResult>div{margin-top:5px;padding:10px;border-radius:9px;background:var(--accent-soft,#eaf4fb);font-weight:800}.qbQuestionPreviewChoice{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line,#dce3ec)}
.qbQuestionPreviewStem{font-size:15px;font-weight:700;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.qbQuestionPreviewMedia{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;margin-top:12px}.qbQuestionPreviewMediaItem{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:72px;max-height:150px;overflow:hidden;background:var(--bg,#f5f7fb);border:1px solid var(--line,#dce3ec);border-radius:8px;color:var(--muted,#6f7786);font-size:13px}.qbQuestionPreviewMediaItem img{display:block!important;position:static!important;max-width:100%!important;max-height:150px!important;width:auto!important;height:auto!important;transform:none!important;box-shadow:none!important;border-radius:0!important;cursor:default!important;object-fit:contain}.qbQuestionPreviewMediaItem[data-pdf=true]::after{content:'PDF';position:absolute;right:5px;bottom:5px;padding:2px 5px;background:#000a;color:#fff;border-radius:4px;font-size:10px}
@media(max-width:360px){.qbImageLightboxZoom{gap:3px}.qbImageLightboxCounter{min-width:42px}.qbImageLightboxFoot{gap:4px}}
`;document.head.appendChild(s);
}
function groupImages(img){
  const group=img.closest(GROUP);
  const nodes=group?[...group.querySelectorAll(MEDIA)].filter(x=>x.closest(GROUP)===group&&!x.closest('.sortable-fallback,.sortable-drag')&&x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden'):[img];
  // Identical URLs can belong to distinct rows. Preserve each row and its order.
  const images=nodes.map(node=>({node,src:node.dataset.pdfSrc||node.dataset.originalSrc||node.currentSrc||node.src,alt:node.alt||'',pdf:node.matches('.qbPdfCard')})).filter(x=>x.src);
  const index=images.findIndex(x=>x.node===img);
  return index<0?{images:[{node:img,src:img.currentSrc||img.src,alt:img.alt||''}],index:0}:{images,index};
}
function open(origin,{savedBlob=null}={}){
  if(active)return;
  const {images,index:startIndex}=groupImages(origin);if(!images[0]?.src)return;
  const savedURL=savedBlob?URL.createObjectURL(savedBlob):null;if(savedURL)images[startIndex].src=savedURL;
  const focusBefore=document.activeElement;
  const mediaEditor=node=>{for(let n=node;n;n=n.parentElement)if(typeof n.qbEditMedia==='function')return n;return null};
  const locks=[document.documentElement,document.body].map(el=>({el,value:el.style.getPropertyValue('overflow'),priority:el.style.getPropertyPriority('overflow')}));
  const underneath=[...document.body.children].filter(el=>!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>({el,inert:el.inert}));
  const d=document.createElement('div');d.id='qbImageLightbox';d.className='qbImageLightbox';d.tabIndex=-1;
  d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','画像を拡大表示');
  d.innerHTML=`<div class="qbImageLightboxHead"><span class="qbImageLightboxTitle">画像</span><button class="qbImageLightboxClose" type="button" aria-label="閉じる">×</button></div><div class="qbImageLightboxStage"><div class="qbImageLightboxStatus" role="status"><span></span><button class="qbImageLightboxRetry" type="button" hidden>再読み込み</button></div></div><div><div class="qbImageLightboxFoot"><div class="qbImageLightboxNav"><button class="qbImageLightboxPrev" type="button" aria-label="前の画像">‹</button><span class="qbImageLightboxCounter" role="status" aria-live="polite" aria-atomic="true"></span><button class="qbImageLightboxNext" type="button" aria-label="次の画像">›</button></div><div class="qbImageLightboxZoom"><button class="qbImageLightboxOut" type="button" aria-label="縮小">−</button><button class="qbImageLightboxReset" type="button" aria-label="画像全体を表示">全体</button><button class="qbImageLightboxIn" type="button" aria-label="拡大">＋</button></div></div><p class="qbImageLightboxHint"></p></div>`;
  const get=s=>d.querySelector(s),stage=get('.qbImageLightboxStage'),status=get('.qbImageLightboxStatus'),retry=get('.qbImageLightboxRetry');
  const prev=get('.qbImageLightboxPrev'),next=get('.qbImageLightboxNext'),counter=get('.qbImageLightboxCounter');
  const zoomIn=get('.qbImageLightboxIn'),zoomOut=get('.qbImageLightboxOut'),reset=get('.qbImageLightboxReset'),closeButton=get('.qbImageLightboxClose');
  let prepared=null,renderCanvas=null,loadToken=0;
  let index=startIndex,img=null,scale=1,x=0,y=0,width=0,height=0,ready=false,closed=false;
  let gesture=null,blocked=false,backdropTap=false,lastTap=null,lastTouchTime=-Infinity,suppressClickUntil=0,wheelTime=0,wheelSum=0,wheelUsed=false;
  const pointers=new Map();
  function close(){
    if(closed)return;closed=true;if(savedURL)URL.revokeObjectURL(savedURL);loadToken++;prepared?.dispose();prepared=null;renderCanvas?.remove();pointers.clear();observer.disconnect();
    document.removeEventListener('keydown',key,true);window.removeEventListener('qb-screen-change',close);window.removeEventListener('qb-retry-current',close);
    if(img){img.onload=null;img.onerror=null}d.remove();active=null;
    underneath.forEach(({el,inert})=>{el.inert=inert});
    locks.forEach(({el,value,priority})=>{if(value)el.style.setProperty('overflow',value,priority);else el.style.removeProperty('overflow')});
    if(focusBefore?.isConnected)focusBefore.focus?.({preventScroll:true});
  }
  function paint(){
    const box=stage.getBoundingClientRect();if(renderCanvas)renderCanvas.style.transform='';
    x=clamp(x,-Math.max(0,(width*scale-box.width)/2),Math.max(0,(width*scale-box.width)/2));
    y=clamp(y,-Math.max(0,(height*scale-box.height)/2),Math.max(0,(height*scale-box.height)/2));
    if(img)img.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px) scale(${scale})`;
    if(prepared&&renderCanvas){const dpr=Math.min(devicePixelRatio||1,2);renderCanvas.width=Math.max(1,Math.ceil(box.width*dpr));renderCanvas.height=Math.max(1,Math.ceil(box.height*dpr));const ctx=renderCanvas.getContext('2d');ctx.scale(dpr,dpr);ctx.translate(box.width/2+x-width*scale/2,box.height/2+y-height*scale/2);ctx.scale(width*scale/prepared.scene.width,height*scale/prepared.scene.height);prepared.draw(ctx)}
    stage.dataset.zoomed=String(scale>1.01);
    zoomOut.disabled=!ready||scale<=1;zoomIn.disabled=!ready||scale>=6;reset.disabled=!ready;
    get('.qbImageLightboxHint').textContent='1本指ドラッグで移動 · 端まで送る横フリックで前後へ · 2本指で移動・拡大縮小';
  }
  function fit(){
    if(!ready||!img)return;
    const box=stage.getBoundingClientRect(),ratio=Math.min(1,box.width/img.naturalWidth,box.height/img.naturalHeight);
    width=img.naturalWidth*ratio;height=img.naturalHeight*ratio;
    img.style.width=width+'px';img.style.height=height+'px';paint();
  }
  function show(){
    const token=++loadToken;prepared?.dispose();prepared=null;renderCanvas?.remove();renderCanvas=null;
    editButton.hidden=!mediaEditor(images[index].node);ready=false;scale=1;x=y=0;lastTap=null;
    prev.hidden=next.hidden=images.length<2;prev.disabled=index===0;next.disabled=index===images.length-1;
    counter.textContent=`${index+1} / ${images.length}`;
    status.hidden=false;status.querySelector('span').textContent='読み込み中…';retry.hidden=true;
    if(img){img.onload=null;img.onerror=null;img.remove()}
    const current=document.createElement('img');img=current;current.alt=images[index].alt;current.draggable=false;current.hidden=true;
    current.onload=async()=>{if(closed||current!==img)return;ready=true;status.hidden=true;fit();current.hidden=false;if(!window.QBEditableMedia)return;try{const response=await fetch(images[index].src);if(!response.ok)throw Error();const record=await QBEditableMedia.read(await response.blob());if(!record||closed||token!==loadToken)return;const result=await QBEditableMedia.prepare(record);if(closed||token!==loadToken){result.dispose();return}prepared=result;renderCanvas=document.createElement('canvas');renderCanvas.className='qbEditableZoom';renderCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';stage.prepend(renderCanvas);current.style.opacity='0';paint()}catch{if(!closed&&token===loadToken)get('.qbImageLightboxHint').textContent='元画像を取得できませんでした。プレビューを表示しています。'}};
    current.onerror=()=>{if(closed||current!==img)return;status.querySelector('span').textContent='画像を読み込めませんでした';retry.hidden=false};
    stage.prepend(current);paint();current.src=images[index].src;
  }
  function go(delta){
    if(pointers.size)return;
    const target=clamp(index+delta,0,images.length-1);if(target===index)return;
    if(images[target].pdf){const item=images[target];close();void window.QBFiles.open(item.src,{mediaOrigin:item.node,initialPage:delta<0?Infinity:1});return}index=target;show();
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
    const start=point(e),box=stage.getBoundingClientRect(),limitX=Math.max(0,(width*scale-box.width)/2);
    gesture={kind:'drag',start,x,y,time:performance.now(),axis:null,moved:false,panned:false,edgePrev:x>=limitX-2,edgeNext:x<=-limitX+2};
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

    if(!gesture.axis&&gesture.moved)gesture.axis=Math.abs(dx)>Math.abs(dy)*1.35?'x':'y';
    if(scale>1.01){const beforeX=x,beforeY=y;x=gesture.x+dx;y=gesture.y+dy;paint();if(Math.hypot(x-beforeX,y-beforeY)>1)gesture.panned=true;return}
    if(gesture.axis==='x'&&images.length>1&&!(window.visualViewport?.scale>1.01)){
      const edge=dx>0?index===0:index===images.length-1;
      if(renderCanvas)renderCanvas.style.transform=`translateX(${dx*(edge?.18:.8)}px)`;else img.style.transform=`translate(-50%,-50%) translateX(${dx*(edge ? .18 : .8)}px)`;
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
    const elapsed=Math.max(1,performance.now()-g.time),outward=dx<0?g.edgeNext:g.edgePrev;
    if(g.kind==='drag'&&g.axis==='x'&&!g.panned&&outward&&Math.abs(dx)>=Math.max(52,Math.min(110,stage.clientWidth*.12))&&Math.abs(dx)>Math.abs(dy)*1.55&&Math.abs(dx)/elapsed>.22&&elapsed<750&&!(window.visualViewport?.scale>1.01)){
      go(dx<0?1:-1);lastTap=null;return;
    }
    lastTap=null;
  }
  stage.addEventListener('pointerup',e=>endPointer(e));stage.addEventListener('pointercancel',e=>endPointer(e,true));
  stage.addEventListener('lostpointercapture',e=>endPointer(e,true));
  stage.addEventListener('dblclick',e=>e.preventDefault());
  stage.addEventListener('contextmenu',e=>e.preventDefault());
  stage.addEventListener('wheel',e=>{
    e.preventDefault();if(pointers.size)return;
    if(nativeScale!==null||performance.now()-nativeEnd<120)return;
    if(e.ctrlKey||e.metaKey){zoom(scale*Math.exp(-e.deltaY*.01),point(e));return}
    const unit=e.deltaMode===1?16:e.deltaMode===2?stage.clientWidth:1;
    const dx=(e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX)*unit,dy=e.deltaY*unit;
    if(scale>1.01||window.visualViewport?.scale>1.01){x-=dx;y-=e.shiftKey?0:dy;paint();return}
    const now=performance.now();if(now-wheelTime>220){wheelSum=0;wheelUsed=false}wheelTime=now;
    if(wheelUsed||(!e.shiftKey&&Math.abs(dx)<=Math.abs(dy)*1.25))return;
    if(Math.sign(wheelSum)!==Math.sign(dx))wheelSum=0;wheelSum+=dx;
    if(Math.abs(wheelSum)>=50){go(wheelSum>0?1:-1);wheelUsed=true}
  },{passive:false});
  let nativeScale=null,nativeEnd=-Infinity;
  for(const type of ['gesturestart','gesturechange','gestureend'])stage.addEventListener(type,e=>{
    e.preventDefault();e.stopPropagation();
    if(type==='gesturestart')nativeScale=1;
    else if(type==='gestureend'){nativeScale=null;nativeEnd=performance.now()}
    else if(!pointers.size&&Number(e.scale)>0){zoom(scale*e.scale/(nativeScale||1),point(e));nativeScale=e.scale}
  },{passive:false});
  function key(e){
    if(closed||e.isComposing)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(questionPreview?.closeIfOpen())return;close();return}
    if(e.key==='Tab'){
      const buttons=[...d.querySelectorAll('button')].filter(b=>!b.disabled&&!b.hidden&&b.getClientRects().length);
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
  const editButton=document.createElement('button');editButton.type='button';editButton.textContent='画像編集';editButton.className='qbImageLightboxEdit';closeButton.before(editButton);
  const shareButton=document.createElement('button');shareButton.type='button';shareButton.textContent='共有';shareButton.className='qbImageLightboxShare';closeButton.before(shareButton);
  const questionPreview=attachQuestionPreview(d,get('.qbImageLightboxHead'),{before:editButton});
  editButton.onclick=async()=>{const node=images[index].node,host=mediaEditor(node);if(!host)return;const run=host.qbEditMedia,row=host.dataset.row||host.dataset.id,cls=host.classList.contains('qbLibraryDetailImage')?'qbLibraryDetailImage':null;close();try{const saved=await run();if(saved instanceof Blob)await new Promise(r=>setTimeout(r,100));let target=node.isConnected?node:null;if(row){const wrapper=[...document.querySelectorAll('[data-row],[data-id]')].find(w=>(w.dataset.row||w.dataset.id)===row&&w.querySelector(TARGET));target=wrapper?.querySelector(TARGET)||target}if(cls)target=document.querySelector('.'+cls);if(target?.isConnected)open(target,{savedBlob:saved instanceof Blob?saved:null})}catch(e){alert('画像編集を開けませんでした：'+e.message)}};
  shareButton.onclick=()=>window.QBMediaShare?.open({source:images[index].src,kind:'image',name:images[index].alt||'画像'});
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
function previewSize(img){
  if(!img?.matches?.('#ans .qbMediaHostV2>.qbPublicImageWrap>.qbMediaImg')||!img.naturalWidth||!img.naturalHeight)return;
  const ratio=img.naturalWidth/img.naturalHeight;img.parentElement.dataset.qbWide=String(ratio>=2);img.parentElement.style.setProperty('--qb-preview-width',Math.min(380,Math.max(220,Math.min(img.naturalWidth,400*ratio)))+'px');
}
// Transformation services may reject a valid, large original. Retry that same
// edited original once; never fall back to the pre-edit image.
function recoverPreview(img){
  if(!img?.matches?.(TARGET)||!img.dataset.originalSrc)return;
  const original=img.dataset.originalSrc;
  if(img.getAttribute('src')===original)return;
  img.removeAttribute('srcset');img.src=original;
}
function boot(){
  css();document.addEventListener('error',e=>recoverPreview(e.target),true);document.querySelectorAll(TARGET).forEach(img=>{if(img.complete&&!img.naturalWidth)recoverPreview(img)});document.addEventListener('load',e=>previewSize(e.target),true);
  document.querySelectorAll('.qbMediaImg').forEach(previewSize);
  new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n instanceof Element){previewSize(n);n.querySelectorAll('.qbMediaImg').forEach(previewSize)}}).observe(document.body,{childList:true,subtree:true});document.addEventListener('click',e=>{
    const img=e.target?.closest?.('img');if(!img?.matches(TARGET)||active)return;
    e.preventDefault();e.stopPropagation();open(img);
  },true);
}
window.QBMediaGallery={items:groupImages,open};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
