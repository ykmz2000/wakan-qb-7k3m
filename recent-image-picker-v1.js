(()=>{
'use strict';
const BUCKET='question-media';
const DEFAULT_PAGE_SIZE=30;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function publicUrl(sb,path){return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}
function css(){
  if(document.getElementById('qbripCss'))return;
  const s=document.createElement('style');s.id='qbripCss';s.textContent=`
.qbripModal{position:fixed;inset:0;z-index:10040;background:#0009;display:flex;align-items:flex-end;justify-content:center;padding:12px}
.qbripPanel{width:min(820px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px 18px 12px 12px;padding:12px;overscroll-behavior:contain}
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
.qbripLoader{min-height:54px;display:flex;align-items:center;justify-content:center;color:#6f7786;font-size:11px;font-weight:800;padding:10px 0}
.qbripLoader[data-state="loading"]::before{content:'読み込み中…'}
.qbripLoader[data-state="more"]::before{content:'さらに古い画像を読み込みます'}
.qbripLoader[data-state="end"]::before{content:'これ以前の画像はありません'}
.qbripLoader[data-state="error"]{color:#b33}.qbripLoader[data-state="error"]::before{content:'画像の読み込みに失敗しました。タップして再試行'}
.qbripFoot{position:sticky;bottom:-12px;background:#fff;padding:10px 0 2px;margin-top:0;display:flex;gap:8px;z-index:3}
.qbripFoot button{min-height:44px;border-radius:10px;font-weight:900;flex:1}
.qbripCancel{border:1px solid #dce3ec;background:#fff}.qbripUse{border:0;background:#126fb3;color:#fff}.qbripUse:disabled{opacity:.45}
.qbripEmpty{padding:24px;text-align:center;color:#6f7786;font-size:12px}
@media(max-width:560px){.qbripGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.qbripItem img{height:92px}.qbripModal{padding:0}.qbripPanel{max-height:92vh;border-radius:18px 18px 0 0}}
`;
  document.head.appendChild(s);
}
function placementLabel(p){return({question:'問題文',explanation_overview:'問題文のポイント',choice_explanation:'選択肢解説',examiner_intent:'出題者の意図',exam_summary:'試験用まとめ',medical_verification:'医学的検証'}[p]||p||'画像')}
async function initialPage(sb,pageSize){
  const r=await sb.from('question_images').select('id,image_path,question_id,placement,choice_id,created_at').not('image_path','is',null).order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(pageSize);
  if(r.error)throw r.error;
  return r.data||[];
}
async function pageAfter(sb,cursor,pageSize){
  if(!cursor?.created_at)return[];
  const same=await sb.from('question_images').select('id,image_path,question_id,placement,choice_id,created_at').not('image_path','is',null).eq('created_at',cursor.created_at).lt('id',cursor.id).order('id',{ascending:false}).limit(pageSize);
  if(same.error)throw same.error;
  const rows=[...(same.data||[])];
  const remain=pageSize-rows.length;
  if(remain>0){
    const older=await sb.from('question_images').select('id,image_path,question_id,placement,choice_id,created_at').not('image_path','is',null).lt('created_at',cursor.created_at).order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(remain);
    if(older.error)throw older.error;
    rows.push(...(older.data||[]));
  }
  return rows;
}
async function recentRows(sb,limit=DEFAULT_PAGE_SIZE){return initialPage(sb,Math.max(1,Number(limit)||DEFAULT_PAGE_SIZE))}
async function pick({sb,limit=DEFAULT_PAGE_SIZE,title='最近アップロードした画像'}={}){
  if(!sb)throw new Error('Supabaseを取得できません');css();
  const pageSize=Math.max(10,Math.min(60,Number(limit)||DEFAULT_PAGE_SIZE));
  return new Promise(resolve=>{
    const d=document.createElement('div');d.className='qbripModal';
    d.innerHTML=`<div class="qbripPanel"><div class="qbripHead"><b>${esc(title)}</b><button type="button" class="qbripClose">×</button></div><div class="qbripSub">最近追加した公式画像から選択できます。下までスクロールすると、さらに古い画像を自動で読み込みます。選んだ画像は現在の問題用にコピーして保存するため、元画像を削除しても影響しません。</div><div class="qbripGrid"></div><div class="qbripEmpty hidden">アップロードした画像はありません。</div><button type="button" class="qbripLoader" data-state="loading" aria-label="さらに画像を読み込む"></button><div class="qbripFoot"><button type="button" class="qbripCancel">キャンセル</button><button type="button" class="qbripUse" disabled>選択した画像を追加</button></div></div>`;
    document.body.appendChild(d);
    const oldOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
    const panel=d.querySelector('.qbripPanel'),grid=d.querySelector('.qbripGrid'),loader=d.querySelector('.qbripLoader'),empty=d.querySelector('.qbripEmpty'),use=d.querySelector('.qbripUse');
    const selected=new Map(),seenPaths=new Set();
    let cursor=null,loading=false,hasMore=true,closed=false,observer=null;
    const close=value=>{if(closed)return;closed=true;observer?.disconnect();d.remove();document.documentElement.style.overflow=oldOverflow;resolve(value)};
    const syncUse=()=>{use.disabled=!selected.size;use.textContent=selected.size?`選択した${selected.size}枚を追加`:'選択した画像を追加'};
    const selectRow=(row,b)=>{selected.has(row.id)?selected.delete(row.id):selected.set(row.id,row);b.classList.toggle('on',selected.has(row.id));syncUse()};
    const appendRows=rows=>{
      let added=0;
      for(const row of rows){
        if(!row?.image_path||seenPaths.has(row.image_path))continue;
        seenPaths.add(row.image_path);added++;
        const b=document.createElement('button');b.type='button';b.className='qbripItem';b.dataset.id=row.id;
        b.innerHTML=`<img loading="lazy" src="${esc(publicUrl(sb,row.image_path))}" alt="最近の画像"><span class="qbripCheck">✓</span><div class="qbripMeta">${esc(placementLabel(row.placement))}</div>`;
        b.onclick=()=>selectRow(row,b);grid.appendChild(b);
      }
      empty.classList.toggle('hidden',seenPaths.size>0||hasMore);
      return added;
    };
    const maybeContinue=()=>requestAnimationFrame(()=>{
      if(closed||loading||!hasMore||!loader.isConnected)return;
      const pr=panel.getBoundingClientRect(),lr=loader.getBoundingClientRect();
      if(lr.top<=pr.bottom+320)loadNext();
    });
    const loadNext=async()=>{
      if(closed||loading||!hasMore)return;
      loading=true;loader.dataset.state='loading';loader.disabled=true;
      try{
        const rows=cursor?await pageAfter(sb,cursor,pageSize):await initialPage(sb,pageSize);
        if(rows.length)cursor=rows[rows.length-1];
        hasMore=rows.length===pageSize;
        appendRows(rows);
        loader.dataset.state=hasMore?'more':'end';
        loader.disabled=!hasMore;
        empty.classList.toggle('hidden',seenPaths.size>0||hasMore);
      }catch(e){
        console.error(e);loader.dataset.state='error';loader.disabled=false;
      }finally{
        loading=false;
        if(hasMore&&loader.dataset.state!=='error')maybeContinue();
      }
    };
    d.querySelector('.qbripClose').onclick=d.querySelector('.qbripCancel').onclick=()=>close([]);
    use.onclick=()=>close([...selected.values()]);
    loader.onclick=()=>{if(loader.dataset.state==='error'||hasMore)loadNext()};
    if('IntersectionObserver'in window){
      observer=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting))loadNext()},{root:panel,rootMargin:'360px 0px 360px 0px',threshold:0.01});
      observer.observe(loader);
    }else{
      panel.addEventListener('scroll',()=>{if(panel.scrollTop+panel.clientHeight>=panel.scrollHeight-400)loadNext()},{passive:true});
    }
    loadNext();
  });
}
function extFromPath(path,blob){const m=String(path||'').match(/\.([a-zA-Z0-9]+)(?:\?|$)/);if(m)return m[1].toLowerCase().replace('jpeg','jpg');const t=String(blob?.type||'').split('/')[1]||'png';return t.replace('jpeg','jpg')}
async function copyObject(sb,sourcePath,targetPath){
  const d=await sb.storage.from(BUCKET).download(sourcePath);if(d.error)throw new Error(`元画像の取得に失敗: ${d.error.message}`);
  const blob=d.data,u=await sb.storage.from(BUCKET).upload(targetPath,blob,{contentType:blob.type||'image/png',upsert:false,cacheControl:'3600'});if(u.error)throw new Error(`画像コピーに失敗: ${u.error.message}`);return{blob,ext:extFromPath(sourcePath,blob)}
}
window.qbRecentImagePicker={pick,copyObject,extFromPath,recentRows};
})();
