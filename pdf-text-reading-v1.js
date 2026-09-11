/* Extract native PDF text first, then OCR only scanned pages. */
(function(root){
'use strict';
function normalized(value){return String(value||'').replace(/\s+/g,'').trim()}
function embeddedText(items){
 const rows=[];
 for(const item of items||[]){
  const text=String(item?.str||'').trim();if(!text)continue;
  const y=Number(item?.transform?.[5]);let row=rows.find(r=>Number.isFinite(y)&&Math.abs(r.y-y)<2.5);
  if(!row){row={y:Number.isFinite(y)?y:-rows.length,parts:[]};rows.push(row)}
  row.parts.push({x:Number(item?.transform?.[4])||0,text});
 }
 rows.sort((a,b)=>b.y-a.y);
 return rows.map(row=>row.parts.sort((a,b)=>a.x-b.x).map(part=>part.text).join(' ')).join('\n').trim();
}
function merge(nativeText,ocrText){
 nativeText=String(nativeText||'').trim();ocrText=String(ocrText||'').trim();
 if(!nativeText)return ocrText;if(!ocrText)return nativeText;
 const a=normalized(nativeText),b=normalized(ocrText);if(a.includes(b))return nativeText;if(b.includes(a))return ocrText;
 return nativeText+'\n'+ocrText;
}
async function render(page){
 const raw=page.getViewport({scale:1}),scale=Math.min(2.25,Math.sqrt(5000000/(raw.width*raw.height)),3200/Math.max(raw.width,raw.height)),viewport=page.getViewport({scale:Math.max(1,scale)}),canvas=document.createElement('canvas');
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport}).promise;return canvas;
}
async function read(blob,{documentTask,recognize,alive=()=>true,onProgress=()=>{},minimumNativeCharacters=40}={}){
 if(typeof documentTask!=='function')throw Error('PDFの文字抽出機能を利用できません。');
 let task,doc;const pages=[];
 try{
  task=await documentTask(blob);doc=await task.promise;
  for(let number=1;number<=doc.numPages;number++){
   if(!alive())throw new DOMException('中止しました','AbortError');onProgress({page:number,total:doc.numPages,phase:'extract'});
   const page=await doc.getPage(number),content=await page.getTextContent(),nativeText=embeddedText(content?.items),needsOCR=normalized(nativeText).length<minimumNativeCharacters;let ocrText='',canvas;
   try{if(needsOCR&&typeof recognize==='function'){onProgress({page:number,total:doc.numPages,phase:'ocr'});canvas=await render(page);if(!alive())throw new DOMException('中止しました','AbortError');ocrText=await recognize(canvas)}}finally{if(canvas)canvas.width=canvas.height=1;page.cleanup?.()}
   const text=merge(nativeText,ocrText);if(text)pages.push(doc.numPages>1?`${number}ページ\n${text}`:text);
  }
  return pages.join('\n\n').trim();
 }finally{doc?.cleanup?.();await task?.destroy?.().catch(()=>{})}
}
root.QBPDFTextReading={embeddedText,merge,read};
})(typeof window!=='undefined'?window:globalThis);
