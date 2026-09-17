(()=>{
'use strict';
let adminCache=null,timer=0,ctx=null,drag=null,suppressClickUntil=0,autoScrollFrame=0;
const screen=()=>window.qbGetScreen?.()||'';
const pstate=()=>window.qbGetPracticeState?.()||{};
const sb=()=>window.qbSupabase;
const rows=()=>[...document.querySelectorAll('#view .problem')];
const rowId=r=>r?.querySelector('input[data-q]')?.dataset?.q||null;
const isInteractive=t=>!!t?.closest?.('input,button:not(.qsoHandle),label,a,select,textarea,[contenteditable="true"],.pick');
async function isAdmin(){
  if(adminCache!==null)return adminCache;
  try{const c=sb();if(!c)return false;const {data:{user}}=await c.auth.getUser();if(!user)return adminCache=false;const r=await c.from('profiles').select('role').eq('id',user.id).maybeSingle();return adminCache=r.data?.role==='admin'}catch{return adminCache=false}
}
function css(){
  if(document.getElementById('qsoCss'))return;
  const s=document.createElement('style');s.id='qsoCss';s.textContent=`
#qsoBar{margin:-2px 0 10px;padding:10px 12px;border:1px solid #cfe1ef;background:#f7fbfe;border-radius:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#qsoBar .qsoMsg{font-size:11px;color:#6f7786;margin-right:auto;line-height:1.45}#qsoBar button{border-radius:9px;padding:8px 11px;font-weight:900}
#qsoSave{border:0;background:var(--accent,#126fb3);color:#fff}#qsoUndo{border:1px solid #dce3ec;background:#fff;color:#536174}#qsoSave:disabled,#qsoUndo:disabled{opacity:.35}
.problem.qsoRow .qid{display:flex;align-items:center;gap:5px;min-width:0}.qsoNum{min-width:16px}.qsoHandle{touch-action:none;-webkit-user-select:none;user-select:none;border:0;background:#edf4f9;color:var(--accent,#126fb3);border-radius:9px;width:42px;height:42px;padding:0;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:grab;flex:0 0 auto}
.qsoHandle:active{cursor:grabbing}body.qbQuestionReorderMode .problem.qsoRow{cursor:grab;touch-action:pan-y;-webkit-user-select:none;user-select:none}body.qbQuestionReorderMode .problem.qsoRow.qsoPressing{background:#f4f8fb}body.qbQuestionReorderMode .problem.qsoRow:active{cursor:grabbing}
.problem.qsoSourceHidden{position:fixed!important;left:-10000px!important;top:0!important;width:1px!important;height:1px!important;margin:0!important;opacity:0!important;pointer-events:none!important}.qsoDropIndicator{height:4px;margin:5px 2px;border-radius:999px;background:var(--accent,#126fb3);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent,#126fb3) 22%,transparent);pointer-events:none}
.qsoDragGhost{position:fixed!important;z-index:10000!important;margin:0!important;opacity:.76!important;pointer-events:none!important;box-sizing:border-box!important;transform:scale(1.01);transform-origin:center;box-shadow:0 12px 30px #17324d38!important;background:#fff!important;border-radius:10px!important}
body.qsoIsDragging,body.qsoIsDragging *{cursor:grabbing!important}body.qsoIsDragging{overscroll-behavior:none}
@media(max-width:520px){.problem.qsoRow{grid-template-columns:66px 1fr}.qsoHandle{width:44px;height:44px}.problem.qsoRow .pick{grid-column:2}}
`;document.head.appendChild(s)
}
function stopAutoScroll(){cancelAnimationFrame(autoScrollFrame);autoScrollFrame=0}
function removeDragUi(){stopAutoScroll();document.body.classList.remove('qsoIsDragging');drag?.timer&&clearTimeout(drag.timer);drag?.ghost?.remove();drag?.indicator?.remove();drag?.row?.classList.remove('qsoPressing','qsoSourceHidden')}
function clear(){
  if(drag){removeDragUi();drag=null}ctx=null;suppressClickUntil=0;window.QB_REORDER_ACTIVE=false;document.getElementById('qsoBar')?.remove();
  document.querySelectorAll('.qsoHandle').forEach(x=>x.remove());document.querySelectorAll('.qsoNum').forEach(n=>{const p=n.parentElement;if(p)p.textContent=n.textContent||''});
  document.querySelectorAll('.qsoRow,.qsoPressing,.qsoSourceHidden').forEach(x=>x.classList.remove('qsoRow','qsoPressing','qsoSourceHidden'))
}
function renumber(){rows().forEach((r,i)=>{const n=r.querySelector('.qsoNum');if(n)n.textContent=String(i+1)})}
function idsNow(){return rows().map(rowId).filter(Boolean)}
function sameOrder(a,b){return a.length===b.length&&a.every((x,i)=>x===b[i])}
function updateBar(){
  if(!ctx)return;const dirty=!sameOrder(idsNow(),ctx.originalIds);ctx.dirty=dirty;const save=document.getElementById('qsoSave'),undo=document.getElementById('qsoUndo');if(save)save.disabled=!dirty||ctx.saving;if(undo)undo.disabled=!dirty||ctx.saving;
  const msg=document.querySelector('#qsoBar .qsoMsg');if(msg&&!ctx.saving)msg.textContent=dirty?'順番を変更中です。保存するまでDBには反映されません。':'カードをドラッグして並び替えできます。'
}
function orderBy(ids){const rs=rows(),map=new Map(rs.map(r=>[rowId(r),r])),parent=rs[0]?.parentElement;if(!parent)return;ids.forEach(id=>{const r=map.get(id);if(r)parent.appendChild(r)});renumber();updateBar()}
function restore(){if(ctx)orderBy(ctx.originalIds)}
function armClickSuppression(ms=1400){suppressClickUntil=Date.now()+ms;window.QB_SUPPRESS_SINGLE_OPEN_UNTIL=suppressClickUntil}
function placeIndicator(clientY){
  if(!drag?.active)return;const candidates=rows().filter(r=>r!==drag.row&&!r.classList.contains('qsoSourceHidden')),parent=drag.row.parentElement;if(!parent)return;
  const target=candidates.find(r=>{const b=r.getBoundingClientRect();return clientY<b.top+b.height/2});if(target)parent.insertBefore(drag.indicator,target);else if(candidates.length)parent.insertBefore(drag.indicator,candidates.at(-1).nextSibling);else parent.appendChild(drag.indicator)
}
function updateGhost(x,y){if(drag?.ghost){drag.ghost.style.left=`${x-drag.offsetX}px`;drag.ghost.style.top=`${y-drag.offsetY}px`}}
function scrollStep(){
  autoScrollFrame=0;if(!drag?.active)return;const edge=Math.min(92,Math.max(60,innerHeight*.12)),y=drag.clientY;let speed=0;
  if(y<edge)speed=-Math.ceil(4+24*(edge-y)/edge);else if(y>innerHeight-edge)speed=Math.ceil(4+24*(y-(innerHeight-edge))/edge);
  if(speed){const before=scrollY;window.scrollBy(0,speed);if(scrollY!==before)placeIndicator(y)}autoScrollFrame=requestAnimationFrame(scrollStep)
}
function beginDrag(){
  if(!drag||drag.active||!ctx||ctx.saving)return;drag.timer=0;drag.active=true;drag.row.classList.remove('qsoPressing');armClickSuppression();
  const rect=drag.row.getBoundingClientRect(),ghost=drag.row.cloneNode(true),indicator=document.createElement('div');ghost.classList.remove('qsoPressing','qsoSourceHidden');ghost.classList.add('qsoDragGhost');ghost.setAttribute('aria-hidden','true');ghost.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
  Object.assign(ghost.style,{width:`${rect.width}px`,height:`${rect.height}px`,left:`${rect.left}px`,top:`${rect.top}px`});indicator.className='qsoDropIndicator';indicator.setAttribute('aria-hidden','true');drag.row.parentElement.insertBefore(indicator,drag.row);drag.row.classList.add('qsoSourceHidden');document.body.appendChild(ghost);
  drag.ghost=ghost;drag.indicator=indicator;drag.offsetX=Math.max(0,Math.min(rect.width,drag.clientX-rect.left));drag.offsetY=Math.max(0,Math.min(rect.height,drag.clientY-rect.top));updateGhost(drag.clientX,drag.clientY);document.body.classList.add('qsoIsDragging');window.QB_REORDER_ACTIVE=true;
  window.dispatchEvent(new CustomEvent('qb-question-reorder-drag-start',{detail:{questionId:rowId(drag.row)}}));autoScrollFrame=requestAnimationFrame(scrollStep)
}
function cancelPending(){if(!drag||drag.active)return;drag.timer&&clearTimeout(drag.timer);drag.row.classList.remove('qsoPressing');drag=null}
function onPointerDown(e){
  const row=e.currentTarget;if(!row||!ctx||ctx.saving||!window.QB_REORDER_MODE||e.button>0||isInteractive(e.target))return;const handle=!!e.target.closest('.qsoHandle');
  drag={row,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,clientX:e.clientX,clientY:e.clientY,active:false,startIds:idsNow(),timer:0};row.classList.add('qsoPressing');try{row.setPointerCapture(e.pointerId)}catch{}
  if(handle){e.preventDefault();e.stopPropagation();beginDrag()}else if(e.pointerType==='touch')drag.timer=setTimeout(beginDrag,160)
}
function onPointerMove(e){
  if(!drag||e.pointerId!==drag.pointerId)return;drag.clientX=e.clientX;drag.clientY=e.clientY;const distance=Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY);
  if(!drag.active){if(e.pointerType==='touch'){if(distance>8)cancelPending()}else if(distance>=4)beginDrag();return}e.preventDefault();e.stopPropagation();armClickSuppression();updateGhost(e.clientX,e.clientY);placeIndicator(e.clientY)
}
function finishDrag(e,cancel=false){
  if(!drag||e.pointerId!==drag.pointerId)return;const d=drag;if(!d.active){cancelPending();return}e.preventDefault();e.stopPropagation();armClickSuppression();
  if(cancel)orderBy(d.startIds);else d.row.parentElement.insertBefore(d.row,d.indicator);removeDragUi();drag=null;window.QB_REORDER_ACTIVE=!!window.QB_REORDER_MODE;renumber();updateBar();
  window.dispatchEvent(new CustomEvent('qb-question-reorder-drag-end',{detail:{questionId:rowId(d.row),cancelled:cancel}}))
}
function suppressSyntheticClick(e){if(Date.now()>suppressClickUntil)return;const row=e.target?.closest?.('#view .problem');if(!row)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()}
async function save(){
  if(!ctx||ctx.saving)return;const current=idsNow();if(sameOrder(current,ctx.originalIds))return;ctx.saving=true;updateBar();const msg=document.querySelector('#qsoBar .qsoMsg');if(msg)msg.textContent='順番を保存中…';
  try{if(ctx.rankValues.length!==current.length)throw new Error('並び順データの件数が一致しません');const items=current.map((id,i)=>({id,study_order:ctx.rankValues[i]}));const r=await sb().rpc('admin_reorder_questions',{p_unit_id:ctx.unitId,p_items:items});if(r.error)throw r.error;ctx.originalIds=[...current];ctx.saving=false;updateBar();if(msg)msg.textContent=`保存しました（${r.data||0}件更新）`;window.dispatchEvent(new CustomEvent('qb-question-order-updated',{detail:{unitId:ctx.unitId,questionIds:current}}))}
  catch(err){ctx.saving=false;restore();updateBar();if(msg)msg.textContent='保存に失敗したため、元の順番に戻しました: '+(err?.message||err)}
}
async function inject(){
  clearTimeout(timer);if(screen()!=='problems'){clear();return}const st=pstate(),unitId=st.unitId||null;if(!unitId||unitId==='__all__'){clear();return}if(!(await isAdmin())){clear();return}
  const rs=rows();if(rs.length<2){clear();return}const ids=rs.map(rowId).filter(Boolean);if(ids.length!==rs.length){clear();return}const r=await sb().from('questions').select('id,unit_id,study_order').in('id',ids);if(r.error){console.error('question reorder load',r.error);return}
  const rec=r.data||[];if(rec.length!==ids.length||rec.some(x=>x.unit_id!==unitId)){clear();return}const rankValues=rec.map(x=>Number(x.study_order)||0).sort((a,b)=>a-b);if(new Set(rankValues).size!==rankValues.length){clear();console.warn('question reorder disabled: duplicate study_order');return}
  clear();ctx={unitId,originalIds:[...ids],rankValues,saving:false,dirty:false};css();rs.forEach((row,i)=>{
    row.classList.add('qsoRow');const qid=row.querySelector('.qid');if(!qid)return;const old=qid.textContent.trim();qid.textContent='';const h=document.createElement('button');h.type='button';h.className='qsoHandle';h.setAttribute('aria-label','問題を並び替え');h.textContent='≡';const n=document.createElement('span');n.className='qsoNum';n.textContent=old||String(i+1);qid.append(h,n);
    row.addEventListener('pointerdown',onPointerDown);row.addEventListener('pointermove',onPointerMove);row.addEventListener('pointerup',e=>finishDrag(e,false));row.addEventListener('pointercancel',e=>finishDrag(e,true));h.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()})
  });
  const listCard=rs[0].parentElement,bar=document.createElement('div');bar.id='qsoBar';bar.innerHTML='<div class="qsoMsg" aria-live="polite">カードをドラッグして並び替えできます。</div><button id="qsoUndo" type="button" disabled>元に戻す</button><button id="qsoSave" type="button" disabled>順番を保存</button>';listCard?.insertAdjacentElement('beforebegin',bar);document.getElementById('qsoUndo').onclick=restore;document.getElementById('qsoSave').onclick=save;renumber();updateBar()
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>inject().catch(console.error),80)}
function boot(){css();document.addEventListener('click',suppressSyntheticClick,true);['qb-screen-change','qb-app-ready','qb-question-order-updated'].forEach(ev=>window.addEventListener(ev,schedule));setTimeout(schedule,900)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
