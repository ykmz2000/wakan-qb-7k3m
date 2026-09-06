(()=>{
'use strict';
let raf=0;
const BUCKET='question-media';
const q=()=>{try{return window.pq?.()||null}catch{return null}};
const qid=Q=>Q?.id||Q?.dbId||null;
function publicUrl(sb,path){return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}
function ext(path,blob){return window.qbRecentImagePicker?.extFromPath?.(path,blob)||((String(path||'').match(/\.([a-zA-Z0-9]+)$/)||[])[1]||'png').toLowerCase().replace('jpeg','jpg')}
async function recentFiles(sb,rows){
  const out=[];
  for(const row of rows){
    const d=await sb.storage.from(BUCKET).download(row.image_path);if(d.error)throw new Error(`元画像の取得に失敗: ${d.error.message}`);
    const b=d.data,e=ext(row.image_path,b),type=b.type||({'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp','gif':'image/gif','heic':'image/heic','heif':'image/heif'}[e]||'application/octet-stream');
    out.push(new File([b],`recent-${crypto.randomUUID()}.${e}`,{type}));
  }
  return out;
}
function dispatchFiles(input,files){
  if(!input||!files.length)return false;
  try{
    const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }catch(e){console.error(e);return false}
}
async function chooseRecent(input,status,button){
  const sb=window.qbSupabase,picker=window.qbRecentImagePicker;if(!sb||!picker)return;
  try{
    button.disabled=true;if(status)status.textContent='最近の画像を読み込んでいます…';
    const rows=await picker.pick({sb,title:'最近アップロードした画像'});if(!rows.length){if(status)status.textContent='';return}
    if(status)status.textContent='選択した画像を準備中…';
    const files=await recentFiles(sb,rows);
    if(!dispatchFiles(input,files))throw new Error('この端末では画像の受け渡しに失敗しました');
  }catch(e){if(status)status.textContent='最近の画像の追加失敗: '+(e?.message||e)}finally{setTimeout(()=>{if(button.isConnected)button.disabled=false},300)}
}
function ensureCropper(){
  if(window.Cropper)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    if(!document.getElementById('cropperCss')){const l=document.createElement('link');l.id='cropperCss';l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css';document.head.appendChild(l)}
    const old=document.getElementById('cropperJs');if(old){if(window.Cropper)return resolve();old.addEventListener('load',()=>resolve(),{once:true});old.addEventListener('error',()=>reject(new Error('Cropper.jsの読み込みに失敗しました')),{once:true});return}
    const s=document.createElement('script');s.id='cropperJs';s.src='https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js';s.onload=()=>resolve();s.onerror=()=>reject(new Error('Cropper.jsの読み込みに失敗しました'));document.head.appendChild(s)
  })
}
async function cropModal(src){
  await ensureCropper();
  return new Promise((resolve,reject)=>{
    const d=document.createElement('div');d.className='oeiCropModal';d.innerHTML=`<div class="oeiCropPanel"><div class="oeiCropHead"><b>問題画像をトリミング</b><button type="button" class="oeiCropClose">×</button></div><div class="oeiCropHint">角・辺をドラッグして範囲変更／画像をドラッグして位置調整／ピンチで拡大縮小</div><div class="oeiCropStage"><img class="oeiCropImage" src="${String(src).replace(/"/g,'&quot;')}" alt="トリミング対象"></div><div class="oeiAspect"><button type="button" data-r="NaN" class="on">自由</button><button type="button" data-r="1">1:1</button><button type="button" data-r="1.333333">4:3</button><button type="button" data-r="1.777778">16:9</button></div><div class="oeiCropFoot"><button type="button" class="oeiCropCancel">キャンセル</button><button type="button" class="oeiCropSave">この範囲で保存</button></div></div>`;
    document.body.appendChild(d);const oldOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
    const img=d.querySelector('.oeiCropImage');let cropper=null;
    const close=()=>{try{cropper?.destroy()}catch{}d.remove();document.documentElement.style.overflow=oldOverflow};
    img.onload=()=>{try{cropper=new Cropper(img,{viewMode:1,dragMode:'move',autoCropArea:.9,responsive:true,restore:false,checkOrientation:true,modal:true,guides:true,center:true,highlight:true,background:true,cropBoxMovable:true,cropBoxResizable:true,toggleDragModeOnDblclick:false,zoomOnTouch:true,zoomOnWheel:false,movable:true,zoomable:true,scalable:false,rotatable:false})}catch(e){close();reject(e)}};
    img.onerror=()=>{close();reject(new Error('画像を読み込めませんでした'))};
    d.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{d.querySelectorAll('[data-r]').forEach(x=>x.classList.remove('on'));b.classList.add('on');cropper?.setAspectRatio(Number(b.dataset.r))});
    d.querySelector('.oeiCropClose').onclick=d.querySelector('.oeiCropCancel').onclick=()=>{close();resolve(null)};
    d.querySelector('.oeiCropSave').onclick=()=>{if(!cropper)return;const canvas=cropper.getCroppedCanvas({maxWidth:4096,maxHeight:4096,imageSmoothingEnabled:true,imageSmoothingQuality:'high'});canvas.toBlob(blob=>{close();if(!blob)return reject(new Error('トリミング画像の生成に失敗しました'));resolve(blob)},'image/jpeg',0.94)};
  })
}
async function cropStem(button){
  const wrap=button.closest('.qsiImgWrap'),rowId=wrap?.dataset.row,Q=q(),id=qid(Q),sb=window.qbSupabase;if(!rowId||!id||!sb)return;
  const oldText=button.textContent;
  try{
    button.disabled=true;button.textContent='準備中…';
    const r=await sb.from('question_images').select('id,image_path').eq('id',rowId).maybeSingle();if(r.error||!r.data)throw r.error||new Error('画像情報がありません');
    const blob=await cropModal(publicUrl(sb,r.data.image_path));if(!blob)return;
    button.textContent='保存中…';const path=`${id}/question/question/${crypto.randomUUID()}.jpg`,file=new File([blob],`crop-${Date.now()}.jpg`,{type:'image/jpeg'});
    const u=await sb.storage.from(BUCKET).upload(path,file,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});if(u.error)throw new Error(`Storage: ${u.error.message}`);
    const up=await sb.from('question_images').update({image_path:path,updated_at:new Date().toISOString()}).eq('id',rowId);if(up.error){await sb.storage.from(BUCKET).remove([path]);throw new Error(`DB: ${up.error.message}`)}
    await sb.storage.from(BUCKET).remove([r.data.image_path]);
    window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:id,type:'question-image-crop'}}));
  }catch(e){alert('トリミング失敗: '+(e?.message||e))}finally{if(button.isConnected){button.disabled=false;button.textContent=oldText}}
}
function css(){
  if(document.getElementById('qbilCss'))return;const s=document.createElement('style');s.id='qbilCss';s.textContent=`
.qsiCropTool{position:absolute;right:7px;bottom:7px;z-index:3;border:1px solid #cbd7e3;background:#fffffff2;color:#126fb3;border-radius:8px;padding:5px 8px;font-weight:900;font-size:11px}
.qsiRecentBtn{border:1px solid #126fb3;background:#fff;color:#126fb3;border-radius:8px;padding:8px 10px;font-size:11px;font-weight:900}
.oeiRecentBtn:disabled,.qsiRecentBtn:disabled,.qsiCropTool:disabled{opacity:.5}
`;
  document.head.appendChild(s)
}
function enhanceStem(){
  document.querySelectorAll('.qsiImgWrap').forEach(w=>{if(!w.querySelector('.qsiDelete')||w.querySelector('.qsiCropTool'))return;const b=document.createElement('button');b.type='button';b.className='qsiCropTool';b.textContent='✂︎ トリミング';b.onclick=()=>cropStem(b);w.appendChild(b)});
  document.querySelectorAll('.qsiEditor,.qsiInlineEditor').forEach(box=>{const actions=box.querySelector('.qsiActions'),input=box.querySelector('input[type=file]');if(!actions||!input||actions.querySelector('.qsiRecentBtn'))return;const b=document.createElement('button');b.type='button';b.className='qsiRecentBtn';b.textContent='🕘 最近の画像';actions.appendChild(b);b.onclick=()=>chooseRecent(input,box.querySelector('.qsiStatus'),b)})
}
function enhanceOfficial(){
  document.querySelectorAll('.oeiBox').forEach(box=>{const actions=box.querySelector('.oeiActions'),input=box.querySelector('.oeiFile');if(!actions||!input||actions.querySelector('.oeiRecentBtn'))return;const b=document.createElement('button');b.type='button';b.className='oeiBtn oeiRecentBtn';b.textContent='🕘 最近の画像';actions.appendChild(b);b.onclick=()=>chooseRecent(input,box.querySelector('.oeiStatus'),b)})
}
function scan(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;css();enhanceStem();enhanceOfficial()})}
function relevant(node){if(!(node instanceof Element))return false;return node.matches?.('.qsiHost,.qsiImgWrap,.qsiEditor,.qsiInlineEditor,.oeiBox,.adeEditor')||!!node.querySelector?.('.qsiHost,.qsiImgWrap,.qsiEditor,.qsiInlineEditor,.oeiBox,.adeEditor')}
function boot(){
  css();scan();['qb-screen-change','qb-content-updated','qb-admin-editor-opened','qb-answer-shown'].forEach(ev=>window.addEventListener(ev,scan));
  const v=document.getElementById('view');if(v)new MutationObserver(ms=>{if(ms.some(m=>[...m.addedNodes].some(relevant)))scan()}).observe(v,{childList:true,subtree:true})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
