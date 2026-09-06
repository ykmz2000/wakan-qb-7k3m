(()=>{
'use strict';
let timer=null,ctxPromise=null,sortablePromise=null;
const q=()=>{try{return window.pq?.()||null}catch{return null}};
const qid=Q=>Q?.id||Q?.dbId||null;
function css(){
  if(document.getElementById('qbImageSortCss'))return;
  const s=document.createElement('style');s.id='qbImageSortCss';s.textContent=`
.qbsortHandle{cursor:grab!important;touch-action:none;-webkit-user-select:none;user-select:none}
.qbsortHandle:active{cursor:grabbing!important}
.qbsortGhost{opacity:.35!important}
.qbsortChosen{outline:2px solid #126fb3!important;outline-offset:2px}
.qbsortStatus{font-size:10px;color:#6f7786;margin-top:5px;min-height:14px}
.qsiImgWrap .qbsortStemHandle{position:absolute;left:7px;top:7px;z-index:3;border:1px solid #cbd7e3;background:#fffffff2;color:#405064;border-radius:8px;padding:5px 8px;font-weight:900;font-size:11px}
.qbsortNoteItem{position:relative;width:min(320px,100%);margin:5px 0}
.qbsortNoteItem>img{margin:0!important}
.qbsortNoteHandle{position:absolute;left:6px;top:6px;z-index:3;border:1px solid #cbd7e3;background:#fffffff2;color:#405064;border-radius:8px;padding:5px 8px;font-weight:900;font-size:11px}
`;
  document.head.appendChild(s);
}
async function ctx(){
  if(ctxPromise)return ctxPromise;
  ctxPromise=(async()=>{
    const sb=window.qbSupabase;if(!sb)return null;
    const a=await sb.auth.getUser(),user=a.data?.user;if(!user)return null;
    let admin=false;
    const p=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle();
    admin=p.data?.role==='admin';
    return{sb,user,admin};
  })();
  return ctxPromise;
}
function ensureSortable(){
  if(window.Sortable)return Promise.resolve(window.Sortable);
  if(sortablePromise)return sortablePromise;
  sortablePromise=new Promise((resolve,reject)=>{
    const old=document.getElementById('qbSortableJs');
    if(old){old.addEventListener('load',()=>resolve(window.Sortable),{once:true});old.addEventListener('error',()=>reject(new Error('並べ替え機能を読み込めませんでした')),{once:true});return}
    const s=document.createElement('script');s.id='qbSortableJs';s.src='https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js';s.onload=()=>resolve(window.Sortable);s.onerror=()=>reject(new Error('並べ替え機能を読み込めませんでした'));document.head.appendChild(s);
  });
  return sortablePromise;
}
function statusFor(container){
  let st=container.nextElementSibling;
  if(st?.classList?.contains('qbsortStatus'))return st;
  st=document.createElement('div');st.className='qbsortStatus';container.insertAdjacentElement('afterend',st);return st;
}
async function persist(table,ids,status,detail){
  if(ids.length<2)return;
  const c=await ctx();if(!c)return;
  status.textContent='順番を保存中…';
  try{
    const results=await Promise.all(ids.map((id,i)=>c.sb.from(table).update({sort_order:(i+1)*10}).eq('id',id)));
    const bad=results.find(x=>x.error);if(bad?.error)throw bad.error;
    status.textContent='順番を保存しました';
    window.dispatchEvent(new CustomEvent('qb-content-updated',{detail}));
    setTimeout(()=>{if(status.isConnected)status.textContent=''},1500);
  }catch(e){
    console.error(e);status.textContent='並べ替えの保存に失敗しました';
  }
}
async function bindSortable(container,itemSelector,idOf,onSave){
  if(!container||container.dataset.qbSortable==='1')return;
  const items=[...container.querySelectorAll(itemSelector)];if(items.length<2)return;
  container.dataset.qbSortable='1';
  const Sortable=await ensureSortable();
  const status=statusFor(container);
  new Sortable(container,{animation:150,draggable:itemSelector,handle:'.qbsortHandle',delay:160,delayOnTouchOnly:true,touchStartThreshold:4,ghostClass:'qbsortGhost',chosenClass:'qbsortChosen',fallbackTolerance:5,onEnd:async()=>{
    const ids=[...container.querySelectorAll(itemSelector)].map(idOf).filter(Boolean);
    await onSave(ids,status);
  }});
}
function editorMap(ed){
  const key=ed?.dataset?.adeEditor||'';
  if(key==='overview')return{placement:'explanation_overview',choiceId:null};
  if(key==='intent')return{placement:'examiner_intent',choiceId:null};
  if(key==='summary')return{placement:'exam_summary',choiceId:null};
  if(key==='verify')return{placement:'medical_verification',choiceId:null};
  if(key.startsWith('choice-'))return{placement:'choice_explanation',choiceId:key.slice(7)};
  return null;
}
async function bindOfficialEditors(c,Q){
  if(!c.admin||!Q)return;
  document.querySelectorAll('.adeEditor').forEach(ed=>{
    const m=editorMap(ed),grid=ed.querySelector('.oeiGrid');if(!m||!grid)return;
    grid.querySelectorAll('.oeiItem').forEach(item=>{
      if(item.querySelector('.qbsortHandle'))return;
      const actions=item.querySelector('.oeiItemActions');if(!actions)return;
      const b=document.createElement('button');b.type='button';b.className='oeiMini qbsortHandle';b.textContent='☰ 並べ替え';actions.prepend(b);
    });
    bindSortable(grid,'.oeiItem',x=>x.dataset.id,(ids,status)=>persist('question_images',ids,status,{questionId:qid(Q),type:'official-image-order',placement:m.placement,choiceId:m.choiceId||null})).catch(console.error);
  });
}
async function bindQuestionStem(c,Q){
  if(!c.admin||!Q)return;
  document.querySelectorAll('.qsiGrid').forEach(grid=>{
    grid.querySelectorAll('.qsiImgWrap').forEach(item=>{
      if(item.querySelector('.qbsortHandle'))return;
      const b=document.createElement('button');b.type='button';b.className='qbsortHandle qbsortStemHandle';b.textContent='☰';b.setAttribute('aria-label','画像を並べ替え');item.appendChild(b);
    });
    bindSortable(grid,'.qsiImgWrap',x=>x.dataset.row,(ids,status)=>persist('question_images',ids,status,{questionId:qid(Q),type:'question-image-order',placement:'question',choiceId:null})).catch(console.error);
  });
}
function decodeStoragePath(src,bucket){
  try{
    const u=new URL(src,location.href),needle=`/${bucket}/`,i=u.pathname.indexOf(needle);if(i<0)return'';
    return decodeURIComponent(u.pathname.slice(i+needle.length));
  }catch{return''}
}
async function noteRows(c,Q,personal){
  const key=personal.dataset.noteKey||'',p=key.indexOf('|'),placement=p>=0?key.slice(0,p):key,choiceId=p>=0?key.slice(p+1):'';
  if(!placement)return[];
  let z=c.sb.from('user_notes').select('id').eq('user_id',c.user.id).eq('question_id',qid(Q)).eq('placement',placement);
  z=choiceId?z.eq('choice_id',choiceId):z.is('choice_id',null);
  const n=await z.order('updated_at',{ascending:false}).limit(1).maybeSingle();if(n.error||!n.data?.id)return[];
  const r=await c.sb.from('user_note_images').select('id,image_path,sort_order,created_at').eq('user_id',c.user.id).eq('question_id',qid(Q)).eq('note_id',n.data.id).order('sort_order').order('created_at');
  return r.data||[];
}
async function bindPersonal(c,Q){
  if(!Q)return;
  const personals=[...document.querySelectorAll('.qbPersonal')];
  for(const personal of personals){
    const grid=personal.querySelector('.qbNoteImageGrid');if(!grid||grid.dataset.qbNoteSortPrepared==='1')continue;
    const imgs=[...grid.querySelectorAll(':scope > img')];if(imgs.length<2)continue;
    const rows=await noteRows(c,Q,personal);if(rows.length<2)continue;
    const byPath=new Map(rows.map(r=>[r.image_path,r]));
    for(let i=0;i<imgs.length;i++){
      const img=imgs[i],path=decodeStoragePath(img.src,'user-note-images'),row=byPath.get(path)||rows[i];if(!row)continue;
      const w=document.createElement('div');w.className='qbsortNoteItem';w.dataset.id=row.id;
      img.replaceWith(w);w.appendChild(img);
      const b=document.createElement('button');b.type='button';b.className='qbsortHandle qbsortNoteHandle';b.textContent='☰';b.setAttribute('aria-label','画像を並べ替え');w.appendChild(b);
    }
    grid.dataset.qbNoteSortPrepared='1';
    await bindSortable(grid,'.qbsortNoteItem',x=>x.dataset.id,(ids,status)=>persist('user_note_images',ids,status,{questionId:qid(Q),type:'personal-note-image-order'}));
  }
}
async function scan(){
  clearTimeout(timer);timer=setTimeout(async()=>{
    try{
      css();const Q=q(),c=await ctx();if(!Q||!c)return;
      await bindOfficialEditors(c,Q);await bindQuestionStem(c,Q);await bindPersonal(c,Q);
    }catch(e){console.error(e)}
  },80);
}
function boot(){
  css();scan();
  ['qb-screen-change','qb-answer-shown','qb-admin-editor-opened','qb-content-updated','qb-retry-current'].forEach(ev=>window.addEventListener(ev,scan));
  const v=document.getElementById('view');if(v)new MutationObserver(scan).observe(v,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
