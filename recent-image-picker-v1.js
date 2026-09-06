(()=>{
'use strict';
const BUCKET='question-media';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function publicUrl(sb,path){return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}
function css(){
  if(document.getElementById('qbripCss'))return;
  const s=document.createElement('style');s.id='qbripCss';s.textContent=`
.qbripModal{position:fixed;inset:0;z-index:10040;background:#0009;display:flex;align-items:flex-end;justify-content:center;padding:12px}
.qbripPanel{width:min(820px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px 18px 12px 12px;padding:12px}
.qbripHead{display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:-12px;background:#fff;z-index:3;padding:10px 0 8px}
.qbripClose{border:0;background:transparent;font-size:26px;line-height:1}
.qbripSub{font-size:11px;color:#6f7786;margin:0 0 9px}
.qbripGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.qbripItem{position:relative;border:2px solid transparent;background:#f6f8fb;border-radius:11px;padding:5px;min-height:110px}
.qbripItem.on{border-color:#126fb3;background:#eaf4fb}
.qbripItem img{display:block;width:100%;height:120px;object-fit:contain;background:#fff;border-radius:7px}
.qbripMeta{font-size:9px;color:#6f7786;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.qbripCheck{position:absolute;right:8px;top:8px;width:24px;height:24px;border-radius:999px;background:#fff;border:1px solid #cbd7e3;display:grid;place-items:center;font-weight:900;color:#126fb3}
.qbripItem.on .qbripCheck{background:#126fb3;color:#fff;border-color:#126fb3}
.qbripFoot{position:sticky;bottom:-12px;background:#fff;padding:10px 0 2px;margin-top:10px;display:flex;gap:8px}
.qbripFoot button{min-height:44px;border-radius:10px;font-weight:900;flex:1}
.qbripCancel{border:1px solid #dce3ec;background:#fff}.qbripUse{border:0;background:#126fb3;color:#fff}.qbripUse:disabled{opacity:.45}
.qbripEmpty{padding:24px;text-align:center;color:#6f7786;font-size:12px}
@media(max-width:560px){.qbripGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.qbripItem img{height:92px}.qbripModal{padding:0}.qbripPanel{max-height:92vh;border-radius:18px 18px 0 0}}
`;
  document.head.appendChild(s);
}
function placementLabel(p){return({question:'問題文',explanation_overview:'問題文のポイント',choice_explanation:'選択肢解説',examiner_intent:'出題者の意図',exam_summary:'試験用まとめ',medical_verification:'医学的検証'}[p]||p||'画像')}
async function recentRows(sb,limit=40){
  const r=await sb.from('question_images').select('id,image_path,question_id,placement,choice_id,created_at').not('image_path','is',null).order('created_at',{ascending:false}).limit(limit);
  if(r.error)throw r.error;
  const seen=new Set(),out=[];
  for(const x of r.data||[]){if(!x.image_path||seen.has(x.image_path))continue;seen.add(x.image_path);out.push(x)}
  return out;
}
async function pick({sb,limit=40,title='最近アップロードした画像'}={}){
  if(!sb)throw new Error('Supabaseを取得できません');css();
  const rows=await recentRows(sb,limit);
  return new Promise(resolve=>{
    const d=document.createElement('div');d.className='qbripModal';
    d.innerHTML=`<div class="qbripPanel"><div class="qbripHead"><b>${esc(title)}</b><button type="button" class="qbripClose">×</button></div><div class="qbripSub">最近追加した公式画像から選択できます。選んだ画像は現在の問題用にコピーして保存するため、元画像を削除しても影響しません。</div>${rows.length?`<div class="qbripGrid">${rows.map((x,i)=>`<button type="button" class="qbripItem" data-i="${i}"><img loading="lazy" src="${esc(publicUrl(sb,x.image_path))}" alt="最近の画像"><span class="qbripCheck">✓</span><div class="qbripMeta">${esc(placementLabel(x.placement))}</div></button>`).join('')}</div>`:'<div class="qbripEmpty">最近アップロードした画像はありません。</div>'}<div class="qbripFoot"><button type="button" class="qbripCancel">キャンセル</button><button type="button" class="qbripUse" disabled>選択した画像を追加</button></div></div>`;
    document.body.appendChild(d);const oldOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
    const selected=new Set(),use=d.querySelector('.qbripUse');
    const close=value=>{d.remove();document.documentElement.style.overflow=oldOverflow;resolve(value)};
    d.querySelector('.qbripClose').onclick=d.querySelector('.qbripCancel').onclick=()=>close([]);
    d.querySelectorAll('.qbripItem').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.i);selected.has(i)?selected.delete(i):selected.add(i);b.classList.toggle('on',selected.has(i));use.disabled=!selected.size;use.textContent=selected.size?`選択した${selected.size}枚を追加`:'選択した画像を追加'});
    use.onclick=()=>close([...selected].sort((a,b)=>a-b).map(i=>rows[i]).filter(Boolean));
  });
}
function extFromPath(path,blob){const m=String(path||'').match(/\.([a-zA-Z0-9]+)(?:\?|$)/);if(m)return m[1].toLowerCase().replace('jpeg','jpg');const t=String(blob?.type||'').split('/')[1]||'png';return t.replace('jpeg','jpg')}
async function copyObject(sb,sourcePath,targetPath){
  const d=await sb.storage.from(BUCKET).download(sourcePath);if(d.error)throw new Error(`元画像の取得に失敗: ${d.error.message}`);
  const blob=d.data,u=await sb.storage.from(BUCKET).upload(targetPath,blob,{contentType:blob.type||'image/png',upsert:false,cacheControl:'3600'});if(u.error)throw new Error(`画像コピーに失敗: ${u.error.message}`);return{blob,ext:extFromPath(sourcePath,blob)}
}
window.qbRecentImagePicker={pick,copyObject,extFromPath};
})();
