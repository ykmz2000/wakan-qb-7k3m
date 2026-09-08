(()=>{
'use strict';
const SUPABASE_URL='https://qebvqcubtyfgaakrzbzh.supabase.co';
const SUPABASE_KEY='sb_publishable_XdCnuTSA6bDh6vB04MlnPw_HDxJgVtZ';
if(window.supabase&&!window.qbSupabase)window.qbSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const s=document.createElement('style');s.id='qbRankingThemeCss';s.textContent=`
.avatar{background-color:var(--accent)!important}
.back,.tab,.rankNo{color:var(--accent)!important}
.tab.on{background:var(--accent)!important;color:#fff!important}
.meRow{border-color:var(--accent)!important}
svg circle[fill="#126fb3"]{fill:var(--accent)!important}
.legend .dot[style*="#126fb3"]{background:var(--accent)!important}
`;document.head.appendChild(s);
function sync(){
  document.querySelectorAll('svg circle[fill="#126fb3"]').forEach(()=>{});
  document.querySelectorAll('svg circle').forEach(x=>{if((x.getAttribute('fill')||'').toLowerCase()==='#126fb3')x.setAttribute('fill','var(--accent)')});
  document.querySelectorAll('.legend .dot').forEach(x=>{if((x.getAttribute('style')||'').includes('#126fb3'))x.style.background='var(--accent)'})
}
new MutationObserver(sync).observe(document.body,{childList:true,subtree:true});
window.addEventListener('qb-theme-change',sync);sync();
})();
