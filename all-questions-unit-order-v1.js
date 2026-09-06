(()=>{
'use strict';
const processed=new WeakSet(),unitCache=new Map();
let timer=0;
const screen=()=>window.qbGetScreen?.()||'';
const pstate=()=>window.qbGetPracticeState?.()||{};
function escAttr(v){return String(v??'').replace(/\\/g,'\\\\').replace(/"/g,'\\"')}
async function unitRanks(subjectId){
  if(unitCache.has(subjectId))return unitCache.get(subjectId);
  const sb=window.qbSupabase;if(!sb)throw new Error('Supabase未初期化');
  const r=await sb.from('units').select('id,sort_order').eq('subject_id',subjectId).eq('is_active',true).order('sort_order',{ascending:true});
  if(r.error)throw r.error;
  const rows=r.data||[],rank=new Map(rows.map((u,i)=>[String(u.id),{sort:Number(u.sort_order)||0,index:i}]));
  unitCache.set(subjectId,rank);return rank
}
function clearSelection(){
  const boxes=[...document.querySelectorAll('#view input[data-q]')],toggle=document.getElementById('toggleAll');
  if(!toggle)return false;
  const checked=boxes.filter(x=>x.checked).length;
  if(checked===boxes.length&&boxes.length){toggle.click();return true}
  toggle.click();
  document.getElementById('toggleAll')?.click();
  return true
}
function restoreSelection(ids,allCount){
  if(ids.size===allCount){document.getElementById('toggleAll')?.click();return}
  for(const q of window.QB_QUESTIONS||[]){
    if(!ids.has(String(q.id)))continue;
    const box=document.querySelector(`#view input[data-q="${escAttr(q.id)}"]`);
    if(!box)continue;box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}))
  }
}
async function fix(){
  if(screen()!=='problems')return;
  const st=pstate();if(st.unitId!=='__all__'||!st.subjectId)return;
  const arr=window.QB_QUESTIONS;if(!Array.isArray(arr)||arr.length<2||processed.has(arr))return;
  const selectedIds=new Set([...document.querySelectorAll('#view input[data-q]')].filter(x=>x.checked).map(x=>String(x.dataset.q)));
  const ranks=await unitRanks(st.subjectId);
  if(screen()!=='problems'||pstate().unitId!=='__all__'||window.QB_QUESTIONS!==arr)return;
  arr.sort((a,b)=>{
    const ra=ranks.get(String(a.unit_id)),rb=ranks.get(String(b.unit_id));
    const usa=ra?.sort??Number.MAX_SAFE_INTEGER,usb=rb?.sort??Number.MAX_SAFE_INTEGER;
    if(usa!==usb)return usa-usb;
    const uia=ra?.index??Number.MAX_SAFE_INTEGER,uib=rb?.index??Number.MAX_SAFE_INTEGER;
    if(uia!==uib)return uia-uib;
    const sa=Number.isFinite(Number(a.study_order))?Number(a.study_order):Number.MAX_SAFE_INTEGER;
    const sb=Number.isFinite(Number(b.study_order))?Number(b.study_order):Number.MAX_SAFE_INTEGER;
    if(sa!==sb)return sa-sb;
    return String(a.id).localeCompare(String(b.id))
  });
  processed.add(arr);
  if(clearSelection())restoreSelection(selectedIds,arr.length)
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>fix().catch(e=>console.error('all questions unit order',e)),25)}
function boot(){window.addEventListener('qb-screen-change',schedule);window.addEventListener('qb-app-ready',schedule);schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();