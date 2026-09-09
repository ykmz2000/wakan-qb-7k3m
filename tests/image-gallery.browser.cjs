'use strict';
// Real viewer, deterministic image lists with the same boundaries as the renderers.
// No live data, network services or image-order writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const stage='.qbImageLightboxStage',counter='.qbImageLightboxCounter';
const svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><rect width="1800" height="1200" fill="#edf3ff"/><path d="M0 0L1800 1200M1800 0L0 1200" stroke="#345" stroke-width="30"/></svg>');
async function ready(p){await p.waitForFunction(()=>{const i=document.querySelector('.qbImageLightboxStage img');return i&&!i.hidden&&i.complete&&i.naturalWidth>0})}
async function count(p,value){assert.equal(await p.locator(counter).textContent(),value)}
async function close(p){await p.locator('.qbImageLightboxClose').click();await p.locator('#qbImageLightbox').waitFor({state:'detached'})}
async function pointer(p,type,x,y,id=1){await p.locator(stage).dispatchEvent(type,{pointerId:id,pointerType:'touch',isPrimary:id===1,button:0,clientX:x,clientY:y,bubbles:true,cancelable:true})}
async function swipe(p,dx,dy=0,cancel=false){
  const box=await p.locator(stage).boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await pointer(p,'pointerdown',x,y);await pointer(p,'pointermove',x+dx/2,y+dy/2);await pointer(p,'pointermove',x+dx,y+dy);await pointer(p,cancel?'pointercancel':'pointerup',x+dx,y+dy);
}
async function run(browser,name){
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>r.abort());
  await p.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#fixture{width:300px}button{font:inherit}</style><main id="fixture"><textarea id="draft">未保存のメモ</textarea></main><div id="alreadyInert" inert></div>');
  await p.evaluate(src=>{
    const f=document.getElementById('fixture');
    const spec=[['stem','qsiGrid','qsiImg',3],['point','qbMediaHostV2','qbMediaImg',3],['choiceA','qbMediaHostV2','qbMediaImg',2],['choiceB','qbMediaHostV2','qbMediaImg',2],['intent','qbMediaHostV2','qbMediaImg',2],['summary','qbMediaHostV2','qbMediaImg',2],['noteA','qbNoteImageGrid','',2],['noteB','qbNoteImageGrid','',2],['editA','oeiGrid','',2],['editB','oeiGrid','',2],['unknown','','qbMediaImg',2],['single','qbMediaHostV2','qbMediaImg',1]];
    for(const [id,cls,imgClass,n] of spec){
      const card=document.createElement('section');card.className=id.startsWith('choice')?'exp':'card';
      const grid=document.createElement('div');grid.id=id;grid.className=cls;card.append(grid);f.append(card);
      for(let i=1;i<=n;i++){
        const wrap=document.createElement('div');wrap.className=id==='stem'?'qsiImgWrap':id.startsWith('note')?'qbsortNoteItem':id.startsWith('edit')?'oeiItem':'entry';wrap.dataset.id=id+'-'+i;
        const img=document.createElement('img');img.src=src;img.alt=id+'-'+i;img.className=imgClass;wrap.append(img);grid.append(wrap);
      }
    }
    // Same card/editor and nested note are still independent groups.
    document.getElementById('choiceA').parentElement.append(document.getElementById('noteA'),document.getElementById('editA'));
    document.getElementById('choiceB').parentElement.append(document.getElementById('noteB'),document.getElementById('editB'));
    document.getElementById('point').append(document.getElementById('single'));
    const point=document.getElementById('point');point.prepend(point.children[2]);
    const hidden=document.createElement('div');hidden.hidden=true;hidden.innerHTML='<img class="qbMediaImg" alt="hidden duplicate">';hidden.firstChild.src=src;point.append(hidden);
    window.originalNodes=[...f.querySelectorAll('img')];window.originalOrder=originalNodes.map(i=>i.alt);window.outsideEscapes=0;
    document.addEventListener('keydown',e=>{if(e.key==='Escape')outsideEscapes++});
  },svg);
  await p.addScriptTag({content:fs.readFileSync(path.join(root,'image-viewer.js'),'utf8')});
  for(const [id,total] of [['stem',3],['point',3],['choiceA',2],['choiceB',2],['intent',2],['summary',2],['noteA',2],['noteB',2],['editA',2],['editB',2]]){
    const images=p.locator('#'+id+' > div:not([hidden]) > img');
    const alts=await images.evaluateAll(xs=>xs.map(x=>x.alt));
    await images.nth(1).click();await ready(p);await count(p,'2 / '+total);
    assert.equal(await p.locator(stage+' img').getAttribute('alt'),alts[1]);
    await p.keyboard.press('End');await ready(p);await count(p,total+' / '+total);
    await p.keyboard.press('ArrowRight');await count(p,total+' / '+total);assert.equal(await p.locator('.qbImageLightboxNext').isDisabled(),true);
    assert.equal(await p.locator(stage+' img').getAttribute('alt'),alts.at(-1));
    await p.keyboard.press('Home');await ready(p);await p.keyboard.press('ArrowLeft');await count(p,'1 / '+total);
    assert.equal(await p.locator(stage+' img').getAttribute('alt'),alts[0]);await close(p);
  }
  console.log(name+' PASS clicked position and displayed order; stem, sections, individual choices, notes and editors never mix');
  for(const id of ['unknown','single']){
    await p.locator('#'+id+' img').first().click();await ready(p);await count(p,'1 / 1');
    assert.equal(await p.locator('.qbImageLightboxNext').isVisible(),false);await p.keyboard.press('ArrowRight');await count(p,'1 / 1');await close(p);
  }
  assert.equal(await p.evaluate(()=>originalNodes.every(i=>i.isConnected)&&JSON.stringify(originalOrder)===JSON.stringify([...document.querySelectorAll('#fixture img')].map(i=>i.alt))),true);
  console.log(name+' PASS unknown groups remain single; source DOM, duplicate URLs and sort order are unchanged');
  await p.locator('#stem img').first().click();await ready(p);await p.waitForTimeout(50);
  await swipe(p,-135);await ready(p);await count(p,'2 / 3');
  await p.locator(stage).dispatchEvent('click');await count(p,'2 / 3');
  await swipe(p,135);await ready(p);await count(p,'1 / 3');
  await swipe(p,135);await count(p,'1 / 3');
  await swipe(p,-135,220);await count(p,'1 / 3');
  await swipe(p,-135,0,true);await count(p,'1 / 3');
  console.log(name+' PASS horizontal touch swipe, end resistance, vertical movement and pointer cancellation; release click does not close');
  await p.locator(stage).dispatchEvent('wheel',{deltaX:70,deltaY:0});
  await ready(p);await count(p,'2 / 3');
  for(let i=0;i<4;i++)await p.locator(stage).dispatchEvent('wheel',{deltaX:60,deltaY:0});
  await count(p,'2 / 3');await p.waitForTimeout(250);
  await p.locator(stage).dispatchEvent('wheel',{deltaX:0,deltaY:120});await count(p,'2 / 3');
  await p.waitForTimeout(250);await p.locator(stage).dispatchEvent('wheel',{deltaX:0,deltaY:-70,shiftKey:true});await ready(p);await count(p,'1 / 3');
  console.log(name+' PASS trackpad/wheel sends one image per horizontal gesture and ignores vertical scrolling');
  const b=await p.locator(stage).boundingBox(),cx=b.x+b.width/2,cy=b.y+b.height/2;
  await pointer(p,'pointerdown',cx-40,cy,1);await pointer(p,'pointerdown',cx+40,cy,2);
  await pointer(p,'pointermove',cx-100,cy,1);await pointer(p,'pointermove',cx+100,cy,2);
  assert.equal(await p.locator(stage).getAttribute('data-zoomed'),'true');
  await pointer(p,'pointerup',cx+100,cy,2);
  const transform=await p.locator(stage+' img').getAttribute('style');
  await pointer(p,'pointermove',cx-160,cy,1);assert.equal(await p.locator(stage+' img').getAttribute('style'),transform);
  await pointer(p,'pointerup',cx-160,cy,1);await count(p,'1 / 3');
  await swipe(p,-100);await count(p,'1 / 3');assert.notEqual(await p.locator(stage+' img').getAttribute('style'),transform);
  await p.locator(stage).dispatchEvent('wheel',{deltaX:120,deltaY:0});await count(p,'1 / 3');
  await p.keyboard.press('ArrowRight');await count(p,'1 / 3');
  await p.locator('.qbImageLightboxReset').click();assert.equal(await p.locator(stage).getAttribute('data-zoomed'),'false');
  // Touch double-tap must not be undone by its subsequent native dblclick.
  for(let i=0;i<2;i++){await pointer(p,'pointerdown',cx,cy);await pointer(p,'pointerup',cx,cy)}
  assert.equal(await p.locator(stage).getAttribute('data-zoomed'),'true');
  await p.locator(stage+' img').dispatchEvent('dblclick');assert.equal(await p.locator(stage).getAttribute('data-zoomed'),'true');
  await p.locator('.qbImageLightboxNext').click();await ready(p);await count(p,'2 / 3');assert.equal(await p.locator(stage).getAttribute('data-zoomed'),'false');
  console.log(name+' PASS pinch and pan take priority, remaining finger is guarded, double-tap works and explicit next resets zoom');
  for(const viewport of [{width:320,height:568},{width:844,height:390},{width:1024,height:768},{width:1366,height:900}]){
    await p.setViewportSize(viewport);await p.waitForTimeout(50);
    const controls=await p.locator('#qbImageLightbox button:visible').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}));
    for(const r of controls){assert.ok(r.w>=44&&r.h>=44);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=viewport.width+.5&&r.y+r.h<=viewport.height+.5,JSON.stringify({viewport,r}))}
    const fit=await p.locator(stage+' img').boundingBox(),area=await p.locator(stage).boundingBox();assert.ok(fit.width<=area.width+.5&&fit.height<=area.height+.5);
  }
  console.log(name+' PASS phone, landscape, tablet and desktop retain fitted images and reachable 44px controls');
  await close(p);await p.evaluate(()=>{
    document.getElementById('draft').focus();document.documentElement.style.setProperty('overflow','auto','important');document.body.style.overflow='scroll';window.beforeScroll=scrollY;
    document.querySelector('#stem img').click();
  });await ready(p);
  assert.equal(await p.locator('#fixture').evaluate(e=>e.inert),true);
  for(let i=0;i<10;i++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>!!document.activeElement.closest('#qbImageLightbox')),true)}
  await p.keyboard.press('Escape');
  assert.deepEqual(await p.evaluate(()=>({draft:document.getElementById('draft').value,focus:document.activeElement.id,inert:document.getElementById('fixture').inert,other:document.getElementById('alreadyInert').inert,html:document.documentElement.style.overflow,priority:document.documentElement.style.getPropertyPriority('overflow'),body:document.body.style.overflow,escapes:outsideEscapes,scroll:scrollY===beforeScroll})),{draft:'未保存のメモ',focus:'draft',inert:false,other:true,html:'auto',priority:'important',body:'scroll',escapes:0,scroll:true});
  console.log(name+' PASS Escape and focus trap affect only the viewer; draft, focus, scroll and existing inert/overflow states are restored');
  await p.locator('#stem img').first().click();await ready(p);await p.evaluate(()=>dispatchEvent(new CustomEvent('qb-screen-change')));assert.equal(await p.locator('#qbImageLightbox').count(),0);
  await p.evaluate(()=>{document.querySelector('#stem img').src='data:image/png;base64,invalid'});
  // currentSrc still points at the previous displayed image in the same task.
  // Wait for the replacement to fail before opening the failed image itself.
  await p.waitForFunction(()=>{const i=document.querySelector('#stem img');return i.complete&&i.naturalWidth===0});
  await p.evaluate(()=>document.querySelector('#stem img').click());
  await p.locator('.qbImageLightboxRetry').waitFor();await count(p,'1 / 3');await p.locator('.qbImageLightboxNext').click();await ready(p);await count(p,'2 / 3');await close(p);
  console.log(name+' PASS screen change closes the old group; failed images retain navigation and retry controls');
  if(name==='Chromium'){
    await p.setViewportSize({width:390,height:844});await p.locator('#point > div > img').first().click();await ready(p);await p.waitForTimeout(60);
    const session=await ctx.newCDPSession(p),area=await p.locator(stage).boundingBox(),x=area.x+area.width*.7,y=area.y+area.height/2;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=5;step++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-step*30,y}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await ready(p);await count(p,'2 / 3');await close(p);await session.detach();
    console.log(name+' PASS native browser touch delivery, pointer capture and release navigate exactly once');
  }
  assert.deepEqual(errors,[]);await ctx.close();
}
async function integration(browser,name){
  const fixturePath=path.join(__dirname,'inline-stem.browser.cjs'),source=fs.readFileSync(fixturePath,'utf8');
  const end=source.lastIndexOf('(async()=>{for(const [name,type]');assert.ok(end>0);
  const fixture=new Module(fixturePath,module);fixture.filename=fixturePath;fixture.paths=module.paths;
  fixture._compile(source.slice(0,end)+'\nmodule.exports={boot};',fixturePath);
  const {page:p,errors}=await fixture.exports.boot(browser);
  await p.locator('.adeStemBtn').click();const rich=p.locator('.qtext .qbInlineRich');await rich.waitFor();
  await rich.press('End');await p.keyboard.insertText(' 画像を見ても保持する下書き');
  const draft=await rich.textContent(),before=await p.evaluate(()=>JSON.stringify(testDB));
  for(const selector of ['.qsiImg','.qbMediaHostV2 .qbMediaImg','.qbNoteImageGrid img']){
    const first=p.locator(selector).first();await first.click();await p.locator('#qbImageLightbox').waitFor();await p.keyboard.press('ArrowRight');await p.keyboard.press('Escape');
    assert.equal(await rich.textContent(),draft);assert.equal(await p.evaluate(()=>JSON.stringify(testDB)),before);
  }
  await p.locator('.qbInlineCancel').click();assert.deepEqual(errors,[]);await p.close();
  console.log(name+' PASS actual stem, official and private image renderers preserve unsaved rich text and all DB data');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await run(browser,name);await integration(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
