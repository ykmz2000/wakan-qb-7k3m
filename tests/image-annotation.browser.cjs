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
async function launch(p){
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
  await launch(p);assert.equal(await p.locator('.qbDrawSwatch').count(),7);let map=await mapping(p);
  await p.locator('[data-tool=rect]').click();await drag(p,map,[[100,100],[340,220]]);
  await p.locator('[data-tool=lasso]').click();await drag(p,map,[[220,160],[300,200]]);
  await p.getByRole('button',{name:'↶ 元に戻す',exact:true}).click();await p.getByRole('button',{name:'↷ やり直す',exact:true}).click();
  await p.locator('[data-tool=marker]').click();await p.getByRole('button',{name:'青',exact:true}).click();await drag(p,map,[[100,280],[400,280]]);
  await p.locator('[data-tool=pen]').click();await p.getByRole('button',{name:'緑',exact:true}).click();await drag(p,map,[[100,340],[200,340],[250,380]]);
  await p.locator('[data-tool=arrow]').click();await p.getByRole('button',{name:'オレンジ',exact:true}).click();await drag(p,map,[[100,440],[400,440]]);
  await p.locator('[data-tool=text]').click();const t=map(120,500);await p.mouse.click(t.x,t.y);await p.getByRole('textbox',{name:'画像に入れる文字'}).fill('日本語の追記');
  await p.screenshot({path:path.join(resultsDir,name+'-annotation.png')});
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>window.drawResult instanceof Blob);const out=await pixels(p,[[180,140],[220,180],[100,100],[200,280],[160,340],[200,440]]);
  assert.deepEqual([out.width,out.height,out.type],[800,600,'image/png']);assert.ok(out.colors[0][0]>180&&out.colors[0][1]<100);assert.deepEqual(out.colors[1],[255,255,255,255]);assert.deepEqual(out.colors[2],[255,255,255,255]);assert.ok(out.colors[3][2]>220&&out.colors[3][0]>150&&out.colors[3][0]<220);assert.ok(out.colors[4][1]>110&&out.colors[4][0]<60);assert.ok(out.colors[5][0]>220&&out.colors[5][1]<170);
  console.log(name+' PASS transparent arbitrary rectangle, move/undo/redo, translucent marker, handwriting, arrow, Japanese text, flattened PNG');
  await launch(p);map=await mapping(p);
  // Add an image through the clipboard, crop in a separate dialog, then resize/move it.
  await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d');x.fillStyle='#2463d3';x.fillRect(0,0,120,80);const b=await new Promise(r=>c.toBlob(r));const d=new DataTransfer();d.items.add(new File([b],'added.png',{type:'image/png'}));document.querySelector('.qbDrawCanvas').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}))});
  await p.waitForFunction(()=>document.querySelector('.qbDrawStatus').textContent.includes('画像を追加しました'));
  await p.getByRole('button',{name:'追加画像をトリミング',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.qbCropSave')?.disabled===false);
  await p.evaluate(()=>document.querySelector('.qbCropImage').cropper.setData({x:20,y:0,width:60,height:80}));await p.locator('.qbCropSave').click();await p.locator('.qbCropModal').waitFor({state:'detached'});
  await drag(p,map,[[370,300],[650,150]]);await drag(p,map,[[680,190],[710,230]]);
  await p.locator('.qbDrawSave').click();await p.waitForFunction(()=>window.drawResult instanceof Blob);const pasted=await pixels(p,[[660,150],[400,300]]);assert.ok(pasted.colors[0][2]>170&&pasted.colors[0][0]<70);assert.deepEqual(pasted.colors[1],[255,255,255,255]);
  console.log(name+' PASS image paste, separate crop, movement and aspect-preserving resize');
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
async function augment(p){
  await p.route('blob:**',r=>r.continue());
  await p.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,600);x.fillStyle='#22b8dc';x.fillRect(40,40,160,100);window.testImage=await new Promise(r=>c.toBlob(r));window.testObjects=new Map();window.testRemoved=[];
    const base=qbSupabase.storage.from.bind(qbSupabase.storage);qbSupabase.storage.from=bucket=>({...base(bucket),download:async p=>({data:testObjects.get(p)||testImage,error:null}),upload:async(path,blob)=>{if(window.testUploadFailure)return{error:{message:'fixture upload failure'}};testObjects.set(path,blob);testUploads++;return{data:{path},error:null}},remove:async paths=>{testRemoved.push(...paths);paths.forEach(p=>testObjects.delete(p));return{error:null}}});
  });await install(p,true);
}
async function paste(p,selector,image=true){
  await p.locator(selector).first().evaluate((n,image)=>{n.focus();const d=new DataTransfer();if(image)d.items.add(new File([window.testImage],'clipboard.png',{type:'image/png'}));else d.setData('text/plain','テキスト貼付');n.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}))},image);
  if(image)await p.waitForFunction(()=>document.querySelector('.qbDrawSave')?.disabled===false);
}
async function confirm(p){await p.locator('.qbDrawSave').click();await p.locator('.qbDrawModal').waitFor({state:'detached'})}
async function integration(browser,name){
  const {page:p,errors}=await fixture.exports.boot(browser);await augment(p);
  await p.locator('.qbExportButton').waitFor();assert.equal(await p.evaluate(()=>document.querySelector('.adeStemToolbar').firstElementChild.className),'qbExportButton');
  await p.locator('[data-ade-v2="overview"]').click();await p.locator('.qbInlineRich').waitFor();await paste(p,'.qbInlineRich',false);const draft=await p.locator('.qbInlineRich').textContent();assert.ok(draft.includes('テキスト貼付'));
  const before=await p.evaluate(()=>({images:testDB.question_images.length,writes:JSON.stringify(testWrites),uploads:testUploads}));await paste(p,'.qbInlineRich');assert.deepEqual(await p.evaluate(()=>({images:testDB.question_images.length,writes:JSON.stringify(testWrites),uploads:testUploads})),before);
  await p.locator('.qbDrawModal').getByRole('button',{name:'キャンセル',exact:true}).click();await p.locator('.qbDrawModal').waitFor({state:'detached'});assert.equal(await p.locator('.qbInlineRich').textContent(),draft);
  await paste(p,'.qbInlineRich');await confirm(p);assert.equal(await p.locator('.qbInlineRich').textContent(),draft);
  let added=await p.evaluate(()=>testDB.question_images.at(-1));assert.equal(added.placement,'explanation_overview');assert.ok(added.original_image_path);assert.notEqual(added.image_path,added.original_image_path);assert.equal(await p.evaluate(()=>testWrites.filter(w=>w.table==='questions').length),0);
  await p.locator('.qbInlineCancel').click();
  await p.locator('.adeStemBtn').click();await p.locator('.qbInlineRich').waitFor();await paste(p,'.qbInlineRich');await confirm(p);added=await p.evaluate(()=>testDB.question_images.at(-1));assert.equal(added.placement,'question');assert.equal(added.question_id,'q1');await p.locator('.qbInlineCancel').click();
  await p.locator('[data-ade-v2="choice-c1"]').click();await p.locator('[data-ade-v2-editor="choice-c1"]').waitFor();await paste(p,'[data-ade-v2-editor="choice-c1"] .qbInlineRich');await confirm(p);added=await p.evaluate(()=>testDB.question_images.at(-1));assert.equal(added.choice_id,'c1');assert.equal(added.placement,'choice_explanation');await p.locator('[data-ade-v2-editor="choice-c1"] .adeCancel').click();
  console.log(name+' PASS image clipboard routes to overview, stem and choice; text paste and cancelled/unsaved drafts are retained');
  const storage=await p.evaluate(async()=>{
    const c={sb:qbSupabase,bucket:'question-media',questionId:'q1',placement:'question',choiceId:null,host:document.querySelector('.qtext')},old=await QBImageStore.get(c,'stem-image'),row=await QBImageStore.replace(c,old,testImage),latest=await QBImageStore.get(c,'stem-image');
    let conflict=false;try{await QBImageStore.replace(c,old,testImage)}catch(e){conflict=e.message.includes('別の画像更新')}
    await QBImageStore.restore(c,latest);const restored=await QBImageStore.get(c,'stem-image');
    window.testUploadFailure=true;let failure=false;try{await QBImageStore.replace(c,restored,testImage)}catch(e){failure=e.message.includes('fixture upload failure')}window.testUploadFailure=false;
    return{old,row,restored,conflict,failure,unchanged:(await QBImageStore.get(c,'stem-image')).image_path===restored.image_path,removed:testRemoved};
  });assert.equal(storage.row.original_image_path,storage.old.image_path);assert.equal(storage.restored.image_path,storage.old.image_path);assert.ok(storage.conflict&&storage.failure&&storage.unchanged);assert.deepEqual(storage.removed,[]);
  console.log(name+' PASS original retained/restored, stale image conflict rejected, failed upload leaves original untouched');
  assert.deepEqual(errors,[]);const db=await p.evaluate(()=>testDB);await p.close();
  const user=await fixture.exports.boot(browser,{role:'user',db});const u=user.page;await augment(u);await u.locator('.qbExportButton').waitFor();assert.equal(await u.locator('.adeStemBtn').count(),0);
  const note=u.locator('.qbPersonal').first();await note.locator('.qbPencil').click();await note.locator('textarea').fill('画像追加中のメモ下書き');await paste(u,'.qbPersonal .qbNoteEditor textarea');await confirm(u);assert.equal(await note.locator('textarea').inputValue(),'画像追加中のメモ下書き');assert.equal(await u.evaluate(()=>testDB.user_notes[0].note_text),'以前からの個人メモ');assert.equal(await u.evaluate(()=>testDB.user_note_images.at(-1).note_id),'n1');assert.equal(await u.evaluate(()=>testDB.user_note_images.at(-1).user_id),'u1');
  await note.locator('.qbNoteImageWrap .qbImageWriteActions').first().waitFor();
  await u.evaluate(()=>{window.Sortable=class{constructor(container,options){container.testSortOptions=options}}});await u.addScriptTag({content:read('image-sortable-v1.js')});
  await u.waitForFunction(()=>document.querySelectorAll('.qbPersonal .qbNoteImageWrap.qbsortNoteItem').length===2);
  assert.equal(await note.locator('.qbNoteImageWrap .qbImageWriteActions').count(),2);
  await note.locator('.qbNoteImageGrid').evaluate(async grid=>{grid.prepend(grid.querySelector('.qbsortNoteItem:last-child'));await grid.testSortOptions.onEnd()});
  assert.equal(await u.evaluate(()=>testDB.user_note_images.at(-1).sort_order),10);
  const denied=await u.evaluate(async()=>{try{await QBImageStore.authorize({sb:qbSupabase,bucket:'question-media',questionId:'q1',placement:'question',host:document.querySelector('.qtext')});return false}catch{return true}});assert.ok(denied);
  console.log(name+' PASS personal image save stays private, retains note draft and rejects general-user official edits');
  // Export pixels really render, text never clips, and output does not write app records.
  const exportResult=await u.evaluate(async()=>{
    const before=JSON.stringify(testDB),writes=JSON.stringify(testWrites),draw=CanvasRenderingContext2D.prototype.fillText,lines=[];CanvasRenderingContext2D.prototype.fillText=function(text,...rest){lines.push(text);return draw.call(this,text,...rest)};
    const Q=JSON.parse(JSON.stringify(testQ));Q.stem='長文問題\n'.repeat(60)+'問題末尾';Q.choices.push({choice_key:'b',choice_text:'選択肢末尾',is_correct:false,sort_order:2});Q.occ=[{official_answer:'a',academic_year:2019,exam_type:'本試'}];const result=await QBQuestionExport.render(Q);CanvasRenderingContext2D.prototype.fillText=draw;
    const image=await new Promise((resolve,reject)=>{const i=new Image(),url=URL.createObjectURL(result.blob);i.onload=()=>{URL.revokeObjectURL(url);resolve(i)};i.onerror=()=>reject(Error('PNG decode failed: '+JSON.stringify({size:drawResult.size,type:drawResult.type,url:u})));i.src=url});
    return{width:image.width,height:image.height,type:result.blob.type,lines,unchanged:before===JSON.stringify(testDB)&&writes===JSON.stringify(testWrites),nonChoice:QBQuestionExport.answers({answer_mode:'fill_blank',answer_fields:[{key:'A',label:'空欄1'}],occ:[{official_answer:{A:'模範解答',note:'補足情報',IMAGE_REQUIRED:'ignored'}}]})};
  });assert.ok(exportResult.height>4000);assert.equal(exportResult.type,'image/png');assert.ok(exportResult.lines.includes('問題末尾')&&exportResult.lines.includes('b. 選択肢末尾')&&exportResult.lines.includes('a'));assert.ok(exportResult.unchanged);assert.equal(exportResult.nonChoice,'空欄1：模範解答\n補足：補足情報');
  await u.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{window.testCopyType=items[0].types[0]}}});window.ClipboardItem=class{constructor(x){this.types=Object.keys(x)}};Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false})});
  await u.locator('.qbExportButton').click();await u.getByRole('button',{name:'画像としてコピー',exact:true}).click();assert.equal(await u.evaluate(()=>testCopyType),'image/png');assert.equal(await u.locator('.qbDrawModal').count(),0);
  const download=u.waitForEvent('download');await u.getByRole('button',{name:'画像として保存',exact:true}).click();const downloaded=await download;assert.match(downloaded.suggestedFilename(),/\.png$/);await downloaded.saveAs(path.join(resultsDir,name+'-question-export.png'));await u.getByRole('button',{name:'閉じる',exact:true}).click();assert.deepEqual(user.errors,[]);await u.close();
  console.log(name+' PASS independent general-user export, complete long question/options/answers, PNG clipboard and download, no data writes');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const browser=await type.launch();try{await core(browser,name);await integration(browser,name)}finally{await browser.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
