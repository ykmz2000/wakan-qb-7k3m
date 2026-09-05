(()=>{
'use strict';
let adminCache=null,timer=null;
const stateCache=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currentQuestion=()=>{try{return window.pq?.()||null}catch{return null}};
const qid=q=>q?.id||q?.dbId||null;
async function isAdmin(){
  if(adminCache!==null)return adminCache;
  const sb=window.qbSupabase;if(!sb)return false;
  const {data:{user}}=await sb.auth.getUser();if(!user)return adminCache=false;
  if((user.email||'').toLowerCase()==='otohaykm@gmail.com')return adminCache=true;
  const r=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle();
  return adminCache=r.data?.role==='admin';
}
function css(){
  if(document.getElementById('qbVerificationIssueCss'))return;
  const s=document.createElement('style');s.id='qbVerificationIssueCss';
  s.textContent=`.qbVerifyIssueCard{border:1px solid #d8e0e8;background:#fff}.qbVerifyIssueRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}.qbVerifyIssueBadge{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:900}.qbVerifyIssueBadge.on{background:#fff0f0;color:#b42318}.qbVerifyIssueBadge.off{background:#eef7f2;color:#087a55}.qbVerifyIssueEdit{margin-left:auto;flex:0 0 auto;white-space:nowrap;border:1px solid #cfd8e3;background:#fff;color:#126fb3;border-radius:9px;padding:7px 10px;font-weight:900}.qbVerifyIssueEditor{margin-top:10px;padding:10px;background:#f8fbff;border:1px solid #cfe1ef;border-radius:10px}.qbVerifyIssueEditor textarea{width:100%;min-height:88px;border:1px solid #cfd8e3;border-radius:9px;padding:9px;font:inherit;background:#fff}.qbVerifyIssueActions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}.qbVerifyIssueActions button{border-radius:9px;padding:8px 12px;font-weight:900}.qbVerifyIssueSave{border:0;background:#126fb3;color:#fff}.qbVerifyIssueCancel{border:1px solid #dce3ec;background:#fff}@media(max-width:520px){.qbVerifyIssueEdit{margin-left:0}}`;
  document.head.appendChild(s);
}
async function loadState(q){
  const id=qid(q);if(!id)throw new Error('問題IDを取得できません');
  if(stateCache.has(id))return stateCache.get(id);
  const r=await window.qbSupabase.from('questions').select('has_verification_issue,medical_verification_note').eq('id',id).maybeSingle();
  if(r.error)throw r.error;
  const state={has:!!r.data?.has_verification_issue,note:r.data?.medical_verification_note||''};
  stateCache.set(id,state);return state;
}
function placeCard(ans,d){
  const medical=[...ans.querySelectorAll(':scope > .card')].find(c=>[...c.querySelectorAll(':scope > b')].some(b=>(b.textContent||'').includes('医学的検証メモ')));
  if(medical){if(d.nextElementSibling!==medical)ans.insertBefore(d,medical)}else if(d.parentElement!==ans)ans.appendChild(d);
}
function renderCard(ans,q,state){
  const id=qid(q);if(!id)return;
  let d=ans.querySelector(`.qbVerifyIssueCard[data-question-id="${id}"]`);
  if(!d){
    ans.querySelectorAll('.qbVerifyIssueCard').forEach(x=>x.remove());
    d=document.createElement('div');d.className='card qbVerifyIssueCard';d.dataset.questionId=id;
    d.innerHTML=`<b>■ 医学的検証ステータス</b><div class="qbVerifyIssueRow"><span class="qbVerifyIssueBadge"></span><span class="meta">公式解答・原資料は変更せず、医学的疑義だけを管理します。</span><button type="button" class="qbVerifyIssueEdit">疑義の有無を編集</button></div>`;
    d.querySelector('.qbVerifyIssueEdit').onclick=()=>openEditor(d,q,state);
  }
  const badge=d.querySelector('.qbVerifyIssueBadge');
  const desiredClass=state.has?'on':'off',desiredText=state.has?'疑義あり':'疑義なし';
  if(!badge.classList.contains(desiredClass)){badge.classList.remove('on','off');badge.classList.add(desiredClass)}
  if(badge.textContent!==desiredText)badge.textContent=desiredText;
  placeCard(ans,d);
}
function openEditor(card,q,state){
  if(card.querySelector('.qbVerifyIssueEditor'))return;
  const ed=document.createElement('div');ed.className='qbVerifyIssueEditor';
  ed.innerHTML=`<div class="qbVerifyIssueRow"><label><input type="radio" name="qbVerifyIssue" value="false" ${state.has?'':'checked'}> 疑義なし</label><label><input type="radio" name="qbVerifyIssue" value="true" ${state.has?'checked':''}> 疑義あり</label></div><div class="meta" style="margin-top:8px">医学的検証メモ</div><textarea>${esc(state.note)}</textarea><div class="qbVerifyIssueActions"><button type="button" class="qbVerifyIssueCancel">キャンセル</button><button type="button" class="qbVerifyIssueSave">保存</button></div><div class="meta qbVerifyIssueMsg"></div>`;
  card.appendChild(ed);
  ed.querySelector('.qbVerifyIssueCancel').onclick=()=>ed.remove();
  ed.querySelector('.qbVerifyIssueSave').onclick=async()=>{
    const save=ed.querySelector('.qbVerifyIssueSave'),msg=ed.querySelector('.qbVerifyIssueMsg');save.disabled=true;msg.textContent='保存中…';
    try{
      const has=ed.querySelector('input[name="qbVerifyIssue"]:checked')?.value==='true';
      const note=ed.querySelector('textarea').value.trim();
      const id=qid(q);
      const r=await window.qbSupabase.from('questions').update({has_verification_issue:has,medical_verification_note:note||null,updated_at:new Date().toISOString()}).eq('id',id);
      if(r.error)throw r.error;
      q.has_verification_issue=has;q.medical_verification_note=note;
      state.has=has;state.note=note;stateCache.set(id,state);
      renderCard(document.getElementById('ans'),q,state);
      ed.remove();
      window.dispatchEvent(new CustomEvent('qb-content-updated',{detail:{questionId:id,type:'verification_issue',hasVerificationIssue:has}}));
    }catch(e){msg.textContent='保存失敗: '+e.message;save.disabled=false;}
  };
}
async function inject(){
  clearTimeout(timer);css();
  const ans=document.getElementById('ans');if(!ans||!ans.querySelector('.resultcard'))return;
  const q=currentQuestion();if(!q||!(await isAdmin()))return;
  try{const state=await loadState(q);renderCard(ans,q,state)}catch(e){console.warn('verification issue editor:',e)}
}
function schedule(){clearTimeout(timer);timer=setTimeout(inject,60)}
function boot(){['qb-answer-shown','qb-explanation-ready','qb-screen-change','qb-content-updated'].forEach(ev=>window.addEventListener(ev,schedule));schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();