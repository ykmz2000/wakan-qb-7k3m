/* A PNG preview carries immutable source bytes and a versioned editable scene.
 * The preview is disposable: reopening and zooming always use source assets.
 * One self-contained file makes every existing byte-copy route independent. */
(()=>{
'use strict';
const LIMIT=100*1024*1024,META_LIMIT=8*1024*1024,TYPE='qbED',SIGN=[137,80,78,71,13,10,26,10];
const copy=x=>JSON.parse(JSON.stringify(x));
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c});
function crc(data){let c=0xffffffff;for(const b of data)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
const u32=n=>{const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,n);return a};
const types=new Set(['pen','marker','text','counter','rect','circle','ellipse','arrow','image']);
function validateScene(s,assets){
 const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7;
 if(!s||![s.width,s.height].every(n=>finite(n)&&n>0)||!Array.isArray(s.items)||s.items.length>20000)throw Error('編集データの寸法・物体数が不正です。');
 let points=0;for(const i of [s.base,...s.items].filter(Boolean)){
  if(i!==s.base&&!types.has(i.type))throw Error('対応していない編集データです。');
  for(const k of ['x','y','w','h','width','fontSize'])if(i[k]!=null&&!finite(i[k]))throw Error('編集座標が不正です。');
  if(i.points){points+=i.points.length;if(points>2000000||!i.points.every(p=>finite(p.x)&&finite(p.y)))throw Error('ペンの編集データが不正です。');}
  for(const p of [i.a,i.b].filter(Boolean))if(!finite(p.x)||!finite(p.y))throw Error('矢印の座標が不正です。');
  if(i.assetId&&!assets.has(i.assetId))throw Error('元画像が不足しています。');
  if(i.sourceRect&&!Object.values(i.sourceRect).every(finite))throw Error('トリミング範囲が不正です。');
 }
 return s;
}
async function read(blob){
 if(!(blob instanceof Blob)||blob.size<20)return null;if(blob.size>LIMIT)throw Error('ファイルは100MiB以下にしてください。');
 const bytes=new Uint8Array(await blob.arrayBuffer());if(!SIGN.every((v,i)=>bytes[i]===v))return null;
 const view=new DataView(bytes.buffer);let pos=8;
 while(pos+12<=bytes.length){const n=view.getUint32(pos),end=pos+12+n;if(end>bytes.length)throw Error('PNGのデータが途中で切れています。');const type=String.fromCharCode(...bytes.subarray(pos+4,pos+8));
  if(type===TYPE){if(n<4||crc(bytes.subarray(pos+4,end-4))!==view.getUint32(end-4))throw Error('編集データの検証に失敗しました。');const len=view.getUint32(pos+8);if(len>META_LIMIT||len>n-4)throw Error('編集データが大きすぎます。');const record=JSON.parse(new TextDecoder().decode(bytes.subarray(pos+12,pos+12+len)));if(record.version!==1||!record.assets)throw Error('編集データの版に対応していません。');const start=pos+12+len,assets=new Map();for(const [id,a] of Object.entries(record.assets)){if(!Number.isSafeInteger(a.offset)||!Number.isSafeInteger(a.length)||a.offset<0||a.length<1||start+a.offset+a.length>end-4||!/^image\/(png|jpeg|webp|gif|heic|heif)$/.test(a.type))throw Error('元画像の形式が不正です。');assets.set(id,new Blob([bytes.subarray(start+a.offset,start+a.offset+a.length)],{type:a.type}));}
   validateScene(record.scene,assets);if(record.reset)validateScene(record.reset,assets);return {scene:record.scene,reset:record.reset||null,assets};}
  if(type==='IEND')break;pos=end;
 }return null;
}
async function write(preview,record){
 const blobs=[],assets={};let offset=0;for(const [id,blob] of record.assets){assets[id]={offset,length:blob.size,type:blob.type};blobs.push(blob);offset+=blob.size;}
 validateScene(record.scene,record.assets);const json=new TextEncoder().encode(JSON.stringify({version:1,scene:record.scene,reset:record.reset,assets}));if(json.length>META_LIMIT||preview.size+offset+json.length+16>LIMIT)throw Error('元画像と編集情報の合計が100MiBを超えました。素材を分けて保存してください。');
 const payload=new Uint8Array(await new Blob([new TextEncoder().encode(TYPE),u32(json.length),json,...blobs]).arrayBuffer()),tail=new Uint8Array(await preview.slice(-12).arrayBuffer());if(String.fromCharCode(...tail.subarray(4,8))!=='IEND')throw Error('プレビューの生成に失敗しました。');
 return new Blob([preview.slice(0,-12),u32(payload.length-4),payload,u32(crc(payload)),tail],{type:'image/png'});
}
function image(blob){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>resolve({img,url});img.onerror=async()=>{try{const bitmap=await createImageBitmap(blob);resolve({img:bitmap,url})}catch{URL.revokeObjectURL(url);reject(Error('元画像を読み込めません。'))}};img.src=url})}
async function prepare(record,depth=0){
 if(depth>8)throw Error('入れ子の画像が多すぎます。');const assets=new Map();
 const dispose=()=>{for(const a of assets.values()){a.nested?.dispose();if(a.url)URL.revokeObjectURL(a.url);a.img?.close?.()}};
 try{for(const [id,blob] of record.assets){const nested=await read(blob);assets.set(id,nested?{nested:await prepare(nested,depth+1)}:await image(blob));}return {scene:record.scene,assets,draw(ctx){paint(ctx,record.scene,assets)},dispose};}catch(e){dispose();throw e}
}
function drawAsset(ctx,a,i){if(!a)return;const w=a.nested?.scene.width||a.img.naturalWidth||a.img.width,h=a.nested?.scene.height||a.img.naturalHeight||a.img.height,r=i.sourceRect||{x:0,y:0,w,h};ctx.save();ctx.beginPath();ctx.rect(i.x,i.y,i.w,i.h);ctx.clip();ctx.translate(i.x,i.y);ctx.scale(i.w/r.w,i.h/r.h);ctx.translate(-r.x,-r.y);if(a.nested)a.nested.draw(ctx);else ctx.drawImage(a.img,0,0);ctx.restore()}
function drawItem(ctx,i,assets){
 ctx.save();ctx.setLineDash([]);ctx.strokeStyle=ctx.fillStyle=i.color||'#111111';ctx.lineWidth=i.width||2;ctx.lineCap='round';ctx.lineJoin='round';
 if(i.points?.length){ctx.globalAlpha=i.type==='marker'?.32:1;ctx.beginPath();ctx.moveTo(i.points[0].x,i.points[0].y);for(const p of i.points.slice(1))ctx.lineTo(p.x,p.y);if(i.points.length===1)ctx.lineTo(i.points[0].x+.01,i.points[0].y);ctx.stroke()}
 else if(i.type==='image')drawAsset(ctx,assets.get(i.assetId),i);
 else if(i.type==='rect'){ctx.lineJoin='miter';ctx.strokeRect(i.x,i.y,i.w,i.h)}
 else if(['ellipse','circle','counter'].includes(i.type)){ctx.beginPath();ctx.ellipse(i.x+i.w/2,i.y+i.h/2,i.w/2,i.h/2,0,0,Math.PI*2);if(i.type==='counter'){ctx.fill();ctx.fillStyle=['#ffd63d','#22b8dc','#f28c28','#ffffff'].includes(i.color)?'#172033':'#fff';ctx.textAlign='center';ctx.textBaseline='middle';let size=i.h*.58;ctx.font=`700 ${size}px sans-serif`;const w=ctx.measureText(i.label).width;if(w>i.w*.76)size*=i.w*.76/w;ctx.font=`700 ${size}px sans-serif`;ctx.fillText(i.label,i.x+i.w/2,i.y+i.h/2)}else ctx.stroke()}
 else if(i.type==='arrow'){const a=i.a,b=i.b,t=Math.atan2(b.y-a.y,b.x-a.x),len=Math.max(12,i.width*4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.moveTo(b.x-len*Math.cos(t-.5),b.y-len*Math.sin(t-.5));ctx.lineTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(t+.5),b.y-len*Math.sin(t+.5));ctx.stroke()}
 else if(i.type==='text'){ctx.font=`${i.fontSize}px -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif`;ctx.textBaseline='top';String(i.text||'').split('\n').forEach((line,n)=>ctx.fillText(line,i.x,i.y+n*i.fontSize*1.3))}ctx.restore();
}
function paint(ctx,scene,assets,{overlay=false,exclude=null}={}){ctx.save();ctx.beginPath();ctx.rect(0,0,scene.width,scene.height);ctx.clip();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';if(!overlay){ctx.fillStyle=scene.background||'#ffffff';ctx.fillRect(0,0,scene.width,scene.height);if(scene.base)drawAsset(ctx,assets.get(scene.base.assetId),scene.base)}for(const i of scene.items)if(i.id!==exclude)drawItem(ctx,i,assets);ctx.restore()}
async function preview(scene,assets,overlay=false){const scale=Math.min(2,2400/Math.max(scene.width,scene.height),Math.sqrt(4000000/(scene.width*scene.height))),c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(scene.width*scale));c.height=Math.max(1,Math.ceil(scene.height*scale));try{const ctx=c.getContext('2d');ctx.scale(scale,scale);paint(ctx,scene,assets,{overlay});const blob=await new Promise(r=>c.toBlob(r,'image/png'));if(!blob)throw Error('プレビューを生成できません。');return blob}finally{c.width=c.height=1}}
const dataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)});
async function legacy(record){const assets={},ids=new Set(record.scene.items.map(i=>i.assetId).filter(Boolean)),scene=copy(record.scene);scene.base=null;for(const [id,blob] of record.assets)if(ids.has(id))assets[id]=await dataURL(blob);return{scene,assets}}
async function fromLegacy(record){const assets=new Map();for(const [id,url] of Object.entries(record.assets||{})){if(!/^data:image\/(png|jpeg|webp|gif|heic|heif);base64,/.test(url))throw Error('編集素材の形式が不正です。');assets.set(id,await(await fetch(url)).blob())}const scene=copy(record.scene);scene.base=null;return{scene,assets}}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
// PDF coordinates here are top-left/y-down, just like the editable scene.
// Raster source bytes are embedded once; paths stay vector. Only text glyphs
// are rasterized (including Japanese, without a remote font dependency).
async function drawPDF(pdf,page,record,{overlay=false,depth=0}={}){
 if(depth>8)throw Error('入れ子の画像が多すぎます。');
 const L=await import('./vendor/pdfjs/pdf-lib.mjs'),loaded=new Map();
 const push=(...ops)=>page.pushOperators(...ops),matrix=(...n)=>L.concatTransformationMatrix(...n);
 const color=value=>{const s=/^#[a-f0-9]{6}$/i.test(value||'')?value:'#111111';return L.rgb(parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255)};
 const clip=(x,y,w,h)=>push(L.rectangle(x,y,w,h),L.clip(),L.endPath());
 const raster=async(blob)=>{let png=blob;if(!['image/png','image/jpeg'].includes(blob.type)){const a=await image(blob);try{png=await QBImageEditor.encodePng(a.img.width,a.img.height,ctx=>ctx.drawImage(a.img,0,0))}finally{URL.revokeObjectURL(a.url);a.img.close?.()}}return png.type==='image/jpeg'?pdf.embedJpg(await png.arrayBuffer()):pdf.embedPng(await png.arrayBuffer())};
 async function asset(i){const blob=record.assets.get(i.assetId);if(!blob)throw Error('PDFに保存する元画像がありません。');let a=loaded.get(i.assetId);if(!a){const nested=await read(blob);a=nested?{nested,w:nested.scene.width,h:nested.scene.height}:{image:await raster(blob)};if(a.image){a.w=a.image.width;a.h=a.image.height}loaded.set(i.assetId,a)}const r=i.sourceRect||{x:0,y:0,w:a.w,h:a.h};push(L.pushGraphicsState());clip(i.x,i.y,i.w,i.h);push(matrix(i.w/r.w,0,0,i.h/r.h,i.x-r.x*i.w/r.w,i.y-r.y*i.h/r.h));if(a.nested)await drawPDF(pdf,page,a.nested,{depth:depth+1});else{push(matrix(1,0,0,-1,0,a.h));page.drawImage(a.image,{x:0,y:0,width:a.w,height:a.h})}push(L.popGraphicsState())}
 async function glyph(i){const pad=4,w=Math.max(1,(i.w||i.fontSize*String(i.text||'').length)+pad*2),h=Math.max(1,(i.h||i.fontSize*String(i.text||'').split('\n').length*1.3)+pad*2),scale=Math.min(4,8192/Math.max(w,h),Math.sqrt(8000000/(w*h))),c=document.createElement('canvas');c.width=Math.ceil(w*scale);c.height=Math.ceil(h*scale);try{const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.translate(pad-i.x,pad-i.y);drawItem(ctx,i,new Map());const blob=await new Promise(r=>c.toBlob(r,'image/png'));if(!blob)throw Error('文字をPDFに描画できません。');const im=await pdf.embedPng(await blob.arrayBuffer());push(L.pushGraphicsState(),matrix(1,0,0,-1,i.x-pad,i.y-pad+h));page.drawImage(im,{x:0,y:0,width:w,height:h});push(L.popGraphicsState())}finally{c.width=c.height=1}}
 const line=(a,b,i)=>page.drawLine({start:a,end:b,thickness:i.width||2,color:color(i.color),lineCap:L.LineCapStyle.Round,opacity:i.type==='marker'?.32:1});
 const s=validateScene(record.scene,record.assets);push(L.pushGraphicsState());clip(0,0,s.width,s.height);
 try{if(!overlay){page.drawRectangle({x:0,y:0,width:s.width,height:s.height,color:color(s.background||'#ffffff')});if(s.base)await asset(s.base)}for(const i of s.items){
  if(i.type==='image')await asset(i);
  else if(i.points?.length){const pts=i.points;if(pts.length===1)line(pts[0],{x:pts[0].x+.01,y:pts[0].y},i);else{const path='M '+pts.map(p=>p.x+' '+(-p.y)).join(' L ');page.drawSvgPath(path,{borderColor:color(i.color),borderWidth:i.width||2,borderOpacity:i.type==='marker'?.32:1,borderLineCap:L.LineCapStyle.Round})}}
  else if(i.type==='rect')page.drawRectangle({x:i.x,y:i.y,width:i.w,height:i.h,borderColor:color(i.color),borderWidth:i.width||2});
  else if(['ellipse','circle'].includes(i.type))page.drawEllipse({x:i.x+i.w/2,y:i.y+i.h/2,xScale:i.w/2,yScale:i.h/2,borderColor:color(i.color),borderWidth:i.width||2});
  else if(i.type==='arrow'){line(i.a,i.b,i);const t=Math.atan2(i.b.y-i.a.y,i.b.x-i.a.x),n=Math.max(12,i.width*4);for(const d of [-.5,.5])line(i.b,{x:i.b.x-n*Math.cos(t+d),y:i.b.y-n*Math.sin(t+d)},i)}
  else if(['text','counter'].includes(i.type))await glyph(i);
 }}finally{push(L.popGraphicsState())}
}
async function exportPDF(record){const L=await import('./vendor/pdfjs/pdf-lib.mjs'),pdf=await L.PDFDocument.create(),s=record.scene,p=pdf.addPage([s.width,s.height]);p.pushOperators(L.pushGraphicsState(),L.concatTransformationMatrix(1,0,0,-1,0,s.height));await drawPDF(pdf,p,record);p.pushOperators(L.popGraphicsState());const out=new Blob([await pdf.save()],{type:'application/pdf'});if(out.size>LIMIT)throw Error('PDFが100MiBを超えました。');return out}
window.QBEditableMedia={read,write,prepare,paint,drawAsset,preview,legacy,fromLegacy,drawPDF,exportPDF,download};
})();
