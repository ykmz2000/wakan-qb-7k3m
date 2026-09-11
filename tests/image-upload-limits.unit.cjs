'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto').webcrypto;
function fixture(){
 const uploads=[];
 class Query{
  constructor(table){this.table=table}select(){return this}eq(){return this}is(){return this}order(){return this}limit(){return this}insert(payload){this.payload=payload;return this}
  maybeSingle(){return Promise.resolve({data:this.table==='profiles'?{role:'admin'}:this.table==='qb_image_library_config'?{enabled:true}:null})}
  single(){return Promise.resolve({data:{id:'row',...this.payload}})}then(a,b){return Promise.resolve({data:[]}).then(a,b)}
 }
 const sb={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from:t=>new Query(t),storage:{from:bucket=>({upload:async(path,blob)=>{uploads.push({bucket,size:blob.size});return{data:{path}}}})}};
 const window={pq:()=>({id:'question'}),QBImageLibraryCore:{}};const context=vm.createContext({window,globalThis:window,crypto,console});
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
