(()=>{
'use strict';
let cache=null,loading=null,timer=null;
const TZ='Asia/Tokyo';
const screen=()=>window.qbGetScreen?.()||'';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function css(){
  if(document.getElementById('qbExamScheduleCss'))return;
  const s=document.createElement('style');s.id='qbExamScheduleCss';s.textContent=`
.qbNextExamCard{border:1.5px solid #b9d9ee;background:linear-gradient(180deg,#f3f9fd,#fff);border-radius:17px;padding:14px 15px;margin-bottom:10px}.qbNextExamHead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.qbNextExamTitle{font-size:16px;font-weight:900}.qbNextExamDate{font-size:12px;font-weight:900;color:#126fb3;background:#eaf4fb;border-radius:999px;padding:5px 8px;white-space:nowrap}.qbNextExamRows{display:grid;gap:7px}.qbNextExamRow{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center}.qbNextExamPeriod{font-size:11px;font-weight:900;color:#126fb3;background:#eaf4fb;border-radius:8px;padding:5px 7px;white-space:nowrap}.qbNextExamName{font-weight:900;line-height:1.35}.qbSubjectExamTitle{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.qbSubjectExamBadge{display:inline-flex;align-items:center;border-radius:999px;background:#eef5fa;color:#126fb3;padding:4px 7px;font-size:10px;font-weight:900;line-height:1.1}.qbSubjectExamMeta{font-size:11px;color:#6f7786;margin-top:3px;font-weight:700}
`;
  document.head.appendChild(s)
}
function jstParts(date=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {year:Number(p.year),month:Number(p.month),day:Number(p.day)}
}
function academicYear(){const p=jstParts();return p.month>=4?p.year:p.year-1}
function toDate(row,end=false){const t=String(end?row.ends_at:row.starts_at||'00:00').slice(0,5);return new Date(`${row.exam_date}T${t}:00+09:00`)}
function fmtDate(d){const x=new Date(`${d}T00:00:00+09:00`);return new Intl.DateTimeFormat('ja-JP',{timeZone:TZ,month:'numeric',day:'numeric',weekday:'short'}).format(x)}
function fmtTime(t){return String(t||'').slice(0,5)}
function fmtPeriod(r){return `${r.period_no}限 ${fmtTime(r.starts_at)}–${fmtTime(r.ends_at)}`}
async function load(){
  if(cache)return cache;if(loading)return loading;
  loading=(async()=>{
    const sb=window.qbSupabase;if(!sb)throw new Error('Supabase未初期化');
    const g=await sb.from('grades').select('id').eq('code','M4').maybeSingle();if(g.error)throw g.error;if(!g.data?.id)return [];
    const r=await sb.from('exam_schedules').select('id,grade_id,subject_id,subject_name,academic_year,exam_type,exam_date,period_no,starts_at,ends_at').eq('grade_id',g.data.id).eq('academic_year',academicYear()).eq('exam_type','main').order('exam_date',{ascending:true}).order('period_no',{ascending:true});if(r.error)throw r.error;
    cache=r.data||[];return cache
  })().finally(()=>loading=null);
  return loading
}
function nextRows(rows){const now=new Date(),future=rows.filter(r=>toDate(r,true)>now);if(!future.length)return[];const d=future[0].exam_date;return future.filter(r=>r.exam_date===d)}
function insertNextCard(rows){
  const V=document.getElementById('view');if(!V)return;
  V.querySelector('.qbNextExamCard')?.remove();
  const firstCard=V.querySelector(':scope > .card'),next=nextRows(rows),d=document.createElement('div');d.className='qbNextExamCard';
  if(next.length){
    d.innerHTML=`<div class="qbNextExamHead"><div class="qbNextExamTitle">次回の試験</div><div class="qbNextExamDate">${esc(fmtDate(next[0].exam_date))}</div></div><div class="qbNextExamRows">${next.map(r=>`<div class="qbNextExamRow"><span class="qbNextExamPeriod">${esc(fmtPeriod(r))}</span><span class="qbNextExamName">${esc(r.subject_name)}</span></div>`).join('')}</div>`;
  }else{
    d.innerHTML=`<div class="qbNextExamHead"><div class="qbNextExamTitle">次回の試験</div></div><div class="meta">${academicYear()}年度の本試験は終了しました。</div>`;
  }
  if(firstCard)firstCard.insertAdjacentElement('afterend',d);else V.prepend(d)
}
function decorateSubjects(rows){
  const V=document.getElementById('view');if(!V||screen()!=='subjects')return;
  insertNextCard(rows);
  const byId=new Map(rows.filter(r=>r.subject_id).map(r=>[String(r.subject_id),r]));
  const buttons=[...V.querySelectorAll(':scope > button.list[data-s]')];
  buttons.forEach(b=>{
    const r=byId.get(String(b.dataset.s));if(!r)return;
    const lt=b.querySelector('.lt');if(!lt)return;
    lt.classList.add('qbSubjectExamTitle');
    lt.querySelector('.qbSubjectExamBadge')?.remove();
    const badge=document.createElement('span');badge.className='qbSubjectExamBadge';badge.textContent=`${fmtDate(r.exam_date)} ${r.period_no}限 ${fmtTime(r.starts_at)}`;lt.appendChild(badge);
    const host=lt.parentElement;if(host){host.querySelector('.qbSubjectExamMeta')?.remove();const m=document.createElement('div');m.className='qbSubjectExamMeta';m.textContent=`本試験 ${fmtTime(r.starts_at)}–${fmtTime(r.ends_at)}`;host.appendChild(m)}
  });
  const originalIndex=new Map(buttons.map((b,i)=>[b,i]));
  buttons.sort((a,b)=>{
    const ra=byId.get(String(a.dataset.s)),rb=byId.get(String(b.dataset.s));
    if(ra&&rb)return toDate(ra)-toDate(rb);
    if(ra)return-1;if(rb)return 1;return (originalIndex.get(a)||0)-(originalIndex.get(b)||0)
  });
  buttons.forEach(b=>V.appendChild(b))
}
async function render(){
  if(screen()!=='subjects')return;
  try{css();const rows=await load();if(screen()==='subjects')decorateSubjects(rows)}catch(e){console.error('exam schedule ui',e)}
}
function schedule(){clearTimeout(timer);timer=setTimeout(render,0)}
function boot(){css();['qb-screen-change','qb-app-ready'].forEach(ev=>window.addEventListener(ev,schedule));schedule();window.qbRefreshExamSchedule=()=>{cache=null;loading=null;schedule()}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
