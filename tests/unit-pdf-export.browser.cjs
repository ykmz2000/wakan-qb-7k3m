'use strict';
// Synthetic data only; test real cards, read-only export and resulting PDF bytes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const jsQR=require('jsqr');
const siteURL='https://ykmz2000.github.io/wakan-qb-7k3m/';
const root=path.resolve(__dirname,'..'),out=process.env.QB_PDF_RESULTS||'/tmp/qb-pdf-results';fs.mkdirSync(out,{recursive:true});
const source=f=>fs.readFileSync(path.join(root,f),'utf8');
async function run(type,name){
  const browser=await type.launch({headless:true}),p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  try{
    p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
    // The only network fixture is the app document; all other network requests fail closed.
    await p.route('**/*',route=>route.request().url()==='https://fixture.test/'?route.fulfill({contentType:'text/html',body:source('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'')}):route.request().url().startsWith('blob:')?route.continue():route.abort());
    await p.goto('https://fixture.test/');
    await p.evaluate(()=>{
      document.documentElement.classList.remove('qb-auth-pending');
      const choice=(id)=>[{id:id+'a',choice_key:'a',choice_text:'選択肢の文章',is_correct:true,sort_order:1,explanation:'根拠となる所見。',correction_text:'修正する語句。'},{id:id+'b',choice_key:'b',choice_text:'別の選択肢',is_correct:false,sort_order:2,explanation:'異なる所見。'}];
      const question=(id,unit,sort)=>({id,subject_id:'s1',unit_id:unit,study_order:sort,status:'published',stem:'設問 '+id+'。正しいものを選べ。',answer_mode:'single',choices:choice(id),explanation_overview:'注目する所見から病態を考える。',exam_summary:'確認する知識。',question_occurrences:[{id:'o'+id,academic_year:2025,exam_type:'本試',original_question_number:id,official_answer:['a'],source_file:'試験資料.pdf',source_page:2}]});
      const q1=question('q1','u1',2),q2=question('q2','u1',1),q3=question('q3','u2',0);q2.explanation_overview='画像が多い設問。セクションを維持して配置する。';
      q1.stem_formatting={version:1,source_text:q1.stem,ranges:[{start:7,end:13,kind:'underline'}]};
      q1.explanation_formatting={explanation_overview:{version:1,source_text:q1.explanation_overview,ranges:[{start:0,end:6,kind:'bold'},{start:0,end:6,kind:'accent'},{start:0,end:6,kind:'underline'}]}};
      window.pdfDB={grades:[{id:'g',code:'M4'}],subjects:[{id:'s1',grade_id:'g',is_active:true,name:'テスト医学',sort_order:1}],units:[{id:'u2',subject_id:'s1',name:'第2単元',sort_order:2,is_active:true},{id:'u1',subject_id:'s1',name:'第1単元・画像と解説',sort_order:1,is_active:true}],questions:[q1,q2,q3,{...question('draft','u1',0),status:'draft'},{...question('other','u1',0),subject_id:'other'}],question_images:[{id:'i1',question_id:'q2',placement:'explanation_overview',choice_id:null,image_path:'one.png',caption:'第1の画像の説明',sort_order:1},{id:'i2',question_id:'q2',placement:'explanation_overview',choice_id:null,image_path:'two.png',caption:'第2の画像の説明',sort_order:2}]};
      for(let n=3;n<=7;n++)pdfDB.question_images.push({id:'i'+n,question_id:'q2',placement:'explanation_overview',choice_id:null,image_path:n===7?'wide.png':'extra'+n+'.png',caption:'第'+n+'の画像の説明',sort_order:n});
      pdfDB.question_images.push({id:'pdf',question_id:'q2',placement:'explanation_overview',choice_id:null,image_path:'two-pages.pdf',caption:'PDF資料',sort_order:8});
      q2.medical_verification_note='PDFには出力しない医学的疑義の検証用メモ';q2.has_verification_issue=true;
      pdfDB.question_images.push({id:'verification',question_id:'q2',placement:'medical_verification',image_path:'verification-only.png',caption:'疑義専用画像',sort_order:99});
      window.pdfReads=[];window.pdfWrites=[];window.failPDF=false;window.delayPDF=false;
      class Query{
        constructor(t){this.t=t;this.filters=[];this.orders=[];this.n=200;this.one=false;this.signal=null}
        select(c){this.cols=c;return this}eq(k,v){this.filters.push(r=>r[k]===v);return this}in(k,v){this.filters.push(r=>v.includes(r[k]));return this}gt(k,v){this.filters.push(r=>String(r[k])>v);return this}order(k,o={}){this.orders.push([k,o.ascending!==false]);return this}limit(n){this.n=n;return this}abortSignal(s){this.signal=s;return this}
        maybeSingle(){this.one=true;return this}then(a,b){return this.run().then(a,b)}
        insert(){pdfWrites.push('insert');throw Error('unexpected write')}update(){pdfWrites.push('update');throw Error('unexpected write')}upsert(){pdfWrites.push('upsert');throw Error('unexpected write')}delete(){pdfWrites.push('delete');throw Error('unexpected write')}
        async run(){
          pdfReads.push({table:this.t,cols:this.cols});if(delayPDF)await new Promise(r=>setTimeout(r,200));if(this.signal?.aborted)throw new DOMException('aborted','AbortError');
          let rows=structuredClone(pdfDB[this.t]||[]).filter(r=>this.filters.every(f=>f(r)));
          rows.sort((a,b)=>{for(const [k,asc]of this.orders)if(a[k]!==b[k])return(a[k]<b[k]?-1:1)*(asc?1:-1);return 0});
          // Enforce a tiny server-side cap on exporter reads to exercise pagination.
          rows=rows.slice(0,this.signal?Math.min(2,this.n):this.n);return{data:this.one?(rows[0]||null):rows,error:null};
        }
      }
      window.qbSupabase={auth:{getUser:async()=>({data:{user:{id:'user1'}}})},from:t=>new Query(t),rpc:async()=>({data:[],error:null}),storage:{from:()=>({download:async file=>{
        if(file==='verification-only.png')throw Error('Excluded verification image must not be downloaded');
        if(failPDF)return{data:null,error:{message:'synthetic missing image'}};
        if(file==='two-pages.pdf')return{data:new Blob(['%PDF-synthetic'],{type:'application/pdf'}),error:null};
        const c=document.createElement('canvas');c.width=file==='one.png'?3600:file==='wide.png'?3600:900;c.height=file==='one.png'?4000:file==='wide.png'?1200:1000;const x=c.getContext('2d');x.fillStyle=file==='one.png'?'#c5e6ef':'#f8d8e6';x.fillRect(0,0,c.width,c.height);x.fillStyle='#172033';x.font='40px sans-serif';x.fillText(file,60,100);x.strokeStyle='#172033';x.strokeRect(60,200,700,600);return{data:await new Promise(r=>c.toBlob(r,file==='two.png'?'image/jpeg':'image/png')),error:null};
      }})}};
      window.pdfSnapshot=JSON.stringify(pdfDB);
      window.QBFiles={
        isPDF:file=>String(file).toLowerCase().endsWith('.pdf'),
        documentTask:async()=>({promise:Promise.resolve({numPages:2,cleanup:async()=>{},getPage:async pageNumber=>({
          getViewport:({scale})=>({width:600*scale,height:800*scale}),
          render:({canvasContext,viewport})=>({promise:Promise.resolve().then(()=>{canvasContext.fillStyle=pageNumber===1?'#dbeafe':'#dcfce7';canvasContext.fillRect(0,0,viewport.width,viewport.height);canvasContext.fillStyle='#172033';canvasContext.font=`${40*(viewport.width/600)}px sans-serif`;canvasContext.fillText(`PDF page ${pageNumber}`,60,100)})})
        })}),destroy:async()=>{}})
      };
    });
    for(const f of ['unit-pdf-layout-v1.js','unit-pdf-export-v1.js','vendor/pdf-lib-1.17.1.min.js','qb-app.js','unit-section-divider-v1.js','ui-polish.js','subject-coming-soon-v1.js'])await p.addScriptTag({content:source(f)});
    await p.waitForFunction(()=>window.QB_DB_READY);await p.evaluate(()=>qbOpenSubjects());await p.locator('[data-s="s1"]').click();await p.locator('[data-u="u1"]').waitFor();await p.waitForTimeout(150);
    assert.equal(await p.locator('.qbPdfIcon').count(),3);
    for(const width of [375,768]){
      await p.setViewportSize({width,height:1024});await p.waitForTimeout(50);
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const b=await p.locator('[data-pdf-unit="u1"]').boundingBox(),c=await p.locator('[data-u="u1"]').boundingBox();assert.ok(c.x+c.width<=b.x);assert.ok(b.height>=44);
    }
    const state=await p.evaluate(()=>JSON.stringify(qbGetPracticeState()));await p.locator('[data-pdf-unit="__all__"]').click();
    assert.equal(await p.evaluate(()=>qbGetScreen()),'units');assert.equal(await p.evaluate(()=>JSON.stringify(qbGetPracticeState())),state);
    assert.equal(await p.locator('.qbPdfDialog').count(),1);assert.equal(await p.locator('.qbPdfIcon').first().locator('button').count(),0);
    await p.locator('.qbPdfClose').click();await p.locator('[data-pdf-unit="u1"]').focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>qbGetScreen()),'units');await p.keyboard.press('Escape');assert.equal(await p.locator('.qbPdfDialog').count(),0);
    // Exercise the same generator used by the dialog, with page metadata for invariant checks.
    const result=await p.evaluate(async()=>{
      const controller=new AbortController();window.pdfMeta=[];window.pdfPageImages=[];
      const r=await QBUnitPdf.generate({subjectId:'s1',unitId:'__all__'},{signal:controller.signal,onPage:(m,c)=>{pdfMeta.push(m);if(pdfPageImages.length<6)pdfPageImages.push(c.toDataURL('image/png'))}});
      const doc=await PDFLib.PDFDocument.load(await r.blob.arrayBuffer());window.pdfBytes=Array.from(new Uint8Array(await r.blob.arrayBuffer()));
      window.pdfCoverPixels=(()=>{const c=document.createElement('canvas');c.width=444;c.height=444;const x=c.getContext('2d');return new Promise(resolve=>{const i=new Image();i.onload=()=>{x.drawImage(i,180,2538,444,444,0,0,444,444);resolve(Array.from(x.getImageData(0,0,444,444).data))};i.src=pdfPageImages[0]})})();
      const links=doc.getPages().map(page=>{const a=page.node.Annots();return a?a.asArray().map(ref=>{const v=doc.context.lookup(ref);return {uri:v.lookup(PDFLib.PDFName.of('A')).lookup(PDFLib.PDFName.of('URI')).decodeText(),rect:v.lookup(PDFLib.PDFName.of('Rect')).asArray().map(n=>n.asNumber())}}):[]});
      const imageSizes=doc.getPages().flatMap(page=>{const xo=page.node.Resources().lookup(PDFLib.PDFName.of('XObject'));return xo.keys().map(k=>{const d=xo.lookup(k).dict;return{width:d.lookup(PDFLib.PDFName.of('Width')).asNumber(),height:d.lookup(PDFLib.PDFName.of('Height')).asNumber()}})});
      return{questions:r.questions,pages:r.pages,sizes:doc.getPages().map(p=>p.getSize()),meta:pdfMeta,links,imageSizes};
    });
    const qr=jsQR(new Uint8ClampedArray(await p.evaluate(()=>pdfCoverPixels)),444,444);assert.equal(qr?.data,siteURL);
    result.links.forEach((links,i)=>{assert.equal(links.length,result.meta[i].type.endsWith('cover')?2:0);for(const link of links){assert.equal(link.uri,siteURL);assert.ok(link.rect[0]>=0&&link.rect[2]<=595.28&&link.rect[1]>=0&&link.rect[3]<=841.89)}});
    assert.ok(result.meta.filter(m=>m.type.endsWith('cover')).every(m=>m.notice==='内容に誤りが含まれる場合があります。誤りがあった際はご容赦ください。\n気になる箇所は授業資料や教科書などで確認してください。'));
    assert.ok(!result.meta.flatMap(m=>m.items||[]).some(i=>i.group==='medical_verification_note'));
    assert.equal(result.questions,3);assert.equal(result.pages,result.meta.length);assert.ok(result.sizes.every(s=>Math.abs(s.width-595.28)<.01&&Math.abs(s.height-841.89)<.01));
    assert.deepEqual(result.meta.filter(m=>m.type.includes('cover')).map(m=>[m.type,m.subtitle]),[['subject-cover',''],['unit-cover','第1単元・画像と解説'],['unit-cover','第2単元']]);
    assert.deepEqual([...new Set(result.meta.filter(m=>m.questionId).map(m=>m.questionId))],['q2','q1','q3']);
    assert.ok(result.meta.filter(m=>m.questionId==='q2').length>1);
    assert.ok(result.imageSizes.some(s=>s.width===3600&&s.height===4000),'native pixels must survive embedding');
    assert.ok(result.imageSizes.some(s=>s.width===3600&&s.height===1200),'wide native picture must remain intact');
    assert.ok(result.imageSizes.some(s=>s.width===900&&s.height===1000),'JPEG normalization must keep native size');
    const imageRows=result.meta.flatMap(m=>m.items||[]).filter(i=>i.type==='imageRow');
    // The wide seventh image keeps its own row; the two PDF pages stay together on the next row.
    assert.deepEqual(imageRows.map(r=>r.images.length),[3,3,1,2]);
    imageRows.forEach(r=>r.images.forEach(i=>assert.ok(i.imageHeight/1123*297<=50.001)));
    for(const m of result.meta.filter(m=>m.items))for(const i of m.items)assert.ok(i.y>=86&&i.y+i.height<=1065,JSON.stringify(i));
    assert.deepEqual(result.meta.flatMap(m=>m.items||[]).flatMap(i=>i.images||[]).map(i=>i.imageId),['i1','i2','i3','i4','i5','i6','i7','pdf:pdf-page:1','pdf:pdf-page:2']);
    assert.equal(result.imageSizes.filter(s=>s.width===1200&&s.height===1600).length,2,'every PDF page must be embedded at the high-resolution render size');
    assert.equal(await p.evaluate(()=>JSON.stringify(pdfDB)===pdfSnapshot),true);assert.equal(await p.evaluate(()=>pdfWrites.length),0);
    assert.equal(await p.evaluate(()=>JSON.stringify(qbGetPracticeState())),state);assert.equal(await p.evaluate(()=>qbGetScreen()),'units');
    fs.writeFileSync(path.join(out,name+'-all.pdf'),Buffer.from(await p.evaluate(()=>pdfBytes)));
    const screenshots=await p.evaluate(()=>pdfPageImages);screenshots.forEach((s,i)=>fs.writeFileSync(path.join(out,name+'-page-'+(i+1)+'.png'),Buffer.from(s.split(',')[1],'base64')));
    const unit=await p.evaluate(async()=>{const meta=[],r=await QBUnitPdf.generate({subjectId:'s1',unitId:'u2'},{mode:'questions',signal:new AbortController().signal,onPage:m=>meta.push(m)});return{meta,questions:r.questions}});
    assert.equal(unit.questions,1);assert.equal(unit.meta[0].type,'unit-cover');assert.equal(unit.meta[0].subtitle,'第2単元');assert.ok(!unit.meta.flatMap(m=>m.items||[]).some(i=>i.group==='answer'));
    await p.evaluate(()=>{failPDF=true});await p.locator('[data-pdf-unit="u1"]').click();await p.locator('.qbPdfCreate').click();await p.waitForFunction(()=>document.querySelector('.qbPdfStatus').textContent.includes('画像を取得できません'));
    assert.equal(await p.locator('.qbPdfSave').isVisible(),false);await p.locator('.qbPdfClose').click();
    await p.evaluate(()=>{failPDF=false;delayPDF=true});await p.locator('[data-pdf-unit="u1"]').click();await p.locator('.qbPdfCreate').click();await p.locator('.qbPdfClose').click();await p.waitForTimeout(500);assert.equal(await p.locator('.qbPdfDialog').count(),0);await p.evaluate(()=>{delayPDF=false});
    await p.evaluate(()=>{
      window.sharedPayload=null;window.shareFail=null;
      Object.defineProperty(navigator,'canShare',{configurable:true,value:d=>Object.keys(d).join(',')==='files'&&d.files[0] instanceof File&&d.files[0].type==='application/pdf'});
      Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{if(shareFail)throw new DOMException('test',shareFail);sharedPayload={keys:Object.keys(d),type:d.files[0].type,name:d.files[0].name,bytes:Array.from(new Uint8Array(await d.files[0].arrayBuffer()))}}});
    });
    await p.locator('[data-pdf-unit="u2"]').click();await p.locator('select[aria-label="PDFの出力内容"]').selectOption('answers');await p.locator('.qbPdfCreate').click();await p.locator('.qbPdfSave').waitFor();
    await p.locator('.qbPdfShare').click();await p.waitForFunction(()=>sharedPayload!==null);
    const shared=await p.evaluate(()=>sharedPayload);assert.deepEqual(shared.keys,['files']);assert.equal(shared.type,'application/pdf');assert.equal(Buffer.from(shared.bytes).subarray(0,5).toString(),'%PDF-');
    let downloads=0;p.on('download',()=>downloads++);
    const downloaded=p.waitForEvent('download');await p.locator('.qbPdfSave').click();const download=await downloaded;
    assert.equal(download.suggestedFilename(),shared.name);const downloadedBytes=fs.readFileSync(await download.path());assert.deepEqual(downloadedBytes,Buffer.from(shared.bytes));
    const saved=await p.evaluate(async bytes=>{const doc=await PDFLib.PDFDocument.load(new Uint8Array(bytes));return doc.getPageCount()},shared.bytes);assert.equal(saved,2);
    await p.evaluate(()=>{shareFail='AbortError'});await p.locator('.qbPdfShare').click();assert.equal(await p.locator('.qbPdfSave').isEnabled(),true);assert.equal(downloads,1);
    await p.evaluate(()=>{shareFail='NotAllowedError'});await p.locator('.qbPdfShare').click();await p.waitForFunction(()=>document.querySelector('.qbPdfStatus').textContent.includes('ダウンロードしてください'));assert.equal(downloads,1);
    await p.locator('.qbPdfClose').click();
    await p.locator('[data-u="u1"]').click();await p.locator('.problem').first().waitFor();assert.equal(await p.evaluate(()=>qbGetScreen()),'problems');
    assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>pdfWrites.length),0);
    console.log(name+' PASS separate card/button interaction, narrow layout, A4 covers, sorted questions, complete images, read-only export, modes, cancellation, retry and navigation');
  }finally{await browser.close()}
}
(async()=>{for(const [name,type]of [['Chromium',chromium],['WebKit',webkit]])await run(type,name)})().catch(e=>{console.error(e);process.exit(1)});
