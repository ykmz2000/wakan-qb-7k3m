(()=>{
'use strict';
const SUPABASE_URL='https://qebvqcubtyfgaakrzbzh.supabase.co';
const SUPABASE_KEY='sb_publishable_XdCnuTSA6bDh6vB04MlnPw_HDxJgVtZ';
if(window.supabase&&!window.qbSupabase)window.qbSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const s=document.createElement('style');s.textContent=`.avatar{background-color:var(--accent)!important}svg circle[fill="#126fb3"]{fill:var(--accent)!important}`;document.head.appendChild(s);
})();