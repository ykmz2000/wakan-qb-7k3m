(()=>{
'use strict';
let timer=0;
function css(){if(document.getElementById('rankingEntryCss'))return;const s=document.createElement('style');s.id='rankingEntryCss';s.textContent=`.header{flex-wrap:wrap}.qbAccountCluster{margin-left:auto;display:flex;align-items:center;gap:7px}.qbRankBtn{width:44px;height:44px;border:1px solid #dce3ec;background:#fff;border-radius:999px;display:grid;place-items:center;font-size:21px;text-decoration:none;color:#126fb3;font-weight:900}.acctBtn{margin-left:0!important}@media(max-width:600px){.qbRankBtn{width:40px;height:40px}.qbAccountCluster{gap:5px}}`;document.head.appendChild(s)}
function ensureHeader(){const h=document.querySelector('.header'),acct=document.getElementById('acctBtn');if(!h||!acct)return;let cluster=document.querySelector('.qbAccountCluster');if(!cluster){cluster=document.createElement('div');cluster.className='qbAccountCluster';const rank=document.createElement('a');rank.className='qbRankBtn';rank.href='./ranking.html';rank.setAttribute('aria-label','ランキング');rank.title='ランキング';rank.textContent='♛';h.insertBefore(cluster,acct);cluster.append(rank,acct)}else if(acct.parentElement!==cluster)cluster.appendChild(acct)}
function schedule(){clearTimeout(timer);timer=setTimeout(ensureHeader,80)}
function boot(){css();schedule();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});window.addEventListener('qb-app-ready',schedule);window.addEventListener('qb-screen-change',schedule)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();