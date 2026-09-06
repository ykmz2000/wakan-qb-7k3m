(()=>{
'use strict';
let adminCache=null,timer=0,ctx=null,drag=null,suppressClickRow=null,suppressClickUntil=0;
const screen=()=>window.qbGetScreen?.()||'';
const pstate=()=>window.qbGetPracticeState?.()||{};
const sb=()=>window.qbSupabase;
const rows=()=>[...document.querySelectorAll('#view .problem')];
const rowId=r=>r?.querySelector('input[data-q]')?.dataset?.q||null;
async function isAdmin(){
  if(adminCache!==null)return adminCache;
  try{
    const c=sb();if(!c)return false;const {data:{user}}=await c.auth.getUser();if(!user)return adminCache=false;
    const r=await c.from('profiles').select('role').eq('id',user.id).maybeSingle();
    return adminCache=r.data?.role==='admin';
  }catch{return adminCache=false}
}
function css(){
  if(document.getElementById('qsoCss'))return;
  const s=document.createElement('style');s.id='qsoCss';s.textContent=`
#qsoBar{margin:-2px 0 10px;padding:10px 12px;border:1px solid #cfe1ef;background:#f7fbfe;border-radius:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#qsoBar .qsoMsg{font-size:11px;color:#6f7786;margin-right:auto;line-height:1.45}#qsoBar button{border-radius:9px;padding:8px 11px;font-weight:900}
#qsoSave{border:0;background:#126fb3;color:#fff}#qsoUndo{border:1px solid #dce3ec;background:#fff;color:#536174}#qsoSave:disabled,#qsoUndo:disabled{opacity:.35}
.problem.qsoRow .qid{display:flex;align-items:center;gap:5px;min-width:0}.qsoNum{min-width:16px}.qsoHandle{touch-action:none;-webkit-user-select:none;user-select:none;border:0;background:#edf4f9;color:#126fb3;border-radius:8px;width:30px;height:34px;padding:0;font-size:21px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:grab;flex:0 0 auto}
.qsoHandle:active{cursor:grabbing}.problem.qsoDragging{opacity:.5;background:#eef6fb;border-radius:10px}.problem.qsoDropTarget{box-shadow:inset 0 2px 0 #126fb3}
@media(max-width:520px){.problem.qsoRow{grid-template-columns:58px 1fr}.qsoHandle{width:32px;height:36px}.problem.qsoRow .pick{grid-column:2}}
`;
  document.head.appendChild(s)
}
function clear(){
  drag=null;ctx=null;suppressClickRow=null;suppressClickUntil=0;window.QB_REORDER_ACTIVE=false;document.getElementById('qsoBar')?.remove();
  document.querySelectorAll('.qsoHandle').forEach(x=>x.remove());
  document.querySelectorAll('.qsoNum').forEach(n=>{const p=n.parentElement;if(p){p.textContent=n.textContent||''}});
  document.querySelectorAll('.qsoRow,.qsoDragging,.qsoDropTarget').forEach(x=>x.classList.remove('qsoRow','qsoDragging','qsoDropTarget'))
}
function renumber(){rows().forEach((r,i)=>{const n=r.querySelector('.qsoNum');if(n)n.textContent=String(i+1)})}
function idsNow(){return rows().map(rowId).filter(Boolean)}
function sameOrder(a,b){return a.length===b.length&&a.every((x,i)=>x===b[i])}
function updateBar(){
  if(!ctx)return;const dirty=!sameOrder(idsNow(),ctx.originalIds);ctx.dirty=dirty;
  const save=document.getElementById('qsoSave'),undo=document.getElementById('qsoUndo');if(save)save.disabled=!dirty||ctx.saving;if(undo)undo.disabled=!dirty||ctx.saving;
  const msg=document.querySelector('#qsoBar .qsoMsg');if(msg&&!ctx.saving)msg.textContent=dirty?'順番を変更中です。保存するまでDBには反映されません。':'≡ をドラッグして並び替えできます。'
}
function restore(){
  if(!ctx)return;const map=new Map(rows().map(r=>[rowId(r),r]));const parent=rows()[0]?.parentElement;if(!parent)return;
  ctx.originalIds.forEach(id=>{const r=map.get(id);if(r)parent.appendChild(r)});renumber();updateBar()
}
function armClickSuppression(row,ms=1200){suppressClickRow=row;suppressClickUntil=Date.now()+ms;window.QB_SUPPRESS_SINGLE_OPEN_UNTIL=suppressClickUntil}
function onPointerDown(e){
  const h=e.currentTarget,r=h.closest('.problem');if(!r||!ctx||ctx.saving)return;
  e.preventDefault();e.stopPropagation();window.QB_REORDER_ACTIVE=true;armClickSuppression(r);drag={row:r,pointerId:e.pointerId,moved:false};r.classList.add('qsoDragging');
  try{h.setPointerCapture(e.pointerId)}catch{}
}
function onPointerMove(e){
  if(!drag||e.pointerId!==drag.pointerId)return;e.preventDefault();e.stopPropagation();drag.moved=true;window.QB_REORDER_ACTIVE=true;armClickSuppression(drag.row);
  document.querySelectorAll('.qsoDropTarget').forEach(x=>x.classList.remove('qsoDropTarget'));
  const el=document.elementFromPoint(e.clientX,e.clientY),target=el?.closest?.('.problem');if(!target||target===drag.row)return;
  const rect=target.getBoundingClientRect(),parent=target.parentElement;if(!parent)return;
  target.classList.add('qsoDropTarget');
  if(e.clientY<rect.top+rect.height/2)parent.insertBefore(drag.row,target);else parent.insertBefore(drag.row,target.nextSibling);
  renumber();updateBar()
}
function onPointerUp(e){
  if(!drag||e.pointerId!==drag.pointerId)return;e.preventDefault();e.stopPropagation();const row=drag.row;armClickSuppression(row,1400);row.classList.remove('qsoDragging');document.querySelectorAll('.qsoDropTarget').forEach(x=>x.classList.remove('qsoDropTarget'));drag=null;window.QB_REORDER_ACTIVE=false;renumber();updateBar()
}
function suppressSyntheticClick(e){
  if(Date.now()>suppressClickUntil)return;
  const row=e.target?.closest?.('#view .problem');if(!row)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()
}
async function save(){
  if(!ctx||ctx.saving)return;const current=idsNow();if(sameOrder(current,ctx.originalIds))return;
  ctx.saving=true;updateBar();const msg=document.querySelector('#qsoBar .qsoMsg');if(msg)msg.textContent='順番を保存中…';
  try{
    if(ctx.rankValues.length!==current.length)throw new Error('並び順データの件数が一致しません');
    const items=current.map((id,i)=>({id,study_order:ctx.rankValues[i]}));
    const r=await sb().rpc('admin_reorder_questions',{p_unit_id:ctx.unitId,p_items:items});if(r.error)throw r.error;
    ctx.originalIds=[...current];ctx.saving=false;updateBar();if(msg)msg.textContent=`保存しました（${r.data||0}件更新）`;
    window.dispatchEvent(new CustomEvent('qb-question-order-updated',{detail:{unitId:ctx.unitId,questionIds:current}}));
  }catch(err){ctx.saving=false;updateBar();if(msg)msg.textContent='保存失敗: '+(err?.message||err)}
}
async function inject(){
  clearTimeout(timer);if(screen()!=='problems'){clear();return}const st=pstate(),unitId=st.unitId||null;if(!unitId||unitId==='__all__'){clear();return}
  if(!(await isAdmin())){clear();return}const rs=rows();if(rs.length<2){clear();return}const ids=rs.map(rowId).filter(Boolean);if(ids.length!==rs.length){clear();return}
  const r=await sb().from('questions').select('id,unit_id,study_order').in('id',ids);if(r.error){console.error('question reorder load',r.error);return}
  const rec=r.data||[];if(rec.length!==ids.length||rec.some(x=>x.unit_id!==unitId)){clear();return}
  const rankValues=rec.map(x=>Number(x.study_order)||0).sort((a,b)=>a-b);if(new Set(rankValues).size!==rankValues.length){clear();console.warn('question reorder disabled: duplicate study_order');return}
  clear();ctx={unitId,originalIds:[...ids],rankValues,saving:false,dirty:false};css();
  rs.forEach((row,i)=>{
    row.classList.add('qsoRow');const qid=row.querySelector('.qid');if(!qid)return;const old=qid.textContent.trim();qid.textContent='';
    const h=document.createElement('button');h.type='button';h.className='qsoHandle';h.setAttribute('aria-label','問題を並び替え');h.textContent='≡';
    const n=document.createElement('span');n.className='qsoNum';n.textContent=old||String(i+1);qid.append(h,n);
    h.addEventListener('pointerdown',onPointerDown);h.addEventListener('pointermove',onPointerMove);h.addEventListener('pointerup',onPointerUp);h.addEventListener('pointercancel',onPointerUp);h.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()})
  });
  const listCard=rs[0].parentElement,bar=document.createElement('div');bar.id='qsoBar';bar.innerHTML='<div class="qsoMsg">≡ をドラッグして並び替えできます。</div><button id="qsoUndo" type="button" disabled>元に戻す</button><button id="qsoSave" type="button" disabled>順番を保存</button>';
  listCard?.insertAdjacentElement('beforebegin',bar);document.getElementById('qsoUndo').onclick=restore;document.getElementById('qsoSave').onclick=save;renumber();updateBar()
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>inject().catch(console.error),80)}
function boot(){css();document.addEventListener('click',suppressSyntheticClick,true);['qb-screen-change','qb-app-ready','qb-question-order-updated'].forEach(ev=>window.addEventListener(ev,schedule));setTimeout(schedule,900)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();