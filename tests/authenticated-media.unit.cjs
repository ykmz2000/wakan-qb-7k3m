const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(){
  let next=0;
  const context={window:{addEventListener(){}},Date,Map,Promise,Error,String,Math,URL:{createObjectURL:()=>`blob:test-${++next}`,revokeObjectURL(){}},Blob};
  vm.runInNewContext(fs.readFileSync('authenticated-media-v1.js','utf8'),context);
  return context.window.QBAuthenticatedMedia;
}

test('object URLs and downloads use each row storage bucket',async()=>{
  const calls=[];
  const sb={storage:{from(bucket){return{
    async download(path){calls.push(['download',bucket,path]);return{data:new Blob([`${bucket}:${path}`]),error:null}}
  }}}};
  const media=load(),row={storage_bucket:'question-images',image_path:'legacy/a.png'};
  assert.equal(await media.objectUrl(sb,row),'blob:test-1');
  assert.equal(await(await media.download(sb,row)).text(),'question-images:legacy/a.png');
  assert.deepEqual(calls,[['download','question-images','legacy/a.png'],['download','question-images','legacy/a.png']]);
});

test('legacy rows default to question-media and reuse a browser-local URL',async()=>{
  let downloads=0;
  const sb={storage:{from(bucket){return{async download(path){downloads++;return{data:new Blob([`${bucket}/${path}`]),error:null}}}}}};
  const media=load(),row={image_path:'q/image.png'};
  assert.equal(await media.objectUrl(sb,row),'blob:test-1');
  assert.equal(await media.objectUrl(sb,row),'blob:test-1');
  assert.equal(downloads,1);
});
