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
    const b=d.data,e=ext(row.image_path,b),type=b.type||({'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp','gif':'image/gif','heic':'image/heic','heif':'image/heif','pdf':'application/pdf'}[e]||'application/octet-stream');
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
    button.disabled=true;if(status)status.textContent='最近のファイルを読み込んでいます…';
    const rows=await picker.pick({sb,title:'最近アップロードしたファイル'});if(!rows.length){if(status)status.textContent='';return}
    if(status)status.textContent='選択したファイルを準備中…';
    const files=await recentFiles(sb,rows);
    if(!dispatchFiles(input,files))throw new Error('この端末ではファイルの受け渡しに失敗しました');
  }catch(e){if(status)status.textContent='最近のファイルの追加失敗: '+(e?.message||e)}finally{setTimeout(()=>{if(button.isConnected)button.disabled=false},300)}
}
function cropModal(src){return window.QBImageCrop.open(src,{title:'問題画像をトリミング',rotatable:false})}
async function cropStem(button){
  const wrap=button.closest('.qsiImgWrap'),rowId=wrap?.dataset.row,Q=q(),id=qid(Q),sb=window.qbSupabase;if(!rowId||!id||!sb)return;
  const oldText=button.textContent;
  try{
    button.disabled=true;button.textContent='準備中…';
    const r=await sb.from('question_images').select('*').eq('id',rowId).eq('question_id',id).maybeSingle();if(r.error||!r.data)throw r.error||new Error('画像情報がありません');
    const blob=await cropModal(publicUrl(sb,r.data.image_path));if(!blob)return;
    button.textContent='保存中…';
    await window.QBImageStore.replace({sb,bucket:BUCKET,questionId:String(id),placement:'question',choiceId:null,host:wrap.closest('.qsiHost')},r.data,blob);
    window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:id,type:'question-image-crop'}}));
  }catch(e){alert('トリミング失敗: '+(e?.message||e))}finally{if(button.isConnected){button.disabled=false;button.textContent=oldText}}
}
function css(){
  if(document.getElementById('qbilCss'))return;const s=document.createElement('style');s.id='qbilCss';s.textContent=`
.qsiCropTool{position:absolute;right:7px;bottom:7px;z-index:3;border:1px solid var(--accent-border,var(--line));background:#fffffff2;color:var(--accent);border-radius:8px;padding:5px 8px;font-weight:900;font-size:11px}
.qsiRecentBtn{border:1px solid var(--accent);background:#fff;color:var(--accent);border-radius:8px;padding:8px 10px;font-size:11px;font-weight:900}
.oeiRecentBtn:disabled,.qsiRecentBtn:disabled,.qsiCropTool:disabled{opacity:.5}
`;
  document.head.appendChild(s)
}
function enhanceStem(){
  document.querySelectorAll('.qsiImgWrap').forEach(w=>{if(window.QBImageEditor||w.querySelector('[data-pdf-src]')||!w.querySelector('.qsiDelete')||w.querySelector('.qsiCropTool'))return;const b=document.createElement('button');b.type='button';b.className='qsiCropTool';b.textContent='トリミング';b.onclick=()=>cropStem(b);w.appendChild(b)});
  document.querySelectorAll('.qsiEditor,.qsiInlineEditor').forEach(box=>{const actions=box.querySelector('.qsiActions'),input=box.querySelector('input[type=file]');if(!actions||!input||actions.querySelector('.qsiRecentBtn'))return;const b=document.createElement('button');b.type='button';b.className='qsiRecentBtn';b.textContent='最近のファイル';actions.appendChild(b);b.onclick=()=>chooseRecent(input,box.querySelector('.qsiStatus'),b)})
}
function enhanceOfficial(){
  document.querySelectorAll('.oeiBox').forEach(box=>{const actions=box.querySelector('.oeiActions'),input=box.querySelector('.oeiFile');if(!actions||!input||actions.querySelector('.oeiRecentBtn'))return;const b=document.createElement('button');b.type='button';b.className='oeiBtn oeiRecentBtn';b.textContent='最近のファイル';actions.appendChild(b);b.onclick=()=>chooseRecent(input,box.querySelector('.oeiStatus'),b)})
}
function scan(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;css();enhanceStem();enhanceOfficial()})}
function relevant(node){if(!(node instanceof Element))return false;return node.matches?.('.qsiHost,.qsiImgWrap,.qsiEditor,.qsiInlineEditor,.oeiBox,.adeEditor')||!!node.querySelector?.('.qsiHost,.qsiImgWrap,.qsiEditor,.qsiInlineEditor,.oeiBox,.adeEditor')}
function boot(){
  css();scan();['qb-screen-change','qb-content-updated','qb-admin-editor-opened','qb-answer-shown'].forEach(ev=>window.addEventListener(ev,scan));
  const v=document.getElementById('view');if(v)new MutationObserver(ms=>{if(ms.some(m=>[...m.addedNodes].some(relevant)))scan()}).observe(v,{childList:true,subtree:true})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
