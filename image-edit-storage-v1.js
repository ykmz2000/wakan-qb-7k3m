/* New objects + conditional row update. Never overwrite a shared storage object. */
(()=>{
'use strict';
const id=q=>String(q?.id||q?.dbId||'');
function currentId(){try{return id(window.pq?.())}catch{return''}}
async function authorize(c){
  if(!c?.questionId||!c.host?.isConnected||currentId()!==String(c.questionId))throw Error('問題が切り替わりました。画像を保存する前に編集を開き直してください。');
  if(c.alive&&!c.alive())throw Error('編集が終了しました。画像の保存先を確認して開き直してください。');
  const auth=await c.sb.auth.getUser(),user=auth.data?.user;if(auth.error||!user)throw Error('ログイン情報を確認できません。');
  if(c.userId&&user.id!==c.userId)throw Error('ログイン中のユーザーが変わりました。');
  if(c.bucket==='user-note-images'&&(!c.userId||c.userId!==user.id))throw Error('本人の画像のみ編集できます。');
  if(c.bucket!=='user-note-images'){const role=await c.sb.from('profiles').select('role').eq('id',user.id).maybeSingle();if(role.error||role.data?.role!=='admin')throw Error('この画像の編集権限を確認できません。')}
  return user;
}
function table(c){return c.bucket==='user-note-images'?'user_note_images':'question_images'}
function scoped(c,query){query=query.eq('question_id',c.questionId);return c.userId?query.eq('user_id',c.userId):query}
async function get(c,rowId){const r=await scoped(c,c.sb.from(table(c)).select('*').eq('id',rowId)).maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error('画像が見つかりません。');return r.data}
function ext(blob){return blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':blob.type==='image/gif'?'gif':blob.type==='image/heic'?'heic':blob.type==='image/heif'?'heif':'png'}
function objectPath(c,blob){return c.userId?`${c.userId}/${c.questionId}/${c.noteId}/${crypto.randomUUID()}.${ext(blob)}`:`${c.questionId}/${c.placement}/${c.choiceId||'question'}/${crypto.randomUUID()}.${ext(blob)}`}
async function upload(c,blob){if(!blob||blob.size>20*1024*1024)throw Error('保存する画像は20MB以下にしてください。');const path=objectPath(c,blob),r=await c.sb.storage.from(c.bucket).upload(path,blob,{contentType:blob.type||'image/png',upsert:false,cacheControl:'3600'});if(r.error)throw r.error;return path}
async function discardUnreferenced(c,path){
  // A failed response can still have committed. Preserve every referenced image version.
  const checks=await Promise.all(['image_path','original_image_path','annotation_base_image_path'].map(column=>c.sb.from(table(c)).select('id').eq(column,path).limit(1)));
  if(checks.every(r=>!r.error&&!r.data?.length))await c.sb.storage.from(c.bucket).remove([path]);
}
async function replace(c,row,blob,operation='crop'){
  await authorize(c);const latest=await get(c,row.id);if(latest.image_path!==row.image_path||(row.updated_at&&latest.updated_at!==row.updated_at))throw Error('別の画像更新がありました。書き込みは残っています。キャンセルして最新の画像を開き直してください。');
  const path=await upload(c,blob);let result;
  try{
    // Bind provenance to the exact result. Cached clients changing image_path cannot expose an obsolete pre-crop version.
    const annotationBase=operation==='annotation'?(latest.annotation_result_image_path===latest.image_path&&latest.annotation_base_image_path||latest.image_path):null;
    await authorize(c);let q=scoped(c,c.sb.from(table(c)).update({image_path:path,original_image_path:latest.original_image_path||latest.image_path,annotation_base_image_path:annotationBase,annotation_result_image_path:annotationBase?path:null,updated_at:new Date().toISOString()}).eq('id',row.id).eq('image_path',latest.image_path));if(latest.updated_at)q=q.eq('updated_at',latest.updated_at);
    result=await q.select('id,image_path,original_image_path').maybeSingle();
    if(result.error||!result.data){const check=await get(c,row.id);if(check.image_path!==path)throw result.error||Error('保存中に別の更新がありました。');result={data:check}}
    return result.data;
  }catch(e){await discardUnreferenced(c,path).catch(()=>{});throw e}
}
async function add(c,blob,original){
  const user=await authorize(c);if(c.beforeSave)await c.beforeSave(user);await authorize(c);
  let originalPath=null,path=null;
  try{
    if(original)originalPath=await upload(c,original);path=await upload(c,blob);await authorize(c);
    const existing=await scoped(c,c.sb.from(table(c)).select('sort_order').eq('placement',c.placement)).order('sort_order',{ascending:false}).limit(1);if(existing.error)throw existing.error;
    const payload={question_id:c.questionId,choice_id:c.choiceId||null,placement:c.placement,image_path:path,original_image_path:originalPath,sort_order:(existing.data?.[0]?.sort_order||0)+10};
    if(c.userId)Object.assign(payload,{user_id:c.userId,note_id:c.noteId});
    const r=await c.sb.from(table(c)).insert(payload).select('id,image_path,original_image_path').single();
    if(r.error||!r.data){const check=await scoped(c,c.sb.from(table(c)).select('id,image_path,original_image_path').eq('image_path',path)).maybeSingle();if(check.error||!check.data)throw r.error||Error('保存結果を確認できません。');return check.data}return r.data;
  }catch(e){if(path)await discardUnreferenced(c,path).catch(()=>{});if(originalPath)await discardUnreferenced(c,originalPath).catch(()=>{});throw e}
}
async function restore(c,row){await authorize(c);if(!row.original_image_path||row.original_image_path===row.image_path)return;const r=await scoped(c,c.sb.from(table(c)).update({image_path:row.original_image_path,annotation_base_image_path:null,annotation_result_image_path:null,updated_at:new Date().toISOString()}).eq('id',row.id).eq('image_path',row.image_path)).select('id').maybeSingle();if(r.error||!r.data)throw r.error||Error('別の画像更新がありました。開き直してください。')}
async function download(c,path){const r=await c.sb.storage.from(c.bucket).download(path);if(r.error)throw r.error;return r.data}
async function remove(c,row){
  await authorize(c);
  let z=scoped(c,c.sb.from(table(c)).delete().eq('id',row.id).eq('image_path',row.image_path));
  if(row.updated_at)z=z.eq('updated_at',row.updated_at);
  const r=await z.select('id').maybeSingle();
  if(r.error||!r.data)throw r.error||Error('画像が更新されています。最新の状態でやり直してください。');
  // Storage objects may also be referenced by another question. Keep them intact.
}
window.QBImageStore={authorize,get,replace,add,restore,download,remove};
})();
