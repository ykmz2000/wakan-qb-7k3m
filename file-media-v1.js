/* Images and PDFs share attachment order; PDF pages remain inside one document. */
(()=>{
'use strict';
const MAX=100*1024*1024;
const isPDF=value=>typeof value==='string'?/\.pdf(?:[?#]|$)/i.test(value):/^application\/(?:x-)?pdf$/i.test(value?.type||'')||/\.pdf$/i.test(value?.name||'');
const supported=file=>isPDF(file)||/^image\//.test(file?.type||'');
function filesFromPaste(e){const files=[...(e.clipboardData?.files||[])].filter(supported);return files.length?files:[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(supported)}
async function clipboardFiles(){const files=[];if(!navigator.clipboard?.read)return files;for(const item of await navigator.clipboard.read()){const type=item.types.find(t=>/^application\/(?:x-)?pdf$/i.test(t))||item.types.find(t=>t.startsWith('image/'));if(type)files.push(new File([await item.getType(type)],'貼り付け.'+(/pdf$/i.test(type)?'pdf':type.split('/')[1]),{type}))}return files}
async function validate(file){if(!file?.size||file.size>MAX)throw Error('ファイルは100MiB以下にしてください。');if(!supported(file))throw Error('画像またはPDFを選択してください。');if(isPDF(file)){const header=new TextDecoder().decode(await file.slice(0,1024).arrayBuffer());if(!header.includes('%PDF-'))throw Error('PDFの内容を確認できません。');return new File([file],file.name||'資料.pdf',{type:'application/pdf'})}return file}
let enginePromise;
async function engine(){if(!enginePromise)enginePromise=import('./vendor/pdfjs/pdf.mjs').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',document.baseURI).href;return pdf}).catch(e=>{enginePromise=null;throw e});return enginePromise}
async function documentTask(source){const pdf=await engine(),base=new URL('./vendor/pdfjs/',document.baseURI).href;const options={isEvalSupported:false,disableAutoFetch:true,disableStream:true,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/'};if(source instanceof Blob){if(source.size>MAX)throw Error('PDFは100MiB以下にしてください。');options.data=new Uint8Array(await source.arrayBuffer())}else options.url=source;return pdf.getDocument(options)}
async function previewPage(source){let task,canvas;try{task=await documentTask(source);const doc=await task.promise,page=await doc.getPage(1),raw=page.getViewport({scale:1}),vp=page.getViewport({scale:Math.min(2,Math.sqrt(8000000/(raw.width*raw.height)),8192/Math.max(raw.width,raw.height))});canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PDFのプレビューを生成できません。');return {blob,pages:doc.numPages}}finally{if(canvas)canvas.width=canvas.height=1;await task?.destroy().catch(()=>{})}}
function element(tag,cls,text){const n=document.createElement(tag);n.className=cls||'';if(text!=null)n.textContent=text;return n}
function button(label,fn){const n=element('button','',label);n.type='button';n.onclick=fn;return n}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function markup(url,label='PDF'){return `<div class="qbPdfCard" data-pdf-src="${esc(url)}" aria-label="${esc(label)}を開く"><span class="qbPdfPoster"></span><span class="qbPdfCaption">PDF · 読み込み待ち</span></div>`}
// Replace only the media element. Attachment wrappers and row IDs stay intact.
function present(img,url,interactive=true){const target=img.qbPdfReplacement?.isConnected?img.qbPdfReplacement:img;if(!isPDF(url)){if(target!==img)target.replaceWith(img);delete img.qbPdfReplacement;img.src=url;return img}const card=element('span','qbPdfCard');img.qbPdfReplacement=card;card.dataset.pdfSrc=url;card.dataset.pdfPassive=String(!interactive);card.innerHTML='<span class="qbPdfPoster"></span><span class="qbPdfCaption">PDF · 読み込み待ち</span>';card.qbEditMedia=img.qbEditMedia;target.replaceWith(card);scan(card);return card}
let thumbnailQueue=[],thumbnailBusy=false;
const visible=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){visible.unobserve(e.target);thumbnailQueue.push(e.target)}void drain()},{rootMargin:'120px'});
// Only visible page surfaces hold a high-density bitmap; page order is always present.
const inlineStates=new Map();
const inlineObserver=new IntersectionObserver(entries=>{for(const e of entries){const st=inlineStates.get(e.target);if(!st)continue;st.visible=e.isIntersecting;if(st.visible){thumbnailQueue.push(e.target);void drain()}else{st.token++;const c=e.target.querySelector('canvas');if(c){c.width=c.height=1;c.remove()}}}},{rootMargin:'300px'});
const inlineResize=new ResizeObserver(entries=>{for(const e of entries){const st=inlineStates.get(e.target);if(st?.visible&&Math.abs(st.width-e.contentRect.width)>2){thumbnailQueue.push(e.target);void drain()}}});
async function drain(){
 if(thumbnailBusy)return;thumbnailBusy=true;
 try{while(thumbnailQueue.length){const node=thumbnailQueue.shift();if(!node.isConnected)continue;let task;
 try{
  const st=inlineStates.get(node);if(st&&!st.visible)continue;
  const card=st?st.card:node;task=await documentTask(card.dataset.pdfSrc);const doc=await task.promise;if(!node.isConnected)continue;
  card.dataset.pdfPages=doc.numPages;
  if(!st&&card.dataset.pdfPassive!=='true'&&!card.closest('.qbLibraryImageButton,.qbripItem')){
   card.classList.add('qbPdfInline');card.setAttribute('role','group');card.removeAttribute('tabindex');const poster=card.querySelector('.qbPdfPoster');poster.replaceChildren();
   for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),vp=page.getViewport({scale:1}),slot=element('span','qbPdfInlinePage');slot.dataset.inlinePage=n;slot.setAttribute('role','button');slot.tabIndex=0;slot.setAttribute('aria-label',`${n}ページを拡大表示`);slot.style.aspectRatio=vp.width+'/'+vp.height;poster.append(slot);inlineStates.set(slot,{card,visible:false,width:0,token:0});inlineObserver.observe(slot);inlineResize.observe(slot)}
   card.querySelector('.qbPdfCaption').textContent=`PDF · ${doc.numPages}ページ · タップして拡大`;continue;
  }
  const token=st?++st.token:0,page=await doc.getPage(st?Number(node.dataset.inlinePage):1),raw=page.getViewport({scale:1}),canvas=element('canvas');
  const cssScale=st?Math.max(1,node.clientWidth)/raw.width:Math.min(360/raw.width,480/raw.height),density=Math.min(devicePixelRatio||1,3),scale=Math.min(cssScale*density,Math.sqrt(8000000/(raw.width*raw.height)),8192/Math.max(raw.width,raw.height));
  const viewport=page.getViewport({scale});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width=raw.width*cssScale+'px';canvas.style.height=raw.height*cssScale+'px';await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  if(node.isConnected&&(!st||(st.visible&&st.token===token))){if(st){st.width=node.clientWidth;node.replaceChildren(canvas)}else{card.querySelector('.qbPdfPoster').replaceChildren(canvas);card.querySelector('.qbPdfCaption').textContent=`PDF · ${doc.numPages}ページ`}}else canvas.width=canvas.height=1;
 }catch{if(node.isConnected){const caption=node.querySelector('.qbPdfCaption');if(caption)caption.textContent='PDF · タップして開く';else node.textContent='タップしてページを開く'}}finally{await task?.destroy().catch(()=>{})}
 }}finally{thumbnailBusy=false}
}
function scan(root=document){const cards=[...(root.matches?.('[data-pdf-src]')?[root]:[]),...root.querySelectorAll('[data-pdf-src]')];for(const card of cards){if(card.dataset.pdfBound)continue;card.dataset.pdfBound='1';if(card.dataset.pdfPassive!=='true'){card.setAttribute('role','button');card.tabIndex=0;card.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void open(card.dataset.pdfSrc,{mediaOrigin:card,initialPage:Number(e.target.closest('[data-inline-page]')?.dataset.inlinePage)||1})});card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();e.target.click()}})}visible.observe(card)}}
let active=null;
async function open(source,{pickPage=false,mediaOrigin=null,initialPage=1}={}){
 if(active)return null;
 const modal=element('div','qbPdfModal'),panel=element('section','qbPdfPanel'),head=element('header','qbPdfHead'),stage=element('div','qbPdfStage qbPdfViewingStage'),nav=element('div','qbPdfNav'),status=element('span','qbPdfStatus','PDFを読み込み中…');
 modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',pickPage?'画像にするPDFページを選択':'PDFを表示');panel.tabIndex=-1;status.setAttribute('role','status');head.append(element('b','',pickPage?'PDFのページを画像として追加':'PDF'),status);panel.append(head,stage,nav);modal.append(panel);
 const origin=document.activeElement,background=[...document.body.children].filter(n=>!['SCRIPT','STYLE','LINK'].includes(n.tagName)).map(n=>[n,n.inert]),overflow=document.documentElement.style.overflow;
 background.forEach(([n])=>n.inert=true);document.documentElement.style.overflow='hidden';document.body.append(modal);active=modal;
 let gestureTimer;const pointers=new Map();let gesture=null;
 let task,doc,renderTask,closed=false,busy=false,pageNumber=1,zoom=1,sequence=0,currentCanvas=null,resolveResult,resizeObserver,resizeTimer;
 const result=new Promise(resolve=>resolveResult=resolve);
 async function close(value=null){if(closed||busy)return;closed=true;clearTimeout(gestureTimer);pointers.clear();clearTimeout(resizeTimer);resizeObserver?.disconnect();sequence++;renderTask?.cancel();await task?.destroy().catch(()=>{});modal.remove();background.forEach(([n,v])=>{if(n.isConnected)n.inert=v});document.documentElement.style.overflow=overflow;active=null;if(origin?.isConnected)origin.focus({preventScroll:true});resolveResult(value)}
 head.append(button('閉じる',()=>close()));
 if(!pickPage){let host=mediaOrigin;while(host&&typeof host.qbEditMedia!=='function')host=host.parentElement;if(host){const run=host.qbEditMedia,row=host.dataset.row||host.dataset.id;head.append(button('PDF編集',async()=>{const n=pageNumber;await close();try{const saved=await run();if(saved instanceof Blob){await new Promise(r=>setTimeout(r,100));const next=row?[...document.querySelectorAll('[data-row],[data-id]')].find(w=>(w.dataset.row||w.dataset.id)===row):document.querySelector('.qbLibraryDetailImage')?.qbPdfReplacement;await open(saved,{mediaOrigin:next||host,initialPage:n})}}catch(e){alert('PDF編集を開けませんでした：'+e.message)}}))}}

 async function show(number=pageNumber,preserve=false){if(!doc||closed)return;pageNumber=Math.max(1,Math.min(doc.numPages,number));const seq=++sequence;renderTask?.cancel();const old=renderTask;try{await old?.promise}catch{}if(closed||seq!==sequence)return;status.textContent='読み込み中…';try{const page=await doc.getPage(pageNumber);if(closed||seq!==sequence)return;const raw=page.getViewport({scale:1}),cssScale=Math.min(Math.max(1,stage.clientWidth-48)/raw.width,Math.max(1,stage.clientHeight-48)/raw.height)*zoom;const pixelScale=Math.min(cssScale*Math.min(devicePixelRatio||1,2),Math.sqrt(8000000/(raw.width*raw.height)),8192/Math.max(raw.width,raw.height));const viewport=page.getViewport({scale:pixelScale}),canvas=element('canvas','qbPdfPage');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width=raw.width*cssScale+'px';canvas.style.height=raw.height*cssScale+'px';const job=page.render({canvasContext:canvas.getContext('2d'),viewport});renderTask=job;await job.promise;if(closed||seq!==sequence){canvas.width=canvas.height=1;return}const scroll={left:stage.scrollLeft,top:stage.scrollTop};if(currentCanvas)currentCanvas.width=currentCanvas.height=1;currentCanvas=canvas;const frame=element('div','qbPdfPageFrame');frame.append(canvas);stage.replaceChildren(frame);status.textContent=`${pageNumber} / ${doc.numPages}ページ`;const gallery=mediaOrigin&&window.QBMediaGallery?.items(mediaOrigin);previous.disabled=pageNumber===1&&(pickPage||!gallery||gallery.index===0);next.disabled=pageNumber===doc.numPages&&(pickPage||!gallery||gallery.index===gallery.images.length-1);nav.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.page)===pageNumber)));if(preserve){stage.scrollLeft=scroll.left;stage.scrollTop=scroll.top}else stage.scrollTop=stage.scrollLeft=0;void pageThumbs(seq)}catch(e){if(!closed&&seq===sequence&&e.name!=='RenderingCancelledException')status.textContent='ページを表示できませんでした。別のページを選ぶか再試行してください。'}}
 async function pageThumbs(seq){
   const buttons=[...nav.querySelectorAll('[data-page]')];
   for(const b of buttons){const n=Number(b.dataset.page);if(Math.abs(n-pageNumber)>2){const c=b.querySelector('canvas');if(c){c.width=c.height=1;c.remove()}continue}if(b.querySelector('canvas'))continue;
    try{const page=await doc.getPage(n);if(closed||seq!==sequence)return;const raw=page.getViewport({scale:1}),scale=Math.min(80/raw.width,110/raw.height),vp=page.getViewport({scale:scale*Math.min(window.devicePixelRatio||1,3)}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);c.style.width=raw.width*scale+'px';c.style.height=raw.height*scale+'px';await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;if(closed||seq!==sequence){c.width=c.height=1;return}b.prepend(c)}catch{if(closed)return}
   }
 }
 // Handle gestures only inside the page surface; toolbar and page strip keep native input.
 stage.style.touchAction='none';
 function startGesture(){
  const pts=[...pointers.values()],rect=currentCanvas?.getBoundingClientRect();if(!rect||!pts.length){gesture=null;return}
  const center=pts.length>1?{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}:pts[0];
  gesture={center,zoom,width:rect.width,height:rect.height,u:(center.x-rect.left)/rect.width,v:(center.y-rect.top)/rect.height,distance:pts.length>1?Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y):0,left:stage.scrollLeft,top:stage.scrollTop};
 }
 stage.addEventListener('pointerdown',e=>{if(!currentCanvas||e.button>0)return;e.preventDefault();e.stopPropagation();clearTimeout(gestureTimer);sequence++;renderTask?.cancel();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});try{stage.setPointerCapture(e.pointerId)}catch{}startGesture()});
 stage.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)||!gesture)return;e.preventDefault();e.stopPropagation();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const pts=[...pointers.values()];
  if(pts.length>1&&gesture.distance){
   const center={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};zoom=Math.max(.5,Math.min(4,gesture.zoom*Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)/gesture.distance));
   currentCanvas.style.width=gesture.width*zoom/gesture.zoom+'px';currentCanvas.style.height=gesture.height*zoom/gesture.zoom+'px';const r=currentCanvas.getBoundingClientRect();stage.scrollLeft+=r.left+gesture.u*r.width-center.x;stage.scrollTop+=r.top+gesture.v*r.height-center.y;
  }else{stage.scrollLeft=gesture.left+gesture.center.x-e.clientX;stage.scrollTop=gesture.top+gesture.center.y-e.clientY}
 });
 function endGesture(e){if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);startGesture();if(!pointers.size){clearTimeout(gestureTimer);gestureTimer=setTimeout(()=>{if(!closed)void show(pageNumber,true)},100)}}
 for(const type of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,endGesture);
 async function go(delta){if(!doc||busy)return;const n=pageNumber+delta;if(n>=1&&n<=doc.numPages){zoom=1;await show(n);return}const group=mediaOrigin&&window.QBMediaGallery?.items(mediaOrigin),item=group?.images[group.index+delta];if(!pickPage&&item){await close();if(item.pdf)void open(item.src,{mediaOrigin:item.node,initialPage:delta<0?Infinity:1});else window.QBMediaGallery.open(item.node)}}
 let nativeScale=null,nativeEnded=-Infinity;
 function zoomAt(factor,e){if(!currentCanvas||pointers.size)return;clearTimeout(gestureTimer);sequence++;renderTask?.cancel();const r=currentCanvas.getBoundingClientRect(),x=Number.isFinite(e.clientX)?e.clientX:r.left+r.width/2,y=Number.isFinite(e.clientY)?e.clientY:r.top+r.height/2,u=(x-r.left)/r.width,v=(y-r.top)/r.height,old=zoom;zoom=Math.max(.5,Math.min(4,zoom*factor));currentCanvas.style.width=r.width*zoom/old+'px';currentCanvas.style.height=r.height*zoom/old+'px';const after=currentCanvas.getBoundingClientRect();stage.scrollLeft+=after.left+u*after.width-x;stage.scrollTop+=after.top+v*after.height-y;gestureTimer=setTimeout(()=>{if(!closed)void show(pageNumber,true)},150)}
 stage.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();e.stopPropagation();if(nativeScale!==null||performance.now()-nativeEnded<120)return;const unit=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;zoomAt(Math.exp(-e.deltaY*unit*.004),e)},{passive:false});
 for(const type of ['gesturestart','gesturechange','gestureend'])stage.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();if(type==='gesturestart')nativeScale=1;else if(type==='gestureend'){nativeScale=null;nativeEnded=performance.now()}else if(Number(e.scale)>0){zoomAt(e.scale/(nativeScale||1),e);nativeScale=e.scale}},{passive:false});
 const previous=button('前のページ',()=>go(-1)),next=button('次のページ',()=>go(1));head.append(previous,next,button('全体を表示',()=>{zoom=1;void show()}),button('−',()=>{zoom=Math.max(.5,zoom/1.25);void show()}),button('＋',()=>{zoom=Math.min(4,zoom*1.25);void show()}));
 if(pickPage)head.append(button('このページを画像として追加',async()=>{if(!doc||busy)return;busy=true;status.textContent='画像を作成中…';let canvas;try{const page=await doc.getPage(pageNumber),raw=page.getViewport({scale:1}),scale=Math.min(2,Math.sqrt(8000000/(raw.width*raw.height)),8192/Math.max(raw.width,raw.height)),vp=page.getViewport({scale});canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('画像を作成できませんでした。');busy=false;await close(blob)}catch(e){status.textContent=e.message;busy=false}finally{if(canvas)canvas.width=canvas.height=1}}));
 modal.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();void close()}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();void go(e.key==='ArrowRight'?1:-1)}if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button,a')].filter(n=>!n.disabled&&!n.hidden),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});modal.addEventListener('click',e=>e.stopPropagation());panel.focus();
 const retry=button('再試行',()=>loadDocument());retry.hidden=true;head.append(retry);
 async function loadDocument(){
   retry.hidden=true;status.textContent='PDFを読み込み中…';doc=null;
   await task?.destroy().catch(()=>{});if(closed)return;
   try{task=await documentTask(source);if(closed){await task.destroy();return}doc=await task.promise;if(closed)return;nav.replaceChildren();const strip=element('div','qbPdfPageStrip');nav.append(strip);for(let n=1;n<=doc.numPages;n++){const b=button(String(n),()=>show(n));b.dataset.page=n;b.setAttribute('aria-label',`${n}ページを表示`);strip.append(b)}await show(initialPage)}catch(e){if(!closed){doc=null;status.textContent='PDFを開けませんでした。暗号化・破損・通信状況を確認してください。';retry.hidden=false}}
 }
 resizeObserver=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(doc&&!closed)void show()},100)});resizeObserver.observe(stage);
 await loadDocument();
 return result;
}
function boot(){scan();new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)scan(n);for(const [node,st] of inlineStates)if(!node.isConnected){st.token++;inlineObserver.unobserve(node);inlineResize.unobserve(node);inlineStates.delete(node)}}).observe(document.body,{childList:true,subtree:true})}
window.QBFiles={documentTask,isPDF,supported,validate,filesFromPaste,clipboardFiles,markup,present,open,previewPage};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
