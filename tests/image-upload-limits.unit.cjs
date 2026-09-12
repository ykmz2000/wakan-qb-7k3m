'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto').webcrypto;
function fixture({tus}={}){
 const uploads=[];
 class Query{
  constructor(table){this.table=table}select(){return this}eq(){return this}is(){return this}order(){return this}limit(){return this}insert(payload){this.payload=payload;return this}
  maybeSingle(){return Promise.resolve({data:this.table==='profiles'?{role:'admin'}:this.table==='qb_image_library_config'?{enabled:true}:null})}
  single(){return Promise.resolve({data:{id:'row',...this.payload}})}then(a,b){return Promise.resolve({data:[]}).then(a,b)}
 }
 const sb={supabaseUrl:'https://project.supabase.co',auth:{getUser:async()=>({data:{user:{id:'admin'}}}),getSession:async()=>({data:{session:{access_token:'session-token'}}})},from:t=>new Query(t),storage:{from:bucket=>({upload:async(path,blob)=>{uploads.push({bucket,size:blob.size});return{data:{path}}}})}};
 const window={pq:()=>({id:'question'}),QBImageLibraryCore:{},tus};const context=vm.createContext({window,globalThis:window,crypto,console});
 for(const file of ['image-edit-storage-v1.js','image-library-store-v1.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),context);
 return{sb,uploads,window};
}
test('every editing bucket accepts the 100MiB boundary and rejects one byte above before upload',async()=>{
 const {sb,uploads,window:w}=fixture();
 for(const bucket of ['question-media','user-note-images']){
  const context={sb,bucket,questionId:'question',placement:'explanation_overview',host:{isConnected:true},...(bucket==='user-note-images'?{userId:'admin',noteId:'note'}:{})};
  for(const size of [20*1024*1024+1,50*1024*1024,100*1024*1024])await w.QBImageStore.add(context,{size,type:'image/png'});
  const before=uploads.length;await assert.rejects(()=>w.QBImageStore.add(context,{size:100*1024*1024+1,type:'image/png'}),/100M(?:i)?B/);assert.equal(uploads.length,before);
 }
});
test('library accepts 100MiB and rejects larger inputs without a Storage write',async()=>{
 const {sb,uploads,window:w}=fixture();await w.QBImageLibraryStore.add(sb,{size:100*1024*1024,type:'image/png',name:'large.png'});assert.equal(uploads.at(-1).size,100*1024*1024);
 await assert.rejects(()=>w.QBImageLibraryStore.add(sb,{size:100*1024*1024+1,type:'image/png'}),/100M(?:i)?B/);assert.equal(uploads.length,1);
});
test('library uses resumable upload for PDFs above 6MiB',async()=>{
 const tasks=[];class Upload{constructor(file,options){this.file=file;this.options=options;tasks.push(this)}start(){this.options.onSuccess()}}
 const {sb,uploads,window:w}=fixture({tus:{Upload}});const file={size:6*1024*1024+1,type:'application/pdf',name:'large.pdf'};
 await w.QBImageLibraryStore.add(sb,file);assert.equal(uploads.length,0);assert.equal(tasks.length,1);
 assert.equal(tasks[0].options.endpoint,'https://project.supabase.co/storage/v1/upload/resumable');assert.equal(tasks[0].options.headers.authorization,'Bearer session-token');assert.equal(tasks[0].options.metadata.bucketName,'qb-image-library');assert.equal(tasks[0].options.metadata.contentType,'application/pdf');assert.match(tasks[0].options.metadata.objectName,/\.pdf$/);
});
test('editing saves PDFs above 6MiB with resumable upload',async()=>{
 const tasks=[];class Upload{constructor(file,options){this.file=file;this.options=options;tasks.push(this)}start(){this.options.onSuccess()}}
 const {sb,uploads,window:w}=fixture({tus:{Upload}}),context={sb,bucket:'question-media',questionId:'question',placement:'explanation_overview',host:{isConnected:true}};
 await w.QBImageStore.add(context,{size:6*1024*1024+1,type:'application/pdf'});
 assert.equal(uploads.length,0);assert.equal(tasks.length,1);assert.equal(tasks[0].options.metadata.bucketName,'question-media');assert.equal(tasks[0].options.metadata.contentType,'application/pdf');assert.match(tasks[0].options.metadata.objectName,/\.pdf$/);
});
test('resumable PDF saves accept a URL-like storageUrl from the Supabase client',async()=>{
 const tasks=[];class Upload{constructor(file,options){this.options=options;tasks.push(this)}start(){this.options.onSuccess()}}
 const {sb,window:w}=fixture({tus:{Upload}});sb.storageUrl={href:'https://project.supabase.co/storage/v1/'};
 await w.QBImageStore.add({sb,bucket:'question-media',questionId:'question',placement:'question',host:{isConnected:true}},{size:6*1024*1024+1,type:'application/pdf'});
 await w.QBImageLibraryStore.add(sb,{size:6*1024*1024+1,type:'application/pdf',name:'large.pdf'});
 assert.deepEqual(tasks.map(task=>task.options.endpoint),['https://project.supabase.co/storage/v1/upload/resumable','https://project.supabase.co/storage/v1/upload/resumable']);
});
test('editing identifies a resumable 413 as a storage size limit instead of a network failure',async()=>{
 class Upload{constructor(file,options){this.options=options}start(){this.options.onError(Error('unexpected response: 413 Maximum size exceeded'))}}
 const {sb,window:w}=fixture({tus:{Upload}}),context={sb,bucket:'question-media',questionId:'question',placement:'question',host:{isConnected:true}};
 await assert.rejects(()=>w.QBImageStore.add(context,{size:6*1024*1024+1,type:'application/pdf'}),error=>error.code==='STORAGE_FILE_TOO_LARGE'&&/ファイルサイズの上限/.test(error.message));
});
