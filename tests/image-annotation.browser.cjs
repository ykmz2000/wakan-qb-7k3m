'use strict';
// Actual canvas, pointer events, Cropper and editor integration. Synthetic DB/storage only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const resultsDir=process.env.QB_IMAGE_TEST_RESULTS||'/tmp/qb-annotation-results';fs.mkdirSync(resultsDir,{recursive:true});
const fixturePath=path.join(__dirname,'inline-stem.browser.cjs'),source=fs.readFileSync(fixturePath,'utf8'),end=source.lastIndexOf('(async()=>{for(const [name,type]');
assert.ok(end>0);const fixture=new Module(fixturePath,module);fixture.filename=fixturePath;fixture.paths=module.paths;fixture._compile(source.slice(0,end)+'\nmodule.exports={boot};',fixturePath);
async function install(p,integration=false){
  await p.addStyleTag({content:read('image-annotation-v1.css')});
  await p.addStyleTag({content:fs.readFileSync(require.resolve('cropperjs/dist/cropper.css'),'utf8')});await p.evaluate(()=>document.head.lastElementChild.id='cropperCss');
  await p.addScriptTag({content:fs.readFileSync(require.resolve('cropperjs/dist/cropper.js'),'utf8')});
  const scripts=['image-crop-editor-v1.js','image-annotation-model-v1.js','image-edit-storage-v1.js','image-annotation-editor-v1.js'];
  if(integration)scripts.push('image-edit-integration-v1.js','question-image-export-v1.js');
  for(const s of scripts)await p.addScriptTag({content:read(s)});
}
async function launch(p,reset=true){
  if(reset)await p.evaluate(()=>localStorage.setItem('qb-image-editor-settings-v1','{}'));
  await p.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,800,600);window.drawResult=undefined;QBImageEditor.open(c.toDataURL()).then(b=>window.drawResult=b)});
  await p.waitForFunction(()=>document.querySelector('.qbDrawSave')?.disabled===false);
}
async function mapping(p,w=800,h=600){
  await p.getByRole('button',{name:'全体表示',exact:true}).click();
  const b=await p.locator('.qbDrawStage').boundingBox(),z=Math.min((b.width-32)/w,(b.height-32)/h);
  return (x,y)=>({x:b.x+(b.width-w*z)/2+x*z,y:b.y+(b.height-h*z)/2+y*z});
}
async function drag(p,map,points){const first=map(...points[0]);await p.mouse.move(first.x,first.y);await p.mouse.down();for(const xy of points.slice(1)){const n=map(...xy);await p.mouse.move(n.x,n.y,{steps:5})}await p.mouse.up()}
async function pixels(p,points){return p.evaluate(async points=>{
  const image=await new Promise((resolve,reject)=>{const i=new Image(),u=URL.createObjectURL(drawResult);i.onload=()=>{URL.revokeObjectURL(u);resolve(i)};i.onerror=()=>reject(Error('PNG decode failed: '+JSON.stringify({size:drawResult.size,type:drawResult.type,url:u})));i.src=u});const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return{width:c.width,height:c.height,type:drawResult.type,colors:points.map(([a,b])=>[...x.getImageData(a,b,1,1).data])};
},points)}
async function core(browser,name){
  const p=await browser.newPage({viewport:{width:1024,height:900},hasTouch:true});p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>r.request().url()==='https://qb-draw.test/'?r.fulfill({contentType:'text/html',body:'<!doctype html><style>*{box-sizing:border-box}body{margin:0}</style><button>前の画面</button>'}):r.request().url().startsWith('blob:')?r.continue():r.abort());await p.goto('https://qb-draw.test/');await install(p);
  // A 12MP original must not be downsampled when margins take output past 12MP.
  await p.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=4000;c.height=3000;const x=c.getContext('2d');
    x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.fillRect(100,100,1,100);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));c.width=c.height=1;
    window.drawResult=undefined;QBImageEditor.open(blob).then(b=>window.drawResult=b);
  });
  await p.waitForFunction(()=>document.querySelector('.qbDrawSave')?.disabled===false);
  await p.getByRole('button',{name:'右に余白',exact:true}).click();
  await p.getByRole('button',{name:'下に余白',exact:true}).click();
  await p.getByRole('button',{name:'右に余白',exact:true}).click();
  await p.getByRole('button',{name:'下に余白',exact:true}).click();
  await p.evaluate(()=>{window.exportTiles=[];const create=document.createElement.bind(document);document.createElement=function(tag,...args){const el=create(tag,...args);if(tag==='canvas'){const get=el.getContext.bind(el);el.getContext=function(...a){exportTiles.push([el.width,el.height]);return get(...a)}}return el};window.restoreCreate=()=>document.createElement=create});
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob,null,{timeout:60000});
  const tiles=await p.evaluate(()=>{restoreCreate();return exportTiles});assert.ok(tiles.length>1);assert.ok(tiles.every(([w,h])=>w<=2048&&h<=128));
  const full=await pixels(p,[[99,150],[100,150],[101,150],[4500,3500]]);
  assert.deepEqual([full.width,full.height,full.type],[6250,5813,'image/png']);
  assert.deepEqual(full.colors,[[255,255,255,255],[0,0,0,255],[255,255,255,255],[255,255,255,255]]);
  // Reopening an expanded result must also preserve the saved dimensions and fine detail.
  await p.evaluate(()=>{const blob=drawResult;window.drawResult=undefined;QBImageEditor.open(blob).then(b=>window.drawResult=b)});
  await p.waitForFunction(()=>document.querySelector('.qbDrawSave')?.disabled===false);
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const again=await pixels(p,[[100,150]]);assert.deepEqual([again.width,again.height],[6250,5813]);assert.deepEqual(again.colors[0],[0,0,0,255]);
  console.log(name+' PASS tiled PNG beyond 32MP, bounded canvas, one-pixel detail and lossless re-edit');
  await p.evaluate(()=>{const c=document.createElement('canvas');c.width=16000;c.height=20;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.fillRect(2047,0,3,20);window.drawResult=undefined;QBImageEditor.open(c.toDataURL()).then(b=>window.drawResult=b)});
  await p.waitForFunction(()=>document.querySelector('.qbDrawSave')?.disabled===false);
  await p.getByRole('button',{name:'右に余白',exact:true}).click();
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const wide=await pixels(p,[[2046,10],[2047,10],[2048,10],[2049,10],[2050,10],[19000,10]]);
  assert.deepEqual([wide.width,wide.height],[20000,20]);assert.deepEqual(wide.colors,[[255,255,255,255],[0,0,0,255],[0,0,0,255],[0,0,0,255],[255,255,255,255],[255,255,255,255]]);
  console.log(name+' PASS tiled PNG beyond 16384px and horizontal tile boundary');
  await p.evaluate(()=>{window.saveAttempts=0;window.drawResult=undefined;const c=document.createElement('canvas');c.width=80;c.height=60;QBImageEditor.open(c.toDataURL(),{onSave:async()=>{if(++saveAttempts===1)throw Error('test upload failure')}}).then(b=>window.drawResult=b)});
  await p.waitForFunction(()=>document.querySelector('.qbDrawSave')?.disabled===false);
  await p.locator('.qbDrawSave').click();await p.getByText('保存できませんでした：test upload failure',{exact:true}).waitFor();
  assert.equal(await p.locator('.qbDrawSave').isEnabled(),true);
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  assert.equal(await p.evaluate(()=>saveAttempts),2);
  console.log(name+' PASS failed save retains editor and retries');
  await p.evaluate(()=>{const t=document.createElement('textarea');t.id='backgroundEditor';t.value='background draft';document.body.append(t);t.focus();window.backgroundKeys=0;window.backgroundWheel=0;document.addEventListener('keydown',()=>backgroundKeys++,true);document.addEventListener('wheel',()=>backgroundWheel++,true)});
  await launch(p);
  assert.equal(await p.evaluate(()=>document.querySelector('#backgroundEditor').inert),true);
  await p.locator('[data-tool=counter]').click();
  assert.equal(await p.getByLabel('連番の種類',{exact:true}).inputValue(),'letter');
  const counterMap=await mapping(p),spot=counterMap(200,200);await p.mouse.click(spot.x,spot.y);
  assert.equal(await p.getByLabel('次に貼る番号',{exact:true}).inputValue(),'b');
  await p.evaluate(()=>document.querySelector('.qbDrawPasteTarget').focus());
  await p.keyboard.press('Meta+z');assert.equal(await p.getByLabel('次に貼る番号',{exact:true}).inputValue(),'a');
  await p.keyboard.press('Meta+Shift+z');assert.equal(await p.getByLabel('次に貼る番号',{exact:true}).inputValue(),'b');
  await p.locator('.qbDrawCanvas').evaluate(c=>c.dispatchEvent(new InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true})));
  assert.equal(await p.getByLabel('次に貼る番号',{exact:true}).inputValue(),'a');
  await p.locator('.qbDrawCanvas').dispatchEvent('wheel',{deltaX:30,deltaY:20,bubbles:true,cancelable:true});
  assert.deepEqual(await p.evaluate(()=>[backgroundKeys,backgroundWheel,document.querySelector('#backgroundEditor').value]),[0,0,'background draft']);
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  assert.equal(await p.evaluate(()=>document.querySelector('#backgroundEditor').inert),false);
  console.log(name+' PASS letter default, hidden-paste-focus Command undo/redo, native undo, background isolation and wheel capture');
  await launch(p);assert.equal(await p.locator('.qbDrawSwatch').count(),9);let map=await mapping(p);
  await p.locator('[data-tool=rect]').click();map=await mapping(p);await drag(p,map,[[100,100],[340,220]]);
  await p.locator('[data-tool=lasso]').click();await drag(p,map,[[100,160],[180,200]]);
  await p.getByRole('button',{name:'↶ 元に戻す',exact:true}).click();await p.getByRole('button',{name:'↷ やり直す',exact:true}).click();
  await p.locator('[data-tool=marker]').click();await p.getByRole('button',{name:'青',exact:true}).click();map=await mapping(p);await drag(p,map,[[100,280],[400,280]]);
  await p.locator('[data-tool=pen]').click();await p.getByRole('button',{name:'緑',exact:true}).click();map=await mapping(p);await drag(p,map,[[100,340],[200,340],[250,380]]);
  await p.locator('[data-tool=arrow]').click();await p.getByRole('button',{name:'オレンジ',exact:true}).click();map=await mapping(p);await drag(p,map,[[100,440],[400,440]]);
  await p.locator('[data-tool=text]').click();map=await mapping(p);const t=map(120,500);await p.mouse.click(t.x,t.y);await p.getByRole('textbox',{name:'画像に入れる文字'}).fill('日本語の追記');
  await p.screenshot({path:path.join(resultsDir,name+'-annotation.png')});
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>window.drawResult instanceof Blob);const out=await pixels(p,[[180,140],[220,180],[100,100],[200,280],[160,340],[200,440]]);
  assert.deepEqual([out.width,out.height,out.type],[800,600,'image/png']);assert.ok(out.colors[0][0]>180&&out.colors[0][1]<100);assert.deepEqual(out.colors[1],[255,255,255,255]);assert.deepEqual(out.colors[2],[255,255,255,255]);assert.ok(out.colors[3][2]>220&&out.colors[3][0]>150&&out.colors[3][0]<220);assert.ok(out.colors[4][1]>110&&out.colors[4][0]<60);assert.ok(out.colors[5][0]>220&&out.colors[5][1]<170);
  console.log(name+' PASS transparent arbitrary rectangle, move/undo/redo, translucent marker, handwriting, arrow, Japanese text, flattened PNG');
  // Even an already selected rectangle must leave its interior available to the mouse marker.
  await launch(p);await p.locator('[data-tool=rect]').click();map=await mapping(p);await drag(p,map,[[100,100],[600,400]]);
  await p.locator('[data-tool=lasso]').click();map=await mapping(p);const edge=map(100,250);await p.mouse.click(edge.x,edge.y);
  await p.locator('[data-tool=marker]').click();await p.getByRole('button',{name:'青',exact:true}).click();map=await mapping(p);await drag(p,map,[[200,250],[500,250]]);
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const inside=await pixels(p,[[300,250],[100,250],[600,250],[300,180]]);
  assert.ok(inside.colors[0][2]>220&&inside.colors[0][0]>150&&inside.colors[0][0]<220,'interior receives marker');
  for(const i of [1,2])assert.ok(inside.colors[i][0]>180&&inside.colors[i][1]<100,'rectangle remains in place');
  assert.deepEqual(inside.colors[3],[255,255,255,255]);console.log(name+' PASS selected rectangle border moves, interior accepts marker ink');
  await penAndShapes(p,name);
  await straightMarker(p,name);
  await marginsAndPaste(p,name);
  await launch(p);map=await mapping(p);
  // Add an image through the clipboard, crop in a separate dialog, then resize/move it.
  await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d');x.fillStyle='#2463d3';x.fillRect(0,0,120,80);const b=await new Promise(r=>c.toBlob(r));const d=new DataTransfer();d.items.add(new File([b],'added.png',{type:'image/png'}));document.querySelector('.qbDrawCanvas').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}))});
  await p.waitForFunction(()=>document.querySelector('.qbDrawStatus').textContent.includes('画像を追加しました'));
  await p.getByRole('button',{name:'選択画像をトリミング',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.qbCropSave')?.disabled===false);
  await p.evaluate(()=>document.querySelector('.qbCropImage').cropper.setData({x:20,y:0,width:60,height:80}));await p.locator('.qbCropSave').click();await p.locator('.qbCropModal').waitFor({state:'detached'});
  map=await mapping(p);await drag(p,map,[[370,300],[650,150]]);await drag(p,map,[[680,190],[710,230]]);
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>window.drawResult instanceof Blob);const pasted=await pixels(p,[[660,150],[400,300]]);assert.ok(pasted.colors[0][2]>170&&pasted.colors[0][0]<70);assert.deepEqual(pasted.colors[1],[255,255,255,255]);
  console.log(name+' PASS image paste, separate crop, movement and aspect-preserving resize');
  await launch(p);
  await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#2463d3';ctx.fillRect(0,0,120,80);const b=await new Promise(r=>c.toBlob(r));const d=new DataTransfer();d.items.add(new File([b],'blue.png',{type:'image/png'}));document.querySelector('.qbDrawCanvas').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}))});
  await p.waitForFunction(()=>document.querySelector('.qbDrawStatus').textContent.includes('画像を追加しました'));
  await p.locator('[data-tool=pen]').click();map=await mapping(p);await drag(p,map,[[380,300],[430,300]]);
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const ink=await pixels(p,[[350,270],[450,330],[400,300],[480,300]]);
  for(const i of [0,1])assert.deepEqual(ink.colors[i],[36,99,211,255],'pasted image stays in place');
  assert.ok(ink.colors[2][0]>180&&ink.colors[2][1]<110,'mouse pen draws on pasted image');assert.deepEqual(ink.colors[3],[255,255,255,255]);
  console.log(name+' PASS mouse pen writes over pasted image without dragging it');
  for(const viewport of [{width:390,height:844},{width:1024,height:768},{width:844,height:390},{width:1366,height:900}]){
    await p.setViewportSize(viewport);await launch(p);const a=await p.locator('.qbDrawSave').boundingBox(),stage=await p.locator('.qbDrawStage').boundingBox();assert.ok(a.y>=0&&a.y+a.height<=viewport.height+1&&a.x+a.width<=viewport.width+1);assert.ok(stage.height>60);await p.screenshot({path:path.join(resultsDir,name+'-layout-'+viewport.width+'.png')});
    await p.locator('.qbDrawModal').getByRole('button',{name:'キャンセル',exact:true}).click();await p.waitForFunction(()=>window.drawResult===null);
  }
  // Pencil input draws; simultaneous palm touches must not create marks.
  await p.setViewportSize({width:1024,height:900});await launch(p);map=await mapping(p);const a=map(120,120),b=map(280,120),palm=map(400,300);
  await p.evaluate(({a,b,palm})=>{const c=document.querySelector('.qbDrawCanvas'),event=(type,id,kind,point)=>c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:kind,button:0,buttons:type==='pointerup'?0:1,clientX:point.x,clientY:point.y}));event('pointerdown',41,'pen',a);event('pointerdown',42,'touch',palm);event('pointerdown',43,'touch',{x:palm.x+30,y:palm.y});event('pointermove',41,'pen',b);event('pointerup',43,'touch',{x:palm.x+30,y:palm.y});event('pointerup',42,'touch',palm);event('pointerup',41,'pen',b)}, {a,b,palm});
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>window.drawResult instanceof Blob);const pen=await pixels(p,[[180,120],[400,300]]);assert.ok(pen.colors[0][0]>180&&pen.colors[0][1]<100);assert.deepEqual(pen.colors[1],[255,255,255,255]);assert.deepEqual(errors,[]);await p.close();
  console.log(name+' PASS phone/tablet/landscape layout, pointer pencil input and concurrent palm-touch isolation');
}
async function penAndShapes(p,name){
  await launch(p);
  const mode=p.getByRole('combobox',{name:'ペンの描き方',exact:true});
  assert.equal(await mode.inputValue(),'freehand');await mode.selectOption('straight');
  let map=await mapping(p);await drag(p,map,[[100,100],[180,240],[300,200]]);
  await mode.selectOption('horizontal');map=await mapping(p);await drag(p,map,[[400,280],[300,400],[100,350]]);
  await mode.selectOption('vertical');map=await mapping(p);
  await p.evaluate(({a,b})=>{const c=document.querySelector('.qbDrawCanvas');for(const [type,pt] of [['pointerdown',a],['pointerup',b]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:81,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,clientX:pt.x,clientY:pt.y}))},{a:map(550,450),b:map(650,120)});
  await p.getByRole('button',{name:'↶ 元に戻す',exact:true}).click();await p.getByRole('button',{name:'↷ やり直す',exact:true}).click();
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const out=await pixels(p,[[200,150],[180,240],[250,280],[250,330],[550,280],[600,280]]);
  for(const i of [0,2,4])assert.ok(out.colors[i][0]>180&&out.colors[i][1]<110,'opaque constrained pen');
  for(const i of [1,3,5])assert.deepEqual(out.colors[i],[255,255,255,255]);
  await launch(p,false);assert.equal(await mode.inputValue(),'vertical');
  await p.locator('[data-tool=marker]').click();assert.equal(await p.getByRole('combobox',{name:'マーカーの描き方',exact:true}).inputValue(),'freehand');
  await p.locator('[data-tool=pen]').click();assert.equal(await mode.inputValue(),'vertical');await mode.selectOption('freehand');assert.ok(await p.getByRole('slider',{name:'手ぶれ補正',exact:true}).isVisible());
  await p.locator('[data-tool=circle]').click();map=await mapping(p);await drag(p,map,[[280,280],[100,180]]);
  await p.locator('[data-tool=ellipse]').click();map=await mapping(p);await drag(p,map,[[400,100],[700,220]]);
  await p.getByRole('button',{name:'↶ 元に戻す',exact:true}).click();await p.getByRole('button',{name:'↷ やり直す',exact:true}).click();
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const shapes=await pixels(p,[[190,100],[100,190],[190,280],[280,190],[190,190],[550,100],[400,160],[550,220],[700,160],[550,160],[400,100]]);
  for(const i of [0,1,2,3,5,6,7,8])assert.ok(shapes.colors[i][0]>180&&shapes.colors[i][1]<110,'round outline');
  for(const i of [4,9,10])assert.deepEqual(shapes.colors[i],[255,255,255,255],'hollow center and ellipse corner');
  await launch(p,false);assert.equal(await p.locator('[data-tool=ellipse]').getAttribute('aria-pressed'),'true');
  await p.locator('.qbDrawModal').getByRole('button',{name:'キャンセル',exact:true}).click();await p.waitForFunction(()=>drawResult===null);
  console.log(name+' PASS pen line modes, independent preferences, Pencil release, circle/ellipse PNG outlines and undo/redo');
}
async function marginsAndPaste(p,name){
  await p.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,800,600);x.fillStyle='#22b8dc';x.fillRect(40,40,80,80);localStorage.setItem('qb-image-editor-settings-v1','{}');window.drawResult=undefined;QBImageEditor.open(c.toDataURL()).then(b=>window.drawResult=b)});
  await p.waitForFunction(()=>document.querySelector('.qbDrawSave')?.disabled===false);
  await p.locator('[data-tool=rect]').click();let map=await mapping(p);await drag(p,map,[[160,160],[260,240]]);
  if(name.toLowerCase()==='chromium')await p.context().grantPermissions(['clipboard-read','clipboard-write']);
  await p.evaluate(async native=>{const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d');x.fillStyle='#2463d3';x.fillRect(0,0,120,80);window.pasteTestBlob=await new Promise(r=>c.toBlob(r));if(native)await navigator.clipboard.write([new ClipboardItem({'image/png':pasteTestBlob})])},name.toLowerCase()==='chromium');
  // Exercise both non-editable focus locations. Chromium uses the real clipboard.
  for(const selector of ['.qbDrawCanvas','[data-tool=rect]']){
    await p.locator(selector).focus();
    if(name.toLowerCase()==='chromium')await p.keyboard.press('Control+v');
    else await p.evaluate(()=>{document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'v',metaKey:true,bubbles:true,cancelable:true}));if(!document.activeElement.classList.contains('qbDrawPasteTarget'))throw Error('Paste receiver was not focused');const d=new DataTransfer();d.items.add(new File([pasteTestBlob],'pasted.png',{type:'image/png'}));document.activeElement.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}))});
    await p.waitForFunction(()=>document.querySelector('.qbDrawStatus').textContent.includes('画像を追加しました'));
    // Move each image away from the paste position so a duplicate insertion is visible.
    map=await mapping(p);await drag(p,map,[[400,300],[600,400]]);
    if(selector==='.qbDrawCanvas')await p.getByRole('button',{name:'↶ 元に戻す',exact:true}).click();
    if(selector==='.qbDrawCanvas')await p.getByRole('button',{name:'↶ 元に戻す',exact:true}).click();
  }
  await p.getByRole('button',{name:'左に余白',exact:true}).click();await p.getByRole('button',{name:'上に余白',exact:true}).click();
  for(let i=0;i<2;i++)await p.getByRole('button',{name:'↶ 元に戻す',exact:true}).click();
  for(let i=0;i<2;i++)await p.getByRole('button',{name:'↷ やり直す',exact:true}).click();
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const out=await pixels(p,[[100,400],[400,100],[280,330],[360,450],[800,650],[600,550]]);
  assert.deepEqual([out.width,out.height],[1000,850]);
  for(const i of [0,1,5])assert.deepEqual(out.colors[i],[255,255,255,255],'new margin or vacated image position must stay white');
  assert.deepEqual(out.colors[2],[34,184,220,255],'base image shifts with margins');
  assert.ok(out.colors[3][0]>180&&out.colors[3][1]<100,'rectangle shifts with base');
  assert.deepEqual(out.colors[4],[36,99,211,255],'pasted image shifts with base');
  console.log(name+' PASS left/top margins preserve base, annotations and pasted images; undo/redo; keyboard paste from canvas and toolbar');
}
async function straightMarker(p,name){
  await launch(p);await p.locator('[data-tool=marker]').click();
  const mode=p.getByRole('combobox',{name:'マーカーの描き方',exact:true});
  assert.equal(await mode.inputValue(),'freehand');await mode.selectOption('straight');
  assert.equal(await p.getByRole('slider',{name:'手ぶれ補正',exact:true}).isVisible(),false);
  let map=await mapping(p);
  await drag(p,map,[[100,100],[250,200],[400,100]]);
  await drag(p,map,[[100,300],[180,500],[400,450]]);
  await p.getByRole('button',{name:'↶ 元に戻す',exact:true}).click();await p.getByRole('button',{name:'↷ やり直す',exact:true}).click();
  // The release point must be used even without a final pointermove (Pencil/touch).
  await p.evaluate(({a,b,c})=>{const canvas=document.querySelector('.qbDrawCanvas');for(const [type,pt] of [['pointerdown',a],['pointermove',b],['pointerup',c]])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:61,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,clientX:pt.x,clientY:pt.y}))},{a:map(500,100),b:map(650,200),c:map(700,100)});
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const out=await pixels(p,[[250,100],[250,200],[250,375],[180,500],[600,100],[650,200]]);
  for(const i of [0,2,4])assert.ok(out.colors[i][0]>240&&out.colors[i][1]>140&&out.colors[i][1]<230,'straight translucent marker');
  for(const i of [1,3,5])assert.deepEqual(out.colors[i],[255,255,255,255],'intermediate pointer path must not remain');
  await launch(p,false);assert.equal(await mode.inputValue(),'straight');
  await mode.selectOption('freehand');assert.ok(await p.getByRole('slider',{name:'手ぶれ補正',exact:true}).isVisible());
  await p.getByRole('spinbutton',{name:'手ぶれ補正の数値',exact:true}).fill('0');map=await mapping(p);
  await drag(p,map,[[100,100],[250,200],[400,100]]);
  await mode.selectOption('straight');await p.locator('[data-tool=pen]').click();assert.equal(await mode.isVisible(),false);
  await p.getByRole('spinbutton',{name:'手ぶれ補正の数値',exact:true}).fill('0');map=await mapping(p);
  await drag(p,map,[[100,300],[250,400],[400,300]]);
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const free=await pixels(p,[[250,200],[250,100],[250,400],[250,300]]);
  assert.ok(free.colors[0][1]<230);assert.ok(free.colors[2][1]<110);
  for(const i of [1,3])assert.deepEqual(free.colors[i],[255,255,255,255]);
  console.log(name+' PASS straight marker endpoints, diagonal lines, undo/redo, saved preference, freehand switch and independent pen');
  await launch(p);await p.locator('[data-tool=marker]').click();await mode.selectOption('horizontal');map=await mapping(p);
  await drag(p,map,[[400,120],[300,250],[100,220]]);
  await mode.selectOption('vertical');map=await mapping(p);
  await drag(p,map,[[550,450],[700,250],[650,120]]);
  // Axis constraints also apply to release-only movement from Pencil input.
  await p.evaluate(({a,b})=>{const c=document.querySelector('.qbDrawCanvas');for(const [type,pt] of [['pointerdown',a],['pointerup',b]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:71,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,clientX:pt.x,clientY:pt.y}))},{a:map(200,300),b:map(300,500)});
  await p.getByRole('button',{name:'↶ 元に戻す',exact:true}).click();await p.getByRole('button',{name:'↷ やり直す',exact:true}).click();
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const axes=await pixels(p,[[250,120],[250,170],[550,280],[600,280],[200,400],[250,400]]);
  for(const i of [0,2,4])assert.ok(axes.colors[i][0]>240&&axes.colors[i][1]>140&&axes.colors[i][1]<230,'axis constrained marker');
  for(const i of [1,3,5])assert.deepEqual(axes.colors[i],[255,255,255,255],'diagonal path must not remain');
  await launch(p,false);assert.equal(await mode.inputValue(),'vertical');await mode.selectOption('horizontal');
  await p.locator('.qbDrawModal').getByRole('button',{name:'キャンセル',exact:true}).click();await p.waitForFunction(()=>drawResult===null);
  await launch(p,false);assert.equal(await mode.inputValue(),'horizontal');
  await p.locator('.qbDrawModal').getByRole('button',{name:'キャンセル',exact:true}).click();await p.waitForFunction(()=>drawResult===null);
  console.log(name+' PASS horizontal and vertical marker constraints in both drag directions, Pencil release, undo/redo and remembered modes');
}
async function augment(p){
  await p.route('blob:**',r=>r.continue());
  await p.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,600);x.fillStyle='#22b8dc';x.fillRect(40,40,160,100);window.testImage=await new Promise(r=>c.toBlob(r));window.testObjects=new Map();window.testRemoved=[];
    const base=qbSupabase.storage.from.bind(qbSupabase.storage);qbSupabase.storage.from=bucket=>({...base(bucket),download:async p=>({data:testObjects.get(p)||testImage,error:null}),upload:async(path,blob)=>{if(window.testUploadFailure)return{error:{message:'fixture upload failure'}};testObjects.set(path,blob);testUploads++;return{data:{path},error:null}},remove:async paths=>{testRemoved.push(...paths);paths.forEach(p=>testObjects.delete(p));return{error:null}}});
  });await install(p,true);
}
async function paste(p,selector,image=true){
  await p.locator(selector).first().evaluate((n,image)=>{n.focus();const d=new DataTransfer();if(image)d.items.add(new File([window.testImage],'clipboard.png',{type:'image/png'}));else d.setData('text/plain','テキスト貼付');n.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}))},image);
}
async function confirm(p){await p.locator('.qbDrawSave').click();await p.locator('.qbDrawModal').waitFor({state:'detached'})}
async function pasteAndWait(p,selector,note=false){const before=await p.evaluate(note=>(note?testDB.user_note_images:testDB.question_images).length,note);await paste(p,selector);await p.waitForFunction(({before,note})=>(note?testDB.user_note_images:testDB.question_images).length===before+1,{before,note});assert.equal(await p.locator('.qbDrawModal').count(),0)}
async function integration(browser,name){
  const {page:p,errors}=await fixture.exports.boot(browser);await augment(p);
  await p.locator('.qbPublicImageWrap .qbImageWriteActions').first().waitFor({state:'attached'});assert.equal(await p.locator('.qbPublicImageWrap .qbImageWriteActions').first().isVisible(),true);await p.locator('[data-ade-v2="overview"]').click();await p.locator('.qbInlineRich').waitFor();assert.equal(await p.locator('.qbPublicImageWrap').first().getByRole('button',{name:'トリミング',exact:true}).count(),0);assert.ok(await p.locator('.qbPublicImageWrap').first().getByRole('button',{name:'画像編集',exact:true}).isVisible());assert.equal(await p.locator('.qbDrawModal').count(),0);await p.locator('.qbInlineCancel').click();assert.equal(await p.locator('.qbPublicImageWrap .qbImageWriteActions').first().isVisible(),true);
  const readingImage=p.locator('.qbPublicImageWrap').first();await readingImage.getByRole('button',{name:'画像編集',exact:true}).click();await p.locator('.qbDrawSave:enabled').waitFor();await p.locator('.qbDrawCropAll').click();await p.locator('.qbCropCancel').click();await p.locator('.qbDrawClose').click();await p.locator('.qbDrawModal').waitFor({state:'detached'});assert.equal(await p.locator('.qbInlineRich').count(),0);
  await p.locator('.qbExportButton').waitFor();assert.equal(await p.evaluate(()=>document.querySelector('.adeStemToolbar').firstElementChild.className),'qbExportButton');
  await p.waitForFunction(()=>{const stem=document.querySelector('#view > .card > .qtext'),bar=document.querySelector('.adeStemToolbar'),images=document.querySelector('.qsiHost');return stem&&bar&&images&&(stem.compareDocumentPosition(bar)&4)&&(bar.compareDocumentPosition(images)&4)});
  const referenceBefore=await p.evaluate(()=>JSON.stringify(testDB));await launch(p);const refMap=await mapping(p);await drag(p,refMap,[[100,300],[400,300]]);
  await p.getByRole('button',{name:'問題・解答を表示',exact:true}).click();await p.locator('.qbDrawReference img').waitFor();await p.waitForFunction(()=>document.querySelector('.qbDrawReference img')?.naturalWidth>0);assert.ok(await p.locator('.qbDrawCanvas').isVisible());assert.equal(await p.evaluate(()=>JSON.stringify(testDB)),referenceBefore);
  await p.getByRole('button',{name:'問題・解答を隠す',exact:true}).click();await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);const retained=await pixels(p,[[200,300]]);assert.ok(retained.colors[0][0]>180&&retained.colors[0][1]<110);console.log(name+' PASS reference question/answer opens beside canvas, retains ink, and does not write records');
  await p.locator('[data-ade-v2="overview"]').click();await p.locator('.qbInlineRich').waitFor();await paste(p,'.qbInlineRich',false);const draft=await p.locator('.qbInlineRich').textContent();assert.ok(draft.includes('テキスト貼付'));
  const before=await p.evaluate(()=>testDB.question_images.length);await paste(p,'.qbInlineRich');await p.waitForFunction(n=>testDB.question_images.length===n+1,before);assert.equal(await p.locator('.qbDrawModal').count(),0);assert.equal(await p.locator('.qbInlineRich').textContent(),draft);
  let added=await p.evaluate(()=>testDB.question_images.at(-1));assert.equal(added.placement,'explanation_overview');assert.equal(added.original_image_path,null);assert.equal(await p.evaluate(()=>testWrites.filter(w=>w.table==='questions').length),0);
  await p.locator('.qbInlineCancel').click();
  await p.locator('.adeStemBtn').click();await p.locator('.qbInlineRich').waitFor();await pasteAndWait(p,'.qbInlineRich');added=await p.evaluate(()=>testDB.question_images.at(-1));assert.equal(added.placement,'question');assert.equal(added.question_id,'q1');await p.locator('.qbInlineCancel').click();
  await p.locator('[data-ade-v2="choice-c1"]').click();await p.locator('[data-ade-v2-editor="choice-c1"]').waitFor();await pasteAndWait(p,'[data-ade-v2-editor="choice-c1"] .qbInlineRich');added=await p.evaluate(()=>testDB.question_images.at(-1));assert.equal(added.choice_id,'c1');assert.equal(added.placement,'choice_explanation');await p.locator('[data-ade-v2-editor="choice-c1"] .adeCancel').click();
  console.log(name+' PASS image clipboard routes to overview, stem and choice; text paste and cancelled/unsaved drafts are retained');
  const writeTarget=p.locator('.qbPublicImageWrap').first(),writeId=await writeTarget.getAttribute('data-row');
  const beforeWrite=await p.evaluate(id=>testDB.question_images.find(r=>r.id===id).image_path,writeId);
  await writeTarget.getByRole('button',{name:'画像編集',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.qbDrawSave')?.disabled===false);
  const writeMap=await mapping(p);await drag(p,writeMap,[[300,200],[500,200]]);await confirm(p);
  const written=await p.evaluate(id=>testDB.question_images.find(r=>r.id===id),writeId);
  assert.equal(written.annotation_base_image_path,beforeWrite);assert.equal(written.annotation_result_image_path,written.image_path);assert.notEqual(written.image_path,beforeWrite);
  console.log(name+' PASS public write button saves exact before-annotation provenance');
  const storage=await p.evaluate(async()=>{
    const c={sb:qbSupabase,bucket:'question-media',questionId:'q1',placement:'question',choiceId:null,host:document.querySelector('.qtext')},old=await QBImageStore.get(c,'stem-image'),row=await QBImageStore.replace(c,old,testImage),latest=await QBImageStore.get(c,'stem-image');
    let conflict=false;try{await QBImageStore.replace(c,old,testImage)}catch(e){conflict=e.message.includes('別の画像更新')}
    await QBImageStore.restore(c,latest);const restored=await QBImageStore.get(c,'stem-image');
    window.testUploadFailure=true;let failure=false;try{await QBImageStore.replace(c,restored,testImage)}catch(e){failure=e.message.includes('fixture upload failure')}window.testUploadFailure=false;
    return{old,row,restored,conflict,failure,unchanged:(await QBImageStore.get(c,'stem-image')).image_path===restored.image_path,removed:testRemoved};
  });assert.equal(storage.row.original_image_path,storage.old.image_path);assert.equal(storage.restored.image_path,storage.old.image_path);assert.ok(storage.conflict&&storage.failure&&storage.unchanged);assert.deepEqual(storage.removed,[]);
  console.log(name+' PASS original retained/restored, stale image conflict rejected, failed upload leaves original untouched');
  const provenance=await p.evaluate(async()=>{
    const c={sb:qbSupabase,bucket:'question-media',questionId:'q1',placement:'question',choiceId:null,host:document.querySelector('.qtext')};
    const current=()=>QBImageStore.get(c,'stem-image');
    await QBImageStore.replace(c,await current(),testImage);const cropped=await current();
    await QBImageStore.replace(c,cropped,testImage,'annotation');const first=await current();
    await QBImageStore.replace(c,first,testImage,'annotation');const second=await current();
    await QBImageStore.replace(c,second,testImage);const recropped=await current();
    await QBImageStore.replace(c,recropped,testImage,'annotation');const third=await current();
    // An old client changes only image_path. The next annotation must discard stale provenance.
    testDB.question_images.find(r=>r.id==='stem-image').image_path='old-client-crop.png';
    await QBImageStore.replace(c,await current(),testImage,'annotation');const afterLegacy=await current();
    await QBImageStore.restore(c,afterLegacy);return{cropped,first,second,recropped,third,afterLegacy,restored:await current()};
  });
  assert.equal(provenance.first.annotation_base_image_path,provenance.cropped.image_path);
  assert.equal(provenance.first.annotation_result_image_path,provenance.first.image_path);
  assert.equal(provenance.second.annotation_base_image_path,provenance.cropped.image_path);
  assert.equal(provenance.second.annotation_result_image_path,provenance.second.image_path);
  assert.equal(provenance.recropped.annotation_base_image_path,null);assert.equal(provenance.recropped.annotation_result_image_path,null);
  assert.equal(provenance.third.annotation_base_image_path,provenance.recropped.image_path);
  assert.equal(provenance.afterLegacy.annotation_base_image_path,'old-client-crop.png');
  assert.equal(provenance.restored.annotation_base_image_path,null);assert.equal(provenance.restored.annotation_result_image_path,null);
  console.log(name+' PASS annotation retains post-crop base across writes; subsequent crop, legacy writes and restore invalidate old provenance');

  await p.locator('[data-ade-v2="overview"]').click();await p.locator('.qbInlineRich').waitFor();
  await p.evaluate(()=>{window.Sortable=class{constructor(container,options){container.testSortOptions=options}}});await p.addScriptTag({content:read('image-sortable-v1.js')});
  await p.waitForFunction(()=>[...document.querySelectorAll('.qbMediaHostV2')].some(g=>g.querySelectorAll('.qbPublicImageWrap').length>1&&g.testSortOptions));
  const reordered=await p.evaluate(async()=>{const g=[...document.querySelectorAll('.qbMediaHostV2')].find(g=>g.querySelectorAll('.qbPublicImageWrap').length>1&&g.testSortOptions),last=g.querySelector('.qbPublicImageWrap:last-child'),id=last.dataset.row;g.prepend(last);await g.testSortOptions.onEnd();return testDB.question_images.find(r=>r.id===id).sort_order});assert.equal(reordered,10);
  const deleteId=await p.locator('.qbPublicImageWrap').first().getAttribute('data-row'),publicImage=p.locator('.qbPublicImageWrap[data-row="'+deleteId+'"]');await publicImage.getByRole('button',{name:'削除',exact:true}).waitFor();
  const changedPath=await p.evaluate(async id=>{const w=[...document.querySelectorAll('.qbPublicImageWrap')].find(w=>w.dataset.row===id),c={sb:qbSupabase,bucket:'question-media',questionId:'q1',placement:w.dataset.placement,choiceId:w.dataset.choice||null,host:w},row=await QBImageStore.get(c,id),changed=await QBImageStore.replace(c,row,testImage);QBImageIntegration.notify('q1',c.placement,c.choiceId);return changed.image_path},deleteId);
  await publicImage.getByRole('button',{name:'元画像に戻す',exact:true}).waitFor();p.once('dialog',d=>d.dismiss());await publicImage.getByRole('button',{name:'元画像に戻す',exact:true}).click();assert.equal(await p.evaluate(id=>testDB.question_images.find(r=>r.id===id).image_path,deleteId),changedPath);
  p.once('dialog',d=>d.accept());await publicImage.getByRole('button',{name:'元画像に戻す',exact:true}).click();await p.waitForFunction(id=>{const r=testDB.question_images.find(r=>r.id===id);return r.image_path===r.original_image_path},deleteId);
  await publicImage.getByRole('button',{name:'元画像に戻す',exact:true}).waitFor({state:'detached'});
  p.once('dialog',d=>{assert.equal(d.type(),'confirm');d.dismiss()});await publicImage.getByRole('button',{name:'削除',exact:true}).click();assert.ok(await p.evaluate(id=>testDB.question_images.some(r=>r.id===id),deleteId));
  p.once('dialog',d=>d.accept());await publicImage.getByRole('button',{name:'削除',exact:true}).click();await p.waitForFunction(id=>!testDB.question_images.some(r=>r.id===id),deleteId);assert.deepEqual(await p.evaluate(()=>testRemoved),[]);
  console.log(name+' PASS inline official reorder and confirmed deletion; cancellation and shared storage are preserved');
  await p.locator('.qbInlineCancel').click();
  assert.deepEqual(errors,[]);const db=await p.evaluate(()=>testDB);await p.close();
  const user=await fixture.exports.boot(browser,{role:'user',db});const u=user.page;await augment(u);await u.locator('.qbExportButton').waitFor();assert.equal(await u.locator('.adeStemBtn').count(),0);
  const note=u.locator('.qbPersonal').first();await note.locator('.qbNoteImageWrap .qbImageWriteActions').first().waitFor({state:'visible'});assert.equal(await note.locator('.qbNoteEditor').isVisible(),false);assert.equal(await u.locator('.qsiDelete,.qsiCropTool,.qsiImgWrap .qbImageWriteActions').count(),0);await note.locator('.qbPencil').click();await note.locator('textarea').fill('画像追加中のメモ下書き');await pasteAndWait(u,'.qbPersonal .qbNoteEditor textarea',true);assert.equal(await note.locator('textarea').inputValue(),'画像追加中のメモ下書き');assert.equal(await u.evaluate(()=>testDB.user_notes[0].note_text),'以前からの個人メモ');assert.equal(await u.evaluate(()=>testDB.user_note_images.at(-1).note_id),'n1');assert.equal(await u.evaluate(()=>testDB.user_note_images.at(-1).user_id),'u1');
  await note.locator('.qbNoteImageWrap .qbImageWriteActions').first().waitFor();
  assert.equal(await u.locator('.qbPublicImageWrap .qbImageWriteActions').count(),0);assert.ok(await note.locator('.qbNoteImageWrap').first().getByRole('button',{name:'画像編集',exact:true}).isVisible());
  await u.evaluate(()=>{window.Sortable=class{constructor(container,options){container.testSortOptions=options}}});await u.addScriptTag({content:read('image-sortable-v1.js')});
  await u.waitForFunction(()=>document.querySelectorAll('.qbPersonal .qbNoteImageWrap.qbsortNoteItem').length===2);
  assert.equal(await note.locator('.qbNoteImageWrap .qbImageWriteActions').count(),2);
  await note.locator('.qbNoteImageGrid').evaluate(async grid=>{grid.prepend(grid.querySelector('.qbsortNoteItem:last-child'));await grid.testSortOptions.onEnd()});
  assert.equal(await u.evaluate(()=>testDB.user_note_images.at(-1).sort_order),10);
  const personalImage=note.locator('.qbNoteImageWrap').first(),personalId=await personalImage.getAttribute('data-row');u.once('dialog',d=>d.accept());await personalImage.getByRole('button',{name:'削除',exact:true}).click();await u.waitForFunction(id=>!testDB.user_note_images.some(r=>r.id===id),personalId);assert.equal(await note.locator('textarea').inputValue(),'画像追加中のメモ下書き');
  const denied=await u.evaluate(async()=>{try{await QBImageStore.authorize({sb:qbSupabase,bucket:'question-media',questionId:'q1',placement:'question',host:document.querySelector('.qtext')});return false}catch{return true}});assert.ok(denied);
  console.log(name+' PASS personal image save stays private, retains note draft and rejects general-user official edits');
  // Export pixels really render, text never clips, and output does not write app records.
  // Keep the ordinary fixture small enough for full 4800px output; the long case below exercises the pixel cap.
  await u.evaluate(async()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='#22b8dc';x.fillRect(0,0,200,100);window.testImage=await new Promise(r=>c.toBlob(r))});
  const exportResult=await u.evaluate(async()=>{
    const standard=await QBQuestionExport.render(testQ);window.highResolutionWidth=standard.width;const highest=await QBQuestionExport.render(testQ,{width:4800});window.highestResolutionWidth=highest.width;const before=JSON.stringify(testDB),writes=JSON.stringify(testWrites),draw=CanvasRenderingContext2D.prototype.fillText,lines=[];CanvasRenderingContext2D.prototype.fillText=function(text,...rest){lines.push(text);return draw.call(this,text,...rest)};
    const Q=JSON.parse(JSON.stringify(testQ));Q.stem='長文問題\n'.repeat(60)+'問題末尾';Q.choices.push({choice_key:'b',choice_text:'選択肢末尾',is_correct:false,sort_order:2});Q.occ=[{official_answer:'a',academic_year:2019,exam_type:'本試'}];const result=await QBQuestionExport.render(Q,{width:4800});CanvasRenderingContext2D.prototype.fillText=draw;
    const image=await new Promise((resolve,reject)=>{const i=new Image(),url=URL.createObjectURL(result.blob);i.onload=()=>{URL.revokeObjectURL(url);resolve(i)};i.onerror=()=>reject(Error('PNG decode failed: '+JSON.stringify({size:drawResult.size,type:drawResult.type,url:u})));i.src=url});
    return{width:image.width,height:image.height,adjusted:result.adjusted,type:result.blob.type,lines,unchanged:before===JSON.stringify(testDB)&&writes===JSON.stringify(testWrites),nonChoice:QBQuestionExport.answers({answer_mode:'fill_blank',answer_fields:[{key:'A',label:'空欄1'}],occ:[{official_answer:{A:'模範解答',note:'補足情報',IMAGE_REQUIRED:'ignored'}}]})};
  });assert.equal(await u.evaluate(()=>highResolutionWidth),3600);assert.equal(await u.evaluate(()=>highestResolutionWidth),4800);assert.ok(exportResult.adjusted);assert.ok(exportResult.width*exportResult.height<=24000000);assert.ok(exportResult.height<=16384);assert.ok(exportResult.height>4000);assert.equal(exportResult.type,'image/png');assert.ok(exportResult.lines.includes('問題末尾')&&exportResult.lines.includes('b. 選択肢末尾')&&exportResult.lines.includes('a'));assert.ok(exportResult.unchanged);assert.equal(exportResult.nonChoice,'空欄1：模範解答\n補足：補足情報');
  await u.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{window.testCopyType=items[0].types[0];window.testCopyBlob=items[0].data['image/png']}}});window.ClipboardItem=class{constructor(x){this.types=Object.keys(x);this.data=x}};Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false})});
  await u.locator('.qbExportButton').click();await u.getByRole('button',{name:'画像としてコピー',exact:true}).click();assert.equal(await u.evaluate(()=>testCopyType),'image/png');assert.equal(await u.locator('.qbDrawModal').count(),0);
  assert.equal(await u.getByRole('combobox',{name:'出力画質'}).inputValue(),'3600');
  assert.equal(await u.evaluate(async()=>new DataView(await testCopyBlob.arrayBuffer()).getUint32(16)),3600);
  await u.getByRole('combobox',{name:'出力画質'}).selectOption('4800');
  await u.getByRole('button',{name:'画像としてコピー',exact:true}).click();
  assert.equal(await u.evaluate(async()=>new DataView(await testCopyBlob.arrayBuffer()).getUint32(16)),4800);
  const download=u.waitForEvent('download');await u.getByRole('button',{name:'画像として保存',exact:true}).click();const downloaded=await download;assert.match(downloaded.suggestedFilename(),/\.png$/);await downloaded.saveAs(path.join(resultsDir,name+'-question-export.png'));assert.equal(fs.readFileSync(path.join(resultsDir,name+'-question-export.png')).readUInt32BE(16),4800);await u.getByRole('button',{name:'閉じる',exact:true}).click();assert.deepEqual(user.errors,[]);await u.close();
  console.log(name+' PASS independent general-user export, complete long question/options/answers, PNG clipboard and download, no data writes');
}
async function mobileWidth(browser,name){
  const {page:p}=await fixture.exports.boot(browser);await augment(p);
  await p.evaluate(()=>{
    const choices=document.createElement('div');choices.className='choices';
    for(const text of ['コンタクトを装着したまま寝てしまうと、角膜上皮障害による激しい眼痛をきたすことがある。','急性緑内障発作では急激な眼圧上昇による角膜浮腫で眼痛を自覚するのはまれである。','https://example.invalid/'+ 'long-reference-'.repeat(35)]){const b=document.createElement('button');b.className='choice';b.textContent=text;choices.append(b)}
    document.querySelector('#ans').before(choices);
    document.querySelector('.qbPersonalBody').textContent='参考資料：'+ 'https://example.invalid/'+ 'long-reference-'.repeat(35);
  });
  for(const width of [375,390,430,768]){
    await p.setViewportSize({width,height:844});
    const result=await p.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('.choice,.qbPersonal,.qbMediaHostV2')].filter(x=>x.getClientRects().length&&x.getBoundingClientRect().right>document.documentElement.clientWidth+1).map(x=>x.className)}));
    console.log(name+' mobile width '+width+' '+JSON.stringify(result));assert.ok(result.scroll<=result.viewport+1);assert.deepEqual(result.overflow,[]);
  }
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(resultsDir,name+'-mobile-width.png')});await p.close();
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await core(browser,name);await integration(browser,name);await mobileWidth(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
