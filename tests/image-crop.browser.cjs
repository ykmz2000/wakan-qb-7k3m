'use strict';
// Real pinned Cropper in Chromium/WebKit; generated images and no production writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const vendorJS=fs.readFileSync(require.resolve('cropperjs/dist/cropper.js'),'utf8');
const vendorCSS=fs.readFileSync(require.resolve('cropperjs/dist/cropper.css'),'utf8');
const app=fs.readFileSync(path.join(root,'image-crop-editor-v1.js'),'utf8');
async function install(p){
  await p.addStyleTag({content:vendorCSS});await p.evaluate(()=>document.head.lastElementChild.id='cropperCss');
  await p.addScriptTag({content:vendorJS});await p.addScriptTag({content:app});
}
async function launch(p,width=1200,height=800){
  await p.evaluate(([w,h])=>{
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);ctx.fillStyle='#000';ctx.fillRect(w/4,h/4,w/2,h/2);
    window.cropResult=undefined;
    QBImageCrop.open(canvas.toDataURL()).then(async blob=>{if(!blob){window.cropResult=null;return}const image=await createImageBitmap(blob);window.cropResult={width:image.width,height:image.height,type:blob.type};image.close()});
  },[width,height]);
  await p.waitForFunction(()=>document.querySelector('.qbCropSave')?.disabled===false);
}
async function data(p){return p.evaluate(()=>document.querySelector('.qbCropImage').cropper.getData())}
async function canvas(p){return p.evaluate(()=>document.querySelector('.qbCropImage').cropper.getCanvasData())}
function near(a,b,label,tolerance=1){assert.ok(Math.abs(a-b)<=tolerance,label+': '+a+' ≈ '+b)}
async function touches(p,type,points){
  await p.evaluate(({type,points})=>{
    for(const {id,x,y} of points){const target=type==='pointerdown'?document.elementFromPoint(x,y):document;
      target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:id,isPrimary:id===1,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y}));}
  },{type,points});
}
async function cancel(p){await p.locator('.qbCropCancel').click();await p.waitForFunction(()=>window.cropResult===null)}
async function run(browser,name){
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  await p.route('**/*',r=>r.abort());
  await p.setContent('<!doctype html><html style="overflow:scroll"><head><style>:root{--accent:rgb(190,35,106);--card:#fff;--text:#172033;--line:#ddd}*{box-sizing:border-box}body{margin:0}</style></head><body><button id="opener">開く</button></body></html>');
  await install(p);
  await launch(p);const trackpad=await p.locator('.qbCropStage').evaluate(stage=>{const cp=document.querySelector('.qbCropImage').cropper,r=stage.getBoundingClientRect(),before=cp.getCanvasData().width,e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-150,clientX:r.left+r.width/2,clientY:r.top+r.height/2});stage.dispatchEvent(e);return{before,after:cp.getCanvasData().width,prevented:e.defaultPrevented}});assert.ok(trackpad.prevented&&trackpad.after>trackpad.before*1.5);await cancel(p);
  for(const [width,height] of [[1200,800],[600,3000],[2400,400],[80,60]]){
    await launch(p,width,height);const d=await data(p);near(d.x,0,'initial x');near(d.y,0,'initial y');near(d.width,width,'full width');near(d.height,height,'full height');await cancel(p);
  }
  assert.equal(await p.evaluate(()=>document.documentElement.style.overflow),'scroll');
  console.log(name+' PASS landscape, long portrait, wide and small images start fully selected; cancel restores page scrolling');
  for(const viewport of [{width:390,height:844},{width:1024,height:768},{width:844,height:390},{width:1366,height:900}]){
    await p.setViewportSize(viewport);await launch(p);
    const layout=await p.evaluate(()=>{
      const save=document.querySelector('.qbCropSave').getBoundingClientRect(),stage=document.querySelector('.qbCropStage').getBoundingClientRect();
      const handle=document.querySelector('.point-ne').getBoundingClientRect(),color=getComputedStyle(document.querySelector('.qbCropSave')).backgroundColor;
      return{save:{top:save.top,bottom:save.bottom,right:save.right},stage:{top:stage.top,bottom:stage.bottom,left:stage.left,right:stage.right},handle:{width:handle.width,height:handle.height,left:handle.left,right:handle.right,top:handle.top,bottom:handle.bottom},color};
    });
    assert.ok(layout.save.top>=0&&layout.save.bottom<=viewport.height+1&&layout.save.right<=viewport.width);
    assert.ok(layout.stage.bottom-layout.stage.top>60);assert.equal(layout.handle.width,44);assert.equal(layout.handle.height,44);
    assert.ok(layout.handle.left>=layout.stage.left&&layout.handle.right<=layout.stage.right+1&&layout.handle.top>=layout.stage.top&&layout.handle.bottom<=layout.stage.bottom);
    assert.equal(layout.color,'rgb(190, 35, 106)');await cancel(p);
  }
  console.log(name+' PASS phone/tablet/landscape/desktop layouts keep actions visible, 44px handles reachable and theme colors intact');
  await p.setViewportSize({width:1024,height:768});await launch(p);
  let box=await p.locator('.point-e').boundingBox();
  await touches(p,'pointerdown',[{id:1,x:box.x+22,y:box.y+22}]);
  await touches(p,'pointermove',[{id:1,x:box.x-40,y:box.y+22}]);
  await touches(p,'pointerup',[{id:1,x:box.x-40,y:box.y+22}]);
  assert.ok((await data(p)).width<1150);
  await p.locator('.qbCropFull').click();near((await data(p)).width,1200,'reset after touch resize');
  // Start with a smaller box so movement and zoom have room without hitting image limits.
  await p.evaluate(()=>document.querySelector('.qbCropImage').cropper.setData({x:300,y:200,width:500,height:400}));
  const face=await p.locator('.cropper-face').boundingBox(),cx=face.x+face.width/2,cy=face.y+face.height/2;
  const initialBox=await p.evaluate(()=>document.querySelector('.qbCropImage').cropper.getCropBoxData());
  const before=await canvas(p);
  await touches(p,'pointerdown',[{id:1,x:cx-40,y:cy},{id:2,x:cx+40,y:cy}]);
  await touches(p,'pointermove',[{id:1,x:cx-70,y:cy},{id:2,x:cx+70,y:cy}]);
  const zoomed=await canvas(p);assert.ok(zoomed.width>before.width*1.4);
  await touches(p,'pointermove',[{id:1,x:cx-50,y:cy+10},{id:2,x:cx+90,y:cy+10}]);
  const moved=await canvas(p);near(moved.width,zoomed.width,'two-finger pan keeps scale',2);near(moved.left,zoomed.left+20,'two-finger horizontal pan',2);near(moved.top,zoomed.top+10,'two-finger vertical pan',2);
  const afterBox=await p.evaluate(()=>document.querySelector('.qbCropImage').cropper.getCropBoxData());
  near(afterBox.width,initialBox.width,'pinch keeps crop-box width');near(afterBox.left,initialBox.left,'pinch keeps crop-box position');
  await touches(p,'pointerup',[{id:2,x:cx+90,y:cy+10}]);
  await touches(p,'pointermove',[{id:1,x:cx-10,y:cy+40}]);
  const oneLeft=await canvas(p);near(oneLeft.left,moved.left,'lifting a finger does not switch to image dragging');
  await touches(p,'pointerup',[{id:1,x:cx-10,y:cy+40}]);
  await p.locator('.qbCropFull').click();near((await data(p)).width,1200,'reset after pinch');
  console.log(name+' PASS one-finger edge resize, two-finger pinch+pan, stable frame and safe transition back to one finger');
  box=await p.locator('.point-w').boundingBox();await p.mouse.move(box.x+22,box.y+22);await p.mouse.down();await p.mouse.move(box.x+80,box.y+22,{steps:8});await p.mouse.up();
  assert.ok((await data(p)).x>0);await p.locator('[data-r="1"]').click();const square=await data(p);near(square.width,square.height,'ratio preset');
  await p.locator('.qbCropFull').click();await p.locator('[data-rotate="90"]').click();await p.locator('.qbCropFull').click();
  const rotated=await data(p);near(rotated.rotate,90,'rotation retained');near(rotated.width,800,'rotated full width');near(rotated.height,1200,'rotated full height');
  await p.locator('.qbCropSave').click();await p.waitForFunction(()=>window.cropResult&&window.cropResult.width);
  assert.deepEqual(await p.evaluate(()=>cropResult),{width:800,height:1200,type:'image/png'});assert.equal(await p.locator('.qbCropModal').count(),0);assert.deepEqual(errors,[]);
  console.log(name+' PASS mouse resize, ratio presets, rotation, full-image reset and correctly sized saved JPEG');
  await p.close();
}
async function entryPoints(browser,name){
  const file=path.join(__dirname,'inline-stem.browser.cjs'),source=fs.readFileSync(file,'utf8'),end=source.lastIndexOf('(async()=>{for(const [name,type]');
  const fixture=new Module(file,module);fixture.filename=file;fixture.paths=module.paths;fixture._compile(source.slice(0,end)+'\nmodule.exports={boot};',file);
  const {page:p,errors}=await fixture.exports.boot(browser);await install(p);
  await p.addScriptTag({content:fs.readFileSync(path.join(root,'image-library-tools-v1.js'),'utf8')});
  const before=await p.evaluate(()=>JSON.stringify(testDB));
  await p.locator('.qsiCropTool').first().click();await p.locator('.qbCropModal').waitFor();await p.waitForFunction(()=>document.querySelector('.qbCropSave')?.disabled===false);
  assert.equal(await p.locator('#qbCropTitle').textContent(),'問題画像をトリミング');await p.locator('.qbCropCancel').click();
  await p.locator('[data-ade-v2="overview"]').click();await p.locator('.qbInlineImageToggle').click();await p.locator('.oeiCrop').first().click();await p.waitForFunction(()=>document.querySelector('.qbCropSave')?.disabled===false);
  assert.equal(await p.locator('#qbCropTitle').textContent(),'画像をトリミング');await p.locator('.qbCropCancel').click();await p.locator('.qbInlineCancel').click();
  assert.equal(await p.evaluate(()=>JSON.stringify(testDB)),before);assert.deepEqual(errors,[]);await p.close();
  console.log(name+' PASS real question-image and explanation-image buttons open shared crop UI; cancel leaves DB/history/notes intact');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,name);await entryPoints(b,name)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
