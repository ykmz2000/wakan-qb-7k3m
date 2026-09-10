'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {chromium,webkit}=require('playwright');
const file=path.join(__dirname,'image-annotation.browser.cjs'),source=fs.readFileSync(file,'utf8'),end=source.lastIndexOf('(async()=>{for(const [name,type]');
const m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(source.slice(0,end)+'\nmodule.exports={install,launch,mapping,drag,pixels};',file);
const {install,launch,mapping,drag,pixels}=m.exports;
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const matrix=p=>p.locator('.qbDrawCanvas').evaluate(c=>{const m=c.getContext('2d').getTransform();return{a:m.a,e:m.e,f:m.f}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<.02,`${a} should equal ${b}`);
async function native(p,type,scale){await p.locator('.qbDrawStage').evaluate((stage,{type,scale})=>{const b=stage.getBoundingClientRect(),e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{scale:{value:scale},clientX:{value:b.x+b.width/2},clientY:{value:b.y+b.height/2}});document.dispatchEvent(e);if(!e.defaultPrevented)throw Error(type+' was not handled')},{type,scale});await settle(p)}
async function run(browser,name){
  const p=await browser.newPage({viewport:{width:1024,height:900},hasTouch:true});p.setDefaultTimeout(12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>r.request().url()==='https://qb-interaction.test/'?r.fulfill({contentType:'text/html',body:'<!doctype html><style>*{box-sizing:border-box}body{margin:0}</style>'}):r.request().url().startsWith('blob:')?r.continue():r.abort());await p.goto('https://qb-interaction.test/');await install(p);await launch(p);let map=await mapping(p);
  await drag(p,map,[[100,100],[500,100]]);await settle(p);
  const solid=await p.locator('.qbDrawCanvas').evaluate((c,{a,b})=>{const r=c.getBoundingClientRect(),d=c.width/r.width,x=c.getContext('2d');let gaps=0;for(let px=a.x;px<b.x;px+=2){const v=x.getImageData(Math.round((px-r.left)*d),Math.round((a.y-r.top)*d),1,1).data;if(v[0]<150||v[1]>130)gaps++}return gaps},{a:map(130,100),b:map(470,100)});assert.equal(solid,0,'live pen must stay solid across consecutive render frames');
  console.log(name+' PASS live handwriting remains a continuous solid line');
  await p.locator('[data-tool=rect]').click();map=await mapping(p);await drag(p,map,[[100,200],[300,280]]);await p.locator('[data-tool=lasso]').click();await drag(p,map,[[100,240],[300,300]]);
  await p.locator('[data-tool=arrow]').click();await drag(p,map,[[100,400],[300,400]]);await p.locator('[data-tool=lasso]').click();await drag(p,map,[[200,400],[400,430]]);
  await p.locator('[data-tool=text]').click();let t=map(110,500);await p.mouse.click(t.x,t.y);await p.getByRole('textbox',{name:'画像に入れる文字'}).fill('MOVE');await p.locator('[data-tool=lasso]').click();
  t=map(150,515);await p.mouse.click(t.x,t.y);assert.equal(await p.locator('.qbDrawText').isVisible(),false,'first click selects without entering text');
  await drag(p,map,[[150,515],[500,515]]);assert.equal(await p.locator('.qbDrawText').isVisible(),false,'dragging selected text must not start typing');
  t=map(500,515);await p.mouse.click(t.x,t.y);await p.locator('.qbDrawText').waitFor();assert.equal(await p.locator('.qbDrawText').inputValue(),'MOVE');
  const box=await p.locator('.qbDrawText').boundingBox(),target=map(460,500);near(box.x,target.x);near(box.y,target.y);assert.equal(await p.locator('.qbDrawText').evaluate(n=>document.activeElement===n),true);
  await p.locator('.qbDrawText').fill('EDIT');await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>drawResult instanceof Blob);
  const result=await pixels(p,[[300,260],[100,200],[350,430],[150,400]]);assert.ok(result.colors[0][0]>180&&result.colors[0][1]<110);assert.deepEqual(result.colors[1],[255,255,255,255]);assert.ok(result.colors[2][0]>180&&result.colors[2][1]<110);assert.deepEqual(result.colors[3],[255,255,255,255]);
  const textRegions=await p.evaluate(async()=>{const i=await createImageBitmap(drawResult),c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);i.close();return[110,460].map(left=>{const d=x.getImageData(left,500,120,42).data;let n=0;for(let k=0;k<d.length;k+=4)if(d[k+1]<180)n++;return n})});assert.equal(textRegions[0],0);assert.ok(textRegions[1]>30);
  console.log(name+' PASS lasso rectangle/arrow moves, text click-select/drag/click-edit at its own position, saved output has no duplicate originals');
  await launch(p);await mapping(p);const initial=await matrix(p);await native(p,'gesturestart',1);await native(p,'gesturechange',2);near((await matrix(p)).a,initial.a*2);
  await p.locator('.qbDrawCanvas').dispatchEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true});await settle(p);near((await matrix(p)).a,initial.a*2);
  await native(p,'gesturechange',2);near((await matrix(p)).a,initial.a*2);await native(p,'gesturechange',.5);near((await matrix(p)).a,initial.a*.5);await native(p,'gestureend',.5);
  await p.waitForTimeout(150);await p.locator('.qbDrawCanvas').dispatchEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true});await settle(p);near((await matrix(p)).a,initial.a*.5*Math.exp(.4));
  await p.getByRole('button',{name:'全体表示',exact:true}).click();await settle(p);near((await matrix(p)).a,initial.a);
  const b=await p.locator('.qbDrawCanvas').boundingBox(),cx=b.x+b.width/2,cy=b.y+b.height/2;
  async function pointer(type,id,x){await p.locator('.qbDrawCanvas').dispatchEvent(type,{pointerId:id,pointerType:'touch',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:cy,bubbles:true,cancelable:true});await settle(p)}
  await pointer('pointerdown',1,cx-30);await pointer('pointerdown',2,cx+30);await native(p,'gesturestart',1);await pointer('pointermove',1,cx-60);await pointer('pointermove',2,cx+60);await native(p,'gesturechange',2);near((await matrix(p)).a,initial.a*2);await pointer('pointerup',1,cx-60);await pointer('pointerup',2,cx+60);await native(p,'gestureend',2);
  await p.locator('[data-tool=pen]').click();assert.equal(await p.getByLabel('手ぶれ補正の数値',{exact:true}).inputValue(),'20');await p.getByLabel('手ぶれ補正の数値',{exact:true}).fill('80');await p.locator('[data-tool=marker]').click();assert.equal(await p.getByLabel('手ぶれ補正の数値',{exact:true}).inputValue(),'50');await p.getByLabel('手ぶれ補正の数値',{exact:true}).fill('10');
  await p.locator('[data-tool=rect]').click();await p.getByRole('button',{name:'青',exact:true}).click();await p.getByLabel('線の太さ',{exact:true}).selectOption('10');await p.getByLabel('文字サイズ',{exact:true}).selectOption('48');await p.getByLabel('指で描く',{exact:true}).check();
  await p.locator('.qbDrawModal').getByRole('button',{name:'キャンセル',exact:true}).click();
  const released=await p.evaluate(()=>{const e=new Event('gesturestart',{cancelable:true});document.dispatchEvent(e);return !e.defaultPrevented});assert.ok(released,'browser gestures restored after closing');
  await p.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,600);QBImageEditor.open(c.toDataURL()).then(b=>window.drawResult=b)});await p.waitForFunction(()=>document.querySelector('.qbDrawSave')?.disabled===false);
  assert.equal(await p.locator('[data-tool=rect]').getAttribute('aria-pressed'),'true');assert.equal(await p.getByRole('button',{name:'青',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await p.getByLabel('線の太さ',{exact:true}).inputValue(),'10');assert.equal(await p.getByLabel('文字サイズ',{exact:true}).inputValue(),'48');assert.equal(await p.getByLabel('指で描く',{exact:true}).isChecked(),true);
  await p.locator('[data-tool=pen]').click();assert.equal(await p.getByLabel('手ぶれ補正の数値',{exact:true}).inputValue(),'80');await p.locator('[data-tool=marker]').click();assert.equal(await p.getByLabel('手ぶれ補正の数値',{exact:true}).inputValue(),'10');await p.locator('[data-tool=rect]').click();assert.equal(await p.locator('.qbDrawCorrection').isVisible(),false);
  await p.getByLabel('線の太さ',{exact:true}).selectOption('5');const map2=await mapping(p);await drag(p,map2,[[100,100],[300,250]]);await p.locator('.qbDrawSave').click();await p.locator('.qbDrawModal').waitFor({state:'detached'});const thick=await pixels(p,[[150,104],[150,107]]);assert.ok(thick.colors[0][2]>150&&thick.colors[0][0]<150);assert.deepEqual(thick.colors[1],[255,255,255,255]);
  assert.deepEqual(errors,[]);await p.close();console.log(name+' PASS settings survive reopening, rectangle standard is 10px, browser gesture handlers removed on close');
  console.log(name+' PASS Safari trackpad zoom in/out, Ctrl+wheel fallback and touch pinch do not apply zoom twice');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,name)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
