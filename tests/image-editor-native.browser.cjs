'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');
async function run(browser,label){
 const p=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
 await p.setContent('<!doctype html><style>*{box-sizing:border-box}body{margin:0}:root{--card:#fff;--text:#172033;--line:#ddd;--accent:#ee7da8;--muted:#666}</style>');
 await p.evaluate(()=>{if(!crypto.randomUUID)crypto.randomUUID=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('')});
 await p.addStyleTag({content:fs.readFileSync(path.join(root,'image-annotation-v1.css'),'utf8')});
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'image-annotation-model-v1.js'),'utf8')});
 await p.evaluate(()=>{const H=QBImageModel.History;QBImageModel.History=class extends H{constructor(s){super(s);if(s.items)window.sceneHistory=this}}});
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'image-annotation-editor-v1.js'),'utf8')});
 await p.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,800,600);x.fillStyle='#000';x.fillRect(100,100,1,200);QBImageEditor.open(c.toDataURL(),{onSave:async(blob,dim)=>{window.savedBlob=blob;window.savedDimensions=dim}})});
 await p.locator('.qbDrawSave:enabled').waitFor();
 await p.waitForFunction(()=>Number(document.querySelector('.qbDrawStage')?.dataset.zoom)>0);
 const pinch=await p.locator('.qbDrawStage').evaluate(stage=>{const r=stage.getBoundingClientRect(),before=Number(stage.dataset.zoom),e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-150,clientX:r.left+r.width/2,clientY:r.top+r.height/2});stage.dispatchEvent(e);return{before,prevented:e.defaultPrevented,width:r.width}});assert.equal(pinch.prevented,true);await p.waitForFunction(before=>Number(document.querySelector('.qbDrawStage').dataset.zoom)>before*1.5,pinch.before);
 const native=await p.locator('.qbDrawStage').evaluate(stage=>{const before=Number(stage.dataset.zoom),r=stage.getBoundingClientRect();for(const [type,scale] of [['gesturestart',1],['gesturechange',1.5],['gestureend',1.5]]){const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{scale,clientX:r.left+r.width/2,clientY:r.top+r.height/2});window.dispatchEvent(e);if(!e.defaultPrevented)throw Error('Native pinch leaked to browser')}return before});await p.waitForFunction(before=>Number(document.querySelector('.qbDrawStage').dataset.zoom)>before*1.4,native);assert.equal((await p.locator('.qbDrawStage').boundingBox()).width,pinch.width);
 await p.getByRole('button',{name:'全体表示',exact:true}).click();
 for(let n=0;n<3;n++)await p.getByRole('button',{name:'右に余白',exact:true}).click();
 await p.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=1600;c.height=1200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1600,1200);
   // One-pixel rules and small text: JPEG conversion or downsampling would change these pixels.
   x.fillStyle='black';for(let col=0;col<1600;col+=2)x.fillRect(col,10,1,100);x.font='14px sans-serif';x.fillText('Small text must remain sharp',40,150);x.fillStyle='#ef476f';x.fillRect(201,201,1,300);
   window.sourcePixels=x.getImageData(0,0,1600,1200).data;const blob=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'fine-detail.png',{type:'image/png'}));const input=document.querySelector('.qbDrawTools input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change'));
 });
 await p.waitForFunction(()=>sceneHistory.current.items.length===1);
 await p.locator('.qbDrawSnap').click();assert.equal(await p.locator('.qbDrawSnap').getAttribute('aria-pressed'),'false');
 await p.getByRole('button',{name:'全体表示',exact:true}).click();
 const stage=await p.locator('.qbDrawStage').boundingBox();const sw=await p.evaluate(()=>sceneHistory.current.width),z=Math.min((stage.width-32)/sw,(stage.height-32)/600);
 const at=(x,y)=>({x:stage.x+(stage.width-sw*z)/2+x*z,y:stage.y+(stage.height-600*z)/2+y*z});
 const drag=async(a,b)=>{const x=at(a.x,a.y),y=at(b.x,b.y);await p.locator('.qbDrawCanvas').dispatchEvent('pointerdown',{pointerId:17,pointerType:'pen',button:0,clientX:x.x,clientY:x.y});await p.locator('.qbDrawCanvas').dispatchEvent('pointermove',{pointerId:17,pointerType:'pen',button:0,clientX:y.x,clientY:y.y});await p.locator('.qbDrawCanvas').dispatchEvent('pointerup',{pointerId:17,pointerType:'pen',button:0,clientX:y.x,clientY:y.y})};
 let item=await p.evaluate(()=>sceneHistory.current.items[0]);await drag({x:item.x+item.w/2,y:item.y+item.h/2},{x:900+item.w/2,y:100+item.h/2});
 item=await p.evaluate(()=>sceneHistory.current.items[0]);await drag({x:item.x+item.w,y:item.y+item.h},{x:item.x+400,y:item.y+300});
 item=await p.evaluate(()=>sceneHistory.current.items[0]);assert.ok(Math.abs(item.w-400)<.01);assert.ok(item.x>=800); // It is actually placed on the added margin.
 await p.evaluate(()=>window.expectedItem=JSON.parse(JSON.stringify(sceneHistory.current.items[0])));
 await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>window.savedBlob instanceof Blob,null,{timeout:90000});
 const result=await p.evaluate(async()=>{
   const img=new Image();const url=URL.createObjectURL(savedBlob);img.src=url;await img.decode();const c=document.createElement('canvas');c.width=1600;c.height=1200;const x=c.getContext('2d');x.drawImage(img,-Math.round(expectedItem.x*4),-Math.round(expectedItem.y*4));const out=x.getImageData(0,0,1600,1200).data;let differences=0;for(let i=0;i<out.length;i++)if(out[i]!==sourcePixels[i])differences++;
   const base=document.createElement('canvas');base.width=12;base.height=4;base.getContext('2d').drawImage(img,-396,-600);const stripe=[...base.getContext('2d').getImageData(0,0,12,1).data];URL.revokeObjectURL(url);return{differences,dim:savedDimensions,type:savedBlob.type,stripe};
 });
 assert.equal(result.differences,0);assert.equal(result.type,'image/png');assert.equal(result.dim.width,sw*4);assert.equal(result.dim.height,2400);
 assert.deepEqual(result.stripe.slice(0,4),[255,255,255,255]);assert.deepEqual(result.stripe.slice(4*4,5*4),[0,0,0,255]);assert.deepEqual(result.stripe.slice(8*4,9*4),[255,255,255,255]);
 // Saving the already expanded image again must not lower its resolution or alter the source region.
 await p.evaluate(()=>{window.firstBlob=savedBlob;window.savedBlob=null;QBImageEditor.open(firstBlob,{onSave:async b=>window.savedBlob=b})});
 await p.locator('.qbDrawSave:enabled').waitFor();await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>savedBlob instanceof Blob,null,{timeout:90000});
 const equal=await p.evaluate(async()=>{const a=new Uint8Array(await firstBlob.arrayBuffer()),b=new Uint8Array(await savedBlob.arrayBuffer());return a.length===b.length&&a.every((v,i)=>v===b[i])});assert.equal(equal,true);
 assert.deepEqual(errors,[]);await p.close();console.log(label+' PASS margin collage preserves all 7,680,000 source RGBA bytes, base one-pixel rule, native PNG dimensions and lossless re-edit');
}
(async()=>{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,label)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
