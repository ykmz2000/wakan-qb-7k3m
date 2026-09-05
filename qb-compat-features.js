(()=>{
'use strict';
let admin=false,user=null,ctxReady=false,ctxPromise=null,lastQuestion=null,runTimer=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function ctx(){if(ctxReady)return window.qbSupabase;if(ctxPromise)return ctxPromise;ctxPromise=(async()=>{const sb=window.qbSupabase;if(!sb)return null;const a=await sb.auth.getUser();user=a.data?.user;if(!user)return null;const p=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle();admin=p.data?.role==='admin';ctxReady=true;return sb})();return ctxPromise}
function q(){try{return typeof window.pq==='function'?window.pq():null}catch{return null}}
function screen(){return window.qbGetScreen?.()||''}
function practiceIndex(){const m=(document.getElementById('crumb')?.textContent||'').match(/演習\s+(\d+)\/(\d+)/);return m?{i:Number(m[1])-1,n:Number(m[2])}:null}
function css(){if(document.getElementById('qbCompatCss'))return;const s=document.createElement('style');s.id='qbCompatCss';s.textContent=`body.qbDockOn .app{padding-bottom:calc(118px + env(safe-area-inset-bottom))}.qbCompatDock{position:fixed;left:0;right:0;bottom:0;z-index:70;background:#fffffff2;border-top:1px solid #dce3ec;backdrop-filter:blur(14px);padding:6px max(8px,env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));box-shadow:0 -6px 20px #17203314}.qbCompatDock>div{max-width:850px;margin:auto;display:grid;grid-template-columns:.9fr .75fr 1.35fr .9fr .75fr;gap:4px}.qbCompatDock button{border:0;background:transparent;color:#536174;min-height:52px;border-radius:12px;font-weight:900;font-size:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}.qbCompatDock button.primary{background:#126fb3;color:#fff}.qbCompatDock .ico{font-size:18px}`;document.head.appendChild(s)}
function tap(id){const e=document.getElementById(id);if(e&&!e.disabled){e.click();return true}return false}
function retryCurrent(){
  // Core practice state is intentionally reset through the same choice click path used by normal play.
  // This clears the internal selection Set as well as the visual selected state.
  const selected=[...document.querySelectorAll('#view [data-c].sel')];
  selected.forEach(b=>{if(!b.disabled)b.click()});
  const ans=document.getElementById('ans');if(ans)ans.innerHTML='';
  document.querySelectorAll('#view [data-c]').forEach(b=>{b.disabled=false;b.classList.remove('sel','good','bad')});
  const answer=document.getElementById('answer');if(answer)answer.disabled=true;
  const review=document.getElementById('review');if(review)review.disabled=false;
  window.dispatchEvent(new CustomEvent('qb-retry-current'));
}
function dock(){css();let d=document.getElementById('qbCompatDock');if(screen()!=='practice'){document.body.classList.remove('qbDockOn');d?.remove();return}document.body.classList.add('qbDockOn');if(!d){d=document.createElement('nav');d.id='qbCompatDock';d.className='qbCompatDock';document.body.appendChild(d)}const ix=practiceIndex(),hasReview=!!document.getElementById('review'),isText=!!document.getElementById('showTextAnswer'),submitted=!!document.querySelector('#ans .resultcard');d.innerHTML=`<div><button data-a="list"><span class="ico">☷</span>問題一覧</button><button data-a="prev" ${ix?.i===0?'disabled':''}><span class="ico">‹</span>前へ</button><button class="primary" data-a="answer"><span class="ico">${submitted?'↻':'✓'}</span>${submitted?'もう一度解く':'解答する'}</button><button data-a="review" ${(!hasReview&&!isText)?'disabled':''}><span class="ico">▤</span>解説</button><button data-a="next"><span class="ico">${ix&&ix.i===ix.n-1?'■':'›'}</span>${ix&&ix.i===ix.n-1?'終了':'次へ'}</button></div>`;d.querySelector('[data-a=list]').onclick=()=>window.qbOpenSubjects?.();d.querySelector('[data-a=prev]').onclick=()=>tap('prev');d.querySelector('[data-a=answer]').onclick=()=>{if(submitted){if(isText){tap('showTextAnswer')}else retryCurrent()}else{tap('answer')||tap('showTextAnswer')}};d.querySelector('[data-a=review]').onclick=()=>{if(hasReview)tap('review');else tap('showTextAnswer')};d.querySelector('[data-a=next]').onclick=()=>tap('next')}
function schedule(){clearTimeout(runTimer);runTimer=setTimeout(dock,0)}
function boot(){css();schedule();window.addEventListener('qb-screen-change',schedule);document.addEventListener('click',e=>{if(['answer','review','showTextAnswer','next','prev'].includes(e.target?.id))setTimeout(schedule,30)},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();