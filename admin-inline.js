(()=>{
'use strict';
let adminCache=null,scheduled=false;
function css(){if(document.getElementById('inlineAdminCss'))return;const s=document.createElement('style');s.id='inlineAdminCss';s.textContent='.inlineEditBtn{width:100%;margin:10px 0 0;border:1px solid #172033;background:#172033;color:#fff;border-radius:12px;padding:11px 14px;font-weight:900}';document.head.appendChild(s)}
async function isAdmin(){if(adminCache!==null)return adminCache;const sb=window.qbSupabase;if(!sb)return false;const {data:{user}}=await sb.auth.getUser();if(!user)return adminCache=false;if((user.email||'').toLowerCase()==='otohaykm@gmail.com')return adminCache=true;const {data}=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle();return adminCache=data?.role==='admin'}
function currentQuestion(){try{return typeof window.pq==='function'?window.pq():null}catch{return null}}
async function openEditor(){const q=currentQuestion();if(!q)return alert('現在の問題を取得できませんでした。');location.href=`admin.html?question=${encodeURIComponent(q.dbId||q.id)}`}
async function inject(){scheduled=false;document.getElementById('inlineEditBtn')?.remove();if(!document.querySelector('#view .resultcard')||!(await isAdmin()))return;const reset=document.getElementById('reset');if(!reset)return;const b=document.createElement('button');b.id='inlineEditBtn';b.className='inlineEditBtn';b.type='button';b.textContent='✎ この問題を編集';b.onclick=openEditor;reset.insertAdjacentElement('afterend',b)}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(inject,0)}
function start(){css();schedule();window.addEventListener('qb-screen-change',schedule);document.addEventListener('click',e=>{if(['submit','review','reset','next','prev'].includes(e.target?.id))schedule()},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();