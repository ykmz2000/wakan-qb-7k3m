(()=>{
'use strict';
const processed=new WeakSet(),unitCache=new Map();
let timer=0;
const screen=()=>window.qbGetScreen?.()||'';
const pstate=()=>window.qbGetPracticeState?.()||{};
async function unitRanks(subjectId){
  if(unitCache.has(subjectId))return unitCache.get(subjectId);
  const sb=window.qbSupabase;if(!sb)throw new Error('Supabase未初期化');
  const r=await sb.from('units').select('id,sort_order').eq('subject_id',subjectId).eq('is_active',true).order('sort_order',{ascending:true});
  if(r.error)throw r.error;
  const rows=r.data||[],rank=new Map(rows.map((u,i)=>[String(u.id),{sort:Number(u.sort_order)||0,index:i}]));
  unitCache.set(subjectId,rank);return rank
}
function reorderDom(arr){
  const rs=[...document.querySelectorAll('#view .problem')],parent=rs[0]?.parentElement;if(!parent||!rs.length)return false;
  const map=new Map(rs.map(r=>[String(r.querySelector('input[data-q]')?.dataset?.q||''),r]));
  if(arr.some(q=>!map.has(String(q.id))))return false;
  arr.forEach((q,i)=>{const r=map.get(String(q.id));parent.appendChild(r);const n=r.querySelector('.qid');if(n)n.textContent=String(i+1)});
  return true
}
async function fix(){
  if(screen()!=='problems')return;
  const st=pstate();if(st.unitId!=='__all__'||!st.subjectId)return;
  const arr=window.QB_QUESTIONS;if(!Array.isArray(arr)||arr.length<2||processed.has(arr))return;
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
  processed.add(arr);reorderDom(arr)
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>fix().catch(e=>console.error('all questions unit order',e)),25)}
function boot(){window.addEventListener('qb-screen-change',schedule);window.addEventListener('qb-app-ready',schedule);schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();