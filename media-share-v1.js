/* Export an image or PDF as either PNG or PDF, without changing the source. */
(()=>{
'use strict';
const IMAGE_TARGET='.qbMediaImg,.qbNoteImageGrid img,.oeiGrid img,.qsiImg,.qbLibraryZoomImage,.qbLibraryDetailImage';
const MEDIA_TARGET=IMAGE_TARGET+',.qbPdfCard,.qbPdfInlinePage';
const HOST_TARGET='.qbPublicImageWrap,.qbNoteImageWrap,.qsiImgWrap,.oeiItem,.qbLibraryItem,.qbLibraryDetailMedia';
let active=null,press=null,suppressUntil=0;
const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls||'';if(text!=null)node.textContent=text;return node};
const safeName=(value,fallback)=>String(value||fallback).replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'-').replace(/^\.+|\.+$/g,'').trim()||fallback;
const baseName=value=>safeName(String(value||'').split('/').pop()?.split(/[?#]/)[0]?.replace(/\.(?:pdf|png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i,''),'書き出し');
function inferredName(source,name){if(name)return baseName(name);if(typeof source==='string'){try{return baseName(decodeURIComponent(new URL(source,document.baseURI).pathname))}catch{return baseName(source)}}return baseName(source?.name)}
async function sourceBlob(source,type=''){if(source instanceof Blob)return type&&source.type!==type?new Blob([source],{type}):source;const response=await fetch(source);if(!response.ok)throw Error('元ファイルを取得できませんでした。');const blob=await response.blob();return type&&blob.type!==type?new Blob([blob],{type}):blob}
const canvasBlob=(canvas,type='image/png',quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
async function imagePNG(source){
 const blob=await sourceBlob(source);if(blob.type==='image/png')return blob;
 const url=URL.createObjectURL(blob),img=new Image();
 try{img.src=url;await img.decode();const pixels=img.naturalWidth*img.naturalHeight;if(!pixels)throw Error('画像を読み込めませんでした。');const scale=Math.min(1,8192/Math.max(img.naturalWidth,img.naturalHeight),Math.sqrt(32000000/pixels)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const output=await canvasBlob(canvas);canvas.width=canvas.height=1;if(!output)throw Error('画像を作成できませんでした。');return output}finally{URL.revokeObjectURL(url)}
}
async function pdfPagePNG(source,pageNumber=1){
 if(!window.QBFiles?.documentTask)throw Error('PDF機能を読み込めませんでした。');let task,canvas;
 try{task=await QBFiles.documentTask(source);const pdf=await task.promise,n=Math.max(1,Math.min(pdf.numPages,Number(pageNumber)||1)),page=await pdf.getPage(n),raw=page.getViewport({scale:1}),scale=Math.min(2,8192/Math.max(raw.width,raw.height),Math.sqrt(16000000/(raw.width*raw.height))),vp=page.getViewport({scale});canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const blob=await canvasBlob(canvas);if(!blob)throw Error('PDFページを画像にできませんでした。');return blob}finally{if(canvas)canvas.width=canvas.height=1;await task?.destroy().catch(()=>{})}
}
async function imagePDF(source){
 const png=await imagePNG(source),L=await import('./vendor/pdfjs/pdf-lib.mjs'),pdf=await L.PDFDocument.create(),image=await pdf.embedPng(await png.arrayBuffer()),scale=Math.min(1,1440/Math.max(image.width,image.height)),width=Math.max(1,image.width*scale),height=Math.max(1,image.height*scale),page=pdf.addPage([width,height]);page.drawImage(image,{x:0,y:0,width,height});return new Blob([await pdf.save()],{type:'application/pdf'})
}
async function output(options,format){
 const pdf=options.kind==='pdf';
 if(format==='image')return {blob:pdf?await pdfPagePNG(options.source,options.page):await imagePNG(options.source),extension:'png'};
 return {blob:pdf?await sourceBlob(options.source,'application/pdf'):await imagePDF(options.source),extension:'pdf'};
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
async function copy(blob){
 if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw Error('この端末ではファイルのコピーに対応していません。保存または共有を使ってください。');
 try{await navigator.clipboard.write([new ClipboardItem({[blob.type]:blob})])}catch{throw Error(blob.type==='application/pdf'?'この端末ではPDFのコピーに対応していません。保存または共有を使ってください。':'コピーできませんでした。ブラウザの権限を確認してください。')}
}
async function nativeShare(blob,name){const file=new File([blob],name,{type:blob.type});if(!navigator.share||navigator.canShare&&!navigator.canShare({files:[file]}))throw Error('この端末ではファイル共有に対応していません。保存を使ってください。');await navigator.share({files:[file],title:name})}
function close(){if(!active)return;const {dialog,origin,key}=active;active=null;document.removeEventListener('keydown',key,true);dialog.remove();if(origin?.isConnected)origin.focus?.({preventScroll:true})}
function actionButton(label,format,action){const button=el('button','qbMediaShareAction',label);button.type='button';button.dataset.format=format;button.dataset.action=action;button.setAttribute('aria-label',`${format==='image'?'画像':'PDF'}として${label}`);return button}
function open(options={}){
 if(!options.source)return;close();const origin=document.activeElement,dialog=el('div','qbMediaShareDialog'),sheet=el('section','qbMediaShareSheet');dialog.setAttribute('role','presentation');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','qbMediaShareTitle');
 const head=el('header','qbMediaShareHead'),title=el('b','','書き出し・共有'),dismiss=el('button','qbMediaShareClose','×');title.id='qbMediaShareTitle';dismiss.type='button';dismiss.setAttribute('aria-label','閉じる');head.append(title,dismiss);sheet.append(head,el('p','qbMediaShareHint',options.kind==='pdf'?`PDF全体、または表示中の${Number(options.page)||1}ページを画像として書き出せます。`:'画像のまま、または1ページのPDFとして書き出せます。'));
 for(const [format,label] of [['image','画像として'],['pdf','PDFとして']]){const group=el('section','qbMediaShareGroup'),name=el('b','qbMediaShareFormat',label),actions=el('div','qbMediaShareActions');actions.append(actionButton('コピー',format,'copy'),actionButton('保存',format,'save'),actionButton('共有',format,'share'));group.append(name,actions);sheet.append(group)}
 const status=el('p','qbMediaShareStatus','');status.setAttribute('role','status');status.setAttribute('aria-live','polite');sheet.append(status);dialog.append(sheet);
 const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close()}if(e.key==='Tab'){const buttons=[...sheet.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus()}};active={dialog,origin,key};document.addEventListener('keydown',key,true);document.body.append(dialog);
 dismiss.onclick=close;dialog.addEventListener('click',e=>{if(e.target===dialog)close()});sheet.addEventListener('click',async e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled)return;e.preventDefault();const format=button.dataset.format,action=button.dataset.action,all=[...sheet.querySelectorAll('button')],label=button.textContent;all.forEach(b=>b.disabled=true);button.textContent='準備中…';status.textContent='';try{const result=await output(options,format),name=safeName(inferredName(options.source,options.name)+'.'+result.extension,'書き出し.'+result.extension);if(action==='copy'){await copy(result.blob);status.textContent=`${format==='pdf'?'PDF':'画像'}をコピーしました。`}else if(action==='save'){download(result.blob,name);status.textContent=`${name} を保存しました。`}else{await nativeShare(result.blob,name);status.textContent='共有先を開きました。'}}catch(error){if(error?.name!=='AbortError')status.textContent=error?.message||'書き出しできませんでした。'}finally{button.textContent=label;all.forEach(b=>b.disabled=false)}});dismiss.focus({preventScroll:true});
}
function mediaOptions(node){
 const inline=node.closest?.('.qbPdfInlinePage');if(inline){const card=inline.closest('.qbPdfCard');return {source:card?.dataset.pdfSrc,kind:'pdf',page:Number(inline.dataset.inlinePage)||1,name:card?.getAttribute('aria-label')}}
 const card=node.closest?.('.qbPdfCard');if(card)return {source:card.dataset.pdfSrc,kind:'pdf',page:1,name:card.getAttribute('aria-label')};
 const image=node.matches?.('img')?node:node.querySelector?.(IMAGE_TARGET);return image?{source:image.dataset.originalSrc||image.currentSrc||image.src,kind:'image',name:image.alt}:null;
}
function hostFor(node){if(node.matches('.qbPdfInlinePage'))return node;let host=node.closest(HOST_TARGET);if(!host)host=node.matches('.qbPdfCard')?node:node.parentElement;if(host?.tagName==='BUTTON')host=host.parentElement;return host}
function position(button,host,media){if(!button.isConnected||!media.isConnected)return;const hr=host.getBoundingClientRect(),mr=media.getBoundingClientRect();if(!hr.width||!mr.width)return;button.style.left=Math.max(6,mr.right-hr.left-64)+'px';button.style.top=Math.max(6,mr.bottom-hr.top-50)+'px'}
function decorate(node){
 if(!(node instanceof Element)||node.closest('.qbImageLightbox,.qbPdfModal,.qbMediaShareDialog,.qbQuestionPreviewPanel'))return;
 if(node.matches('.qbPdfCard.qbPdfInline')){node.querySelector(':scope > .qbMediaShareButton')?.remove();node.querySelectorAll('.qbPdfInlinePage').forEach(decorate);return}
 if(node.matches('.qbPdfCard')&&node.querySelector('.qbPdfInlinePage'))return;
 if(node.matches('.qbPdfInlinePage'))node.closest('.qbPdfCard')?.querySelector(':scope > .qbMediaShareButton')?.remove();const host=hostFor(node);if(!host||host.querySelector(':scope > .qbMediaShareButton'))return;const options=mediaOptions(node);if(!options?.source)return;
 const button=el('button','qbMediaShareButton','共有');button.type='button';button.setAttribute('aria-label','書き出し・共有');button.title='書き出し・共有';host.classList.add('qbMediaShareHost');host.append(button);const update=()=>position(button,host,node);requestAnimationFrame(update);if(node.matches('img')&&!node.complete)node.addEventListener('load',update,{once:true});if(window.ResizeObserver)new ResizeObserver(update).observe(node);else window.addEventListener('resize',update,{passive:true});
 button.addEventListener('pointerdown',e=>e.stopPropagation());button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open(mediaOptions(node))});
}
function scan(root=document){const nodes=[...(root.matches?.(MEDIA_TARGET)?[root]:[]),...root.querySelectorAll(MEDIA_TARGET)];for(const node of nodes)decorate(node)}
function cancelPress(){if(!press)return;clearTimeout(press.timer);press=null}
function boot(){
 scan();new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)scan(node)}).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false||e.target.closest('.qbMediaShareButton,.qbMediaShareDialog'))return;const media=e.target.closest(MEDIA_TARGET);if(!media||media.closest('.qbImageLightbox,.qbPdfModal,.qbripModal,.qbLibraryOverlay'))return;cancelPress();const p={id:e.pointerId,x:e.clientX,y:e.clientY,node:media,timer:0};press=p;p.timer=setTimeout(()=>{if(press!==p||!media.isConnected)return;suppressUntil=performance.now()+800;open(mediaOptions(media));try{navigator.vibrate?.(10)}catch{}},520)},true);
 document.addEventListener('pointermove',e=>{if(press&&press.id===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)cancelPress()},true);for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>{if(press?.id===e.pointerId)cancelPress()},true);
 document.addEventListener('click',e=>{if(performance.now()<suppressUntil&&e.target.closest(MEDIA_TARGET)){e.preventDefault();e.stopImmediatePropagation()}},true);document.addEventListener('contextmenu',e=>{if(performance.now()<suppressUntil&&e.target.closest(MEDIA_TARGET))e.preventDefault()},true);
}
window.QBMediaShare={open,close,output};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
