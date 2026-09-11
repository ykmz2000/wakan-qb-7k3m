'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test');
const code=fs.readFileSync(path.join(__dirname,'..','pdf-text-reading-v1.js'),'utf8'),context={console,DOMException};context.globalThis=context;vm.runInNewContext(code,context);const R=context.QBPDFTextReading;

test('embedded PDF text is ordered by line and horizontal position',()=>{
 const text=R.embeddedText([
  {str:'B',transform:[1,0,0,1,40,90]},
  {str:'second',transform:[1,0,0,1,10,70]},
  {str:'A',transform:[1,0,0,1,10,90]}
 ]);
 assert.equal(text,'A B\nsecond');
});

test('native text avoids OCR and labels each PDF page',async()=>{
 let recognized=0,destroyed=0;
 const pages=[
  [{str:'これは十分な長さを持つ埋め込み文字列です。画像化せず、そのまま正確に抽出されます。',transform:[1,0,0,1,10,90]}],
  [{str:'二ページ目にも十分な量の埋め込み文字があり、OCR処理を必要としません。検索にも利用できます。',transform:[1,0,0,1,10,90]}]
 ];
 const documentTask=async()=>({promise:Promise.resolve({numPages:2,getPage:async n=>({getTextContent:async()=>({items:pages[n-1]}),cleanup(){}}),cleanup(){}}),destroy:async()=>{destroyed++}});
 const text=await R.read({}, {documentTask,recognize:async()=>{recognized++;return'不要'}});
 assert.match(text,/1ページ/);assert.match(text,/2ページ/);assert.match(text,/埋め込み文字列/);assert.equal(recognized,0);assert.equal(destroyed,1);
});

test('a scanned PDF page is rendered and OCR text is retained',async()=>{
 let rendered=0,cleaned=0;
 const canvas={width:0,height:0,getContext:()=>({})};context.document={createElement:()=>canvas};
 const page={getTextContent:async()=>({items:[]}),getViewport:({scale})=>({width:600*scale,height:800*scale}),render:()=>({promise:Promise.resolve().then(()=>rendered++)}),cleanup:()=>cleaned++};
 const documentTask=async()=>({promise:Promise.resolve({numPages:1,getPage:async()=>page,cleanup(){}}),destroy:async()=>{}});
 const text=await R.read({}, {documentTask,recognize:async()=> 'スキャンされた本文'});
 assert.equal(text,'スキャンされた本文');assert.equal(rendered,1);assert.equal(cleaned,1);assert.equal(canvas.width,1);assert.equal(canvas.height,1);
});

test('small native fragments and OCR are merged without duplicate text',()=>{
 assert.equal(R.merge('1','読み取った本文'),'1\n読み取った本文');
 assert.equal(R.merge('読み取った 本文','読み取った本文'),'読み取った 本文');
});
