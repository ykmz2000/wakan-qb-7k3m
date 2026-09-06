(()=>{
'use strict';
const FLAG='review_later';
let ctxPromise=null,user=null,flags=new Set(),loadedFingerprint='',timer=0,loading=false;
const screen=()=>window.qbGetScreen?.()||'';
const inputs=()=>[...document.querySelectorAll('#view .problem input[data-q]')];
const rows=()=>[...document.querySelectorAll('#view .problem')];
const rowId=r=>r?.querySelector('input[data-q]')?.dataset?.q||null;
const fp=()=>inputs().map(x=>x.dataset.q).filter(Boolean).join('|');
async function ctx(){
  if(ctxPromise)return ctxPromise;
  ctxPromise=(async()=>{const sb=window.qbSupabase;if(!sb)return null;const a=await sb.auth.getUser();user=a.data?.user||null;return user?sb:null})();
  return ctxPromise;
}
function css(){
  if(document.getElementById('qbReviewLaterCss'))return;
  const s=document.createElement('style');s.id='qbReviewLaterCss';s.textContent=`
#qbReviewLaterPanel{padding:12px 13px;margin-bottom:10px;border:1px solid #eadca8;background:#fffdf5;border-radius:15px}
#qbReviewLaterPanel .qbrlHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.qbrlTitle{font-size:20px;font-weight:900;color:#9a6d00}.qbrlCount{font-size:11px;color:#7f7350}.qbrlActions{display:block}.qbrlBtn{width:100%;border:1px solid #dacb91;background:#fff;color:#735f19;border-radius:11px;min-height:43px;padding:7px 8px;font-weight:900}.qbrlHint{margin-top:7px;font-size:10px;color:#837858;line-height:1.45}.qbReviewRowMark{display:inline-flex;align-items:center;justify-content:center;margin-left:7px;width:22px;height:22px;border-radius:999px;background:#fff4c7;color:#9a6d00;font-size:14px;font-weight:900;vertical-align:middle}.qbReviewPractice{margin-left:auto;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.qbReviewPractice button{width:42px;height:42px;border:1px solid #dacb91;background:#fffdf5;color:#846500;border-radius:12px;padding:0;font-weight:900;font-size:27px;line-height:1;display:flex;align-items:center;justify-content:center}.qbReviewPractice button.on{background:#f0b429;color:#fff;border-color:#f0b429}.qbReviewPractice button:disabled{opacity:.6}
@media(max-width:390px){#qbReviewLaterPanel{padding:10px}.qbrlBtn{font-size:12px}.qbReviewPractice button{width:38px;height:38px;font-size:24px}}
`;
  document.head.appendChild(s);
}
async function loadFlags(ids){
  const sb=await ctx();if(!sb||!ids.length){flags=new Set();return}
  const r=await sb.from('user_question_flags').select('question_id').eq('flag_type',FLAG).in('question_id',ids);
  if(r.error)throw r.error;
  flags=new Set((r.data||[]).map(x=>String(x.question_id)));
}
function markRows(){
  rows().forEach(r=>{
    const id=rowId(r),meta=r.querySelector('.meta');let m=r.querySelector('.qbReviewRowMark');
    if(flags.has(id)){
      if(!m&&meta){m=document.createElement('span');m.className='qbReviewRowMark';m.textContent='★';m.setAttribute('aria-label','★');meta.appendChild(m)}
    }else m?.remove();
  });
}
function updatePanel(){
  const p=document.getElementById('qbReviewLaterPanel');if(!p)return;
  const n=[...flags].filter(id=>inputs().some(x=>x.dataset.q===id)).length;
  p.querySelector('.qbrlCount').textContent=`${n}問`;
}
function filterToFlags(){
  inputs().forEach(x=>{
    const want=x.checked&&flags.has(x.dataset.q);
    if(x.checked===want)return;x.checked=want;x.dispatchEvent(new Event('change',{bubbles:true}));
  });
}
function buildPanel(){
  const rs=rows();if(!rs.length)return;
  const listCard=rs[0].closest('.card');if(!listCard)return;
  let p=document.getElementById('qbReviewLaterPanel');
  if(!p){p=document.createElement('div');p.id='qbReviewLaterPanel';p.innerHTML=`<div class="qbrlHead"><div class="qbrlTitle">★</div><div class="qbrlCount"></div></div><div class="qbrlActions"><button type="button" class="qbrlBtn" data-qbrl="filter">★のみ</button></div><div class="qbrlHint">現在の選択から★付きだけを残します。自己評価フィルタと組み合わせ可能です。</div>`;p.querySelector('[data-qbrl="filter"]').onclick=filterToFlags}
  const rating=document.getElementById('qbRatingFilterPanel');if(rating&&rating.nextElementSibling!==p)rating.insertAdjacentElement('afterend',p);else if(!rating&&p.nextElementSibling!==listCard)listCard.insertAdjacentElement('beforebegin',p);
  updatePanel();
}
function currentQuestionId(){
  const st=window.qbGetPracticeState?.()||{};const ids=st.questionIds||[];if(ids.length&&Number.isInteger(Number(st.currentIndex)))return ids[Number(st.currentIndex)]||null;
  const q=window.pq?.();return q?.id||q?.dbId||null;
}
async function currentFlagged(id){
  if(flags.has(String(id)))return true;
  const sb=await ctx();if(!sb||!id)return false;
  const r=await sb.from('user_question_flags').select('question_id').eq('user_id',user.id).eq('question_id',id).eq('flag_type',FLAG).maybeSingle();
  if(r.error)throw r.error;if(r.data)flags.add(String(id));return !!r.data;
}
function setPracticeButtonState(w,on){
  const b=w?.querySelector('button');if(!b)return;b.classList.toggle('on',on);b.textContent=on?'★':'☆';b.setAttribute('aria-label',on?'★を解除':'★を付ける');b.setAttribute('aria-pressed',String(on));
}
async function ensurePractice(){
  if(screen()!=='practice'){document.querySelector('.qbReviewPractice')?.remove();return}
  const id=currentQuestionId();if(!id)return;
  const stem=document.querySelector('#view .qtext');if(!stem)return;
  const card=stem.closest('.card'),head=card?.querySelector(':scope > .row'),count=head?.querySelector(':scope > .meta');if(!head)return;
  let w=document.querySelector('.qbReviewPractice');if(w?.dataset.qid===String(id)&&w.parentElement===head)return;w?.remove();
  w=document.createElement('div');w.className='qbReviewPractice';w.dataset.qid=String(id);w.innerHTML='<button type="button" aria-label="★を付ける" aria-pressed="false">☆</button>';
  if(count)head.insertBefore(w,count);else head.appendChild(w);
  let on=false;try{on=await currentFlagged(id);setPracticeButtonState(w,on)}catch(e){console.error('review star load',e);setPracticeButtonState(w,false)}
  w.querySelector('button').onclick=async()=>{
    const b=w.querySelector('button');b.disabled=true;
    try{
      const sb=await ctx();if(!sb)throw new Error('not authenticated');
      if(on){const r=await sb.from('user_question_flags').delete().eq('user_id',user.id).eq('question_id',id).eq('flag_type',FLAG);if(r.error)throw r.error;flags.delete(String(id));on=false}
      else{const r=await sb.from('user_question_flags').insert({user_id:user.id,question_id:id,flag_type:FLAG});if(r.error)throw r.error;flags.add(String(id));on=true}
      setPracticeButtonState(w,on);window.dispatchEvent(new CustomEvent('qb-review-later-changed',{detail:{questionId:id,active:on}}));
    }catch(e){console.error('review star save',e);setPracticeButtonState(w,on)}
    finally{b.disabled=false}
  };
}
async function ensureList(force=false){
  if(screen()!=='problems'){document.getElementById('qbReviewLaterPanel')?.remove();return}
  const xs=inputs();if(!xs.length)return;const f=fp();
  if(f!==loadedFingerprint){loadedFingerprint='';flags=new Set()}
  if(loading)return;
  if(force||loadedFingerprint!==f){loading=true;try{await loadFlags(xs.map(x=>x.dataset.q));loadedFingerprint=f}catch(e){console.error('review star load',e)}finally{loading=false}}
  markRows();buildPanel();
}
function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>{ensurePractice().catch(console.error);ensureList(force).catch(console.error)},80)}
function boot(){
  css();schedule(true);
  ['qb-screen-change','qb-app-ready'].forEach(ev=>window.addEventListener(ev,()=>schedule(true)));
  window.addEventListener('qb-review-later-changed',()=>schedule(true));
  const v=document.getElementById('view');if(v)new MutationObserver(()=>schedule(false)).observe(v,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
