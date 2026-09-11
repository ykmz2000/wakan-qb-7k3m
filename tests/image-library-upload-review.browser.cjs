'use strict';
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{boot}=require('./image-library.browser.cjs');
async function run(browser,label){
 const {page:p,errors}=await boot(browser);
 await p.evaluate(()=>{
  window.ocrJobs=[];window.terminations=0;window.originalReviewRPC=qbSupabase.rpc;
  window.Tesseract={createWorker:async()=>({recognize:()=>new Promise(resolve=>ocrJobs.push(resolve)),terminate:async()=>{terminations++}})};
 });
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 const upload=async names=>{
  await p.locator('.qbLibraryTools input[type=file][multiple]').setInputFiles(names.map(name=>({name,mimeType:'image/png',buffer:Buffer.from('pixels')})));
  if(names.length>1)await p.getByRole('button',{name:`別々のカードに追加（${names.length}枚）`,exact:true}).click();
  await p.getByRole('dialog',{name:'追加したファイルを確認',exact:true}).waitFor();await p.getByRole('button',{name:'画像の文字を読み取る',exact:true}).click();
 };
 const review=p.getByRole('dialog',{name:'追加したファイルを確認',exact:true});
 await upload(['first.png','second.png']);
 // Each uploaded image precedes its name and other fields, including after batch navigation.
 const previewFirst=()=>review.locator('.qbLibraryDetailImage').evaluateAll(images=>images.every(img=>{const form=img.parentElement.querySelector('.qbLibraryForm');return !!(img.compareDocumentPosition(form)&Node.DOCUMENT_POSITION_FOLLOWING)}));
 assert.equal(await previewFirst(),true);
 await p.waitForFunction(()=>ocrJobs.length===1);
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.length),4);
 assert.equal(await p.locator('.qbLibraryOverlay > .qbLibraryPanel').first().evaluate(n=>n.inert),true);
 await review.getByLabel('ファイル名',{exact:true}).first().fill('手入力のタイトル');
 await review.getByText('細かい設定',{exact:true}).first().click();await review.getByLabel('読み取り本文',{exact:true}).first().fill('自分で入力');
 await p.evaluate(()=>ocrJobs.shift()({data:{text:'上書きしてはいけない本文'}}));
 await p.waitForFunction(()=>ocrJobs.length===1);
 assert.equal(await review.getByLabel('読み取り本文',{exact:true}).first().inputValue(),'自分で入力');
 await review.getByRole('button',{name:'次の画像',exact:true}).click();
 assert.equal(await previewFirst(),true);
 await p.evaluate(()=>ocrJobs.shift()({data:{text:'眼球運動と動眼神経'}}));
 await p.waitForFunction(()=>[...document.querySelectorAll('.qbLibraryUploadReview .qbLibraryTranscript')].some(n=>n.value==='眼球運動と動眼神経'));
 assert.equal(await review.getByLabel('解析状況',{exact:true}).nth(1).inputValue(),'needs_review');
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.ocr_text),'');
 await review.getByRole('button',{name:'前の画像',exact:true}).click();
 await review.getByLabel('ファイル名',{exact:true}).first().focus();await p.keyboard.press('Meta+s');await review.waitFor({state:'detached'});
 assert.deepEqual(await p.evaluate(()=>db.qb_image_library_items.slice(-2).map(r=>[r.metadata.name,r.metadata.ocr_text,r.metadata.analysis_status])),[['手入力のタイトル','自分で入力','unprocessed'],['second.png','眼球運動と動眼神経','needs_review']]);
 assert.equal(await p.locator('#draft').inputValue(),'保存していない問題文');
 // Confirm before recognition completes: no late mutation and worker is terminated.
 await upload(['early.png']);await p.waitForFunction(()=>ocrJobs.length===1);
 await review.getByRole('button',{name:'確定',exact:true}).click();await review.waitFor({state:'detached'});
 await p.evaluate(()=>ocrJobs.shift()({data:{text:'遅れて届いた本文'}}));
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.ocr_text),'');
 // Saving responds on the first click, prevents duplicate writes and closes without waiting for list refresh.
 await upload(['responsive.png']);await review.getByLabel('ファイル名',{exact:true}).fill('一度で保存する');
 await p.evaluate(()=>{const rpc=qbSupabase.rpc;window.saveRequests=0;window.refreshRequests=0;qbSupabase.rpc=(n,a)=>{if(n==='qb_library_save'){saveRequests++;return new Promise(resolve=>window.releaseSave=()=>resolve(rpc(n,a)))}if(n==='qb_library_search_v2'){refreshRequests++;return new Promise(resolve=>window.releaseRefresh=()=>resolve(rpc(n,a)))}return rpc(n,a)}});
 await review.getByRole('button',{name:'確定',exact:true}).click();
 const pending=review.getByRole('button',{name:'保存中…',exact:true});assert.equal(await pending.isDisabled(),true);assert.equal(await pending.getAttribute('aria-busy'),'true');
 await pending.dispatchEvent('click');await review.press('Meta+s');assert.equal(await p.evaluate(()=>saveRequests),1);
 await p.evaluate(()=>releaseSave());await review.waitFor({state:'detached'});assert.equal(await p.evaluate(()=>refreshRequests),1);assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.name),'一度で保存する');
 await p.evaluate(()=>{releaseRefresh();const rpc=qbSupabase.rpc;qbSupabase.rpc=window.originalReviewRPC});await p.locator('.qbLibraryItem').first().waitFor();
 // A failed confirmation keeps the draft and restores a working retry button.
 await upload(['retry.png']);await review.getByLabel('ファイル名',{exact:true}).fill('再試行でも残る');
 await p.evaluate(()=>{const rpc=qbSupabase.rpc;let fail=true;qbSupabase.rpc=(n,a)=>{if(n==='qb_library_save'&&fail){fail=false;return Promise.resolve({error:{message:'一時的な保存エラー'}})}return rpc(n,a)}});
 await review.getByRole('button',{name:'確定',exact:true}).click();await review.getByText('一時的な保存エラー 入力内容は保持しています。',{exact:true}).waitFor();assert.equal(await review.getByLabel('ファイル名',{exact:true}).inputValue(),'再試行でも残る');
 await review.getByRole('button',{name:'確定',exact:true}).click();await review.waitFor({state:'detached'});assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.name),'再試行でも残る');
 // Loading/recognition failure is non-blocking.
 await p.evaluate(()=>Tesseract.createWorker=async()=>{throw Error('offline')});
 await upload(['offline.png']);await review.getByText('OCRを利用できませんでした。未入力でも確定できます。',{exact:true}).waitFor();
 await review.getByRole('button',{name:'確定',exact:true}).click();await review.waitFor({state:'detached'});
 // Escape discards metadata edits, retains the registered image and restores parent focusability.
 await upload(['retained.png']);await review.getByLabel('ファイル名',{exact:true}).fill('破棄する下書き');await p.keyboard.press('Escape');await review.waitFor({state:'detached'});
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.name),'retained.png');
 assert.equal(await p.evaluate(()=>calls.filter(c=>c[1]==='qb_library_record_reading').length),0);
 assert.equal(await p.evaluate(()=>db.question_images.length),0);
 assert.deepEqual(errors,[]);await p.close();console.log(label+' PASS upload review, batch navigation, draft OCR, manual preservation, Mod-S, early confirm, offline and cancellation');
}
async function realOCR(browser){
 const {page:p}=await boot(browser);
 await p.unroute('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
 await p.route('https://cdn.jsdelivr.net/**',r=>r.continue());
 await p.route('https://tessdata.projectnaptha.com/**',r=>r.continue());
 const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=300;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1200,300);x.fillStyle='black';x.font='70px sans-serif';x.fillText('EYE MOVEMENT',70,160);return c.toDataURL('image/png').split(',')[1]});
 await p.locator('.qbLibraryEntry').click();await p.locator('.qbLibraryItem').first().waitFor();
 await p.locator('.qbLibraryTools input[type=file][multiple]').setInputFiles({name:'ocr-smoke.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await p.getByRole('button',{name:'画像の文字を読み取る',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('.qbLibraryUploadReview')?.textContent.includes('簡易OCRの仮読み取りです。')||document.querySelector('.qbLibraryUploadReview')?.textContent.includes('OCRを利用できませんでした。')||document.querySelector('.qbLibraryUploadReview')?.textContent.includes('OCRを終了しました。'),{},{timeout:75000});
 const review=p.getByRole('dialog',{name:'追加したファイルを確認',exact:true});
 assert.match(await review.getByLabel('読み取り本文',{exact:true}).inputValue(),/EYE\s+MOVEMENT/i,await review.textContent());
 await review.getByRole('button',{name:'確定',exact:true}).click();await review.waitFor({state:'detached'});
 assert.equal(await p.evaluate(()=>db.qb_image_library_items.at(-1).metadata.analysis_status),'needs_review');
 await p.close();console.log('Chromium PASS real pinned browser OCR worker with Japanese and English models');
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){const b=await type.launch();try{await run(b,name);if(name==='Chromium')await realOCR(b)}finally{await b.close()}}})().catch(e=>{console.error(e);process.exitCode=1});
