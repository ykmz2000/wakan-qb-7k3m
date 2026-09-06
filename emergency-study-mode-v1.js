(()=>{
'use strict';
const ZERO='00000000-0000-0000-0000-000000000000';
let subjectId=null,provenanceCache=new Map();
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function sb(){for(let i=0;i<40;i++){if(window.qbSupabase)return window.qbSupabase;await new Promise(r=>setTimeout(r,75))}return null}
async function getSubjectId(){if(subjectId)return subjectId;const c=await sb();if(!c)return null;const r=await c.from('subjects').select('id').eq('slug','emergency-medicine').maybeSingle();subjectId=r.data?.id||null;return subjectId}
function onEmergencyUnits(){const crumb=document.getElementById('crumb')?.textContent||'';return crumb.includes('救急医学')&&crumb.includes('単元')}
async function renderHub(){
  if(!onEmergencyUnits())return;
  const V=document.getElementById('view');if(!V||V.querySelector('#qbEmergencyStudyHub'))return;
  const c=await sb(),sid=await getSubjectId();if(!c||!sid||!onEmergencyUnits())return;
  const [mRes,iRes]=await Promise.all([
    c.from('study_modules').select('id,module_key,title,description,module_type,sort_order').eq('subject_id',sid).eq('academic_year',2026).eq('is_active',true).order('sort_order'),
    c.from('study_module_items').select('module_id,question_id').in('module_id',(await c.from('study_modules').select('id').eq('subject_id',sid).eq('academic_year',2026).eq('is_active',true)).data?.map(x=>x.id)||[ZERO])
  ]);
  if(mRes.error||!mRes.data?.length)return;
  const counts={};(iRes.data||[]).forEach(x=>counts[x.module_id]=(counts[x.module_id]||0)+1);
  const icon={new:'🆕',continuing:'🔁',legacy:'🗂️'};
  const tag={new:'AI作成・レジメ準拠',continuing:'2022〜2025過去問',legacy:'低優先'};
  const wrap=document.createElement('section');wrap.id='qbEmergencyStudyHub';wrap.innerHTML=`<style>
    #qbEmergencyStudyHub{margin-bottom:12px}.qbEmHead{margin:2px 2px 9px;font-weight:900;font-size:17px}.qbEmGrid{display:grid;gap:9px}.qbEmModule{width:100%;border:1px solid var(--line);background:#fff;border-radius:17px;padding:14px;text-align:left;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.qbEmModule[data-type="new"]{border-width:2px;border-color:#126fb3}.qbEmModule[data-type="legacy"]{opacity:.72}.qbEmTitle{font-weight:900;font-size:16px}.qbEmMeta{font-size:12px;color:var(--muted);line-height:1.55;margin-top:4px}.qbEmTag{display:inline-block;margin-top:7px;padding:4px 7px;border-radius:999px;background:#eef3f8;font-size:10px;font-weight:900}.qbEmArrow{font-size:23px;color:var(--muted)}.qbEmDivider{font-size:12px;color:var(--muted);font-weight:900;margin:14px 3px 7px;border-top:1px solid var(--line);padding-top:12px}.qbGeneratedBanner{margin:0 0 10px;padding:9px 11px;border-radius:12px;background:#eaf4fb;border:1px solid #b9d9ef;font-size:12px;font-weight:800;line-height:1.5}
  </style><div class="qbEmHead">2026試験対策</div><div class="qbEmGrid">${mRes.data.map(m=>`<button class="qbEmModule" data-mid="${m.id}" data-type="${esc(m.module_type)}"><div><div class="qbEmTitle">${icon[m.module_type]||''} ${esc(m.title)}</div><div class="qbEmMeta">${esc(m.description||'')}</div><span class="qbEmTag">${counts[m.id]||0}問・${tag[m.module_type]||''}</span></div><div class="qbEmArrow">›</div></button>`).join('')}</div><div class="qbEmDivider">従来の単元一覧</div>`;
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
