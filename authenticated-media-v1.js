(()=>{
'use strict';
const DEFAULT_BUCKET='question-media',CACHE_MS=40*60*1000,MAX_CACHE=120;
const cache=new Map();
const bucketOf=row=>String(row?.storage_bucket||DEFAULT_BUCKET);
async function download(sb,row){
  const path=String(row?.image_path||row?.path||'');
  if(!sb||!path)throw new Error('画像の保存先を確認できません');
  const result=await sb.storage.from(bucketOf(row)).download(path);
  if(result.error)throw result.error;
  return result.data;
}
async function objectUrl(sb,row){
  const path=String(row?.image_path||row?.path||'');
  const key=`${bucketOf(row)}\n${path}`,now=Date.now(),hit=cache.get(key);
  if(hit&&hit.expires>now)return hit.url;
  if(hit)URL.revokeObjectURL(hit.url);
  const url=URL.createObjectURL(await download(sb,row));
  cache.set(key,{url,expires:now+CACHE_MS});
  while(cache.size>MAX_CACHE){const oldest=cache.keys().next().value,old=cache.get(oldest);URL.revokeObjectURL(old.url);cache.delete(oldest)}
  return url;
}
async function prepare(sb,rows){
  const loadedAt=Date.now();
  return Promise.all((rows||[]).map(async row=>({...row,image_url:await objectUrl(sb,row),image_loaded_at:loadedAt})));
}
function forget(row){
  const path=String(row?.image_path||row?.path||'');
  const key=`${bucketOf(row)}\n${path}`,hit=cache.get(key);
  if(hit)URL.revokeObjectURL(hit.url);
  cache.delete(key);
}
window.addEventListener?.('beforeunload',()=>{for(const hit of cache.values())URL.revokeObjectURL(hit.url);cache.clear()});
window.QBAuthenticatedMedia={bucketOf,objectUrl,prepare,download,forget};
})();
