'use strict';
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{boot}=require('./image-library.browser.cjs');
async function run(browser,label){
 const {page:p,errors}=await boot(browser);
 await p.evaluate(()=>{
  window.ocrJobs=[];window.terminations=0;
  window.Tesseract={createWorker:async()=>({recognize:()=>new Promise(resolve=>ocrJobs.push(resolve)),terminate:async()=>{terminations++}})};
 });
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 const upload=async names=>{
  await p.locator('.qbLibraryTools input[type=file][multiple]').setInputFiles(names.map(name=>({name,mimeType:'image/png',buffer:Buffer.from('pixels')})));
  await p.getByRole('dialog',{name:'追加した画像を確認',exact:true}).waitFor();
 };
 const review=p.getByRole('dialog',{name:'追加した画像を確認',exact:true});
 await upload(['first.png','second.png']);
 await p.waitForFunction(()=>ocrJobs.length===1);
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.length),4);
 assert.equal(await p.locator('.qbLibraryOverlay > .qbLibraryPanel').first().evaluate(n=>n.inert),true);
 await review.getByLabel('画像名',{exact:true}).first().fill('手入力のタイトル');
 await review.getByLabel('読み取り本文',{exact:true}).first().fill('自分で入力');
 await p.evaluate(()=>ocrJobs.shift()({data:{text:'上書きしてはいけない本文'}}));
 await p.waitForFunction(()=>ocrJobs.length===1);
 assert.equal(await review.getByLabel('読み取り本文',{exact:true}).first().inputValue(),'自分で入力');
 await review.getByRole('button',{name:'次の画像',exact:true}).click();
 await p.evaluate(()=>ocrJobs.shift()({data:{text:'眼球運動と動眼神経'}}));
 await p.waitForFunction(()=>document.querySelectorAll('.qbLibraryUploadReview textarea')[5].value==='眼球運動と動眼神経');
 assert.equal(await review.getByLabel('解析状況',{exact:true}).nth(1).inputValue(),'needs_review');
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.ocr_text),'');
 await review.getByRole('button',{name:'前の画像',exact:true}).click();
 await review.getByLabel('画像名',{exact:true}).first().focus();await p.keyboard.press('Meta+s');await review.waitFor({state:'detached'});
 assert.deepEqual(await p.evaluate(()=>db.qb_image_library_items.slice(-2).map(r=>[r.metadata.name,r.metadata.ocr_text,r.metadata.analysis_status])),[['手入力のタイトル','自分で入力','unprocessed'],['second.png','眼球運動と動眼神経','needs_review']]);
 assert.equal(await p.locator('#draft').inputValue(),'保存していない問題文');
 // Confirm before recognition completes: no late mutation and worker is terminated.
 await upload(['early.png']);await p.waitForFunction(()=>ocrJobs.length===1);
 await review.getByRole('button',{name:'確定',exact:true}).click();await review.waitFor({state:'detached'});
 await p.evaluate(()=>ocrJobs.shift()({data:{text:'遅れて届いた本文'}}));
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.ocr_text),'');
 // Loading/recognition failure is non-blocking.
 await p.evaluate(()=>Tesseract.createWorker=async()=>{throw Error('offline')});
 await upload(['offline.png']);await review.getByText('OCRを利用できませんでした。未入力でも確定できます。',{exact:true}).waitFor();
 await review.getByRole('button',{name:'確定',exact:true}).click();await review.waitFor({state:'detached'});
 // Escape discards metadata edits, retains the registered image and restores parent focusability.
 await upload(['retained.png']);await review.getByLabel('画像名',{exact:true}).fill('破棄する下書き');await p.keyboard.press('Escape');await review.waitFor({state:'detached'});
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.name),'retained.png');
 assert.equal(await p.evaluate(()=>calls.filter(c=>c[1]==='qb_library_record_reading').length),0);
 assert.equal(await p.evaluate(()=>db.question_images.length),0);
 assert.deepEqual(errors,[]);await p.close();console.log(label+' PASS upload review, batch navigation, draft OCR, manual preservation, Mod-S, early confirm, offline and cancellation');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,name)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
