(()=>{
'use strict';
let adminCache=null,timer=null,lastQuestionId=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getQ=()=>{try{return window.pq?.()||null}catch{return null}};
const qid=q=>q?.id||q?.dbId||null;
async function isAdmin(){
  if(adminCache!==null)return adminCache;
  const sb=window.qbSupabase;if(!sb)return false;
  try{
    const a=await sb.auth.getUser(),u=a.data?.user;if(!u)return false;
    if((u.email||'').toLowerCase()==='otohaykm@gmail.com')return adminCache=true;
    const r=await sb.from('profiles').select('role').eq('id',u.id).maybeSingle();
    return adminCache=r.data?.role==='admin';
  }catch{return false}
}
function css(){
  if(document.getElementById('qseSafeCss'))return;
  const s=document.createElement('style');s.id='qseSafeCss';
  s.textContent=`.qseSafeToolbar{display:flex;justify-content:flex-end;margin:6px 0 10px}.qseSafeBtn{border:1px solid #cfe1ef;background:#fff;color:#126fb3;border-radius:8px;padding:6px 9px;font-weight:900;font-size:12px}.qseSafeEditor{margin:8px 0 12px;padding:10px;border:1px solid #cfe1ef;background:#f8fbff;border-radius:10px}.qseSafeEditor textarea{box-sizing:border-box;width:100%;min-height:130px;border:1px solid #cfd8e3;border-radius:9px;padding:9px;font:inherit;background:#fff}.qseSafeHint{font-size:10px;color:#6f7786;margin-top:6px}.qseSafeActions{display:flex;align-items:center;gap:7px;margin-top:8px}.qseSafeStatus{font-size:10px;color:#6f7786;margin-right:auto}.qseSafeSave,.qseSafeCancel{border-radius:8px;padding:7px 10px;font-weight:900}.qseSafeSave{border:0;background:#126fb3;color:#fff}.qseSafeCancel{border:1px solid #dce3ec;background:#fff}`;
  document.head.appendChild(s)
}
function clear(){document.querySelectorAll('.qseSafeToolbar,.qseSafeEditor').forEach(x=>x.remove())}
function openEditor(toolbar,q,qtext){
  document.querySelectorAll('.qseSafeEditor').forEach(x=>x.remove());
  const d=document.createElement('div');d.className='qseSafeEditor';
  d.innerHTML=`<textarea>${esc(q.stem||'')}</textarea><div class="qseSafeHint">canonical問題文のみ更新します。年度別原文（question_occurrences.exact_stem）は変更しません。</div><div class="qseSafeActions"><span class="qseSafeStatus"></span><button type="button" class="qseSafeCancel">キャンセル</button><button type="button" class="qseSafeSave">保存</button></div>`;
  toolbar.insertAdjacentElement('afterend',d);
  const ta=d.querySelector('textarea'),st=d.querySelector('.qseSafeStatus'),save=d.querySelector('.qseSafeSave');
  d.querySelector('.qseSafeCancel').onclick=()=>d.remove();
  save.onclick=async()=>{
    if(save.disabled)return;
    const id=qid(q),val=ta.value.trim();if(!id){st.textContent='問題IDを取得できません';return}
    save.disabled=true;st.textContent='保存中…';
    try{
      const r=await window.qbSupabase.from('questions').update({stem:val||null}).eq('id',id);if(r.error)throw r.error;
      q.stem=val;
      qtext.textContent=val;
      st.textContent='保存しました';
      window.dispatchEvent(new CustomEvent('qb-question-stem-updated',{detail:{questionId:id,stem:val}}));
      setTimeout(()=>d.remove(),120);
    }catch(e){st.textContent='保存失敗: '+(e?.message||'不明なエラー');save.disabled=false}
  };
  ta.focus()
}
async function inject(){
  clearTimeout(timer);
  const q=getQ(),qtext=document.querySelector('#view > .card > .qtext');
  if(!q||!qtext||!(await isAdmin())){clear();return}
  const id=qid(q);
  if(lastQuestionId!==id){clear();lastQuestionId=id}
  if(qtext.nextElementSibling?.classList?.contains('qseSafeToolbar'))return;
  const toolbar=document.createElement('div');toolbar.className='qseSafeToolbar';
  const b=document.createElement('button');b.type='button';b.className='qseSafeBtn';b.textContent='✎ 問題文を編集';
  b.onclick=e=>{e.preventDefault();e.stopPropagation();openEditor(toolbar,q,qtext)};
  toolbar.appendChild(b);qtext.insertAdjacentElement('afterend',toolbar)
}
function schedule(){clearTimeout(timer);timer=setTimeout(inject,30)}
function boot(){css();schedule();['qb-screen-change','qb-answer-shown','qb-retry-current'].forEach(ev=>window.addEventListener(ev,schedule))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();