(()=>{
'use strict';
const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
let exactId=null;
function visibleStem(){return norm(document.querySelector('#view > .card > .qtext')?.textContent||'')}
function visibleChoices(){
  return [...document.querySelectorAll('#view > .card > .choices > .choice')].map(el=>{
    const t=norm(el.textContent||'');
    const m=t.match(/^([^\.．\s]+)[\.．]\s*(.*)$/s);
    return m?{key:norm(m[1]),text:norm(m[2])}:{key:'',text:t};
  });
}
function visibleOccurrence(){
  const badges=[...document.querySelectorAll('#view > .card .badge')].map(x=>norm(x.textContent));
  const y=(badges[0]||'').match(/(20\d{2})/);
  return {year:y?Number(y[1]):null,examType:badges[1]||null};
}
function sameChoices(q,vis){
  const ch=[...(q?.choices||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  if(ch.length!==vis.length)return false;
  return ch.every((c,i)=>{
    const key=norm(c.choice_key||''),text=norm(c.choice_text||'');
    return (!vis[i].key||key===vis[i].key)&&text===vis[i].text;
  });
}
function matchesVisible(q,stem,vis){
  if(!q||norm(q?.stem||q?.q||'')!==stem)return false;
  if(vis.length&&!sameChoices(q,vis))return false;
  return true;
}
function resolve(){
  const qs=Array.isArray(window.QB_QUESTIONS)?window.QB_QUESTIONS:[];
  if(!qs.length)return null;
  const stem=visibleStem();if(!stem)return null;
  const vis=visibleChoices();
  if(exactId){
    const exact=qs.find(q=>(q?.id||q?.dbId)===exactId);
    if(matchesVisible(exact,stem,vis))return exact;
    exactId=null;
  }
  let cand=qs.filter(q=>matchesVisible(q,stem,vis));
  const occ=visibleOccurrence();
  if(cand.length>1&&occ.year)cand=cand.filter(q=>Number(q?.occ?.[0]?.academic_year||0)===occ.year);
  if(cand.length>1&&occ.examType)cand=cand.filter(q=>norm(q?.occ?.[0]?.exam_type||'')===occ.examType);
  return cand.length===1?cand[0]:null;
}
function qid(q){return q?.id||q?.dbId||null}
window.qbResolveCurrentQuestion=resolve;
window.qbCurrentQuestionId=()=>qid(resolve());
window.pq=resolve;
window.addEventListener('qb-selection-change',e=>{const id=e.detail?.questionId;if(id)exactId=id});
document.addEventListener('click',e=>{if(e.target?.closest?.('#prev,#next,#start,.mode,[data-u],[data-s]'))exactId=null},true);
function annotateEditors(){
  const id=window.qbCurrentQuestionId?.();if(!id)return;
  document.querySelectorAll('.adeEditor,.adeStemEditor,.oaiEditor,.qbNoteEditor,.oeiBox,.qsiEditor').forEach(ed=>{if(!ed.dataset.qbQuestionId)ed.dataset.qbQuestionId=id});
}
function nearestGuardedEditor(el){return el?.closest?.('.adeEditor,.adeStemEditor,.oaiEditor,.qbNoteEditor,.oeiBox,.qsiEditor')||null}
function guardAction(e){
  const target=e.target?.closest?.('.adeSave,.oaiSave,.qbNoteSave,.oeiFile,.oeiPasteBtn,.qsiPick input,.qsiPasteBtn');
  if(!target)return;
  const ed=nearestGuardedEditor(target);if(!ed)return;
  const stored=ed.dataset.qbQuestionId,current=window.qbCurrentQuestionId?.();
  if(stored&&current&&stored!==current){e.preventDefault();e.stopImmediatePropagation();alert('問題が切り替わったため保存を中止しました。編集画面を開き直してください。')}
}
let raf=0;function schedule(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;annotateEditors()})}
['qb-screen-change','qb-answer-shown','qb-explanation-ready','qb-admin-editor-opened','qb-retry-current'].forEach(ev=>window.addEventListener(ev,schedule));
document.addEventListener('click',e=>{schedule();guardAction(e)},true);
document.addEventListener('change',guardAction,true);
const v=document.getElementById('view');if(v)new MutationObserver(schedule).observe(v,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
