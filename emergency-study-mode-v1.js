(()=>{
'use strict';
const ZERO='00000000-0000-0000-0000-000000000000';
let subjectId=null,provenanceCache=new Map();
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function sb(){for(let i=0;i<40;i++){if(window.qbSupabase)return window.qbSupabase;await new Promise(r=>setTimeout(r,75))}return null}
async function getSubjectId(){if(subjectId)return subjectId;const c=await sb();if(!c)return null;const r=await c.from('subjects').select('id').eq('slug','emergency-medicine').maybeSingle();subjectId=r.data?.id||null;return subjectId}
function onEmergencyUnits(){const crumb=document.getElementById('crumb')?.textContent||'';return crumb.includes('救急医学')&&crumb.includes('単元')}
const GROUPS={
  new:{order:1,icon:'🆕',heading:'新設問題（オリジナル問題）',lead:'2026年度レジメをもとに作成した対策問題。過去問ではありません。',priority:'最優先',tone:'new',tag:'AI作成・2026レジメ準拠'},
  continuing:{order:2,icon:'📚',heading:'既存問題（過去問）',lead:'2022〜2025年度の過去問のうち、2026年度も学習に活用する問題。',priority:'優先',tone:'continuing',tag:'実際の過去問'},
  legacy:{order:3,icon:'🗂️',heading:'範囲外となった問題',lead:'昨年までの過去問に含まれるが、2026年度では独立した重点範囲として確認できない問題。完全な出題除外を保証するものではありません。',priority:'低優先',tone:'legacy',tag:'旧範囲・低優先'}
};
function moduleCard(m,count){
  const g=GROUPS[m.module_type]||{icon:'',heading:m.title||'',lead:m.description||'',priority:'',tone:'',tag:''};
  return `<div class="qbEmSection" data-tone="${esc(g.tone)}"><div class="qbEmSectionHead"><div><div class="qbEmSectionTitle">${g.icon} ${esc(g.heading)}</div><div class="qbEmSectionLead">${esc(g.lead)}</div></div><span class="qbEmPriority">${esc(g.priority)}</span></div><button class="qbEmModule" data-mid="${m.id}" data-type="${esc(m.module_type)}"><div><div class="qbEmTitle">${esc(m.title||g.heading)}</div><div class="qbEmMeta">${esc(m.description||'')}</div><span class="qbEmTag">${count||0}問・${esc(g.tag)}</span></div><div class="qbEmArrow">›</div></button></div>`
}
async function renderHub(){
  if(!onEmergencyUnits())return;
  const V=document.getElementById('view');if(!V||V.querySelector('#qbEmergencyStudyHub'))return;
  const c=await sb(),sid=await getSubjectId();if(!c||!sid||!onEmergencyUnits())return;
  const modulesQ=await c.from('study_modules').select('id,module_key,title,description,module_type,sort_order').eq('subject_id',sid).eq('academic_year',2026).eq('is_active',true).order('sort_order');
  if(modulesQ.error||!modulesQ.data?.length)return;
  const mids=modulesQ.data.map(x=>x.id);
  const iRes=await c.from('study_module_items').select('module_id,question_id').in('module_id',mids.length?mids:[ZERO]);
  const counts={};(iRes.data||[]).forEach(x=>counts[x.module_id]=(counts[x.module_id]||0)+1);
  const mods=[...modulesQ.data].sort((a,b)=>((GROUPS[a.module_type]?.order||99)-(GROUPS[b.module_type]?.order||99))||((a.sort_order||0)-(b.sort_order||0)));
  const wrap=document.createElement('section');wrap.id='qbEmergencyStudyHub';wrap.innerHTML=`<style>
    #qbEmergencyStudyHub{margin-bottom:14px}.qbEmHead{margin:2px 2px 4px;font-weight:900;font-size:19px}.qbEmIntro{font-size:12px;color:var(--muted);line-height:1.55;margin:0 2px 13px}.qbEmSection{margin:0 0 14px;padding-top:12px;border-top:2px solid var(--line)}.qbEmSection:first-of-type{border-top:0;padding-top:0}.qbEmSectionHead{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;margin:0 3px 8px}.qbEmSectionTitle{font-weight:950;font-size:17px;line-height:1.35}.qbEmSectionLead{font-size:11px;color:var(--muted);line-height:1.55;margin-top:4px;max-width:650px}.qbEmPriority{flex:0 0 auto;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900;background:#eef3f8;color:#536174}.qbEmSection[data-tone="new"] .qbEmPriority{background:#e7f2fb;color:#126fb3}.qbEmSection[data-tone="legacy"] .qbEmPriority{background:#f1f1f1;color:#777}.qbEmModule{width:100%;border:1px solid var(--line);background:#fff;border-radius:17px;padding:14px;text-align:left;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.qbEmSection[data-tone="new"] .qbEmModule{border-width:2px;border-color:#126fb3}.qbEmSection[data-tone="legacy"] .qbEmModule{opacity:.72}.qbEmTitle{font-weight:900;font-size:15px}.qbEmMeta{font-size:11px;color:var(--muted);line-height:1.5;margin-top:4px}.qbEmTag{display:inline-block;margin-top:7px;padding:4px 7px;border-radius:999px;background:#eef3f8;font-size:10px;font-weight:900}.qbEmArrow{font-size:23px;color:var(--muted)}.qbEmDivider{font-size:13px;color:#536174;font-weight:900;margin:18px 3px 5px;border-top:2px solid var(--line);padding-top:14px}.qbEmDividerNote{font-size:10px;color:var(--muted);font-weight:500;line-height:1.5;margin-top:4px}.qbGeneratedBanner{margin:0 0 10px;padding:9px 11px;border-radius:12px;background:#eaf4fb;border:1px solid #b9d9ef;font-size:12px;font-weight:800;line-height:1.5}
  </style><div class="qbEmHead">2026試験対策</div><div class="qbEmIntro">上から順に優先して学習できるよう、問題の出自と2026年度での位置づけを分けています。</div>${mods.map(m=>moduleCard(m,counts[m.id])).join('')}<div class="qbEmDivider">詳細単元一覧<div class="qbEmDividerNote">下の一覧は従来の単元別表示です。学習優先順位は上の3区分を基準にしてください。</div></div>`;
  const first=V.querySelector('.card');if(first)first.insertAdjacentElement('afterend',wrap);else V.prepend(wrap);
  wrap.querySelectorAll('[data-mid]').forEach(b=>b.onclick=()=>openModule(b.dataset.mid));
}
async function openModule(moduleId){
  const c=await sb(),sid=await getSubjectId();if(!c||!sid)return;
  const r=await c.from('study_module_items').select('question_id,sort_order').eq('module_id',moduleId).order('sort_order');
  if(r.error){alert('問題の読み込みに失敗しました');return}
  const ids=(r.data||[]).map(x=>x.question_id);if(!ids.length){alert('このブロックにはまだ問題がありません');return}
  if(typeof window.qbResumeSession!=='function'){alert('演習機能を読み込んでいます。少し待ってからもう一度押してください。');return}
  window.qbResumeSession({id:ZERO,subject_id:sid,question_ids:ids,current_index:0,mode:'ordered',metadata:{unit_scope:'__all__',study_module_id:moduleId},completed_at:null,updated_at:new Date().toISOString()});
}
async function annotateGenerated(){
  const crumb=document.getElementById('crumb')?.textContent||'';if(!crumb.includes('救急医学')||!crumb.includes('演習'))return;
  const card=document.querySelector('#view>.card');if(!card||card.querySelector('.qbGeneratedBanner'))return;
  const st=typeof window.qbGetPracticeState==='function'?window.qbGetPracticeState():null;
  const qid=st?.question?.id||st?.questionId||st?.questionIds?.[st?.index??0];if(!qid)return;
  let p=provenanceCache.get(qid);
  if(p===undefined){const c=await sb();if(!c)return;const r=await c.from('question_provenance').select('origin_type,is_ai_generated,source_file,source_locator').eq('question_id',qid).maybeSingle();p=r.data||null;provenanceCache.set(qid,p)}
  if(!p?.is_ai_generated)return;
  const d=document.createElement('div');d.className='qbGeneratedBanner';d.textContent=`2026レジメ対策問題｜AI作成・過去問ではありません｜根拠: ${p.source_file||'講義資料'}${p.source_locator?'・'+p.source_locator:''}`;card.prepend(d);
}
window.addEventListener('qb-screen-change',()=>{setTimeout(renderHub,0);setTimeout(annotateGenerated,0)});
window.addEventListener('qb-answer-shown',()=>setTimeout(annotateGenerated,0));
setTimeout(renderHub,800);
})();
