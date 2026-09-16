(()=>{
'use strict';
const DEFAULT_BUCKET='question-media',TTL=60*60,CACHE_MS=40*60*1000;
const cache=new Map();
const bucketOf=row=>String(row?.storage_bucket||DEFAULT_BUCKET);
async function signedUrl(sb,row,seconds=TTL){
  const path=String(row?.image_path||row?.path||'');
  if(!sb||!path)throw new Error('画像の保存先を確認できません');
  const bucket=bucketOf(row),key=`${bucket}\n${path}`,now=Date.now(),hit=cache.get(key);
  if(hit&&hit.expires>now)return hit.url;
  const result=await sb.storage.from(bucket).createSignedUrl(path,seconds);
  if(result.error||!result.data?.signedUrl)throw result.error||new Error('画像の閲覧URLを作成できません');
  cache.set(key,{url:result.data.signedUrl,expires:now+Math.min(CACHE_MS,Math.max(30,seconds-60)*1000)});
  return result.data.signedUrl;
}
async function prepare(sb,rows,seconds=TTL){
  const signedAt=Date.now();
  return Promise.all((rows||[]).map(async row=>({...row,image_url:await signedUrl(sb,row,seconds),image_signed_at:signedAt})));
}
async function download(sb,row){
  const path=String(row?.image_path||row?.path||'');
  if(!path)throw new Error('画像の保存先を確認できません');
  const result=await sb.storage.from(bucketOf(row)).download(path);
  if(result.error)throw result.error;
  return result.data;
}
function forget(row){
  const path=String(row?.image_path||row?.path||'');
  if(path)cache.delete(`${bucketOf(row)}\n${path}`);
}
window.QBAuthenticatedMedia={bucketOf,signedUrl,prepare,download,forget};
})();
