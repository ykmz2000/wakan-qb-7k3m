(()=>{
'use strict';
const cache=new Map(),pending=new Map();
function uniq(a){return [...new Set((a||[]).map(String))]}
function shuffleBlocks(blocks){for(let i=blocks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[blocks[i],blocks[j]]=[blocks[j],blocks[i]]}return blocks}
async function loadSeries(subjectId,force=false){
  subjectId=String(subjectId||'');if(!subjectId)return{groups:[],byQuestion:new Map()};
  if(!force&&cache.has(subjectId))return cache.get(subjectId);
  if(!force&&pending.has(subjectId))return pending.get(subjectId);
  const task=(async()=>{
    const sb=window.qbSupabase;if(!sb)return{groups:[],byQuestion:new Map()};
    const sr=await sb.from('question_series').select('id,name,description').eq('subject_id',subjectId);
    if(sr.error)throw sr.error;
    const series=sr.data||[];if(!series.length){const empty={groups:[],byQuestion:new Map()};cache.set(subjectId,empty);return empty}
    const ids=series.map(x=>x.id),mr=await sb.from('question_series_members').select('series_id,question_id,sequence_order,requires_previous').in('series_id',ids);
    if(mr.error)throw mr.error;
    const membersBySeries=new Map();
    (mr.data||[]).forEach(m=>{const a=membersBySeries.get(String(m.series_id))||[];a.push({...m,question_id:String(m.question_id)});membersBySeries.set(String(m.series_id),a)});
    const groups=series.map(s=>({id:String(s.id),name:s.name||'',description:s.description||'',members:(membersBySeries.get(String(s.id))||[]).sort((a,b)=>(Number(a.sequence_order)||0)-(Number(b.sequence_order)||0))})).filter(g=>g.members.length);
    const byQuestion=new Map();groups.forEach(g=>g.members.forEach(m=>byQuestion.set(m.question_id,g)));
    const data={groups,byQuestion};cache.set(subjectId,data);return data
  })();
  pending.set(subjectId,task);
  try{return await task}finally{pending.delete(subjectId)}
}
function exposeMap(data){const out={};data.groups.forEach(g=>{const ids=g.members.map(m=>m.question_id);ids.forEach(id=>out[id]=ids)});window.QB_SERIES_MAP=out}
async function preparePracticeIds(selectedIds,subjectId,availableIds,mode='ordered'){
  const selected=new Set(uniq(selectedIds)),availableOrder=uniq(availableIds),available=new Set(availableOrder),data=await loadSeries(subjectId);
  exposeMap(data);
  [...selected].forEach(id=>{const g=data.byQuestion.get(id);if(g)g.members.forEach(m=>{if(available.has(m.question_id))selected.add(m.question_id)})});
  const ordered=availableOrder.filter(id=>selected.has(id));if(mode!=='shuffle')return ordered;
  const blocks=[],seen=new Set();
  for(const id of ordered){
    if(seen.has(id))continue;
    const g=data.byQuestion.get(id);
    if(!g){seen.add(id);blocks.push([id]);continue}
    const block=g.members.map(m=>m.question_id).filter(qid=>available.has(qid)&&selected.has(qid));
    block.forEach(qid=>seen.add(qid));if(block.length)blocks.push(block)
  }
  return shuffleBlocks(blocks).flat()
}
function currentQuestionId(){try{const q=window.pq?.();return q?.id||q?.dbId||null}catch{return null}}
function syncBadge(){
  document.getElementById('seriesBadge')?.remove();if(window.qbGetScreen?.()!=='practice')return;
  const id=String(currentQuestionId()||''),group=window.QB_SERIES_MAP?.[id];if(!id||!Array.isArray(group)||group.length<2)return;
  const qtext=document.querySelector('#view .qtext');if(!qtext)return;const idx=group.indexOf(id);
  const d=document.createElement('div');d.id='seriesBadge';d.className='badge gray';d.style.marginTop='8px';d.textContent=`連続問題 ${Math.max(0,idx)+1}/${group.length}`;qtext.insertAdjacentElement('afterend',d)
}
function patchBrand(){const brand=document.querySelector('.brand');if(!brand||brand.dataset.qbSeriesBrand==='1')return;brand.dataset.qbSeriesBrand='1';brand.style.cursor='pointer';brand.onclick=()=>{try{if(typeof window.showGradeScreen==='function')return window.showGradeScreen()}catch{}location.href=location.pathname}}
function loadCurrentSubject(){const st=window.qbGetPracticeState?.()||{};if(!st.subjectId)return;loadSeries(st.subjectId).then(d=>{exposeMap(d);syncBadge()}).catch(e=>console.error('question series load',e))}
window.qbLoadQuestionSeries=loadSeries;
window.qbPreparePracticeIds=preparePracticeIds;
window.qbInvalidateQuestionSeries=subjectId=>{if(subjectId){cache.delete(String(subjectId));pending.delete(String(subjectId))}else{cache.clear();pending.clear()}};
function boot(){window.QB_SERIES_MAP={};patchBrand();['qb-screen-change','qb-app-ready','qb-answer-shown','qb-retry-current'].forEach(ev=>window.addEventListener(ev,()=>setTimeout(()=>{patchBrand();loadCurrentSubject()},0)));loadCurrentSubject()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();