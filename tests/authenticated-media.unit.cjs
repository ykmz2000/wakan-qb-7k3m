const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(){
  const context={window:{},Date,Map,Promise,Error,String,Math};
  vm.runInNewContext(fs.readFileSync('authenticated-media-v1.js','utf8'),context);
  return context.window.QBAuthenticatedMedia;
}

test('signed URLs and downloads use each row storage bucket',async()=>{
  const calls=[];
  const sb={storage:{from(bucket){return{
    async createSignedUrl(path,seconds){calls.push(['sign',bucket,path,seconds]);return{data:{signedUrl:`signed:${bucket}:${path}`},error:null}},
    async download(path){calls.push(['download',bucket,path]);return{data:{bucket,path},error:null}}
  }}}};
  const media=load(),row={storage_bucket:'question-images',image_path:'legacy/a.png'};
  assert.equal(await media.signedUrl(sb,row),'signed:question-images:legacy/a.png');
  assert.deepEqual(await media.download(sb,row),{bucket:'question-images',path:'legacy/a.png'});
  assert.deepEqual(calls.map(x=>x.slice(0,3)),[
    ['sign','question-images','legacy/a.png'],
    ['download','question-images','legacy/a.png']
  ]);
});

test('legacy rows default to question-media and reuse a live signature',async()=>{
  let signs=0;
  const sb={storage:{from(bucket){return{async createSignedUrl(path){signs++;return{data:{signedUrl:`${bucket}/${path}`},error:null}}}}}};
  const media=load(),row={image_path:'q/image.png'};
  assert.equal(await media.signedUrl(sb,row),'question-media/q/image.png');
  assert.equal(await media.signedUrl(sb,row),'question-media/q/image.png');
  assert.equal(signs,1);
});
