(()=>{
'use strict';
let timer=0,ctxReady=false,isAdmin=false;
const LABELS={coming_soon:'Coming soon',in_progress:'作成中',available:'利用可能'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function css(){
  if(document.getElementById('qbSubjectStatusCss'))return;
  const s=document.createElement('style');s.id='qbSubjectStatusCss';s.textContent=`
.qbSubjectStatus{display:inline-flex;align-items:center;margin-top:7px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:900;line-height:1.2}
.qbSubjectStatus[data-status="coming_soon"]{background:#eef1f5;color:#6f7786}
.qbSubjectStatus[data-status="in_progress"]{background:#fff3d9;color:#9a6500}
.qbSubjectStatus[data-status="available"]{background:#e7f7ef;color:#087a55}
#qbSubjectStatusAdmin{margin:0 0 10px}.qbSubjectStatusAdminHead{display:flex;justify-content:space-between;align-items:center;gap:10px}.qbSubjectStatusToggle{border:1px solid #126fb3;background:#fff;color:#126fb3;border-radius:10px;padding:7px 10px;font-weight:900}.qbSubjectStatusPanel{margin-top:10px;border-top:1px solid #e5eaf0}.qbSubjectStatusRow{display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #eef1f5}.qbSubjectStatusName{font-size:13px;font-weight:800}.qbSubjectStatusSelect{width:100%;min-height:36px;border:1px solid #dce3ec;border-radius:9px;background:#fff;padding:4px 8px;font:inherit;font-weight:800}@media(max-width:520px){.qbSubjectStatusRow{grid-template-columns:minmax(0,1fr) 112px}.qbSubjectStatusName{font-size:12px}}
`;
  document.head.appendChild(s);
}
async function context(sb){
  if(ctxReady)return isAdmin;
  const a=await sb.auth.getUser();const uid=a.data?.user?.id;if(!uid){ctxReady=true;return false}
  const p=await sb.from('profiles').select('role').eq('id',uid).maybeSingle();
  isAdmin=p.data?.role==='admin';ctxReady=true;return isAdmin;
}
function subjectButtons(){return [...document.querySelectorAll('#view .list[data-s]')]}
function paint(statusMap){
  subjectButtons().forEach(b=>{
    const status=statusMap.get(String(b.dataset.s))||'coming_soon';
    let badge=b.querySelector('.qbSubjectStatus');
    if(!badge){badge=document.createElement('span');badge.className='qbSubjectStatus';const left=b.firstElementChild||b;left.appendChild(badge)}
    badge.dataset.status=status;badge.textContent=LABELS[status]||LABELS.coming_soon;
  });
}
function buildAdmin(statusMap){
  document.getElementById('qbSubjectStatusAdmin')?.remove();
  if(!isAdmin)return;
  const buttons=subjectButtons();if(!buttons.length)return;
  const host=document.createElement('div');host.id='qbSubjectStatusAdmin';host.className='card';
  host.innerHTML=`<div class="qbSubjectStatusAdminHead"><div><b>科目ステータス</b><div class="meta">管理者のみ変更できます。</div></div><button type="button" class="qbSubjectStatusToggle">編集</button></div><div class="qbSubjectStatusPanel hidden">${buttons.map(b=>{const id=String(b.dataset.s),name=b.querySelector('.lt')?.textContent?.trim()||'',status=statusMap.get(id)||'coming_soon';return `<div class="qbSubjectStatusRow" data-id="${esc(id)}"><div class="qbSubjectStatusName">${esc(name)}</div><select class="qbSubjectStatusSelect"><option value="coming_soon" ${status==='coming_soon'?'selected':''}>Coming soon</option><option value="in_progress" ${status==='in_progress'?'selected':''}>作成中</option><option value="available" ${status==='available'?'selected':''}>利用可能</option></select></div>`}).join('')}</div>`;
  const firstCard=document.querySelector('#view>.card');if(firstCard)firstCard.after(host);else document.getElementById('view')?.prepend(host);
  const panel=host.querySelector('.qbSubjectStatusPanel'),toggle=host.querySelector('.qbSubjectStatusToggle');
  toggle.onclick=()=>{panel.classList.toggle('hidden');toggle.textContent=panel.classList.contains('hidden')?'編集':'閉じる'};
  host.querySelectorAll('.qbSubjectStatusSelect').forEach(sel=>sel.onchange=async()=>{
    const row=sel.closest('.qbSubjectStatusRow'),id=row.dataset.id,next=sel.value,prev=statusMap.get(id)||'coming_soon';
    sel.disabled=true;
    const sb=window.qbSupabase;const r=await sb.from('subjects').update({availability_status:next,updated_at:new Date().toISOString()}).eq('id',id);
    sel.disabled=false;
    if(r.error){sel.value=prev;alert('科目ステータスの更新に失敗しました: '+r.error.message);return}
    statusMap.set(id,next);paint(statusMap);
  });
}
async function render(){
  const buttons=subjectButtons();if(!buttons.length){document.getElementById('qbSubjectStatusAdmin')?.remove();return}
  const sb=window.qbSupabase;if(!sb)return;
  const ids=buttons.map(b=>String(b.dataset.s));
  const r=await sb.from('subjects').select('id,availability_status').in('id',ids);if(r.error){console.error('subject status load',r.error);return}
  if(!subjectButtons().length)return;
  const statusMap=new Map((r.data||[]).map(x=>[String(x.id),x.availability_status||'coming_soon']));
  paint(statusMap);await context(sb);buildAdmin(statusMap);
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>render().catch(e=>console.error('subject status render',e)),25)}
function boot(){css();window.addEventListener('qb-screen-change',schedule);window.addEventListener('qb-app-ready',schedule);schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();