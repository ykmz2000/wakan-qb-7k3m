(()=>{'use strict';
function css(){if(document.getElementById('qvaCss'))return;const s=document.createElement('style');s.id='qvaCss';s.textContent='.qva{margin:10px 0;padding:11px 12px;border:1px solid #e5a000;border-radius:12px;background:#fff8df;color:#6d4b00;font-size:13px;line-height:1.55}.qva b{display:block;margin-bottom:2px}';document.head.appendChild(s)}
function currentQ(){try{return window.pq?.()||null}catch{return null}}
function inject(){
  document.querySelectorAll('.qva').forEach(x=>x.remove());
  if(window.qbGetScreen?.()!=='practice')return;
  const q=currentQ();
  const note=q?.medical_verification_note||q?.medicalVerificationNote||'';
  if(!q||!String(note).trim())return;
  // 警告は解答前だけ表示。#ans自体は常に存在するため、結果カードの有無で判定する。
  if(document.querySelector('#ans .resultcard'))return;
  const card=document.querySelector('#view .card');if(!card)return;
  const anchor=card.querySelector('.choices')||card.querySelector('#showTextAnswer')?.closest('.card')||card.querySelector('#answer')?.parentElement||document.getElementById('ans');
  if(!anchor)return;
  const d=document.createElement('div');d.className='qva';
  d.innerHTML='<b>⚠️ この問題は解答に疑義があります</b><span>原資料の公式解答と医学的な検証結果が一致しない、または解釈に注意が必要な問題です。詳細は解答後の「医学的検証メモ」で確認できます。</span>';
  anchor.parentNode.insertBefore(d,anchor);
}
function schedule(){setTimeout(inject,0)}
function boot(){css();schedule();window.addEventListener('qb-screen-change',schedule);window.addEventListener('qb-app-ready',schedule);window.addEventListener('qb-retry-current',schedule);document.addEventListener('click',e=>{if(['next','prev','answer','review','showTextAnswer'].includes(e.target?.id))setTimeout(inject,40)},true);const v=document.getElementById('view');if(v)new MutationObserver(()=>setTimeout(inject,0)).observe(v,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot()
})();