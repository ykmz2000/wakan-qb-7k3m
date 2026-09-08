(()=>{
'use strict';
const SUPABASE_URL='https://qebvqcubtyfgaakrzbzh.supabase.co';
const SUPABASE_KEY='sb_publishable_XdCnuTSA6bDh6vB04MlnPw_HDxJgVtZ';
if(window.supabase&&!window.qbSupabase)window.qbSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const s=document.createElement('style');s.id='qbRankingThemeCss';s.textContent=`
.back,.tab,.rankNo{color:var(--accent)!important}
.tab.on{background:var(--accent)!important;color:#fff!important}
.meRow{border-color:var(--accent)!important}
.avatar.qbRankMeAvatar{outline:2px solid var(--accent);outline-offset:1px}
.legendAvatar{width:18px;height:18px;border-radius:50%;display:inline-grid;place-items:center;vertical-align:-4px;margin-right:6px;background-size:cover;background-position:center;color:#fff;font-size:9px;font-weight:900;flex:0 0 auto}
.qbLegendMe{outline:2px solid var(--accent);outline-offset:1px}
.legend>span{display:inline-flex;align-items:center}
`;document.head.appendChild(s);
})();