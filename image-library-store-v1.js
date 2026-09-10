(function(root){
'use strict';
const BUCKET='qb-image-library',DESTINATION='question-media',C=root.QBImageLibraryCore;
const TYPES={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/heic':'heic','image/heif':'heif'};
const one=data=>Array.isArray(data)?data[0]:data;
const unwrap=r=>{if(r.error)throw r.error;return r.data};
async function available(sb){
 const a=await sb.auth.getUser();if(a.error||!a.data?.user)return false;
 const p=await sb.from('profiles').select('role').eq('id',a.data.user.id).maybeSingle();if(p.error||p.data?.role!=='admin')return false;
 const r=await sb.from('qb_image_library_config').select('enabled').eq('singleton',true).maybeSingle();return !r.error&&r.data?.enabled===true;
}
async function authorize(sb){if(!await available(sb))throw Error('画像ライブラリの利用権限または稼働状況を確認できません。')}
async function get(sb,id){const r=await sb.from('qb_image_library_items').select('*').eq('id',id).maybeSingle();const row=unwrap(r);if(!row)throw Error('画像が見つかりません。');return row}
async function signedURL(sb,path){return unwrap(await sb.storage.from(BUCKET).createSignedUrl(path,1800)).signedUrl}
function fileInfo(file){if(!file||!file.size||file.size>20*1024*1024)throw Error('画像は20MB以下にしてください。');const type=(file.type||'').toLowerCase(),ext=TYPES[type];if(!ext)throw Error('PNG・JPEG・WebP・GIF・HEIC・HEIFの画像を選んでください。');return {type,ext}}
async function upload(sb,id,file){const {type,ext}=fileInfo(file),path=id+'/'+crypto.randomUUID()+'.'+ext;unwrap(await sb.storage.from(BUCKET).upload(path,file,{contentType:type,upsert:false,cacheControl:'3600'}));return path}
async function add(sb,file){
 await authorize(sb);const id=crypto.randomUUID(),path=await upload(sb,id,file);
 const payload={id,object_path:path,original_path:path,metadata:{name:file.name||'画像',subject_ids:[],topics:[],keywords:[],aspects:[],roles:[],aliases:[],related_keywords:[],notes:'',ocr_text:'',visual_summary:'',analysis_status:'unprocessed',classification_status:'unknown'}};
 // An ambiguous write may already have committed. Never remove the original on error.
 const r=await sb.from('qb_image_library_items').insert(payload).select('*').single();
 if(r.error){const check=await get(sb,id).catch(()=>null);if(check?.object_path===path)return check;throw Error('登録結果を確認できません。再確認用の画像ID: '+id+' / '+r.error.message)}return r.data;
}
async function addRecent(sb,row){
 await authorize(sb);
 const source=unwrap(await sb.from('question_images').select('id,image_path,annotation_base_image_path,annotation_result_image_path').eq('id',row.id).maybeSingle());
 const path=row.image_path,before=row.image_variant==='before-annotation';
 if(!source||!path||(before?(source.annotation_base_image_path!==path||source.annotation_result_image_path!==source.image_path):source.image_path!==path))throw Error('元画像が更新されています。最近の画像から選び直してください。');
 const blob=unwrap(await sb.storage.from(DESTINATION).download(path));
 const ext=path.split('.').pop().toLowerCase(),type=Object.keys(TYPES).find(t=>TYPES[t]===ext)||(ext==='jpeg'?'image/jpeg':'');
 const file=new File([blob],(before?'書き込み前の画像':'最近の画像')+'.'+(TYPES[blob.type]||ext),{type:TYPES[blob.type]?blob.type:type});
 return add(sb,file);
}
async function save(sb,row,patch,options={}){
 C.validate(patch);const r=await sb.rpc('qb_library_save',{p_id:row.id,p_revision:row.revision,p_patch:patch,p_origin:options.origin||'manual',p_reason:options.reason||'情報を編集',p_archived:options.archived??null,p_object_path:options.objectPath||null});return one(unwrap(r));
}
async function replace(sb,row,file){await authorize(sb);const latest=await get(sb,row.id);if(latest.revision!==row.revision)throw Error('別の更新があります。最新の情報を確認してください。');const path=await upload(sb,row.id,file);return save(sb,row,{}, {objectPath:path,reason:'原本を新しい画像に差し替え'})}
async function search(sb,state={}){return unwrap(await sb.rpc('qb_library_search',{p_query:state.query||'',p_subjects:state.subjects||[],p_aspect:state.aspect||'',p_analysis:state.analysis||'',p_classification:state.classification||'',p_used:state.used||'',p_related:!!state.related,p_archived:!!state.archived,p_offset:state.offset||0,p_limit:30}))||[]}
async function catalog(sb,table){let rows=[];for(let n=0;;n+=200){const q=sb.from(table).select('*').order(table==='subjects'?'sort_order':'canonical').range(n,n+199),batch=unwrap(await q)||[];rows.push(...batch);if(batch.length<200)return rows}}
async function history(sb,id,offset=0){return unwrap(await sb.from('qb_image_library_history').select('*').eq('image_id',id).order('revision',{ascending:false}).range(offset,offset+49))||[]}
async function readings(sb,id){return unwrap(await sb.from('qb_image_library_readings').select('*').eq('image_id',id).order('created_at',{ascending:false}).limit(20))||[]}
async function usages(sb,id,offset=0){return unwrap(await sb.from('qb_image_library_usages').select('*').eq('image_id',id).order('created_at',{ascending:false}).range(offset,offset+49))||[]}
async function recordReading(sb,row,envelope){
 if(envelope.image_id!==row.id||envelope.image_version!==row.image_version||envelope.revision!==row.revision)throw Error('読み取り結果の画像ID・画像版・情報版が現在の画像と一致しません。');
 if(!envelope.request_id)throw Error('読み取り結果のrequest_idが必要です。');
 if(!envelope.reading){
  if(!envelope.classification||!Object.keys(envelope.classification).length)throw Error('読み取りまたは分類の結果が必要です。');
  return save(sb,row,envelope.classification,{origin:'ai',reason:'明示的な分類依頼の結果を反映'});
 }
 return one(unwrap(await sb.rpc('qb_library_record_reading',{p_id:row.id,p_revision:row.revision,p_image_version:row.image_version,p_request_id:envelope.request_id,p_reading:envelope.reading,p_classification:envelope.classification||{}})));
}
async function termSave(sb,row,canonical,aliases){
 canonical=canonical.trim();aliases=C.list(aliases);if(!canonical)throw Error('正式な検索語を入力してください。');
 let q=sb.from('qb_image_library_terms');
 q=row?q.update({canonical,aliases,revision:row.revision+1,updated_at:new Date().toISOString()}).eq('id',row.id).eq('revision',row.revision):q.insert({canonical,aliases});
 const r=await q.select('*').maybeSingle();const value=unwrap(r);if(!value)throw Error('検索語に別の更新があります。最新の情報を確認してください。');return value;
}
function newJob(row,context){const requestId=crypto.randomUUID(),ext=row.object_path.split('.').pop().toLowerCase();if(!Object.values(TYPES).includes(ext))throw Error('元画像の形式を確認できません。');return {imageId:row.id,revision:row.revision,sourcePath:row.object_path,questionId:context.questionId,placement:context.placement,choiceId:context.choiceId||null,requestId,path:`${context.questionId}/${context.placement}/${context.choiceId||'question'}/library-${requestId}.${ext}`,copied:false}}
async function usageByRequest(sb,id){return unwrap(await sb.from('qb_image_library_usages').select('*').eq('id',id).maybeSingle())}
async function attach(sb,row,context,job){
 if(!job||job.imageId!==row.id||job.questionId!==context.questionId||job.placement!==context.placement||job.choiceId!==(context.choiceId||null))throw Error('貼り付け先が一致しません。');
 const ensure=async()=>{if(!context.alive())throw Error('貼り付け先の編集が終了しました。保存先を開き直してください。');await authorize(sb);if(!context.alive())throw Error('貼り付け先が切り替わりました。');};
 await ensure();const old=await usageByRequest(sb,job.requestId);if(old)return old;
 const latest=await get(sb,row.id);if(latest.archived||latest.revision!==job.revision||latest.object_path!==job.sourcePath)throw Error('原本が更新されています。最新画像を確認してください。');
 if(!job.copied){
  const blob=unwrap(await sb.storage.from(BUCKET).download(job.sourcePath));await ensure();
  const u=await sb.storage.from(DESTINATION).upload(job.path,blob,{contentType:blob.type||'image/png',upsert:false,cacheControl:'3600'});
  if(u.error){
   // Only this random request path can be reused. Never overwrite an object.
   const check=await sb.storage.from(DESTINATION).download(job.path);if(check.error||!check.data||check.data.size!==blob.size)throw u.error;
   const a=new Uint8Array(await blob.arrayBuffer()),b=new Uint8Array(await check.data.arrayBuffer());if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('コピー先の内容が一致しません。');
  }
  job.copied=true;
 }
 await ensure();const r=await sb.rpc('qb_library_attach',{p_id:row.id,p_revision:job.revision,p_question_id:job.questionId,p_placement:job.placement,p_choice_id:job.choiceId,p_copy_path:job.path,p_request_id:job.requestId});
 if(r.error){const check=await usageByRequest(sb,job.requestId).catch(()=>null);if(check)return check;throw r.error;}
 return one(r.data);
}
root.QBImageLibraryStore={BUCKET,available,authorize,get,signedURL,add,addRecent,save,replace,search,catalog,history,readings,usages,recordReading,termSave,newJob,attach};
})(typeof window!=='undefined'?window:globalThis);
