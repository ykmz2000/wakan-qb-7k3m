(()=>{
'use strict';
const V=document.getElementById('view');
let raf=0;
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function currentQuestion(){
  const qs=window.QB_QUESTIONS||[];
  if(!qs.length)return null;
  const stem=[...document.querySelectorAll('#view .qtext')].map(x=>(x.textContent||'').trim()).find(Boolean);
  if(!stem)return null;
  return qs.find(q=>(q.stem||q.q||'').trim()===stem)||null;
}
// Compatibility bridge for admin editing, media editing and personal notes.
window.pq=currentQuestion;
function hasHeading(root,title){return [...root.querySelectorAll('.card b')].some(x=>(x.textContent||'').trim()===title)}
function addCard(root,title,body,cls='line'){
  if(hasHeading(root,title))return;
  const d=document.createElement('div');d.className='card qbSharedExplanationCard';
  d.innerHTML=`<b>${esc(title)}</b><div class="${cls}">${body}</div>`;
  root.appendChild(d);
}
function choiceBody(q){
  const choices=q.choices||[];
  if(!choices.length)return null;
  const ans=q.ans||choices.map((c,i)=>c.is_correct?i:null).filter(i=>i!==null);
  return choices.map((c,i)=>{
    const key=c.choice_key||String.fromCharCode(97+i),text=c.choice_text||String(c),ok=ans.includes(i),ex=c.explanation||'未登録';
    return `<div class="exp"><b>${esc(key)}. ${ok?'○':'×'} ${esc(text)}</b><div class="line">${esc(ex)}</div></div>`;
  }).join('');
}
async function addRating(root,q){
  if(root.querySelector('.qbSharedRating'))return;
  const d=document.createElement('div');d.className='card qbSharedRating';
  d.innerHTML=`<b>■ 自己評価</b><div class="ratings">${['◎','○','△','×','-'].map(v=>`<button class="rate" data-qb-rate="${v}">${v}</button>`).join('')}</div><div class="meta qbRateMsg">◎=完璧 / ○=理解 / △=あやふや / ×=要復習 / -=解説のみ</div>`;
  root.appendChild(d);
  const sb=window.qbSupabase;if(!sb)return;
  const {data:{user}}=await sb.auth.getUser();if(!user)return;
  const id=q.id||q.dbId;if(!id)return;
  const r=await sb.from('question_ratings').select('rating').eq('user_id',user.id).eq('question_id',id).maybeSingle();
  const setOn=v=>d.querySelectorAll('[data-qb-rate]').forEach(b=>b.classList.toggle('on',b.dataset.qbRate===v));
  if(r.data?.rating)setOn(r.data.rating);
  d.querySelectorAll('[data-qb-rate]').forEach(b=>b.onclick=async()=>{
    const v=b.dataset.qbRate;setOn(v);const msg=d.querySelector('.qbRateMsg');if(msg)msg.textContent='保存中…';
    const x=await sb.from('question_ratings').upsert({user_id:user.id,question_id:id,rating:v,updated_at:new Date().toISOString()},{onConflict:'user_id,question_id'});
    if(msg)msg.textContent=x.error?'保存できませんでした':'保存しました';
  });
}
function ensure(){
  const ans=document.getElementById('ans');if(!ans||!ans.children.length)return;
  const q=currentQuestion();if(!q)return;
  const overview=q.explanation_overview||q.note||'未登録';
  addCard(ans,'■ 問題文のポイント',esc(overview));
  const cb=choiceBody(q);if(cb&&!hasHeading(ans,'■ 各選択肢')){const d=document.createElement('div');d.className='card qbSharedExplanationCard';d.innerHTML=`<b>■ 各選択肢</b>${cb}`;ans.appendChild(d)}
  addCard(ans,'■ 出題者の意図',esc(q.examiner_intent||q.examinerIntent||'未登録'));
  addCard(ans,'■ 試験用まとめ',esc(q.exam_summary||q.examSummary||'未登録'),'summary');
  addCard(ans,'■ 医学的検証メモ',esc(q.medical_verification_note||q.medicalVerificationNote||'未登録'));
  addRating(ans,q);
  window.dispatchEvent(new CustomEvent('qb-explanation-ready',{detail:{questionId:q.id||q.dbId||null}}));
}
function schedule(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;ensure()})}
window.addEventListener('qb-screen-change',schedule);
window.addEventListener('qb-app-ready',schedule);
if(V)new MutationObserver(schedule).observe(V,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();