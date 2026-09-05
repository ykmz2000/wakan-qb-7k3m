(()=>{
'use strict';
let locked=true,shown=false;
function renderGrade(){if(!locked)return;const V=document.getElementById('view'),C=document.getElementById('crumb'),H=document.getElementById('home');if(!V)return;C&&(C.textContent='学年を選択');H?.classList.add('hidden');V.innerHTML=`<div class="card"><div class="title">学年一覧</div><div class="sub">学年を選んでください。</div></div><button id="qbGradeM4" class="list"><div><div class="lt">M4</div><div class="meta">4年</div></div><div>›</div></button>`;document.getElementById('qbGradeM4').onclick=()=>{locked=false;shown=true;if(typeof window.qbOpenSubjects==='function')window.qbOpenSubjects();else location.reload()}}
function boot(){renderGrade();const mo=new MutationObserver(()=>{if(locked)requestAnimationFrame(renderGrade)});mo.observe(document.body,{childList:true,subtree:true});const t=setInterval(()=>{if(!locked){clearInterval(t);return}renderGrade()},300);setTimeout(()=>clearInterval(t),15000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();