(()=>{
'use strict';
const ZERO='00000000-0000-0000-0000-000000000000';
let subjectId=null,provenanceCache=new Map(),renderTimer=null,rendering=false,activeFilter=null,openingFiltered=false;
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function sb(){for(let i=0;i<80;i++){if(window.qbSupabase)return window.qbSupabase;await new Promise(r=>setTimeout(r,75))}return null}
async function getSubjectId(){if(subjectId)return subjectId;const c=await sb();if(!c)return null;const r=await c.from('subjects').select('id').eq('slug','emergency-medicine').maybeSingle();subjectId=r.data?.id||null;return subjectId}
const GROUPS={
  new:{order:1,heading:'新設問題（オリジナル問題）',lead:'2026年度レジメをもとに作成した対策問題です。実際の過去問ではありません。',priority:'最優先'},
  continuing:{order:2,heading:'既存問題（過去問）',lead:'2022〜2025年度の過去問のうち、2026年度も学習に活用する問題です。',priority:'優先'},
  legacy:{order:3,heading:'範囲外となった問題',lead:'昨年までの過去問に含まれますが、2026年度では独立した重点範囲として確認できない問題です。完全な出題除外を保証するものではありません。',priority:'低優先'}
};
function onEmergencyUnits(){const crumb=document.getElementById('crumb')?.textContent||'';return crumb.includes('救急医学')&&crumb.includes('単元')}
function onEmergencyProblems(){const crumb=document.getElementById('crumb')?.textContent||'';return crumb.includes('救急医学')&&window.qbGetScreen?.()==='problems'}
function css(){
  if(document.getElementById('qbEmergencyStudyCss'))return;
  const s=document.createElement('style');s.id='qbEmergencyStudyCss';s.textContent=`
#qbEmergencyAreaLayout{margin-top:2px}.qbEmArea{margin:0 0 18px;padding-top:14px;border-top:2px solid var(--line)}.qbEmArea:first-child{border-top:0;padding-top:0}.qbEmAreaHead{background:#f8fafc;border:1px solid var(--line);border-radius:16px;padding:13px;margin-bottom:9px}.qbEmAreaTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.qbEmAreaTitle{font-size:18px;font-weight:950;line-height:1.35}.qbEmAreaPriority{flex:0 0 auto;padding:5px 9px;border-radius:999px;background:#eef3f8;color:#536174;font-size:10px;font-weight:900}.qbEmArea[data-type="new"] .qbEmAreaHead{border-color:#b9d9ef;background:#f4f9fd}.qbEmArea[data-type="new"] .qbEmAreaPriority{background:#e7f2fb;color:#126fb3}.qbEmArea[data-type="legacy"] .qbEmAreaHead{background:#fafafa}.qbEmAreaDesc{font-size:11px;color:var(--muted);line-height:1.55;margin-top:5px}.qbEmAreaStats{font-size:11px;font-weight:800;color:#536174;margin-top:8px}.qbEmAreaAll{width:100%;margin-top:10px;border:1px solid #cbd8e4;background:#fff;color:#126fb3;border-radius:12px;min-height:42px;padding:8px 12px;font-weight:900;text-align:center}.qbEmAreaAll:active{background:#eef6fb}.qbEmUnitList>.list{margin-bottom:10px}.qbEmEmpty{padding:12px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:12px}.qbEmMask{position:fixed;inset:0;z-index:140;background:#f5f7fbdd;backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;color:#126fb3;font-weight:900}.qbGeneratedBanner{margin:0 0 10px;padding:9px 11px;border-radius:12px;background:#eaf4fb;border:1px solid #b9d9ef;font-size:12px;font-weight:800;line-height:1.5}
  `;document.head.appendChild(s)
}
function mask(on,text='問題一覧を準備しています…'){
  document.getElementById('qbEmMask')?.remove();if(!on)return;
  const d=document.createElement('div');d.id='qbEmMask';d.className='qbEmMask';d.textContent=text;document.body.appendChild(d)
}
async function getStudyData(){
  const c=await sb(),sid=await getSubjectId();if(!c||!sid)return null;
  const mRes=await c.from('study_modules').select('id,module_type,sort_order').eq('subject_id',sid).eq('academic_year',2026).eq('is_active',true).order('sort_order');
  if(mRes.error||!mRes.data?.length)return null;
  const mids=mRes.data.map(x=>x.id),typeByModule=new Map(mRes.data.map(x=>[x.id,x.module_type]));
  const iRes=await c.from('study_module_items').select('module_id,question_id,sort_order').in('module_id',mids).order('sort_order');if(iRes.error)return null;
  const items=iRes.data||[],qids=[...new Set(items.map(x=>x.question_id))];if(!qids.length)return null;
  const qRes=await c.from('questions').select('id,unit_id').in('id',qids);if(qRes.error)return null;
  const unitByQ=new Map((qRes.data||[]).map(x=>[x.id,x.unit_id]));
  const grouped={new:{ids:[],units:new Map()},continuing:{ids:[],units:new Map()},legacy:{ids:[],units:new Map()}};
  items.forEach(x=>{const type=typeByModule.get(x.module_id);if(!grouped[type])return;const uid=unitByQ.get(x.question_id);if(!uid)return;grouped[type].ids.push(x.question_id);if(!grouped[type].units.has(uid))grouped[type].units.set(uid,[]);grouped[type].units.get(uid).push(x.question_id)});
  const allIds=[...new Set(Object.values(grouped).flatMap(g=>g.ids))];let stateMap=new Map();
  try{const {data:{user}}=await c.auth.getUser();if(user&&allIds.length){const st=await c.from('user_question_state').select('question_id,has_answered,has_viewed_explanation').eq('user_id',user.id).in('question_id',allIds);stateMap=new Map((st.data||[]).map(x=>[x.question_id,x]))}}catch{}
  return {grouped,stateMap}
}
function areaStats(ids,stateMap){let answered=0,reviewed=0;ids.forEach(id=>{const st=stateMap.get(id)||{};if(st.has_answered)answered++;if(st.has_viewed_explanation)reviewed++});return {answered,reviewed}}
async function renderAreas(){
  if(rendering||!onEmergencyUnits())return;
  const V=document.getElementById('view');if(!V||V.querySelector('#qbEmergencyAreaLayout'))return;
  const unitButtons=[...V.querySelectorAll('button.list[data-u]')];if(unitButtons.length<2)return;
  rendering=true;
  try{
    const data=await getStudyData();if(!data||!onEmergencyUnits()||V.querySelector('#qbEmergencyAreaLayout'))return;
    const {grouped,stateMap}=data,buttonByUnit=new Map();
    unitButtons.forEach(b=>{if(b.dataset.u!=='__all__')buttonByUnit.set(b.dataset.u,b)});
    const allBtn=unitButtons.find(b=>b.dataset.u==='__all__');if(allBtn)allBtn.remove();
    const layout=document.createElement('div');layout.id='qbEmergencyAreaLayout';
    Object.entries(GROUPS).sort((a,b)=>a[1].order-b[1].order).forEach(([type,g])=>{
      const group=grouped[type],ids=[...new Set(group.ids)],st=areaStats(ids,stateMap),area=document.createElement('section');area.className='qbEmArea';area.dataset.type=type;
      area.innerHTML=`<div class="qbEmAreaHead"><div class="qbEmAreaTop"><div class="qbEmAreaTitle">${esc(g.heading)}</div><span class="qbEmAreaPriority">${esc(g.priority)}</span></div><div class="qbEmAreaDesc">${esc(g.lead)}</div><div class="qbEmAreaStats">${ids.length}問・解答済み ${st.answered}/${ids.length}・解説確認済み ${st.reviewed}/${ids.length}</div><button type="button" class="qbEmAreaAll">このエリアの全問題を選択</button></div><div class="qbEmUnitList"></div>`;
      const list=area.querySelector('.qbEmUnitList');
      [...group.units.entries()].forEach(([uid,subsetIds])=>{
        const original=buttonByUnit.get(uid);if(!original)return;
        const fullCount=Number((original.querySelector('.meta')?.textContent||'').match(/^(\d+)問/)?.[1]||subsetIds.length);
        if(subsetIds.length===fullCount){
          original.addEventListener('click',()=>{activeFilter=null},{capture:true});list.appendChild(original);buttonByUnit.delete(uid)
        }else{
          const clone=original.cloneNode(true),meta=clone.querySelector('.meta'),prog=clone.querySelector('.progress>div'),ss=areaStats(subsetIds,stateMap);
          if(meta)meta.textContent=`${subsetIds.length}問・解答済み ${ss.answered}/${subsetIds.length}・解説確認済み ${ss.reviewed}/${subsetIds.length}`;if(prog)prog.style.width=`${subsetIds.length?ss.answered/subsetIds.length*100:0}%`;
          clone.onclick=e=>{e.preventDefault();openFilteredList(type,subsetIds,clone.querySelector('.lt')?.textContent||g.heading).catch(console.error)};list.appendChild(clone)
        }
      });
      if(!list.children.length){const d=document.createElement('div');d.className='qbEmEmpty';d.textContent='現在、この区分に表示できる単元はありません。';list.appendChild(d)}
      area.querySelector('.qbEmAreaAll').onclick=()=>openFilteredList(type,ids,g.heading).catch(console.error);layout.appendChild(area)
    });
    if(buttonByUnit.size){const area=layout.querySelector('.qbEmArea[data-type="continuing"] .qbEmUnitList');buttonByUnit.forEach(b=>area?.appendChild(b))}
    const first=V.querySelector('.card');if(first)first.insertAdjacentElement('afterend',layout);else V.prepend(layout)
  }finally{rendering=false}
}
async function openFilteredList(type,ids,title){
  if(!ids?.length)return;const sid=await getSubjectId();if(!sid||typeof window.qbResumeSession!=='function'||typeof window.qbOpenProblemList!=='function')return;
  openingFiltered=true;activeFilter={type,ids:new Set(ids),title};mask(true);
  try{
    await window.qbResumeSession({id:ZERO,subject_id:sid,unit_id:null,mode:'ordered',question_ids:[...ids],current_index:0,metadata:{unit_scope:'__all__',emergency_area:type},completed_at:null,updated_at:new Date().toISOString()});
    window.qbOpenProblemList();setTimeout(decorateFilteredProblems,20)
  }catch(e){console.error(e);activeFilter=null;alert('問題一覧を開けませんでした: '+(e?.message||'不明なエラー'))}
  finally{openingFiltered=false;mask(false)}
}
function decorateFilteredProblems(){
  if(!activeFilter||!onEmergencyProblems())return;
  const V=document.getElementById('view'),rows=[...V.querySelectorAll('.problem')];if(!rows.length)return;
  let visible=0;rows.forEach(r=>{const id=r.querySelector('[data-q]')?.dataset.q,show=!!id&&activeFilter.ids.has(id);r.style.display=show?'':'none';if(show)visible++});
  const head=[...V.children].find(x=>x.classList?.contains('card')),title=head?.querySelector('.title'),meta=head?.querySelector('.meta');if(title)title.textContent=activeFilter.title;if(meta)meta.textContent=`${visible}問`;
  const C=document.getElementById('crumb');if(C)C.textContent=`救急医学 ＞ ${activeFilter.title} ＞ 問題一覧`;
  const toggle=document.getElementById('toggleAll');if(toggle&&!toggle.dataset.qbEmFiltered){toggle.dataset.qbEmFiltered='1';toggle.onclick=()=>{
    const boxes=rows.filter(r=>r.style.display!=='none').map(r=>r.querySelector('[data-q]')).filter(Boolean),all=boxes.every(x=>x.checked);boxes.forEach(x=>{const want=!all;if(x.checked!==want){x.checked=want;x.dispatchEvent(new Event('change',{bubbles:true}))}});toggle.textContent=!all?'すべて解除':'すべて選択'
  }}
}
async function annotateGenerated(){
  const crumb=document.getElementById('crumb')?.textContent||'';if(!crumb.includes('救急医学')||!crumb.includes('演習'))return;
  const card=document.querySelector('#view>.card');if(!card||card.querySelector('.qbGeneratedBanner'))return;
  const st=typeof window.qbGetPracticeState==='function'?window.qbGetPracticeState():null,qid=st?.questionIds?.[st?.currentIndex??0];if(!qid)return;
  let p=provenanceCache.get(qid);if(p===undefined){const c=await sb();if(!c)return;const r=await c.from('question_provenance').select('origin_type,is_ai_generated,source_file,source_locator').eq('question_id',qid).maybeSingle();p=r.data||null;provenanceCache.set(qid,p)}
  if(!p?.is_ai_generated)return;const d=document.createElement('div');d.className='qbGeneratedBanner';d.textContent=`2026レジメ対策問題｜AI作成・過去問ではありません｜根拠: ${p.source_file||'講義資料'}${p.source_locator?'・'+p.source_locator:''}`;card.prepend(d)
}
function schedule(delay=40){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{renderAreas().catch(console.error);decorateFilteredProblems()},delay)}
function boot(){
  css();const V=document.getElementById('view'),C=document.getElementById('crumb');if(V)new MutationObserver(()=>schedule(50)).observe(V,{childList:true,subtree:false});if(C)new MutationObserver(()=>schedule(20)).observe(C,{childList:true,subtree:true,characterData:true});
  window.addEventListener('qb-screen-change',()=>{const s=window.qbGetScreen?.();if(s==='units'&&!openingFiltered)activeFilter=null;schedule(10);setTimeout(annotateGenerated,0)});window.addEventListener('qb-app-ready',()=>schedule(20));window.addEventListener('qb-answer-shown',()=>setTimeout(annotateGenerated,0));setInterval(()=>{if(onEmergencyUnits()&&!document.getElementById('qbEmergencyAreaLayout'))schedule(0);if(activeFilter&&onEmergencyProblems())decorateFilteredProblems()},800);schedule(500)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();