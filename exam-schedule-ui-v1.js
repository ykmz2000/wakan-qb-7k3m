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
.qbExamCalendar{background:#fff;border:1px solid #dce3ec;border-radius:17px;padding:14px 0 13px;margin-bottom:10px;overflow:hidden}.qbExamCalendarHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 15px 9px}.qbExamCalendarTitle{font-size:16px;font-weight:900}.qbExamCalendarHint{font-size:10px;color:#6f7786;font-weight:800;white-space:nowrap}.qbExamCalendarTrack{display:grid;grid-auto-flow:column;grid-auto-columns:min(74vw,260px);gap:9px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scroll-padding-left:15px;padding:2px 15px 7px;-webkit-overflow-scrolling:touch;scrollbar-width:none}.qbExamCalendarTrack::-webkit-scrollbar{display:none}.qbExamDay{scroll-snap-align:start;border:1px solid #dce3ec;border-radius:15px;background:#fbfcfe;padding:12px;min-height:154px;display:flex;flex-direction:column;gap:8px}.qbExamDay.qbExamPast{opacity:.52}.qbExamDay.qbExamNext{border:2px solid #126fb3;background:#f3f9fd}.qbExamDayTop{display:flex;align-items:center;justify-content:space-between;gap:8px}.qbExamDayDate{font-size:16px;font-weight:900}.qbExamDayTag{font-size:9px;font-weight:900;border-radius:999px;background:#126fb3;color:#fff;padding:4px 7px;white-space:nowrap}.qbExamDayRows{display:grid;gap:7px}.qbExamItem{border-top:1px solid #e4e9f0;padding-top:7px}.qbExamItem:first-child{border-top:0;padding-top:0}.qbExamItemTime{font-size:10px;color:#6f7786;font-weight:800;margin-bottom:2px}.qbExamItemName{font-size:13px;line-height:1.35;font-weight:900}.qbExamItemButton{display:block;width:100%;border:0;background:transparent;text-align:left;padding:0;color:#126fb3;cursor:pointer}.qbExamItemButton .qbExamItemName{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}.qbExamCalendarEmpty{padding:0 15px;color:#6f7786;font-size:12px}
`;
  document.head.appendChild(s)
}
function jstParts(date=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {year:Number(p.year),month:Number(p.month),day:Number(p.day)}
}
function todayYmd(){const p=jstParts();return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`}
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
function nextDate(rows){const n=nextRows(rows);return n[0]?.exam_date||null}
function insertNextCard(rows){
  const V=document.getElementById('view');if(!V)return null;
  V.querySelector('.qbNextExamCard')?.remove();
  const firstCard=V.querySelector(':scope > .card'),next=nextRows(rows),d=document.createElement('div');d.className='qbNextExamCard';
  if(next.length){
    d.innerHTML=`<div class="qbNextExamHead"><div class="qbNextExamTitle">次回の試験</div><div class="qbNextExamDate">${esc(fmtDate(next[0].exam_date))}</div></div><div class="qbNextExamRows">${next.map(r=>`<div class="qbNextExamRow"><span class="qbNextExamPeriod">${esc(fmtPeriod(r))}</span><span class="qbNextExamName">${esc(r.subject_name)}</span></div>`).join('')}</div>`;
  }else{
    d.innerHTML=`<div class="qbNextExamHead"><div class="qbNextExamTitle">次回の試験</div></div><div class="meta">${academicYear()}年度の本試験は終了しました。</div>`;
  }
  if(firstCard)firstCard.insertAdjacentElement('afterend',d);else V.prepend(d);
  return d
}
function groupByDate(rows){const m=new Map();rows.forEach(r=>{if(!m.has(r.exam_date))m.set(r.exam_date,[]);m.get(r.exam_date).push(r)});return [...m.entries()].map(([date,items])=>({date,items}))}
function insertCalendar(rows,after){
  const V=document.getElementById('view');if(!V)return;
  V.querySelector('.qbExamCalendar')?.remove();
  const wrap=document.createElement('section');wrap.className='qbExamCalendar';wrap.setAttribute('aria-label','本試験日程');
  const days=groupByDate(rows),nd=nextDate(rows),today=todayYmd(),now=new Date();
  if(!days.length){wrap.innerHTML=`<div class="qbExamCalendarHead"><div class="qbExamCalendarTitle">試験日程</div></div><div class="qbExamCalendarEmpty">試験予定は登録されていません。</div>`}
  else{
    wrap.innerHTML=`<div class="qbExamCalendarHead"><div class="qbExamCalendarTitle">試験日程</div><div class="qbExamCalendarHint">横にスワイプ →</div></div><div class="qbExamCalendarTrack">${days.map(day=>{
      const ended=day.items.every(r=>toDate(r,true)<=now),isNext=day.date===nd,isToday=day.date===today;
      const tag=isNext?(isToday?'今日':'次'):(isToday?'今日':'');
      return `<article class="qbExamDay ${ended?'qbExamPast':''} ${isNext?'qbExamNext':''}" data-exam-date="${esc(day.date)}"><div class="qbExamDayTop"><div class="qbExamDayDate">${esc(fmtDate(day.date))}</div>${tag?`<span class="qbExamDayTag">${esc(tag)}</span>`:''}</div><div class="qbExamDayRows">${day.items.map(r=>{
        const inner=`<div class="qbExamItemTime">${esc(fmtPeriod(r))}</div><div class="qbExamItemName">${esc(r.subject_name)}</div>`;
        return r.subject_id?`<div class="qbExamItem"><button type="button" class="qbExamItemButton" data-exam-subject="${esc(r.subject_id)}">${inner}</button></div>`:`<div class="qbExamItem">${inner}</div>`
      }).join('')}</div></article>`
    }).join('')}</div>`
  }
  if(after)after.insertAdjacentElement('afterend',wrap);else V.prepend(wrap);
  wrap.querySelectorAll('[data-exam-subject]').forEach(b=>b.onclick=()=>{
    const target=V.querySelector(`button.list[data-s="${String(b.dataset.examSubject)}"]`);if(target)target.click()
  });
  const track=wrap.querySelector('.qbExamCalendarTrack');if(track){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const target=nd?track.querySelector(`[data-exam-date="${nd}"]`):track.querySelector('.qbExamDay:last-child');
      if(target)track.scrollLeft=Math.max(0,target.offsetLeft-track.offsetLeft-15)
    }))
  }
}
function decorateSubjects(rows){
  const V=document.getElementById('view');if(!V||screen()!=='subjects')return;
  const next=insertNextCard(rows);insertCalendar(rows,next);
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
