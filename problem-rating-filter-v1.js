(()=>{
'use strict';
const CATEGORIES=['◎','○','△','×','未演習'];
let active=new Set(CATEGORIES),ratingByQuestion=new Map(),fingerprint='',loadedFingerprint='',timer=0,loading=false;
const screen=()=>window.qbGetScreen?.()||'';
const inputs=()=>[...document.querySelectorAll('#view .problem input[data-q]')];
const categoryOf=id=>{
  const r=ratingByQuestion.get(id);
  return ['◎','○','△','×'].includes(r)?r:'未演習';
};
function css(){
  if(document.getElementById('qbRatingFilterCss'))return;
  const s=document.createElement('style');s.id='qbRatingFilterCss';s.textContent=`
#qbRatingFilterPanel{padding:12px 13px;margin-bottom:10px;border:1px solid #cfe1ef;background:#f8fcff;border-radius:15px}
#qbRatingFilterPanel .qbrfHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
#qbRatingFilterPanel .qbrfTitle{font-size:13px;font-weight:900;color:#314055}
#qbRatingFilterPanel .qbrfCount{font-size:11px;color:#6f7786;white-space:nowrap}
#qbRatingFilterPanel .qbrfButtons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
#qbRatingFilterPanel .qbrfBtn{border:1px solid #cfd8e3;background:#fff;color:#536174;border-radius:11px;min-height:43px;padding:7px 4px;font-weight:900;font-size:15px;transition:transform .08s ease,background .12s ease,color .12s ease,border-color .12s ease}
#qbRatingFilterPanel .qbrfBtn:active{transform:scale(.97)}
#qbRatingFilterPanel .qbrfBtn.on{background:#1559ad;color:#fff;border-color:#1559ad}
#qbRatingFilterPanel .qbrfBtn[data-cat="未演習"]{font-size:12px}
#qbRatingFilterPanel .qbrfHint{margin-top:7px;font-size:10px;line-height:1.45;color:#7b8492}
@media(max-width:390px){#qbRatingFilterPanel{padding:10px}#qbRatingFilterPanel .qbrfButtons{gap:5px}#qbRatingFilterPanel .qbrfBtn{min-height:41px;font-size:14px}#qbRatingFilterPanel .qbrfBtn[data-cat="未演習"]{font-size:11px}}
`;
  document.head.appendChild(s);
}
function currentFingerprint(){return inputs().map(x=>x.dataset.q).filter(Boolean).join('|')}
function selectedCount(){return inputs().filter(x=>x.checked).length}
function syncCoreUi(){
  const count=selectedCount(),total=inputs().length,start=document.getElementById('start'),toggle=document.getElementById('toggleAll');
  if(start){start.textContent=`演習開始（${count}問）`;start.disabled=count===0;}
  if(toggle)toggle.textContent=count===total?'すべて解除':'すべて選択';
  const c=document.querySelector('#qbRatingFilterPanel .qbrfCount');if(c)c.textContent=`${count}/${total}問を選択`;
}
function applySelection(){
  inputs().forEach(x=>{
    const want=active.has(categoryOf(x.dataset.q));
    if(x.checked===want)return;
    x.checked=want;
    x.dispatchEvent(new Event('change',{bubbles:true}));
  });
  syncCoreUi();
}
function updateButtons(){
  document.querySelectorAll('#qbRatingFilterPanel .qbrfBtn').forEach(b=>{
    const on=active.has(b.dataset.cat);b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
  });
  syncCoreUi();
}
function buildPanel(){
  document.getElementById('qbRatingFilterPanel')?.remove();
  const rs=[...document.querySelectorAll('#view .problem')];if(!rs.length)return;
  const listCard=rs[0].closest('.card');if(!listCard)return;
  const panel=document.createElement('div');panel.id='qbRatingFilterPanel';panel.innerHTML=`<div class="qbrfHead"><div class="qbrfTitle">自己評価で絞り込み</div><div class="qbrfCount"></div></div><div class="qbrfButtons">${CATEGORIES.map(c=>`<button type="button" class="qbrfBtn ${active.has(c)?'on':''}" data-cat="${c}" aria-pressed="${active.has(c)}">${c}</button>`).join('')}</div><div class="qbrfHint">複数選択できます。未演習には「-（解説のみ）」と自己評価未登録を含みます。</div>`;
  const orderBar=document.getElementById('qsoBar');
  if(orderBar&&orderBar.nextElementSibling===listCard)orderBar.insertAdjacentElement('afterend',panel);else listCard.insertAdjacentElement('beforebegin',panel);
  panel.querySelectorAll('.qbrfBtn').forEach(b=>b.onclick=()=>{
    const cat=b.dataset.cat;if(active.has(cat))active.delete(cat);else active.add(cat);
    updateButtons();applySelection();
  });
  applySelection();
}
async function loadRatings(ids){
  const sb=window.qbSupabase;if(!sb||!ids.length){ratingByQuestion=new Map();return}
  const a=await sb.auth.getUser(),user=a.data?.user;if(!user){ratingByQuestion=new Map();return}
  const r=await sb.from('question_ratings').select('question_id,rating').eq('user_id',user.id).in('question_id',ids);
  if(r.error)throw r.error;
  ratingByQuestion=new Map((r.data||[]).map(x=>[String(x.question_id),x.rating]));
}
async function inject(force=false){
  clearTimeout(timer);if(screen()!=='problems'){document.getElementById('qbRatingFilterPanel')?.remove();return}
  const xs=inputs();if(!xs.length)return;
  const fp=currentFingerprint();
  if(fp!==fingerprint){fingerprint=fp;loadedFingerprint='';active=new Set(CATEGORIES);ratingByQuestion=new Map();}
  if(loading)return;
  if(force||loadedFingerprint!==fp){
    loading=true;
    try{await loadRatings(xs.map(x=>x.dataset.q));loadedFingerprint=fp}catch(e){console.error('rating filter load',e)}finally{loading=false}
  }
  buildPanel();
}
function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>inject(force).catch(console.error),120)}
function boot(){
  css();schedule(true);
  window.addEventListener('qb-screen-change',()=>schedule(true));
  window.addEventListener('qb-app-ready',()=>schedule(true));
  window.addEventListener('qb-question-order-updated',()=>schedule(false));
  document.addEventListener('change',e=>{if(e.target?.matches?.('#view .problem input[data-q]'))setTimeout(syncCoreUi,0)},true);
  const v=document.getElementById('view');if(v)new MutationObserver(()=>{if(screen()==='problems'&&!document.getElementById('qbRatingFilterPanel'))schedule(false)}).observe(v,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
