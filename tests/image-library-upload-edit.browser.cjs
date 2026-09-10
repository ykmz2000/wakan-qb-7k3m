'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{boot}=require('./image-library.browser.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
async function run(browser,label){
 const {page:p,errors}=await boot(browser);p.setDefaultTimeout(10000);await p.setViewportSize({width:1024,height:900});
 await p.addStyleTag({content:read('image-annotation-v1.css')});
 for(const f of ['image-annotation-model-v1.js','image-annotation-editor-v1.js'])await p.addScriptTag({content:read(f)});
 await p.evaluate(()=>{window.Tesseract={createWorker:async()=>({recognize:()=>new Promise(r=>window.lateOCR=r),terminate:async()=>{}})};window.QBImageCrop={open:async()=>null};localStorage.setItem('qb-image-editor-settings-v1','{}')});
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 const image=await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').fillRect(0,0,800,600);return c.toDataURL().split(',')[1]});
 await p.locator('.qbLibraryTools input[type=file][multiple]').setInputFiles(['one.png','two.png'].map(name=>({name,mimeType:'image/png',buffer:Buffer.from(image,'base64')})));
 const review=p.getByRole('dialog',{name:'追加した画像を確認',exact:true});await review.waitFor();await p.waitForFunction(()=>!!window.lateOCR);
 const name=review.getByLabel('画像名',{exact:true}).first();await name.fill('入力中の名前');await review.getByLabel('キーワード',{exact:true}).first().fill('lung cancer');
 const before=await p.evaluate(()=>db.qb_image_library_items.slice(-2).map(r=>({id:r.id,path:r.object_path,version:r.image_version})));
 // Crop cancellation never discards metadata or mutates the image.
 await review.getByRole('button',{name:'トリミング',exact:true}).first().click();await review.getByText('画像の編集をキャンセルしました。',{exact:true}).waitFor();assert.equal(await name.inputValue(),'入力中の名前');assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-2).object_path),before[0].path);
 await review.getByRole('button',{name:'書き込み',exact:true}).first().click();await p.locator('.qbDrawSave:enabled').waitFor();assert.equal(await review.evaluate(n=>n.inert),true);
 assert.ok(await p.locator('.qbDrawModal').evaluate(n=>Number(getComputedStyle(n).zIndex))>10100);
 await p.getByRole('button',{name:'連番',exact:true}).click();await p.locator('.qbDrawNavigation').getByRole('button',{name:'全体表示',exact:true}).click();await p.locator('.qbDrawCanvas').click();
 // Failed image save keeps the annotation editor open, allowing retry.
 await p.evaluate(()=>{const save=QBImageLibraryStore.replace;window.replaceImage=save;let fail=true;QBImageLibraryStore.replace=async(...a)=>{if(fail){fail=false;throw Error('画像保存のテストエラー')}return save(...a)}});
 await p.locator('.qbDrawSave').click();await p.locator('.qbDrawStatus').filter({hasText:'画像保存のテストエラー'}).waitFor();await p.locator('.qbDrawSave').click();await p.locator('.qbDrawModal').waitFor({state:'detached'});
 assert.equal(await review.evaluate(n=>n.inert),false);assert.equal(await name.inputValue(),'入力中の名前');assert.notEqual(await p.evaluate(()=>db.qb_image_library_items.at(-2).object_path),before[0].path);assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-2).image_version),before[0].version+1);
 await p.evaluate(()=>lateOCR({data:{text:'古い画像の遅延OCR'}}));await review.getByText('細かい設定',{exact:true}).first().click();assert.equal(await review.getByLabel('読み取り本文',{exact:true}).first().inputValue(),'');
 // Crop save on the second image updates only that image and preserves both drafts.
 await review.getByRole('button',{name:'次の画像',exact:true}).click();await review.getByLabel('画像名',{exact:true}).nth(1).fill('二枚目');
 await p.evaluate(()=>QBImageCrop.open=async()=>{const c=document.createElement('canvas');c.width=100;c.height=100;return new Promise(r=>c.toBlob(r))});
 await review.getByRole('button',{name:'トリミング',exact:true}).click();await review.getByText('画像を保存しました。情報を確認して確定してください。',{exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).image_version),before[1].version+1);
 await review.getByRole('button',{name:'確定',exact:true}).click();await review.waitFor({state:'detached'});
 assert.deepEqual(await p.evaluate(()=>db.qb_image_library_items.slice(-2).map(r=>r.metadata.name)),['入力中の名前','二枚目']);assert.deepEqual(await p.evaluate(()=>db.qb_image_library_items.at(-2).metadata.keywords),['lung cancer']);assert.deepEqual(errors,[]);await p.close();console.log(label+' PASS upload annotation, crop save/cancel, layering, failed-save retry, metadata preservation, batch targeting and stale OCR isolation');
}
(async()=>{for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,label)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
