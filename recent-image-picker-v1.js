(()=>{
'use strict';
const BUCKET='question-media',DEFAULT_PAGE_SIZE=30,HOLD_MS=500,MOVE_PX=10;
const IMAGE_COLUMNS='id,image_path,question_id,placement,choice_id,created_at';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function publicUrl(sb,path){return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}
function css(){
  if(document.getElementById('qbripCss'))return;
  const s=document.createElement('style');s.id='qbripCss';s.textContent=`
.qbripModal{position:fixed;inset:0;z-index:10040;background:#0009;display:flex;align-items:flex-end;justify-content:center;padding:12px;color:var(--text,#172033)}
.qbripPanel{width:min(820px,100%);max-height:90vh;overflow:auto;background:var(--card,#fff);border-radius:18px 18px 12px 12px;padding:12px;overscroll-behavior:contain}
.qbripHead{display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:-12px;background:var(--card,#fff);z-index:3;padding:10px 0 8px}
.qbripClose{border:0;background:transparent;color:var(--text);font-size:26px;line-height:1;min-width:44px;min-height:44px}
.qbripSub,.qbripFilterStatus{font-size:11px;color:var(--muted,#6f7786);margin:0 0 9px;line-height:1.5}
.qbripFilters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
.qbripFilters label{font-size:12px;font-weight:700;min-width:0}
.qbripFilters select{display:block;width:100%;min-height:44px;margin-top:4px;padding:6px;border:1px solid var(--line,#dce3ec);border-radius:8px;background:var(--card,#fff);color:var(--text,#172033);font:inherit;font-size:16px}
.qbripFilterRetry{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:8px;padding:8px;min-height:44px;margin-bottom:8px}
.qbripGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.qbripItem{position:relative;border:2px solid transparent;background:var(--bg,#f5f7fb);color:var(--text);border-radius:11px;padding:5px;min-height:110px;touch-action:pan-y pinch-zoom;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.qbripItem.on{border-color:var(--accent)!important;background:var(--accent-soft)!important}
.qbripItem img{display:block;width:100%;height:120px;object-fit:contain;background:var(--card,#fff);border-radius:7px;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.qbripMeta{font-size:10px;color:var(--muted,#6f7786);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.qbripCheck{position:absolute;right:8px;top:8px;width:24px;height:24px;border-radius:999px;background:var(--card,#fff);border:1px solid var(--line);display:grid;place-items:center;font-weight:900;color:var(--accent)}
.qbripItem.on .qbripCheck{background:var(--accent)!important;color:#fff!important;border-color:var(--accent)!important}
.qbripLoader{width:100%;min-height:54px;display:flex;align-items:center;justify-content:center;color:var(--muted,#6f7786);background:transparent;border:0;font-size:11px;font-weight:800;padding:10px 0}
.qbripLoader[data-state="loading"]::before{content:'読み込み中…'}
.qbripLoader[data-state="more"]::before{content:'さらに古い画像を読み込みます'}
.qbripLoader[data-state="end"]::before{content:'これ以前の画像はありません'}
.qbripLoader[data-state="error"]{color:var(--bad,#b33)}.qbripLoader[data-state="error"]::before{content:'画像の読み込みに失敗しました。タップして再試行'}
.qbripFoot{position:sticky;bottom:-12px;background:var(--card,#fff);padding:10px 0 2px;display:flex;gap:8px;z-index:3}
.qbripFoot button{min-height:44px;border-radius:10px;font-weight:900;flex:1}
.qbripCancel{border:1px solid var(--line,#dce3ec);background:var(--card,#fff);color:var(--text)}.qbripUse{border:0;background:var(--accent)!important;color:#fff!important}.qbripUse:disabled{opacity:.45}
.qbripEmpty{padding:24px;text-align:center;color:var(--muted,#6f7786);font-size:12px}
.qbripPreview{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.94);display:flex;flex-direction:column;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
.qbripPreviewHead{display:flex;justify-content:space-between;align-items:center;gap:12px;color:#fff;padding-bottom:8px;font-size:12px;line-height:1.5}
.qbripPreviewClose{flex:0 0 44px;min-height:44px;border:1px solid #ffffff55;border-radius:999px;background:#ffffff22;color:#fff;font-size:28px}
.qbripPreviewStage{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-x pan-y pinch-zoom;text-align:center}
.qbripPreviewImage{display:block;width:auto;max-width:100%;height:auto;max-height:none;margin:0 auto;background:#fff}
.qbripModal :is(button,select):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:560px){.qbripGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.qbripItem img{height:92px}.qbripModal{padding:0}.qbripPanel{max-height:92vh;border-radius:18px 18px 0 0;padding-bottom:max(12px,env(safe-area-inset-bottom))}}
`;document.head.appendChild(s);
}
function placementLabel(p){return({question:'問題文',explanation_overview:'問題文のポイント',choice_explanation:'選択肢解説',examiner_intent:'出題者の意図',exam_summary:'試験用まとめ',medical_verification:'医学的検証'}[p]||p||'画像')}
// Apply the scope BEFORE pagination, not to just the most recent unfiltered page.
// RLS remains in effect. Only official question_images are read; never user_note_images.
function imageQuery(sb,scope={}){
  const scoped=!!(scope.subjectId||scope.unitId);
  let query=sb.from('question_images').select(IMAGE_COLUMNS+(scoped?',questions!inner(subject_id,unit_id)':'')).not('image_path','is',null);
  if(scope.subjectId)query=query.eq('questions.subject_id',scope.subjectId);
  if(scope.unitId)query=query.eq('questions.unit_id',scope.unitId);
  return query;
}
async function initialPage(sb,pageSize,scope={}){
  const r=await imageQuery(sb,scope).order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(pageSize);
  if(r.error)throw r.error;return r.data||[];
}
async function pageAfter(sb,cursor,pageSize,scope={}){
  if(!cursor?.created_at)return[];
  const same=await imageQuery(sb,scope).eq('created_at',cursor.created_at).lt('id',cursor.id).order('id',{ascending:false}).limit(pageSize);
  if(same.error)throw same.error;
  const rows=[...(same.data||[])],remain=pageSize-rows.length;
  if(remain>0){
    const older=await imageQuery(sb,scope).lt('created_at',cursor.created_at).order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(remain);
    if(older.error)throw older.error;rows.push(...(older.data||[]));
  }
  return rows;
}
async function recentRows(sb,limit=DEFAULT_PAGE_SIZE){return initialPage(sb,Math.max(1,Number(limit)||DEFAULT_PAGE_SIZE))}
async function catalog(sb,table,subjectId,stop){
  const rows=[],size=200;
  for(let offset=0;!stop();offset+=size){
    let q=sb.from(table).select('id,name,sort_order').order('sort_order').order('id').range(offset,offset+size-1);
    if(subjectId)q=q.eq('subject_id',subjectId);
    const r=await q;if(r.error)throw r.error;
    rows.push(...(r.data||[]));if((r.data||[]).length<size)break;
  }
  return rows;
}
function currentQuestion(){try{return window.qbResolveCurrentQuestion?.()||window.pq?.()||null}catch{return null}}
async function currentScope(sb,q){
  const id=q?.id||q?.dbId;
  if(!id)return {subjectId:'',unitId:''};
  const r=await sb.from('questions').select('subject_id,unit_id').eq('id',id).maybeSingle();
  if(r.error)throw r.error;return {subjectId:r.data?.subject_id||'',unitId:r.data?.unit_id||''};
}
async function pick({sb,limit=DEFAULT_PAGE_SIZE,title='最近アップロードした画像'}={}){
  if(!sb)throw new Error('Supabaseを取得できません');css();
  const context=currentQuestion(),pageSize=Math.max(10,Math.min(60,Number(limit)||DEFAULT_PAGE_SIZE));
  return new Promise(resolve=>{
    const origin=document.activeElement,d=document.createElement('div');d.className='qbripModal';
    d.innerHTML=`<div class="qbripPanel" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="qbripHead"><b>${esc(title)}</b><button type="button" class="qbripClose" aria-label="画像一覧を閉じる">×</button></div><div class="qbripSub">短くタップして選択、長押しで拡大できます。選んだ画像は追加先用に独立したコピーを保存します。</div><div class="qbripFilters"><label>科目<select class="qbripSubject" disabled aria-label="科目"><option value="">全科目</option></select></label><label>単元<select class="qbripUnit" disabled aria-label="単元"><option value="">すべて</option></select></label></div><div class="qbripFilterStatus" role="status">科目・単元を読み込み中…</div><button type="button" class="qbripFilterRetry hidden">分類を再読み込み</button><div class="qbripGrid"></div><div class="qbripEmpty hidden">この条件の画像はありません。</div><button type="button" class="qbripLoader" data-state="loading" disabled aria-label="さらに画像を読み込む"></button><div class="qbripFoot"><button type="button" class="qbripCancel">キャンセル</button><button type="button" class="qbripUse" disabled>選択した画像を追加</button></div></div>`;
    document.body.appendChild(d);
    const oldOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
    const panel=d.querySelector('.qbripPanel'),grid=d.querySelector('.qbripGrid'),loader=d.querySelector('.qbripLoader'),empty=d.querySelector('.qbripEmpty'),use=d.querySelector('.qbripUse');
    const subject=d.querySelector('.qbripSubject'),unit=d.querySelector('.qbripUnit'),filterStatus=d.querySelector('.qbripFilterStatus'),filterRetry=d.querySelector('.qbripFilterRetry');
    const selected=new Map(),seenPaths=new Set(),rowByButton=new WeakMap(),blockedClicks=new WeakSet();
    let scope={subjectId:'',unitId:''},cursor=null,loading=false,hasMore=true,closed=false,ready=false,generation=0,unitVersion=0,observer=null,press=null,preview=null,previewOrigin=null,previewScroll=0,previewGuard=0;
    function cancelPress(){
      if(!press)return;clearTimeout(press.timer);blockedClicks.add(press.button);
      if(press.fired)previewGuard=performance.now()+350;press=null;
    }
    function closePreview(){
      if(!preview)return;preview.remove();preview=null;panel.inert=false;panel.removeAttribute('aria-hidden');
      const focus=previewOrigin?.isConnected?previewOrigin:panel;focus.focus({preventScroll:true});panel.scrollTop=previewScroll;
    }
    function close(value){
      if(closed)return;closed=true;generation++;unitVersion++;cancelPress();observer?.disconnect();
      window.removeEventListener('blur',cancelPress);d.remove();document.documentElement.style.overflow=oldOverflow;
      if(origin?.isConnected)origin.focus({preventScroll:true});resolve(value);
    }
    function openPreview(row,b,fromHold=false){
      if(closed||preview)return;
      previewOrigin=b;previewScroll=panel.scrollTop;previewGuard=fromHold?Infinity:performance.now()+100;
      preview=document.createElement('div');preview.className='qbripPreview';preview.setAttribute('role','dialog');preview.setAttribute('aria-modal','true');preview.setAttribute('aria-label','画像の拡大表示');
      preview.innerHTML=`<div class="qbripPreviewHead"><span>${esc(placementLabel(row.placement))} — 確認のみ（選択状態は変わりません）</span><button type="button" class="qbripPreviewClose" aria-label="拡大表示を閉じる">×</button></div><div class="qbripPreviewStage"><img class="qbripPreviewImage" src="${esc(publicUrl(sb,row.image_path))}" alt="拡大した画像" draggable="false"></div>`;
      d.appendChild(preview);panel.inert=true;panel.setAttribute('aria-hidden','true');
      // The pointer release which triggered a long press must not close the preview.
      preview.addEventListener('click',e=>{if(performance.now()<previewGuard){e.preventDefault();e.stopImmediatePropagation()}},true);
      preview.querySelector('.qbripPreviewClose').onclick=()=>closePreview();
      preview.querySelector('.qbripPreviewClose').focus({preventScroll:true});
    }
    function syncUse(){use.disabled=!selected.size;use.textContent=selected.size?`選択した${selected.size}枚を追加`:'選択した画像を追加'}
    function selectRow(row,b){selected.has(row.id)?selected.delete(row.id):selected.set(row.id,row);b.classList.toggle('on',selected.has(row.id));b.setAttribute('aria-pressed',String(selected.has(row.id)));syncUse()}
    function appendRows(rows){
      for(const row of rows){
        if(!row?.image_path||seenPaths.has(row.image_path))continue;seenPaths.add(row.image_path);
        const b=document.createElement('button');b.type='button';b.className='qbripItem';b.dataset.id=row.id;b.setAttribute('aria-pressed','false');
        b.title='短くタップで選択・長押しで拡大（キーボード：Alt+Enter）';b.setAttribute('aria-label',placementLabel(row.placement)+'の画像。長押しまたはAlt+Enterで拡大');
        b.innerHTML=`<img loading="lazy" draggable="false" src="${esc(publicUrl(sb,row.image_path))}" alt="最近の画像"><span class="qbripCheck" aria-hidden="true">✓</span><div class="qbripMeta">${esc(placementLabel(row.placement))}</div>`;
        rowByButton.set(b,row);
        b.onclick=e=>{if(blockedClicks.has(b)||preview){e.preventDefault();e.stopPropagation();blockedClicks.delete(b);return}selectRow(row,b)};
        b.onkeydown=e=>{if(e.altKey&&e.key==='Enter'){e.preventDefault();e.stopPropagation();openPreview(row,b)}else if(e.key==='Enter'||e.key===' ')blockedClicks.delete(b)};
        grid.appendChild(b);
      }
    }
    grid.addEventListener('pointerdown',e=>{
      if(e.isPrimary===false){cancelPress();return}if(e.button!==0||preview)return;
      const b=e.target.closest('.qbripItem');if(!b||!grid.contains(b))return;
      cancelPress();blockedClicks.delete(b);
      const p={id:e.pointerId,x:e.clientX,y:e.clientY,button:b,fired:false,timer:0};press=p;
      p.timer=setTimeout(()=>{if(press!==p||closed||!b.isConnected)return;p.fired=true;blockedClicks.add(b);openPreview(rowByButton.get(b),b,true)},HOLD_MS);
    });
    d.addEventListener('pointermove',e=>{if(press&&e.pointerId===press.id&&!press.fired&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>MOVE_PX)cancelPress()},true);
    d.addEventListener('pointerup',e=>{if(press&&e.pointerId===press.id){clearTimeout(press.timer);if(press.fired){blockedClicks.add(press.button);previewGuard=performance.now()+350}press=null}},true);
    d.addEventListener('pointercancel',cancelPress,true);
    d.addEventListener('pointerleave',e=>{if(e.target===d)cancelPress()});
    grid.addEventListener('contextmenu',e=>{const b=e.target.closest('.qbripItem');if(!b)return;e.preventDefault();if(e.pointerType==='touch'||press?.fired||blockedClicks.has(b))return;cancelPress();blockedClicks.add(b);openPreview(rowByButton.get(b),b)});
    grid.addEventListener('dragstart',e=>e.preventDefault());
    // Also check scrolling when an observer threshold did not change after a
    // filter reset. Both paths share loading/generation guards, so no duplicate read.
    panel.addEventListener('scroll',()=>{cancelPress();if(loader.dataset.state==='more')maybeContinue()},{passive:true});window.addEventListener('blur',cancelPress);
    function maybeContinue(){requestAnimationFrame(()=>{
      if(closed||!ready||loading||!hasMore||preview||loader.dataset.state==='error'||!loader.isConnected)return;
      const pr=panel.getBoundingClientRect(),lr=loader.getBoundingClientRect();if(lr.top<=pr.bottom+320)loadNext();
    })}
    async function loadNext(){
      if(closed||!ready||loading||!hasMore)return;
      const token=generation,snapshot={...scope};loading=true;loader.dataset.state='loading';loader.disabled=true;
      try{
        const rows=cursor?await pageAfter(sb,cursor,pageSize,snapshot):await initialPage(sb,pageSize,snapshot);
        if(closed||token!==generation)return;
        if(rows.length)cursor=rows[rows.length-1];hasMore=rows.length===pageSize;appendRows(rows);
        loader.dataset.state=hasMore?'more':'end';loader.disabled=!hasMore;empty.classList.toggle('hidden',seenPaths.size>0||hasMore);
      }catch(e){if(!closed&&token===generation){loader.dataset.state='error';loader.disabled=false;loader.title=e?.message||'読み込み失敗'}}
      finally{if(!closed&&token===generation){loading=false;if(hasMore&&loader.dataset.state!=='error')maybeContinue()}}
    }
    function reset(){
      generation++;cancelPress();cursor=null;loading=false;hasMore=true;selected.clear();seenPaths.clear();syncUse();grid.replaceChildren();empty.classList.add('hidden');panel.scrollTop=0;loadNext();
    }
    function fillOptions(select,rows,first){
      select.replaceChildren(new Option(first,''));for(const row of rows)select.add(new Option(row.name||'名称未設定',row.id));
    }
    async function loadUnits(preferredUnit=''){
      const version=++unitVersion,sid=scope.subjectId;fillOptions(unit,[],'すべて');unit.disabled=true;filterRetry.classList.add('hidden');
      filterStatus.textContent='絞り込みを変更すると画像の選択が解除されます。';
      if(!sid)return;
      try{
        const rows=await catalog(sb,'units',sid,()=>closed||version!==unitVersion);
        if(closed||version!==unitVersion)return;fillOptions(unit,rows,'すべて');if(preferredUnit&&rows.some(row=>row.id===preferredUnit)){scope.unitId=preferredUnit;unit.value=preferredUnit}unit.disabled=false;
      }catch(e){if(!closed&&version===unitVersion){filterStatus.textContent='単元を読み込めませんでした。科目内の全画像を表示しています。';filterRetry.classList.remove('hidden')}}
    }
    async function initialize(){
      ready=false;subject.disabled=true;unit.disabled=true;filterRetry.classList.add('hidden');filterStatus.textContent='科目・単元を読み込み中…';
      try{
        const [subjects,initialScope]=await Promise.all([catalog(sb,'subjects','',()=>closed),currentScope(sb,context)]);const sid=initialScope.subjectId;
        if(closed)return;fillOptions(subject,subjects,'全科目');scope={subjectId:subjects.some(s=>s.id===sid)?sid:'',unitId:''};subject.value=scope.subjectId;await loadUnits(initialScope.unitId);if(closed)return;subject.disabled=false;ready=true;reset();
      }catch(e){if(!closed){filterStatus.textContent='科目情報を読み込めませんでした。再読み込みしてください。';filterRetry.classList.remove('hidden');loader.dataset.state='';loader.disabled=true}}
    }
    subject.onchange=()=>{scope={subjectId:subject.value,unitId:''};loadUnits();reset()};
    unit.onchange=()=>{scope={subjectId:subject.value,unitId:unit.value};reset()};
    filterRetry.onclick=()=>ready?loadUnits():initialize();
    d.querySelector('.qbripClose').onclick=d.querySelector('.qbripCancel').onclick=()=>close([]);
    use.onclick=()=>{if(selected.size)close([...selected.values()])};
    loader.onclick=()=>loadNext();
    d.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(preview)closePreview();else close([]);return}
      if(e.key!=='Tab')return;
      const layer=preview||panel,items=[...layer.querySelectorAll('button:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(x=>!x.closest('.hidden'));
      if(!items.length)return;const first=items[0],last=items[items.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    });
    if('IntersectionObserver'in window){
      observer=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)&&loader.dataset.state==='more')loadNext()},{root:panel,rootMargin:'360px 0px 360px 0px',threshold:0.01});observer.observe(loader);
    }else panel.addEventListener('scroll',()=>{if(loader.dataset.state==='more'&&panel.scrollTop+panel.clientHeight>=panel.scrollHeight-400)loadNext()},{passive:true});
    d.querySelector('.qbripClose').focus({preventScroll:true});initialize();
  });
}
function extFromPath(path,blob){const m=String(path||'').match(/\.([a-zA-Z0-9]+)(?:\?|$)/);if(m)return m[1].toLowerCase().replace('jpeg','jpg');const t=String(blob?.type||'').split('/')[1]||'png';return t.replace('jpeg','jpg')}
async function copyObject(sb,sourcePath,targetPath){
  const d=await sb.storage.from(BUCKET).download(sourcePath);if(d.error)throw new Error(`元画像の取得に失敗: ${d.error.message}`);
  const blob=d.data,u=await sb.storage.from(BUCKET).upload(targetPath,blob,{contentType:blob.type||'image/png',upsert:false,cacheControl:'3600'});if(u.error)throw new Error(`画像コピーに失敗: ${u.error.message}`);return{blob,ext:extFromPath(sourcePath,blob)}
}
window.qbRecentImagePicker={pick,copyObject,extFromPath,recentRows};
})();
