(()=>{
'use strict';
const FLAG='review_later';
let ctxPromise=null,user=null,flags=new Set(),loadedFingerprint='',timer=0,loading=false,sortPriority=false;
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
#qbReviewLaterPanel .qbrlHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.qbrlTitle{font-size:13px;font-weight:900;color:#4a422b}.qbrlCount{font-size:11px;color:#7f7350}.qbrlActions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qbrlBtn{border:1px solid #dacb91;background:#fff;color:#735f19;border-radius:11px;min-height:43px;padding:7px 8px;font-weight:900}.qbrlBtn.on{background:#f0b429;color:#fff;border-color:#f0b429}.qbrlHint{margin-top:7px;font-size:10px;color:#837858;line-height:1.45}.qbReviewRowMark{display:inline-block;margin-left:7px;padding:2px 6px;border-radius:999px;background:#fff4c7;color:#9a6d00;font-size:10px;font-weight:900}.qbReviewPractice{display:flex;align-items:center;gap:8px;margin:10px 0 2px}.qbReviewPractice button{border:1px solid #dacb91;background:#fffdf5;color:#846500;border-radius:12px;min-height:42px;padding:0 13px;font-weight:900}.qbReviewPractice button.on{background:#f0b429;color:#fff;border-color:#f0b429}.qbReviewPractice .qbrlStatus{font-size:10px;color:#7d7461}.qbReviewSortHost{display:flex!important;flex-direction:column}.qbReviewSortHost>.row{order:-100000}.qbReviewSortHost>.problem{width:100%}body.qbReviewSortOn #qsoBar,body.qbReviewSortOn .qsoHandle{display:none!important}
@media(max-width:390px){#qbReviewLaterPanel{padding:10px}.qbrlActions{gap:5px}.qbrlBtn{font-size:12px}.qbReviewPractice{align-items:stretch;flex-direction:column}.qbReviewPractice button{width:100%}}
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
      if(!m&&meta){m=document.createElement('span');m.className='qbReviewRowMark';m.textContent='★あとで見る';meta.appendChild(m)}
    }else m?.remove();
  });
}
function applyVisualSort(){
  const rs=rows(),host=rs[0]?.closest('.card');if(!host)return;
  if(!sortPriority){document.body.classList.remove('qbReviewSortOn');host.classList.remove('qbReviewSortHost');rs.forEach(r=>r.style.removeProperty('order'));return}
  document.body.classList.add('qbReviewSortOn');host.classList.add('qbReviewSortHost');
  rs.forEach((r,i)=>{r.style.order=String((flags.has(rowId(r))?0:10000)+i)});
}
function updatePanel(){
  const p=document.getElementById('qbReviewLaterPanel');if(!p)return;
  const n=[...flags].filter(id=>inputs().some(x=>x.dataset.q===id)).length;
  p.querySelector('.qbrlCount').textContent=`★ ${n}問`;
  const b=p.querySelector('[data-qbrl="sort"]');b?.classList.toggle('on',sortPriority);if(b)b.textContent=sortPriority?'★を先に解く ON':'★を先に解く';
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
  if(!p){p=document.createElement('div');p.id='qbReviewLaterPanel';p.innerHTML=`<div class="qbrlHead"><div class="qbrlTitle">あとで見る</div><div class="qbrlCount"></div></div><div class="qbrlActions"><button type="button" class="qbrlBtn" data-qbrl="filter">★で絞る</button><button type="button" class="qbrlBtn" data-qbrl="sort">★を先に解く</button></div><div class="qbrlHint">「★で絞る」は現在の選択から★付きだけを残します。自己評価フィルタと組み合わせ可能です。「★を先に解く」は順番通り演習の先頭に★付き問題を並べます。</div>`;p.querySelector('[data-qbrl="filter"]').onclick=filterToFlags;p.querySelector('[data-qbrl="sort"]').onclick=()=>{sortPriority=!sortPriority;applyVisualSort();updatePanel()}}
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
function setPracticeButtonState(w,on,msg=''){
  const b=w?.querySelector('button'),m=w?.querySelector('.qbrlStatus');if(!b)return;b.classList.toggle('on',on);b.textContent=on?'★ あとで見る':'☆ あとで見る';if(m)m.textContent=msg;
}
async function ensurePractice(){
  if(screen()!=='practice'){document.querySelector('.qbReviewPractice')?.remove();return}
  const id=currentQuestionId();if(!id)return;
  const stem=document.querySelector('#view .qtext');if(!stem)return;
  let w=document.querySelector('.qbReviewPractice');if(w?.dataset.qid===String(id))return;w?.remove();
  w=document.createElement('div');w.className='qbReviewPractice';w.dataset.qid=String(id);w.innerHTML='<button type="button">☆ あとで見る</button><span class="qbrlStatus">読み込み中…</span>';stem.insertAdjacentElement('afterend',w);
  let on=false;try{on=await currentFlagged(id);setPracticeButtonState(w,on,'')}catch{setPracticeButtonState(w,false,'読み込み失敗')}
  w.querySelector('button').onclick=async()=>{
    const b=w.querySelector('button');b.disabled=true;setPracticeButtonState(w,on,'保存中…');
    try{
      const sb=await ctx();if(!sb)throw new Error('not authenticated');
      if(on){const r=await sb.from('user_question_flags').delete().eq('user_id',user.id).eq('question_id',id).eq('flag_type',FLAG);if(r.error)throw r.error;flags.delete(String(id));on=false}
      else{const r=await sb.from('user_question_flags').insert({user_id:user.id,question_id:id,flag_type:FLAG});if(r.error)throw r.error;flags.add(String(id));on=true}
      setPracticeButtonState(w,on,on?'あとで見るに追加しました':'解除しました');window.dispatchEvent(new CustomEvent('qb-review-later-changed',{detail:{questionId:id,active:on}}));
    }catch(e){console.error(e);setPracticeButtonState(w,on,'保存できませんでした')}
    finally{b.disabled=false}
  };
}
async function ensureList(force=false){
  if(screen()!=='problems'){document.getElementById('qbReviewLaterPanel')?.remove();document.body.classList.remove('qbReviewSortOn');return}
  const xs=inputs();if(!xs.length)return;const f=fp();
  if(f!==loadedFingerprint){loadedFingerprint='';flags=new Set();sortPriority=false}
  if(loading)return;
  if(force||loadedFingerprint!==f){loading=true;try{await loadFlags(xs.map(x=>x.dataset.q));loadedFingerprint=f}catch(e){console.error('review later load',e)}finally{loading=false}}
  markRows();buildPanel();applyVisualSort();
}
function syncSelectedOrderBeforeStart(){
  if(screen()!=='problems'||!sortPriority)return;
  const xs=inputs(),checked=xs.filter(x=>x.checked);if(checked.length<2)return;
  const ordered=[...checked.filter(x=>flags.has(x.dataset.q)),...checked.filter(x=>!flags.has(x.dataset.q))];
  checked.forEach(x=>{x.checked=false;x.dispatchEvent(new Event('change',{bubbles:true}))});
  ordered.forEach(x=>{x.checked=true;x.dispatchEvent(new Event('change',{bubbles:true}))});
}
function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>{ensurePractice().catch(console.error);ensureList(force).catch(console.error)},80)}
function boot(){
  css();schedule(true);
  ['qb-screen-change','qb-app-ready'].forEach(ev=>window.addEventListener(ev,()=>schedule(true)));
  window.addEventListener('qb-review-later-changed',()=>schedule(true));
  document.addEventListener('click',e=>{if(e.target?.id==='start')syncSelectedOrderBeforeStart()},true);
  const v=document.getElementById('view');if(v)new MutationObserver(()=>schedule(false)).observe(v,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
