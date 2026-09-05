(()=>{
'use strict';
const GRADE_CODE='M4';
const view=document.getElementById('view');
const crumb=document.getElementById('crumb');
const home=document.getElementById('home');
let sb=null;
let subjects=[];
let selected=null;
let catalogShowing=false;

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function selectedSlug(){return new URLSearchParams(location.search).get('subject')||''}
async function waitSb(){for(let i=0;i<100;i++){if(window.qbSupabase)return window.qbSupabase;await new Promise(r=>setTimeout(r,100))}return null}
async function loadSubjects(){
  const g=await sb.from('grades').select('id,code,name').eq('code',GRADE_CODE).maybeSingle();
  if(g.error)throw g.error;
  if(!g.data)throw new Error(`${GRADE_CODE} が見つかりません`);
  const r=await sb.from('subjects').select('id,slug,name,sort_order').eq('grade_id',g.data.id).eq('is_active',true).order('sort_order');
  if(r.error)throw r.error;
  const rows=r.data||[];
  const withCounts=await Promise.all(rows.map(async s=>{
    const q=await sb.from('questions').select('id',{count:'exact',head:true}).eq('subject_id',s.id).eq('status','published');
    return {...s,question_count:q.count||0};
  }));
  subjects=withCounts;
  selected=subjects.find(s=>s.slug===selectedSlug())||subjects.find(s=>s.slug==='wakan')||subjects[0]||null;
}
function goSubject(slug){
  const u=new URL(location.href);
  u.searchParams.set('subject',slug);
  location.href=u.toString();
}
function renderCatalog(){
  if(!view||!crumb)return;
  catalogShowing=true;
  if(home)home.classList.add('hidden');
  crumb.textContent=`${GRADE_CODE} ＞ 科目を選択`;
  view.innerHTML=`<div class="card"><div class="title">科目一覧</div><div class="sub">勉強する科目を選んでください。</div></div>`+
    subjects.map(s=>`<button class="list" data-subject="${esc(s.slug)}"><div><div class="lt">${esc(s.name)}</div><div class="meta">${s.question_count}問収録</div></div><div>›</div></button>`).join('');
  view.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>goSubject(b.dataset.subject));
}
function patchSubjectLabels(){
  if(!selected||catalogShowing)return;
  const from='和漢医学概論',to=selected.name;
  [crumb,...document.querySelectorAll('#view .title')].filter(Boolean).forEach(el=>{
    if(el.textContent.includes(from))el.textContent=el.textContent.replaceAll(from,to);
  });
}
function enterSelectedSubject(){
  if(!selectedSlug())return false;
  const btn=document.getElementById('wakan');
  if(!btn)return false;
  const name=btn.querySelector('.lt');if(name&&selected)name.textContent=selected.name;
  catalogShowing=false;
  btn.click();
  setTimeout(patchSubjectLabels,0);
  return true;
}
function handleSubjectsScreen(){
  if(window.qbGetScreen?.()!=='subjects')return;
  if(selectedSlug()){
    if(!enterSelectedSubject())renderCatalog();
  }else renderCatalog();
}
async function boot(){
  sb=await waitSb();
  if(!sb)return;
  try{await loadSubjects()}catch(e){console.error('subject catalog load failed',e);return}
  const ready=()=>handleSubjectsScreen();
  if(window.QB_DB_READY)ready();else window.addEventListener('qb-app-ready',ready,{once:true});
  window.addEventListener('qb-screen-change',e=>{
    if(e.detail?.screen==='subjects'){
      const u=new URL(location.href);u.searchParams.delete('subject');history.replaceState({},'',u.pathname+u.search+u.hash);
      selected=null;catalogShowing=false;renderCatalog();
    }else{catalogShowing=false;patchSubjectLabels()}
  });
  new MutationObserver(()=>patchSubjectLabels()).observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
